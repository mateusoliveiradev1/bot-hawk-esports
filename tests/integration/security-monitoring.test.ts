import { jest } from '@jest/globals';
import { SecurityService } from '../../src/services/security.service';
import { HealthService } from '../../src/services/health.service';
import { MetricsService } from '../../src/services/metrics.service';
import { StructuredLogger } from '../../src/services/structured-logger.service';
import { DatabaseService } from '../../src/database/database.service';
import { CacheService } from '../../src/services/cache.service';
import { ExtendedClient } from '../../src/types/client';
import { User, Guild, GuildMember, Message } from 'discord.js';

// Mock Discord.js objects
const createMockUser = (id: string, options: Partial<User> = {}): User => ({
  id,
  username: 'testuser',
  discriminator: '1234',
  tag: 'testuser#1234',
  bot: false,
  createdAt: new Date('2020-01-01'),
  ...options,
} as User);

const createMockGuild = (id: string, options: Partial<Guild> = {}): Guild => ({
  id,
  name: 'Test Guild',
  ownerId: 'owner-123',
  memberCount: 100,
  ...options,
} as Guild);

const createMockMember = (userId: string, guildId: string, options: Partial<GuildMember> = {}): GuildMember => ({
  id: userId,
  user: createMockUser(userId),
  guild: createMockGuild(guildId),
  roles: {
    cache: new Map(),
    highest: { position: 1 },
  },
  permissions: {
    has: jest.fn().mockReturnValue(false),
  },
  joinedAt: new Date('2023-01-01'),
  ...options,
} as unknown as GuildMember);

const createMockMessage = (content: string, author: User, options: Partial<Message> = {}): Message => ({
  id: 'message-123',
  content,
  author,
  guild: createMockGuild('guild-123'),
  channel: { id: 'channel-123' },
  createdAt: new Date(),
  ...options,
} as unknown as Message);

describe('Security and Monitoring Integration', () => {
  let securityService: SecurityService;
  let healthService: HealthService;
  let metricsService: MetricsService;
  let databaseService: DatabaseService;
  let cacheService: CacheService;
  let logger: StructuredLogger;
  let client: ExtendedClient;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock services
    databaseService = {
      client: {
        user: {
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        securityLog: {
          create: jest.fn(),
          findMany: jest.fn(),
          deleteMany: jest.fn(),
        },
      },
      healthCheck: jest.fn().mockResolvedValue(true),
    } as unknown as DatabaseService;

    cacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
      keys: jest.fn(),
      healthCheck: jest.fn().mockResolvedValue(true),
    } as unknown as CacheService;

    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      logPerformance: jest.fn(),
    } as unknown as StructuredLogger;

    client = {
      user: { id: 'bot-id' },
      guilds: { cache: new Map() },
      isReady: jest.fn().mockReturnValue(true),
      ws: { ping: 50 },
    } as unknown as ExtendedClient;

    metricsService = new MetricsService(databaseService, cacheService, client);

    // Initialize SecurityService
    securityService = new SecurityService(
      databaseService,
      cacheService,
      logger,
      client,
      {
        rateLimit: {
          enabled: true,
          maxRequests: 10,
          windowMs: 60000,
          blockDuration: 300000,
        },
        antiSpam: {
          enabled: true,
          maxMessages: 5,
          timeWindow: 10000,
          muteTime: 600000,
        },
        autoMod: {
          enabled: true,
          toxicityThreshold: 0.7,
          spamThreshold: 0.8,
        },
        audit: {
          enabled: true,
          logActions: ['ban', 'kick', 'mute', 'warn'],
          retentionDays: 90,
        },
      }
    );

    // Mock HealthService
    healthService = {
      registerService: jest.fn(),
      performHealthCheck: jest.fn(),
      checkServiceHealth: jest.fn(),
      isSystemHealthy: jest.fn().mockReturnValue(true),
    } as unknown as HealthService;
  });

  describe('Complete Security Workflow', () => {
    it('should detect and handle spam attack', async () => {
      const spammer = createMockUser('spammer-123');
      const member = createMockMember('spammer-123', 'guild-123');
      
      // Simulate rapid message sending
      const messages = Array(6).fill({
        content: 'spam message',
        timestamp: Date.now(),
      });
      
      (cacheService.get as jest.Mock).mockResolvedValue(JSON.stringify(messages));
      (cacheService.incr as jest.Mock).mockResolvedValue(11); // Exceed rate limit
      
      // Check rate limit
      const rateLimitResult = await securityService.checkRateLimit('spammer-123', 'message');
      expect(rateLimitResult.allowed).toBe(false);
      
      // Check spam detection
      const spamResult = await securityService.checkSpam('spammer-123', 'spam message');
      expect(spamResult.isSpam).toBe(true);
      
      // Moderate content
      const moderationResult = await securityService.moderateContent('spam message', member);
      expect(moderationResult.action).toBe('delete');
      
      // Verify security log was created
      expect(databaseService.client.securityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          event: expect.stringMatching(/spam|rate_limit/),
          userId: 'spammer-123',
          severity: expect.any(String),
        }),
      });
    });

    it('should handle coordinated attack from multiple users', async () => {
      const attackers = ['user1', 'user2', 'user3'];
      
      // Simulate multiple users hitting rate limits simultaneously
      (cacheService.incr as jest.Mock).mockResolvedValue(15); // All exceed limit
      
      const results = await Promise.all(
        attackers.map(userId => securityService.checkRateLimit(userId, 'command'))
      );
      
      // All should be blocked
      results.forEach(result => {
        expect(result.allowed).toBe(false);
      });
      
      // Verify multiple security logs
      expect(databaseService.client.securityLog.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('Risk Assessment Integration', () => {
    it('should escalate actions based on user risk level', async () => {
      const suspiciousUser = createMockUser('suspicious-123', {
        createdAt: new Date(), // New account
      });
      const member = createMockMember('suspicious-123', 'guild-123', {
        user: suspiciousUser,
        joinedAt: new Date(), // Just joined
      });
      
      // Mock user with violations
      (databaseService.client.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'suspicious-123',
        warnings: 2,
        lastViolation: new Date(),
        joinedAt: new Date(),
      });
      
      const riskAssessment = await securityService.assessUserRisk(member);
      expect(riskAssessment.level).toBe('high');
      
      // High-risk user should get stricter moderation
      const moderationResult = await securityService.moderateContent(
        'borderline toxic message',
        member
      );
      
      // Should be more aggressive with high-risk users
      expect(['warn', 'mute', 'kick']).toContain(moderationResult.action);
    });
  });

  describe('Health Monitoring Integration', () => {
    it('should monitor security service health', async () => {
      // Register security service with health monitoring
      healthService.registerService('security', async () => {
        const isHealthy = await securityService.healthCheck();
        return {
          name: 'Security',
          status: isHealthy ? 'healthy' : 'unhealthy',
          lastCheck: new Date(),
          responseTime: 100,
        };
      });
      
      expect(healthService.registerService).toHaveBeenCalledWith(
        'security',
        expect.any(Function)
      );
      
      // Simulate health check
      const healthCheckFn = (healthService.registerService as jest.Mock).mock.calls[0][1];
      const healthResult = await healthCheckFn();
      
      expect(healthResult.name).toBe('Security');
      expect(healthResult.status).toBe('healthy');
    });

    it('should detect security service degradation', async () => {
      // Simulate cache service failure
      (cacheService.get as jest.Mock).mockRejectedValue(new Error('Cache unavailable'));
      
      const rateLimitResult = await securityService.checkRateLimit('user-123', 'command');
      
      // Should fallback gracefully
      expect(rateLimitResult.allowed).toBe(true); // Fail open for availability
      
      // Should log the error
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit check failed'),
        expect.any(Error)
      );
    });
  });

  describe('Metrics Collection Integration', () => {
    it('should collect security metrics', async () => {
      // Perform various security operations
      await securityService.checkRateLimit('user-123', 'command');
      await securityService.checkSpam('user-456', 'normal message');
      
      const member = createMockMember('user-789', 'guild-123');
      await securityService.moderateContent('clean message', member);
      
      // Check that metrics were recorded
      const metrics = metricsService.getRecordedMetrics();
      
      expect(metrics.has('security_rate_limit_checks')).toBe(true);
      expect(metrics.has('security_spam_checks')).toBe(true);
      expect(metrics.has('security_content_moderation')).toBe(true);
    });

    it('should track security incidents over time', async () => {
      const spammer = createMockMember('spammer-123', 'guild-123');
      
      // Simulate multiple security incidents
      for (let i = 0; i < 5; i++) {
        await securityService.logSecurityEvent(
          'spam_detected',
          'spammer-123',
          { messageCount: i + 1 }
        );
      }
      
      // Verify incidents were logged
      expect(databaseService.client.securityLog.create).toHaveBeenCalledTimes(5);
      
      // Check metrics reflect the incidents
      const metrics = metricsService.getRecordedMetrics();
      expect(metrics.has('security_incidents')).toBe(true);
    });
  });

  describe('Performance Under Load', () => {
    it('should handle high volume of security checks', async () => {
      const startTime = Date.now();
      
      // Simulate high load
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(securityService.checkRateLimit(`user-${i}`, 'command'));
      }
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      
      // All checks should complete
      expect(results).toHaveLength(100);
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(endTime - startTime).toBeLessThan(5000); // 5 seconds
      
      // Verify performance metrics
      const metrics = metricsService.getRecordedMetrics();
      expect(metrics.has('security_check_duration')).toBe(true);
    });

    it('should maintain accuracy under concurrent load', async () => {
      const userId = 'concurrent-user';
      
      // Simulate concurrent rate limit checks for same user
      const promises = Array(20).fill(null).map(() => 
        securityService.checkRateLimit(userId, 'command')
      );
      
      const results = await Promise.all(promises);
      
      // Should properly track rate limits even under concurrency
      const allowedCount = results.filter(r => r.allowed).length;
      const blockedCount = results.filter(r => !r.allowed).length;
      
      expect(allowedCount + blockedCount).toBe(20);
      expect(allowedCount).toBeLessThanOrEqual(10); // Rate limit is 10
    });
  });

  describe('Data Retention and Cleanup', () => {
    it('should clean up old security logs', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100); // 100 days ago
      
      // Mock old security logs
      (databaseService.client.securityLog.findMany as jest.Mock).mockResolvedValue([
        { id: '1', timestamp: oldDate, event: 'old_event' },
        { id: '2', timestamp: new Date(), event: 'recent_event' },
      ]);
      
      (databaseService.client.securityLog.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
      
      const cleanupResult = await securityService.cleanupOldLogs();
      
      expect(cleanupResult.deletedCount).toBe(1);
      expect(databaseService.client.securityLog.deleteMany).toHaveBeenCalledWith({
        where: {
          timestamp: {
            lt: expect.any(Date),
          },
        },
      });
    });
  });

  describe('Error Recovery', () => {
    it('should recover from database failures', async () => {
      // Simulate database failure
      (databaseService.client.securityLog.create as jest.Mock)
        .mockRejectedValueOnce(new Error('Database unavailable'))
        .mockResolvedValue({ id: '123' });
      
      // First attempt should fail gracefully
      await securityService.logSecurityEvent('test_event', 'user-123', {});
      
      // Should log the error but not crash
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to log security event'),
        expect.any(Error)
      );
      
      // Second attempt should succeed
      await securityService.logSecurityEvent('test_event', 'user-123', {});
      
      expect(databaseService.client.securityLog.create).toHaveBeenCalledTimes(2);
    });
  });
});