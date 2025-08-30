import { Logger } from '../utils/logger';
import { DatabaseService } from '../database/database.service';
import { BadgeService } from './badge.service';
import { ExtendedClient } from '../types/client';
import { Prisma } from '@prisma/client';

/**
 * Badge Audit Service - Identifies and fixes badge system issues
 */
export class BadgeAuditService {
  private logger: Logger;
  private database: DatabaseService;
  private badgeService: BadgeService;
  private client: ExtendedClient;

  constructor(client: ExtendedClient, badgeService: BadgeService, database: DatabaseService) {
    this.client = client;
    this.badgeService = badgeService;
    this.database = database;
    this.logger = new Logger();
  }

  /**
   * Run complete badge system audit
   */
  public async runFullAudit(): Promise<{
    orphanedBadges: string[];
    duplicatedUserBadges: Array<{ userId: string; badgeId: string; count: number }>;
    invalidBadgeReferences: Array<{ userId: string; badgeId: string }>;
    missingBadgeDefinitions: string[];
    inconsistentBadgeData: Array<{ badgeId: string; issues: string[] }>;
    fixedIssues: number;
  }> {
    this.logger.info('Starting comprehensive badge system audit...');

    const results = {
      orphanedBadges: [] as string[],
      duplicatedUserBadges: [] as Array<{ userId: string; badgeId: string; count: number }>,
      invalidBadgeReferences: [] as Array<{ userId: string; badgeId: string }>,
      missingBadgeDefinitions: [] as string[],
      inconsistentBadgeData: [] as Array<{ badgeId: string; issues: string[] }>,
      fixedIssues: 0,
    };

    try {
      // 1. Find orphaned badges (badges in DB but not in service definitions)
      results.orphanedBadges = await this.findOrphanedBadges();

      // 2. Find duplicated user badges
      results.duplicatedUserBadges = await this.findDuplicatedUserBadges();

      // 3. Find invalid badge references in UserBadge table
      results.invalidBadgeReferences = await this.findInvalidBadgeReferences();

      // 4. Find missing badge definitions
      results.missingBadgeDefinitions = await this.findMissingBadgeDefinitions();

      // 5. Check for inconsistent badge data
      results.inconsistentBadgeData = await this.findInconsistentBadgeData();

      // 6. Auto-fix issues where possible
      results.fixedIssues = await this.autoFixIssues(results);

      this.logger.info('Badge audit completed:', {
        orphanedBadges: results.orphanedBadges.length,
        duplicatedUserBadges: results.duplicatedUserBadges.length,
        invalidBadgeReferences: results.invalidBadgeReferences.length,
        missingBadgeDefinitions: results.missingBadgeDefinitions.length,
        inconsistentBadgeData: results.inconsistentBadgeData.length,
        fixedIssues: results.fixedIssues,
      });

      return results;
    } catch (error) {
      this.logger.error('Badge audit failed:', error);
      throw error;
    }
  }

  /**
   * Find badges that exist in database but not in service definitions
   */
  private async findOrphanedBadges(): Promise<string[]> {
    try {
      const dbBadges = await this.database.client.badge.findMany({
        select: { id: true },
      });

      const serviceBadges = this.badgeService.getAvailableBadges(true);
      const serviceBadgeIds = new Set(serviceBadges.map(b => b.id));

      const orphaned = dbBadges
        .filter(badge => !serviceBadgeIds.has(badge.id))
        .map(badge => badge.id);

      if (orphaned.length > 0) {
        this.logger.warn(`Found ${orphaned.length} orphaned badges:`, orphaned);
      }

      return orphaned;
    } catch (error) {
      this.logger.error('Failed to find orphaned badges:', error);
      return [];
    }
  }

  /**
   * Find users with duplicate badge entries
   */
  private async findDuplicatedUserBadges(): Promise<
    Array<{ userId: string; badgeId: string; count: number }>
  > {
    try {
      const duplicates = await this.database.client.$queryRaw<
        Array<{ userId: string; badgeId: string; count: bigint }>
      >(
        Prisma.sql`
          SELECT "userId", "badgeId", COUNT(*) as count
          FROM "UserBadge"
          GROUP BY "userId", "badgeId"
          HAVING COUNT(*) > 1
        `
      );

      const result = duplicates.map(d => ({
        userId: d.userId,
        badgeId: d.badgeId,
        count: Number(d.count),
      }));

      if (result.length > 0) {
        this.logger.warn(`Found ${result.length} duplicated user badge entries`);
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to find duplicated user badges:', error);
      return [];
    }
  }

  /**
   * Find UserBadge entries that reference non-existent badges
   */
  private async findInvalidBadgeReferences(): Promise<Array<{ userId: string; badgeId: string }>> {
    try {
      const userBadges = await this.database.client.userBadge.findMany({
        select: { userId: true, badgeId: true },
      });

      const validBadgeIds = new Set(
        (await this.database.client.badge.findMany({ select: { id: true } })).map(b => b.id)
      );

      const invalid = userBadges.filter(ub => !validBadgeIds.has(ub.badgeId));

      if (invalid.length > 0) {
        this.logger.warn(`Found ${invalid.length} invalid badge references in UserBadge table`);
      }

      return invalid;
    } catch (error) {
      this.logger.error('Failed to find invalid badge references:', error);
      return [];
    }
  }

  /**
   * Find badge definitions that exist in service but not in database
   */
  private async findMissingBadgeDefinitions(): Promise<string[]> {
    try {
      const serviceBadges = this.badgeService.getAvailableBadges(true);
      const dbBadgeIds = new Set(
        (await this.database.client.badge.findMany({ select: { id: true } })).map(b => b.id)
      );

      const missing = serviceBadges
        .filter(badge => !dbBadgeIds.has(badge.id))
        .map(badge => badge.id);

      if (missing.length > 0) {
        this.logger.warn(`Found ${missing.length} missing badge definitions in database:`, missing);
      }

      return missing;
    } catch (error) {
      this.logger.error('Failed to find missing badge definitions:', error);
      return [];
    }
  }

  /**
   * Find badges with inconsistent data between service and database
   */
  private async findInconsistentBadgeData(): Promise<Array<{ badgeId: string; issues: string[] }>> {
    try {
      const serviceBadges = this.badgeService.getAvailableBadges(true);
      const dbBadges = await this.database.client.badge.findMany();

      const inconsistencies: Array<{ badgeId: string; issues: string[] }> = [];

      for (const serviceBadge of serviceBadges) {
        const dbBadge = dbBadges.find(db => db.id === serviceBadge.id);
        if (!dbBadge) {
          continue;
        }

        const issues: string[] = [];

        if (dbBadge.name !== serviceBadge.name) {
          issues.push(`Name mismatch: DB='${dbBadge.name}' vs Service='${serviceBadge.name}'`);
        }

        if (dbBadge.description !== serviceBadge.description) {
          issues.push('Description mismatch');
        }

        if (dbBadge.icon !== serviceBadge.icon) {
          issues.push(`Icon mismatch: DB='${dbBadge.icon}' vs Service='${serviceBadge.icon}'`);
        }

        if (dbBadge.category !== serviceBadge.category) {
          issues.push(
            `Category mismatch: DB='${dbBadge.category}' vs Service='${serviceBadge.category}'`
          );
        }

        if (dbBadge.rarity !== serviceBadge.rarity) {
          issues.push(
            `Rarity mismatch: DB='${dbBadge.rarity}' vs Service='${serviceBadge.rarity}'`
          );
        }

        if (dbBadge.isActive !== serviceBadge.isActive) {
          issues.push(
            `Active status mismatch: DB=${dbBadge.isActive} vs Service=${serviceBadge.isActive}`
          );
        }

        if (dbBadge.isSecret !== serviceBadge.isSecret) {
          issues.push(
            `Secret status mismatch: DB=${dbBadge.isSecret} vs Service=${serviceBadge.isSecret}`
          );
        }

        if (issues.length > 0) {
          inconsistencies.push({ badgeId: serviceBadge.id, issues });
        }
      }

      if (inconsistencies.length > 0) {
        this.logger.warn(`Found ${inconsistencies.length} badges with inconsistent data`);
      }

      return inconsistencies;
    } catch (error) {
      this.logger.error('Failed to find inconsistent badge data:', error);
      return [];
    }
  }

  /**
   * Automatically fix issues where possible
   */
  private async autoFixIssues(auditResults: any): Promise<number> {
    let fixedCount = 0;

    try {
      // Fix 1: Remove duplicate user badges (keep the earliest one)
      for (const duplicate of auditResults.duplicatedUserBadges) {
        const userBadges = await this.database.client.userBadge.findMany({
          where: {
            userId: duplicate.userId,
            badgeId: duplicate.badgeId,
          },
          orderBy: { earnedAt: 'asc' },
        });

        // Keep the first one, delete the rest
        if (userBadges.length > 1) {
          const toDelete = userBadges.slice(1);
          for (const badge of toDelete) {
            await this.database.client.userBadge.delete({
              where: { id: badge.id },
            });
            fixedCount++;
          }
          this.logger.info(
            `Removed ${toDelete.length} duplicate badges for user ${duplicate.userId}, badge ${duplicate.badgeId}`
          );
        }
      }

      // Fix 2: Remove invalid badge references
      for (const invalid of auditResults.invalidBadgeReferences) {
        await this.database.client.userBadge.deleteMany({
          where: {
            userId: invalid.userId,
            badgeId: invalid.badgeId,
          },
        });
        fixedCount++;
        this.logger.info(
          `Removed invalid badge reference: user ${invalid.userId}, badge ${invalid.badgeId}`
        );
      }

      // Fix 3: Sync inconsistent badge data (update DB with service data)
      for (const inconsistent of auditResults.inconsistentBadgeData) {
        const serviceBadge = this.badgeService.getBadge(inconsistent.badgeId);
        if (serviceBadge) {
          await this.database.client.badge.update({
            where: { id: inconsistent.badgeId },
            data: {
              name: serviceBadge.name,
              description: serviceBadge.description,
              icon: serviceBadge.icon,
              category: serviceBadge.category,
              rarity: serviceBadge.rarity,
              requirements: JSON.stringify(serviceBadge.requirements),
              isActive: serviceBadge.isActive,
              isSecret: serviceBadge.isSecret,
            },
          });
          fixedCount++;
          this.logger.info(`Updated inconsistent badge data for: ${inconsistent.badgeId}`);
        }
      }

      // Fix 4: Create missing badge definitions in database
      const serviceBadges = this.badgeService.getAvailableBadges(true);
      for (const missingId of auditResults.missingBadgeDefinitions) {
        const serviceBadge = serviceBadges.find(b => b.id === missingId);
        if (serviceBadge) {
          await this.database.client.badge.create({
            data: {
              id: serviceBadge.id,
              name: serviceBadge.name,
              description: serviceBadge.description,
              icon: serviceBadge.icon,
              category: serviceBadge.category,
              rarity: serviceBadge.rarity,
              requirements: JSON.stringify(serviceBadge.requirements),
              isActive: serviceBadge.isActive,
              isSecret: serviceBadge.isSecret,
            },
          });
          fixedCount++;
          this.logger.info(`Created missing badge definition: ${missingId}`);
        }
      }

      this.logger.info(`Auto-fixed ${fixedCount} badge system issues`);
      return fixedCount;
    } catch (error) {
      this.logger.error('Failed to auto-fix badge issues:', error);
      return fixedCount;
    }
  }

  /**
   * Clean up orphaned badges (with confirmation)
   */
  public async cleanupOrphanedBadges(
    orphanedBadgeIds: string[],
    confirm: boolean = false
  ): Promise<number> {
    if (!confirm) {
      this.logger.warn(
        'Orphaned badge cleanup requires confirmation. Set confirm=true to proceed.'
      );
      return 0;
    }

    let cleanedCount = 0;

    try {
      for (const badgeId of orphanedBadgeIds) {
        // First, remove all user badges for this orphaned badge
        await this.database.client.userBadge.deleteMany({
          where: { badgeId },
        });

        // Then remove the badge itself
        await this.database.client.badge.delete({
          where: { id: badgeId },
        });

        cleanedCount++;
        this.logger.info(`Cleaned up orphaned badge: ${badgeId}`);
      }

      this.logger.info(`Cleaned up ${cleanedCount} orphaned badges`);
      return cleanedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup orphaned badges:', error);
      return cleanedCount;
    }
  }

  /**
   * Validate badge requirements format
   */
  public async validateBadgeRequirements(): Promise<Array<{ badgeId: string; errors: string[] }>> {
    const validationErrors: Array<{ badgeId: string; errors: string[] }> = [];

    try {
      const badges = await this.database.client.badge.findMany();

      for (const badge of badges) {
        const errors: string[] = [];

        try {
          const requirements = JSON.parse(badge.requirements as string);

          if (!Array.isArray(requirements)) {
            errors.push('Requirements must be an array');
            continue;
          }

          for (const req of requirements) {
            if (!req.type || typeof req.type !== 'string') {
              errors.push('Requirement missing or invalid type');
            }

            if (!req.operator || !['gte', 'lte', 'eq', 'between'].includes(req.operator)) {
              errors.push(`Invalid operator: ${req.operator}`);
            }

            if (req.value === undefined || req.value === null) {
              errors.push('Requirement missing value');
            }

            if (
              req.operator === 'between' &&
              (!Array.isArray(req.value) || req.value.length !== 2)
            ) {
              errors.push('Between operator requires array of 2 values');
            }
          }
        } catch (parseError) {
          errors.push('Invalid JSON in requirements field');
        }

        if (errors.length > 0) {
          validationErrors.push({ badgeId: badge.id, errors });
        }
      }

      if (validationErrors.length > 0) {
        this.logger.warn(`Found ${validationErrors.length} badges with invalid requirements`);
      }

      return validationErrors;
    } catch (error) {
      this.logger.error('Failed to validate badge requirements:', error);
      return [];
    }
  }

  /**
   * Generate badge system health report
   */
  public async generateHealthReport(): Promise<{
    totalBadges: number;
    activeBadges: number;
    totalUserBadges: number;
    uniqueUsersWithBadges: number;
    badgesByCategory: Record<string, number>;
    badgesByRarity: Record<string, number>;
    topBadgeHolders: Array<{ userId: string; badgeCount: number }>;
    issues: any;
  }> {
    try {
      const [totalBadges, activeBadges, userBadges, badgeStats] = await Promise.all([
        this.database.client.badge.count(),
        this.database.client.badge.count({ where: { isActive: true } }),
        this.database.client.userBadge.findMany({ select: { userId: true, badgeId: true } }),
        this.database.client.badge.groupBy({
          by: ['category', 'rarity'],
          _count: { id: true },
        }),
      ]);

      const uniqueUsers = new Set(userBadges.map(ub => ub.userId)).size;

      // Group by category and rarity
      const byCategory: Record<string, number> = {};
      const byRarity: Record<string, number> = {};

      for (const stat of badgeStats) {
        byCategory[stat.category] = (byCategory[stat.category] || 0) + stat._count.id;
        byRarity[stat.rarity] = (byRarity[stat.rarity] || 0) + stat._count.id;
      }

      // Top badge holders
      const userBadgeCounts = new Map<string, number>();
      for (const ub of userBadges) {
        userBadgeCounts.set(ub.userId, (userBadgeCounts.get(ub.userId) || 0) + 1);
      }

      const topHolders = Array.from(userBadgeCounts.entries())
        .map(([userId, count]) => ({ userId, badgeCount: count }))
        .sort((a, b) => b.badgeCount - a.badgeCount)
        .slice(0, 10);

      // Run audit to get issues
      const issues = await this.runFullAudit();

      return {
        totalBadges,
        activeBadges,
        totalUserBadges: userBadges.length,
        uniqueUsersWithBadges: uniqueUsers,
        badgesByCategory: byCategory,
        badgesByRarity: byRarity,
        topBadgeHolders: topHolders,
        issues,
      };
    } catch (error) {
      this.logger.error('Failed to generate health report:', error);
      throw error;
    }
  }
}
