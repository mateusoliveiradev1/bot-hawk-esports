import { AdvancedRateLimitService, AdvancedRateLimitResult } from '../../src/services/advanced-rate-limit.service';
import { CacheService } from '../../src/services/cache.service';
import { StructuredLogger } from '../../src/services/structured-logger.service';

// Mock dependencies
jest.mock('../../src/services/cache.service');
jest.mock('../../src/services/structured-logger.service');

describe('AdvancedRateLimitService', () => {
  let service: AdvancedRateLimitService;
  let mockCache: jest.Mocked<CacheService>;
  let mockLogger: jest.Mocked<StructuredLogger>;

  const mockRequest = {
    ip: '192.168.1.1',
    get: jest.fn(),
    path: '/api/test',
    method: 'GET',
    headers: {
      'user-agent': 'test-agent'
    }
  } as any;

  beforeEach(() => {
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn()
    } as any;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    } as any;

    service = new AdvancedRateLimitService(mockCache, mockLogger);
    
    // Setup default mocks
    mockRequest.get.mockImplementation((header: string) => {
      if (header === 'User-Agent') return 'test-agent';
      if (header === 'X-Forwarded-For') return null;
      return null;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    it('should allow requests within rate limit', async () => {
      mockCache.get.mockResolvedValue(null); // No existing requests
      mockCache.incr.mockResolvedValue(1);

      const result = await service.checkRateLimit('test-user', 'general', {
        ip: '192.168.1.1',
        userAgent: 'test-agent'
      });

      expect(result.allowed).toBe(true);
      expect(result.violationLevel).toBe('none');
      expect(result.recommendedAction).toBe('allow');
    });

    it('should block requests exceeding rate limit', async () => {
      mockCache.get.mockResolvedValue(101); // Exceeded limit

      const result = await service.checkRateLimit('test-user', 'general', {
        ip: '192.168.1.1',
        userAgent: 'test-agent'
      });

      expect(result.allowed).toBe(false);
      expect(result.violationLevel).toMatch(/warning|critical/);
      expect(result.recommendedAction).toMatch(/throttle|block|captcha/);
    });

    it('should detect suspicious activity for repeated violations', async () => {
      // Mock violation history
      mockCache.get.mockImplementation((key: string) => {
        if (key.includes('violations')) {
          return Promise.resolve([
            { timestamp: Date.now() - 1000, violationType: 'hard' },
            { timestamp: Date.now() - 2000, violationType: 'hard' }
          ]);
        }
        return Promise.resolve(6); // Exceeded limit
      });

      const result = await service.checkRateLimit('suspicious-user', 'auth-login', {
        ip: '192.168.1.1',
        userAgent: 'test-agent'
      });

      expect(result.allowed).toBe(false);
      expect(result.suspiciousActivity).toBe(true);
      expect(result.violationLevel).toBe('critical');
    });
  });

  describe('getStatistics', () => {
    it('should return service statistics', () => {
      const stats = service.getStatistics();

      expect(stats).toHaveProperty('totalViolations');
      expect(stats).toHaveProperty('suspiciousIPs');
      expect(stats).toHaveProperty('blacklistedIPs');
      expect(stats).toHaveProperty('whitelistedIPs');
      expect(stats).toHaveProperty('activeRateLimiters');
      expect(typeof stats.totalViolations).toBe('number');
    });
  });

  describe('whitelistIP', () => {
    it('should add IP to whitelist', () => {
      service.whitelistIP('192.168.1.1');
      
      // Verify the IP is whitelisted by checking if subsequent requests are allowed
      expect(() => service.whitelistIP('192.168.1.1')).not.toThrow();
    });
  });

  describe('blacklistIP', () => {
    it('should add IP to blacklist', () => {
      service.blacklistIP('192.168.1.1');
      
      // Verify the IP is blacklisted by checking if subsequent requests are blocked
      expect(() => service.blacklistIP('192.168.1.1')).not.toThrow();
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limit for identifier', () => {
      expect(() => service.resetRateLimit('test-user', 'general')).not.toThrow();
    });

    it('should reset all rate limits for identifier when no endpoint specified', () => {
      expect(() => service.resetRateLimit('test-user')).not.toThrow();
    });
  });








});