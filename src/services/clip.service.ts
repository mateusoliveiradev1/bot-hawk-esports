import { Logger } from '../utils/logger';
import { CacheService } from './cache.service';
import { DatabaseService } from '../database/database.service';
import { BadgeService } from './badge.service';
import { ExtendedClient } from '../types/client';
import {
  EmbedBuilder,
  TextChannel,
  User,
  GuildMember,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface ClipData {
  id: string;
  userId: string;
  guildId: string;
  title: string;
  description?: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  duration?: number;
  thumbnailPath?: string;
  gameMode?: string;
  tags: string[];
  uploadedAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'featured';
  moderatorId?: string;
  moderationNote?: string;
  views: number;
  likes: number;
  dislikes: number;
  featured: boolean;
  featuredAt?: Date;
  metadata?: {
    resolution?: string;
    fps?: number;
    codec?: string;
    bitrate?: number;
  };
}

export interface ClipVote {
  id: string;
  clipId: string;
  userId: string;
  type: 'like' | 'dislike';
  votedAt: Date;
}

export interface ClipComment {
  id: string;
  clipId: string;
  userId: string;
  content: string;
  createdAt: Date;
  editedAt?: Date;
  parentId?: string; // For replies
  likes: number;
}

export interface ClipRanking {
  period: 'daily' | 'weekly' | 'monthly' | 'all_time';
  clips: {
    rank: number;
    clip: ClipData;
    score: number;
    change: number;
  }[];
  generatedAt: Date;
}

export interface ClipStats {
  userId: string;
  guildId: string;
  totalClips: number;
  totalViews: number;
  totalLikes: number;
  totalDislikes: number;
  averageScore: number;
  bestClip?: {
    id: string;
    title: string;
    score: number;
  };
  recentClips: ClipData[];
  badges: string[];
}

export interface ClipSettings {
  guildId: string;
  enabled: boolean;
  maxFileSize: number; // in MB
  allowedFormats: string[];
  maxDuration: number; // in seconds
  requireApproval: boolean;
  allowComments: boolean;
  allowVoting: boolean;
  featuredChannelId?: string;
  submissionChannelId?: string;
  moderationChannelId?: string;
  autoTags: boolean;
  qualityThreshold: number; // minimum score for auto-approval
  rewards: {
    upload: { xp: number; coins: number };
    featured: { xp: number; coins: number };
    topWeekly: { xp: number; coins: number };
    topMonthly: { xp: number; coins: number };
  };
}

/**
 * Clip Service for managing video highlights and clips
 */
export class ClipService {
  private logger: Logger;
  private cache: CacheService;
  private database: DatabaseService;
  private badgeService: BadgeService;
  private client: ExtendedClient;

  private clips: Map<string, Map<string, ClipData>> = new Map(); // guildId -> clipId -> clip
  private votes: Map<string, Map<string, ClipVote[]>> = new Map(); // guildId -> clipId -> votes
  private rankings: Map<string, Map<string, ClipRanking>> = new Map(); // guildId -> period -> ranking
  private guildSettings: Map<string, ClipSettings> = new Map(); // guildId -> settings

  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'clips');
  private readonly thumbnailDir = path.join(process.cwd(), 'uploads', 'thumbnails');
  private readonly maxFileSize = 100 * 1024 * 1024; // 100MB default
  private readonly allowedFormats = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];

  constructor(client: ExtendedClient) {
    this.logger = new Logger();
    this.cache = new CacheService();
    this.database = new DatabaseService();
    this.badgeService = new BadgeService(client);
    this.client = client;

    this.ensureDirectories();
    this.loadClips();
    this.loadVotes();
    this.loadGuildSettings();
    this.startRankingUpdater();
    this.startCleanupScheduler();
  }

  /**
   * Ensure upload directories exist
   */
  private ensureDirectories(): void {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
    if (!fs.existsSync(this.thumbnailDir)) {
      fs.mkdirSync(this.thumbnailDir, { recursive: true });
    }
  }

  /**
   * Load clips from database
   */
  private async loadClips(): Promise<void> {
    try {
      const clips = await this.database.client.clip.findMany({
        orderBy: {
          createdAt: 'desc',
        },
      });

      for (const clip of clips) {
        if (!this.clips.has(clip.guildId)) {
          this.clips.set(clip.guildId, new Map());
        }

        const clipData: ClipData = {
          id: clip.id,
          userId: clip.userId,
          guildId: clip.guildId,
          title: clip.title,
          description: clip.description || undefined,
          fileName: path.basename(clip.url),
          filePath: clip.url,
          fileSize: clip.fileSize || 0,
          duration: clip.duration || undefined,
          thumbnailPath: clip.thumbnail || undefined,
          gameMode: clip.gameType || undefined,
          tags: clip.tags || [],
          uploadedAt: clip.createdAt,
          status: clip.isApproved ? (clip.isFeatured ? 'featured' : 'approved') : 'pending',
          moderatorId: undefined, // Not available in current schema
          moderationNote: undefined, // Not available in current schema
          views: clip.views,
          likes: clip.likes,
          dislikes: clip.dislikes,
          featured: clip.isFeatured,
          featuredAt: clip.isFeatured ? clip.updatedAt : undefined,
          metadata: undefined, // Not available in current schema
        };

        this.clips.get(clip.guildId)!.set(clip.id, clipData);
      }

      this.logger.info(`Loaded ${clips.length} clips from database`);
    } catch (error) {
      this.logger.error('Failed to load clips:', error);
    }
  }

  /**
   * Load votes from database
   */
  private async loadVotes(): Promise<void> {
    try {
      const votes = await this.database.client.clipVote.findMany({
        include: {
          clip: {
            select: {
              guildId: true,
            },
          },
        },
      });

      for (const vote of votes) {
        const guildId = vote.clip.guildId;

        if (!this.votes.has(guildId)) {
          this.votes.set(guildId, new Map());
        }

        if (!this.votes.get(guildId)!.has(vote.clipId)) {
          this.votes.get(guildId)!.set(vote.clipId, []);
        }

        const clipVote: ClipVote = {
          id: vote.id,
          clipId: vote.clipId,
          userId: vote.userId,
          type: vote.type as 'like' | 'dislike',
          votedAt: vote.createdAt,
        };

        this.votes.get(guildId)!.get(vote.clipId)!.push(clipVote);
      }

      this.logger.info(`Loaded ${votes.length} clip votes`);
    } catch (error) {
      this.logger.error('Failed to load votes:', error);
    }
  }

  /**
   * Load guild settings
   */
  private async loadGuildSettings(): Promise<void> {
    try {
      const guildConfigs = await this.database.client.guildConfig.findMany();

      for (const config of guildConfigs) {
        const configData = (config.config as any) || {};
        const clipConfig = configData.clips || {};

        const settings: ClipSettings = {
          guildId: config.guildId,
          enabled: clipConfig.enabled || false,
          maxFileSize: clipConfig.maxFileSize || 50,
          allowedFormats: clipConfig.allowedFormats || this.allowedFormats,
          maxDuration: clipConfig.maxDuration || 300, // 5 minutes
          requireApproval: clipConfig.requireApproval || false,
          allowComments: clipConfig.allowComments !== false,
          allowVoting: clipConfig.allowVoting !== false,
          featuredChannelId: clipConfig.featuredChannelId || undefined,
          submissionChannelId: clipConfig.submissionChannelId || undefined,
          moderationChannelId: clipConfig.moderationChannelId || undefined,
          autoTags: clipConfig.autoTags !== false,
          qualityThreshold: clipConfig.qualityThreshold || 0.7,
          rewards: clipConfig.rewards || {
            upload: { xp: 25, coins: 10 },
            featured: { xp: 100, coins: 50 },
            topWeekly: { xp: 200, coins: 100 },
            topMonthly: { xp: 500, coins: 250 },
          },
        };

        this.guildSettings.set(config.guildId, settings);
      }

      this.logger.info(`Loaded clip settings for ${this.guildSettings.size} guilds`);
    } catch (error) {
      this.logger.error('Failed to load guild settings:', error);
    }
  }

  /**
   * Start ranking updater
   */
  private startRankingUpdater(): void {
    // Update rankings every hour
    setInterval(
      async () => {
        await this.updateAllRankings();
      },
      60 * 60 * 1000
    );

    // Award weekly/monthly rewards
    setInterval(
      async () => {
        const now = new Date();
        if (now.getHours() === 0 && now.getMinutes() < 5) {
          if (now.getDay() === 1) {
            // Monday
            await this.awardWeeklyRewards();
          }
          if (now.getDate() === 1) {
            // First day of month
            await this.awardMonthlyRewards();
          }
        }
      },
      5 * 60 * 1000
    );
  }

  /**
   * Start cleanup scheduler
   */
  private startCleanupScheduler(): void {
    // Clean up old files daily
    setInterval(
      async () => {
        await this.cleanupOldFiles();
      },
      24 * 60 * 60 * 1000
    );
  }

  /**
   * Upload clip
   */
  public async uploadClip(
    guildId: string,
    userId: string,
    file: Buffer,
    fileName: string,
    title: string,
    description?: string,
    gameMode?: string,
    tags?: string[]
  ): Promise<{ success: boolean; message: string; clipId?: string }> {
    try {
      const settings = this.guildSettings.get(guildId);
      if (!settings || !settings.enabled) {
        return {
          success: false,
          message: 'Sistema de clips não está habilitado neste servidor.',
        };
      }

      // Validate file
      const validation = this.validateFile(file, fileName, settings);
      if (!validation.valid) {
        return {
          success: false,
          message: validation.message,
        };
      }

      // Generate unique filename
      const fileExtension = path.extname(fileName);
      const uniqueFileName = `${crypto.randomUUID()}${fileExtension}`;
      const filePath = path.join(this.uploadDir, uniqueFileName);

      // Save file
      fs.writeFileSync(filePath, file);

      // Create clip record
      const clipId = crypto.randomUUID();
      const clipData: ClipData = {
        id: clipId,
        userId,
        guildId,
        title,
        description,
        fileName: uniqueFileName,
        filePath,
        fileSize: file.length,
        gameMode,
        tags: tags || [],
        uploadedAt: new Date(),
        status: settings.requireApproval ? 'pending' : 'approved',
        views: 0,
        likes: 0,
        dislikes: 0,
        featured: false,
      };

      // Save to database
      await this.database.client.clip.create({
        data: {
          id: clipId,
          userId,
          guildId,
          title,
          description: description || null,
          url: filePath,
          thumbnail: null,
          duration: null,
          fileSize: file.length,
          gameType: gameMode || null,
          tags: tags || [],
          views: 0,
          likes: 0,
          dislikes: 0,
          isApproved: !settings.requireApproval,
          isFeatured: false,
        },
      });

      this.logger.info(`Clip uploaded successfully: ${clipId}`);

      return {
        success: true,
        message: 'Clip enviado com sucesso!',
        clipId,
      };

      /*
      // Store in memory
      if (!this.clips.has(guildId)) {
        this.clips.set(guildId, new Map());
      }
      this.clips.get(guildId)!.set(clipId, clipData);
      
      // Award upload rewards
      await this.awardUploadRewards(guildId, userId);
      
      // Send notifications
      if (settings.requireApproval) {
        await this.sendModerationNotification(guildId, clipData);
      } else {
        await this.sendSubmissionNotification(guildId, clipData);
      }
      
      // Update user stats
      await this.updateUserStats(guildId, userId);
      
      this.logger.info(`Clip uploaded by user ${userId} in guild ${guildId}: ${title}`);
      
      return {
        success: true,
        message: settings.requireApproval ? 
          'Clip enviado com sucesso! Aguardando aprovação da moderação.' :
          'Clip enviado e publicado com sucesso!',
        clipId
      };
      */
    } catch (error) {
      this.logger.error(`Failed to upload clip for user ${userId}:`, error);
      return {
        success: false,
        message: 'Erro interno. Tente novamente mais tarde.',
      };
    }
  }

  /**
   * Validate uploaded file
   */
  private validateFile(
    file: Buffer,
    fileName: string,
    settings: ClipSettings
  ): { valid: boolean; message: string } {
    // Check file size
    const fileSizeMB = file.length / (1024 * 1024);
    if (fileSizeMB > settings.maxFileSize) {
      return {
        valid: false,
        message: `Arquivo muito grande. Tamanho máximo: ${settings.maxFileSize}MB`,
      };
    }

    // Check file format
    const fileExtension = path.extname(fileName).toLowerCase();
    if (!settings.allowedFormats.includes(fileExtension)) {
      return {
        valid: false,
        message: `Formato não suportado. Formatos aceitos: ${settings.allowedFormats.join(', ')}`,
      };
    }

    return { valid: true, message: 'Valido' };
  }

  /**
   * Vote on clip
   */
  public async voteClip(
    guildId: string,
    clipId: string,
    userId: string,
    voteType: 'like' | 'dislike'
  ): Promise<{ success: boolean; message: string }> {
    try {
      const settings = this.guildSettings.get(guildId);
      if (!settings || !settings.allowVoting) {
        return {
          success: false,
          message: 'Votação não está habilitada neste servidor.',
        };
      }

      const clip = this.getClip(guildId, clipId);
      if (!clip) {
        return {
          success: false,
          message: 'Clip não encontrado.',
        };
      }

      // Check if user already voted
      const existingVote = await this.database.client.clipVote.findFirst({
        where: {
          clipId,
          userId,
        },
      });

      if (existingVote) {
        if (existingVote.type === voteType) {
          // Remove vote
          await this.database.client.clipVote.delete({
            where: { id: existingVote.id },
          });

          // Update clip stats
          const updateData =
            voteType === 'like' ? { likes: { decrement: 1 } } : { dislikes: { decrement: 1 } };

          await this.database.client.clip.update({
            where: { id: clipId },
            data: updateData,
          });

          // Update memory
          if (voteType === 'like') {
            clip.likes--;
          } else {
            clip.dislikes--;
          }

          // Remove from votes map
          const guildVotes = this.votes.get(guildId)?.get(clipId) || [];
          const voteIndex = guildVotes.findIndex(v => v.userId === userId);
          if (voteIndex !== -1) {
            guildVotes.splice(voteIndex, 1);
          }

          return {
            success: true,
            message: 'Voto removido com sucesso.',
          };
        } else {
          // Change vote
          await this.database.client.clipVote.update({
            where: { id: existingVote.id },
            data: { type: voteType },
          });

          // Update clip stats
          const updateData =
            voteType === 'like'
              ? { likes: { increment: 1 }, dislikes: { decrement: 1 } }
              : { likes: { decrement: 1 }, dislikes: { increment: 1 } };

          await this.database.client.clip.update({
            where: { id: clipId },
            data: updateData,
          });

          // Update memory
          if (voteType === 'like') {
            clip.likes++;
            clip.dislikes--;
          } else {
            clip.likes--;
            clip.dislikes++;
          }

          // Update votes map
          const guildVotes = this.votes.get(guildId)?.get(clipId) || [];
          const existingVoteData = guildVotes.find(v => v.userId === userId);
          if (existingVoteData) {
            existingVoteData.type = voteType;
            existingVoteData.votedAt = new Date();
          }

          return {
            success: true,
            message: 'Voto alterado com sucesso.',
          };
        }
      } else {
        // New vote
        const voteId = crypto.randomUUID();

        await this.database.client.clipVote.create({
          data: {
            clipId,
            userId,
            type: voteType,
          },
        });

        // Update clip stats
        const updateData =
          voteType === 'like' ? { likes: { increment: 1 } } : { dislikes: { increment: 1 } };

        await this.database.client.clip.update({
          where: { id: clipId },
          data: updateData,
        });

        // Update memory
        if (voteType === 'like') {
          clip.likes++;
        } else {
          clip.dislikes++;
        }

        // Add to votes map
        if (!this.votes.has(guildId)) {
          this.votes.set(guildId, new Map());
        }
        if (!this.votes.get(guildId)!.has(clipId)) {
          this.votes.get(guildId)!.set(clipId, []);
        }

        const newVote: ClipVote = {
          id: voteId,
          clipId,
          userId,
          type: voteType,
          votedAt: new Date(),
        };

        this.votes.get(guildId)!.get(clipId)!.push(newVote);

        return {
          success: true,
          message: `${voteType === 'like' ? 'Like' : 'Dislike'} adicionado com sucesso.`,
        };
      }
    } catch (error) {
      this.logger.error(`Failed to vote on clip ${clipId}:`, error);
      return {
        success: false,
        message: 'Erro interno. Tente novamente mais tarde.',
      };
    }
  }

  /**
   * Moderate clip
   */
  public async moderateClip(
    guildId: string,
    clipId: string,
    moderatorId: string,
    action: 'approve' | 'reject' | 'feature',
    note?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const clip = this.getClip(guildId, clipId);
      if (!clip) {
        return {
          success: false,
          message: 'Clip não encontrado.',
        };
      }

      let newStatus: 'approved' | 'rejected' | 'featured';
      let featured = false;
      let featuredAt: Date | undefined;

      switch (action) {
        case 'approve':
          newStatus = 'approved';
          break;
        case 'reject':
          newStatus = 'rejected';
          break;
        case 'feature':
          newStatus = 'featured';
          featured = true;
          featuredAt = new Date();
          break;
      }

      // Update database
      await this.database.client.clip.update({
        where: { id: clipId },
        data: {
          isApproved: action === 'approve' || action === 'feature',
          isFeatured: action === 'feature',
        },
      });
      this.logger.info(`Clip ${clipId} moderated: ${action} by ${moderatorId}`);

      return {
        success: false,
        message: 'Sistema de moderação de clips temporariamente desabilitado para manutenção.',
      };

      /*
      // Update memory
      clip.status = newStatus;
      clip.moderatorId = moderatorId;
      clip.moderationNote = note;
      clip.featured = featured;
      clip.featuredAt = featuredAt;
      
      // Send notifications
      if (action === 'approve') {
        await this.sendApprovalNotification(guildId, clip);
      } else if (action === 'feature') {
        await this.sendFeatureNotification(guildId, clip);
        await this.awardFeatureRewards(guildId, clip.userId);
      } else if (action === 'reject') {
        await this.sendRejectionNotification(guildId, clip, note);
      }
      
      this.logger.info(`Clip ${clipId} ${action}d by moderator ${moderatorId}`);
      
      return {
        success: true,
        message: `Clip ${action === 'approve' ? 'aprovado' : action === 'reject' ? 'rejeitado' : 'destacado'} com sucesso.`
      };
      */
    } catch (error) {
      this.logger.error(`Failed to moderate clip ${clipId}:`, error);
      return {
        success: false,
        message: 'Erro interno. Tente novamente mais tarde.',
      };
    }
  }

  /**
   * Get clip
   */
  public getClip(guildId: string, clipId: string): ClipData | null {
    return this.clips.get(guildId)?.get(clipId) || null;
  }

  /**
   * Get clips for guild
   */
  public getClips(
    guildId: string,
    status?: 'pending' | 'approved' | 'rejected' | 'featured',
    limit: number = 50,
    offset: number = 0
  ): ClipData[] {
    const guildClips = this.clips.get(guildId);
    if (!guildClips) {
      return [];
    }

    let clips = Array.from(guildClips.values());

    if (status) {
      clips = clips.filter(clip => clip.status === status);
    }

    return clips
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
      .slice(offset, offset + limit);
  }

  /**
   * Get user clips
   */
  public getUserClips(guildId: string, userId: string, limit: number = 20): ClipData[] {
    const guildClips = this.clips.get(guildId);
    if (!guildClips) {
      return [];
    }

    return Array.from(guildClips.values())
      .filter(clip => clip.userId === userId)
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get clip ranking
   */
  public getClipRanking(
    guildId: string,
    period: 'daily' | 'weekly' | 'monthly' | 'all_time',
    limit: number = 20
  ): ClipRanking | null {
    return this.rankings.get(guildId)?.get(period) || null;
  }

  /**
   * Search clips
   */
  public searchClips(
    guildId: string,
    query: string,
    tags?: string[],
    gameMode?: string,
    limit: number = 20
  ): ClipData[] {
    const guildClips = this.clips.get(guildId);
    if (!guildClips) {
      return [];
    }

    const searchTerms = query.toLowerCase().split(' ');

    return Array.from(guildClips.values())
      .filter(clip => {
        // Status filter
        if (clip.status !== 'approved' && clip.status !== 'featured') {
          return false;
        }

        // Text search
        const titleMatch = searchTerms.every(term => clip.title.toLowerCase().includes(term));
        const descriptionMatch =
          clip.description &&
          searchTerms.every(term => clip.description!.toLowerCase().includes(term));

        if (!titleMatch && !descriptionMatch) {
          return false;
        }

        // Tags filter
        if (tags && tags.length > 0) {
          const hasMatchingTag = tags.some(tag =>
            clip.tags.some(clipTag => clipTag.toLowerCase().includes(tag.toLowerCase()))
          );
          if (!hasMatchingTag) {
            return false;
          }
        }

        // Game mode filter
        if (gameMode && clip.gameMode !== gameMode) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Sort by relevance (likes - dislikes) and recency
        const scoreA = a.likes - a.dislikes;
        const scoreB = b.likes - b.dislikes;

        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }

        return b.uploadedAt.getTime() - a.uploadedAt.getTime();
      })
      .slice(0, limit);
  }

  /**
   * Get user clip stats
   */
  public async getUserClipStats(guildId: string, userId: string): Promise<ClipStats> {
    const userClips = this.getUserClips(guildId, userId, 1000);

    const totalViews = userClips.reduce((sum, clip) => sum + clip.views, 0);
    const totalLikes = userClips.reduce((sum, clip) => sum + clip.likes, 0);
    const totalDislikes = userClips.reduce((sum, clip) => sum + clip.dislikes, 0);
    const averageScore = userClips.length > 0 ? (totalLikes - totalDislikes) / userClips.length : 0;

    // Find best clip
    let bestClip: { id: string; title: string; score: number } | undefined;
    let bestScore = -Infinity;

    for (const clip of userClips) {
      const score = clip.likes - clip.dislikes;
      if (score > bestScore) {
        bestScore = score;
        bestClip = {
          id: clip.id,
          title: clip.title,
          score,
        };
      }
    }

    // Get user badges related to clips
    const userBadges = await this.database.client.userBadge.findMany({
      where: {
        userId,
        badge: {
          category: 'clips',
        },
      },
      include: {
        badge: true,
      },
    });

    return {
      userId,
      guildId,
      totalClips: userClips.length,
      totalViews,
      totalLikes,
      totalDislikes,
      averageScore,
      bestClip,
      recentClips: userClips.slice(0, 5),
      badges: userBadges.map(ub => ub.badgeId),
    };
  }

  /**
   * Update all rankings
   */
  private async updateAllRankings(): Promise<void> {
    try {
      for (const guildId of this.clips.keys()) {
        await this.updateGuildRankings(guildId);
      }

      this.logger.debug('Updated all clip rankings');
    } catch (error) {
      this.logger.error('Failed to update clip rankings:', error);
    }
  }

  /**
   * Update guild rankings
   */
  private async updateGuildRankings(guildId: string): Promise<void> {
    const periods: ('daily' | 'weekly' | 'monthly' | 'all_time')[] = [
      'daily',
      'weekly',
      'monthly',
      'all_time',
    ];

    for (const period of periods) {
      const ranking = this.calculateRanking(guildId, period);

      if (!this.rankings.has(guildId)) {
        this.rankings.set(guildId, new Map());
      }

      this.rankings.get(guildId)!.set(period, ranking);
    }
  }

  /**
   * Calculate ranking for period
   */
  private calculateRanking(
    guildId: string,
    period: 'daily' | 'weekly' | 'monthly' | 'all_time'
  ): ClipRanking {
    const guildClips = this.clips.get(guildId);
    if (!guildClips) {
      return {
        period,
        clips: [],
        generatedAt: new Date(),
      };
    }

    // Filter clips by period
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'daily':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'weekly':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'all_time':
      default:
        startDate = new Date(0);
        break;
    }

    const filteredClips = Array.from(guildClips.values())
      .filter(clip => {
        return clip.status === 'approved' || clip.status === 'featured';
      })
      .filter(clip => {
        return period === 'all_time' || clip.uploadedAt >= startDate;
      });

    // Calculate scores and sort
    const rankedClips = filteredClips
      .map(clip => {
        // Score calculation: likes - dislikes + views/10 + featured bonus
        let score = clip.likes - clip.dislikes + Math.floor(clip.views / 10);
        if (clip.featured) {
          score += 50;
        }

        return {
          rank: 0, // Will be set after sorting
          clip,
          score,
          change: 0, // Would need historical data
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 50); // Top 50

    // Set ranks
    rankedClips.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return {
      period,
      clips: rankedClips,
      generatedAt: new Date(),
    };
  }

  /**
   * Award upload rewards
   */
  private async awardUploadRewards(guildId: string, userId: string): Promise<void> {
    try {
      const settings = this.guildSettings.get(guildId);
      if (!settings) {
        return;
      }

      const { xp, coins } = settings.rewards.upload;

      await this.database.client.user.upsert({
        where: {
          id: userId,
        },
        update: {
          xp: { increment: xp },
          coins: { increment: coins },
        },
        create: {
          id: userId,
          username: 'Unknown',
          discriminator: '0000',
          xp,
          coins,
        },
      });

      // Update badge progress for clip uploads
      await this.badgeService.updateProgress(userId, 'clips_uploaded', 1);

      this.logger.info(`Awarded upload rewards to user ${userId}: ${xp} XP, ${coins} coins`);
    } catch (error) {
      this.logger.error(`Failed to award upload rewards to user ${userId}:`, error);
    }
  }

  /**
   * Award feature rewards
   */
  private async awardFeatureRewards(guildId: string, userId: string): Promise<void> {
    try {
      const settings = this.guildSettings.get(guildId);
      if (!settings) {
        return;
      }

      const { xp, coins } = settings.rewards.featured;

      await this.database.client.user.upsert({
        where: {
          id: userId,
        },
        update: {
          xp: { increment: xp },
          coins: { increment: coins },
        },
        create: {
          id: userId,
          username: 'Unknown',
          discriminator: '0000',
          xp,
          coins,
        },
      });

      // Award featured clip badge
      await this.badgeService.awardBadge(userId, 'featured_clip');

      this.logger.info(`Awarded feature rewards to user ${userId}: ${xp} XP, ${coins} coins`);
    } catch (error) {
      this.logger.error(`Failed to award feature rewards to user ${userId}:`, error);
    }
  }

  /**
   * Award weekly rewards
   */
  private async awardWeeklyRewards(): Promise<void> {
    try {
      for (const guildId of this.rankings.keys()) {
        const weeklyRanking = this.rankings.get(guildId)?.get('weekly');
        if (!weeklyRanking || weeklyRanking.clips.length === 0) {
          continue;
        }

        const settings = this.guildSettings.get(guildId);
        if (!settings) {
          continue;
        }

        const topClip = weeklyRanking.clips[0];
        if (!topClip) {
          this.logger.info(`No clips found for weekly rewards in guild ${guildId}`);
          continue;
        }

        const { xp, coins } = settings.rewards.topWeekly;

        await this.database.client.user.upsert({
          where: {
            id: topClip.clip.userId,
          },
          update: {
            xp: { increment: xp },
            coins: { increment: coins },
          },
          create: {
            id: topClip.clip.userId,
            username: 'Unknown',
            discriminator: '0000',
            xp,
            coins,
          },
        });

        // Award weekly winner badge
        await this.badgeService.awardBadge(topClip.clip.userId, 'weekly_clip_winner');

        this.logger.info(
          `Awarded weekly clip rewards to user ${topClip.clip.userId} in guild ${guildId}`
        );
      }
    } catch (error) {
      this.logger.error('Failed to award weekly rewards:', error);
    }
  }

  /**
   * Award monthly rewards
   */
  private async awardMonthlyRewards(): Promise<void> {
    try {
      for (const guildId of this.rankings.keys()) {
        const monthlyRanking = this.rankings.get(guildId)?.get('monthly');
        if (!monthlyRanking || monthlyRanking.clips.length === 0) {
          continue;
        }

        const settings = this.guildSettings.get(guildId);
        if (!settings) {
          continue;
        }

        const topClip = monthlyRanking.clips[0];
        if (!topClip) {
          this.logger.info(`No clips found for monthly rewards in guild ${guildId}`);
          return;
        }

        const { xp, coins } = settings.rewards.topMonthly;

        await this.database.client.user.upsert({
          where: {
            id: topClip.clip.userId,
          },
          update: {
            xp: { increment: xp },
            coins: { increment: coins },
          },
          create: {
            id: topClip.clip.userId,
            username: 'Unknown',
            discriminator: '0000',
            xp,
            coins,
          },
        });

        // Award monthly winner badge
        await this.badgeService.awardBadge(topClip.clip.userId, 'monthly_clip_winner');

        this.logger.info(
          `Awarded monthly clip rewards to user ${topClip.clip.userId} in guild ${guildId}`
        );
      }
    } catch (error) {
      this.logger.error('Failed to award monthly rewards:', error);
    }
  }

  /**
   * Update user stats
   */
  private async updateUserStats(guildId: string, userId: string): Promise<void> {
    try {
      const userClips = this.getUserClips(guildId, userId, 1000);

      // User stats are now tracked in the User model
      // No need to update separate stats table
    } catch (error) {
      this.logger.error(`Failed to update user stats for ${userId}:`, error);
    }
  }

  /**
   * Send moderation notification
   */
  private async sendModerationNotification(guildId: string, clip: ClipData): Promise<void> {
    try {
      const settings = this.guildSettings.get(guildId);
      if (!settings || !settings.moderationChannelId) {
        return;
      }

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        return;
      }

      const channel = guild.channels.cache.get(settings.moderationChannelId) as TextChannel;
      if (!channel) {
        return;
      }

      const user = await this.client.users.fetch(clip.userId);

      const embed = new EmbedBuilder()
        .setColor('#ffaa00')
        .setTitle('🎬 Novo Clip para Moderação')
        .setDescription(`**${clip.title}**\n${clip.description || 'Sem descrição'}`)
        .addFields(
          { name: '👤 Usuário', value: user.username, inline: true },
          { name: '📁 Arquivo', value: clip.fileName, inline: true },
          {
            name: '📊 Tamanho',
            value: `${(clip.fileSize / (1024 * 1024)).toFixed(2)} MB`,
            inline: true,
          }
        )
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp(clip.uploadedAt);

      if (clip.tags.length > 0) {
        embed.addFields({ name: '🏷️ Tags', value: clip.tags.join(', ') });
      }

      if (clip.gameMode) {
        embed.addFields({ name: '🎮 Modo de Jogo', value: clip.gameMode, inline: true });
      }

      const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`clip_approve_${clip.id}`)
          .setLabel('Aprovar')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`clip_feature_${clip.id}`)
          .setLabel('Destacar')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('⭐'),
        new ButtonBuilder()
          .setCustomId(`clip_reject_${clip.id}`)
          .setLabel('Rejeitar')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌')
      );

      await channel.send({ embeds: [embed], components: [buttons] });
    } catch (error) {
      this.logger.error(`Failed to send moderation notification for clip ${clip.id}:`, error);
    }
  }

  /**
   * Send submission notification
   */
  private async sendSubmissionNotification(guildId: string, clip: ClipData): Promise<void> {
    try {
      const settings = this.guildSettings.get(guildId);
      if (!settings || !settings.submissionChannelId) {
        return;
      }

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        return;
      }

      const channel = guild.channels.cache.get(settings.submissionChannelId) as TextChannel;
      if (!channel) {
        return;
      }

      const user = await this.client.users.fetch(clip.userId);

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🎬 Novo Clip Publicado')
        .setDescription(`**${clip.title}**\n${clip.description || 'Sem descrição'}`)
        .addFields(
          { name: '👤 Usuário', value: user.username, inline: true },
          { name: '⏰ Enviado em', value: clip.uploadedAt.toLocaleString('pt-BR'), inline: true }
        )
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp();

      if (clip.tags.length > 0) {
        embed.addFields({ name: '🏷️ Tags', value: clip.tags.join(', ') });
      }

      if (clip.gameMode) {
        embed.addFields({ name: '🎮 Modo de Jogo', value: clip.gameMode, inline: true });
      }

      const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`clip_like_${clip.id}`)
          .setLabel(`${clip.likes}`)
          .setStyle(ButtonStyle.Success)
          .setEmoji('👍'),
        new ButtonBuilder()
          .setCustomId(`clip_dislike_${clip.id}`)
          .setLabel(`${clip.dislikes}`)
          .setStyle(ButtonStyle.Danger)
          .setEmoji('👎'),
        new ButtonBuilder()
          .setCustomId(`clip_view_${clip.id}`)
          .setLabel('Ver Clip')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('👁️')
      );

      await channel.send({ embeds: [embed], components: [buttons] });
    } catch (error) {
      this.logger.error(`Failed to send submission notification for clip ${clip.id}:`, error);
    }
  }

  /**
   * Send approval notification
   */
  private async sendApprovalNotification(guildId: string, clip: ClipData): Promise<void> {
    try {
      const settings = this.guildSettings.get(guildId);
      if (!settings || !settings.submissionChannelId) {
        return;
      }

      await this.sendSubmissionNotification(guildId, clip);
    } catch (error) {
      this.logger.error(`Failed to send approval notification for clip ${clip.id}:`, error);
    }
  }

  /**
   * Send feature notification
   */
  private async sendFeatureNotification(guildId: string, clip: ClipData): Promise<void> {
    try {
      const settings = this.guildSettings.get(guildId);
      if (!settings || !settings.featuredChannelId) {
        return;
      }

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        return;
      }

      const channel = guild.channels.cache.get(settings.featuredChannelId) as TextChannel;
      if (!channel) {
        return;
      }

      const user = await this.client.users.fetch(clip.userId);

      const embed = new EmbedBuilder()
        .setColor('#ffd700')
        .setTitle('⭐ Clip em Destaque')
        .setDescription(`**${clip.title}**\n${clip.description || 'Sem descrição'}`)
        .addFields(
          { name: '👤 Usuário', value: user.username, inline: true },
          { name: '👍 Likes', value: clip.likes.toString(), inline: true },
          { name: '👁️ Views', value: clip.views.toString(), inline: true }
        )
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp();

      if (clip.tags.length > 0) {
        embed.addFields({ name: '🏷️ Tags', value: clip.tags.join(', ') });
      }

      if (clip.gameMode) {
        embed.addFields({ name: '🎮 Modo de Jogo', value: clip.gameMode, inline: true });
      }

      await channel.send({ embeds: [embed] });
    } catch (error) {
      this.logger.error(`Failed to send feature notification for clip ${clip.id}:`, error);
    }
  }

  /**
   * Send rejection notification
   */
  private async sendRejectionNotification(
    guildId: string,
    clip: ClipData,
    reason?: string
  ): Promise<void> {
    try {
      const user = await this.client.users.fetch(clip.userId);

      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Clip Rejeitado')
        .setDescription(`Seu clip "**${clip.title}**" foi rejeitado pela moderação.`)
        .addFields({
          name: '⏰ Enviado em',
          value: clip.uploadedAt.toLocaleString('pt-BR'),
          inline: true,
        })
        .setTimestamp();

      if (reason) {
        embed.addFields({ name: '📝 Motivo', value: reason });
      }

      await user.send({ embeds: [embed] });
    } catch (error) {
      this.logger.error(`Failed to send rejection notification for clip ${clip.id}:`, error);
    }
  }

  /**
   * Clean up old files
   */
  private async cleanupOldFiles(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      
      let cleanupStats = {
        deletedRejectedClips: 0,
        deletedOldClips: 0,
        deletedFiles: 0,
        errors: 0
      };
      
      // Find old rejected clips (older than 30 days)
      const rejectedClips = await this.database.client.clip.findMany({
        where: {
          isApproved: false,
          isFeatured: false,
          createdAt: {
            lt: thirtyDaysAgo
          }
        },
        select: {
          id: true,
          guildId: true,
          url: true,
          thumbnail: true,
          title: true
        }
      });
      
      // Find very old clips (older than 90 days) regardless of status
      const veryOldClips = await this.database.client.clip.findMany({
        where: {
          createdAt: {
            lt: ninetyDaysAgo
          }
        },
        select: {
          id: true,
          guildId: true,
          url: true,
          thumbnail: true,
          title: true
        }
      });
      
      // Cleanup rejected clips
      for (const clip of rejectedClips) {
        try {
          await this.deleteClipFiles(clip);
          
          // Delete from database
          await this.database.client.clipVote.deleteMany({
            where: { clipId: clip.id }
          });
          
          await this.database.client.clip.delete({
            where: { id: clip.id }
          });
          
          // Remove from memory
          this.clips.get(clip.guildId)?.delete(clip.id);
          
          cleanupStats.deletedRejectedClips++;
          this.logger.info(`Cleaned up rejected clip: ${clip.title} (${clip.id})`);
        } catch (error) {
          cleanupStats.errors++;
          this.logger.error(`Failed to cleanup rejected clip ${clip.id}:`, error);
        }
      }
      
      // Cleanup very old clips
      for (const clip of veryOldClips) {
        try {
          await this.deleteClipFiles(clip);
          
          // Delete from database
          await this.database.client.clipVote.deleteMany({
            where: { clipId: clip.id }
          });
          
          await this.database.client.clip.delete({
            where: { id: clip.id }
          });
          
          // Remove from memory
          this.clips.get(clip.guildId)?.delete(clip.id);
          
          cleanupStats.deletedOldClips++;
          this.logger.info(`Cleaned up old clip: ${clip.title} (${clip.id})`);
        } catch (error) {
          cleanupStats.errors++;
          this.logger.error(`Failed to cleanup old clip ${clip.id}:`, error);
        }
      }
      
      this.logger.info('Clip cleanup completed', cleanupStats);
    } catch (error) {
      this.logger.error('Failed to cleanup old files:', error);
    }
  }
  
  /**
   * Delete clip files from filesystem
   */
  private async deleteClipFiles(clip: { url: string; thumbnail?: string | null }): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    
    try {
      // Delete main video file
      if (clip.url) {
        // Handle both URL and file path formats
        let filePath = clip.url;
        if (clip.url.startsWith('http')) {
          // If it's a URL, extract filename and construct local path
          const fileName = path.basename(clip.url);
          filePath = path.join(this.uploadDir, fileName);
        }
        
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          this.logger.debug(`Deleted clip file: ${filePath}`);
        }
      }
      
      // Delete thumbnail if exists
      if (clip.thumbnail) {
        let thumbnailPath = clip.thumbnail;
        if (clip.thumbnail.startsWith('http')) {
          const fileName = path.basename(clip.thumbnail);
          thumbnailPath = path.join(this.thumbnailDir, fileName);
        }
        
        if (fs.existsSync(thumbnailPath)) {
          fs.unlinkSync(thumbnailPath);
          this.logger.debug(`Deleted thumbnail: ${thumbnailPath}`);
        }
      }
    } catch (error) {
      this.logger.warn('Failed to delete clip files:', error);
      throw error;
    }
  }

  /**
   * Delete clip by ID
   */
  public async deleteClip(clipId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Find the clip in database
      const clip = await this.database.client.clip.findUnique({
        where: { id: clipId },
        select: {
          id: true,
          guildId: true,
          url: true,
          thumbnail: true,
          title: true
        }
      });
      
      if (!clip) {
        return {
          success: false,
          message: 'Clip não encontrado.'
        };
      }
      
      // Delete files from filesystem
      await this.deleteClipFiles(clip);
      
      // Delete votes from database
      await this.database.client.clipVote.deleteMany({
        where: { clipId: clip.id }
      });
      
      // Delete clip from database
      await this.database.client.clip.delete({
        where: { id: clip.id }
      });
      
      // Remove from memory
      this.clips.get(clip.guildId)?.delete(clip.id);
      
      this.logger.info(`Deleted clip: ${clip.title} (${clip.id})`);
      
      return {
        success: true,
        message: 'Clip deletado com sucesso.'
      };
    } catch (error) {
      this.logger.error(`Failed to delete clip ${clipId}:`, error);
      return {
        success: false,
        message: 'Erro ao deletar o clip.'
      };
    }
  }

  /**
   * Configure guild settings
   */
  public async configureGuildSettings(
    guildId: string,
    settings: Partial<ClipSettings>
  ): Promise<void> {
    try {
      const currentSettings = this.guildSettings.get(guildId) || {
        guildId,
        enabled: false,
        maxFileSize: 50,
        allowedFormats: this.allowedFormats,
        maxDuration: 300,
        requireApproval: false,
        allowComments: true,
        allowVoting: true,
        autoTags: true,
        qualityThreshold: 0.7,
        rewards: {
          upload: { xp: 25, coins: 10 },
          featured: { xp: 100, coins: 50 },
          topWeekly: { xp: 200, coins: 100 },
          topMonthly: { xp: 500, coins: 250 },
        },
      };

      const updatedSettings = { ...currentSettings, ...settings };
      this.guildSettings.set(guildId, updatedSettings);

      // Save to database
      const existingConfig = await this.database.client.guildConfig.findUnique({
        where: { guildId },
      });

      const currentConfig = (existingConfig?.config as any) || {};
      const updatedConfig = {
        ...currentConfig,
        clips: {
          enabled: updatedSettings.enabled,
          maxFileSize: updatedSettings.maxFileSize,
          allowedFormats: updatedSettings.allowedFormats,
          maxDuration: updatedSettings.maxDuration,
          requireApproval: updatedSettings.requireApproval,
          allowComments: updatedSettings.allowComments,
          allowVoting: updatedSettings.allowVoting,
          featuredChannelId: updatedSettings.featuredChannelId,
          submissionChannelId: updatedSettings.submissionChannelId,
          moderationChannelId: updatedSettings.moderationChannelId,
          autoTags: updatedSettings.autoTags,
          qualityThreshold: updatedSettings.qualityThreshold,
          rewards: updatedSettings.rewards,
        },
      };

      await this.database.client.guildConfig.upsert({
        where: { guildId },
        update: {
          config: updatedConfig,
        },
        create: {
          guildId,
          config: updatedConfig,
        },
      });

      this.logger.info(`Updated clip settings for guild ${guildId}`);
    } catch (error) {
      this.logger.error(`Failed to configure clip settings for ${guildId}:`, error);
    }
  }

  /**
   * Get guild settings
   */
  public getGuildSettings(guildId: string): ClipSettings | null {
    return this.guildSettings.get(guildId) || null;
  }

  /**
   * Increment clip views
   */
  public async incrementViews(guildId: string, clipId: string): Promise<void> {
    try {
      const clip = this.getClip(guildId, clipId);
      if (!clip) {
        return;
      }

      // Update database
      await this.database.client.clip.update({
        where: { id: clipId },
        data: { views: { increment: 1 } },
      });

      // Update memory as well
      clip.views++;
    } catch (error) {
      this.logger.error(`Failed to increment views for clip ${clipId}:`, error);
    }
  }

  /**
   * Get clip file
   */
  public getClipFile(
    guildId: string,
    clipId: string
  ): { filePath: string; fileName: string } | null {
    const clip = this.getClip(guildId, clipId);
    if (!clip || !fs.existsSync(clip.filePath)) {
      return null;
    }

    return {
      filePath: clip.filePath,
      fileName: clip.fileName,
    };
  }
}
