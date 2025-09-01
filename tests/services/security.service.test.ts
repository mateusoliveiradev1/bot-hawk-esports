import { jest } from '@jest/globals';
import { SecurityService } from '../../src/services/security.service';
import { DatabaseService } from '../../src/database/database.service';
import { Request } from 'express';

// Mock Express Request
const createMockRequest = (options: Partial<Request> = {}): Request => ({
  ip: '127.0.0.1',
  headers: {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'accept-language': 'en-US,en;q=0.9',
    'x-forwarded-for': '192.168.1.1',
  },
  connection: {
    remoteAddress: '127.0.0.1',
  },
  ...options,
} as Request);

describe('SecurityService', () => {
  let securityService: SecurityService;
  let mockDatabaseService: jest.Mocked<DatabaseService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDatabaseService = {
      client: {
        user: {
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      },
      healthCheck: jest.fn().mockResolvedValue({ healthy: true, details: {} }),
    } as unknown as jest.Mocked<DatabaseService>;

    securityService = new SecurityService(mockDatabaseService);
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', () => {
      const result = securityService.checkRateLimit('user-123', 'command', 10, 60000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      expect(result.resetTime).toBeInstanceOf(Date);
    });

    it('should block requests exceeding rate limit', () => {
      // Make 10 requests to hit the limit
      for (let i = 0; i < 10; i++) {
        securityService.checkRateLimit('user-123', 'command', 10, 60000);
      }

      // 11th request should be blocked
      const result = securityService.checkRateLimit('user-123', 'command', 10, 60000);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should reset rate limit after window expires', () => {
      // Hit the rate limit
      for (let i = 0; i < 10; i++) {
        securityService.checkRateLimit('user-123', 'command', 10, 1); // 1ms window
      }

      // Wait for window to expire
      setTimeout(() => {
        const result = securityService.checkRateLimit('user-123', 'command', 10, 60000);
        expect(result.allowed).toBe(true);
      }, 10);
    });
  });

  describe('CAPTCHA Generation', () => {
    it('should generate valid CAPTCHA', () => {
      const captcha = securityService.generateCaptcha();

      expect(captcha.id).toBeDefined();
      expect(captcha.text).toBeDefined();
      expect(captcha.svg).toBeDefined();
      expect(captcha.expiresAt).toBeInstanceOf(Date);
      expect(captcha.text.length).toBeGreaterThan(0);
    });

    it('should verify correct CAPTCHA', () => {
      const captcha = securityService.generateCaptcha();
      const result = securityService.verifyCaptcha(captcha.id, captcha.text);

      expect(result).toBe(true);
    });

    it('should reject incorrect CAPTCHA', () => {
      const captcha = securityService.generateCaptcha();
      const result = securityService.verifyCaptcha(captcha.id, 'wrong-answer');

      expect(result).toBe(false);
    });

    it('should reject expired CAPTCHA', () => {
      const captcha = securityService.generateCaptcha();
      
      // Manually expire the captcha
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60 * 1000); // 11 minutes later
      
      const result = securityService.verifyCaptcha(captcha.id, captcha.text);
      expect(result).toBe(false);
      
      jest.restoreAllMocks();
    });
  });

  describe('Request Analysis', () => {
    it('should analyze normal request with low risk', () => {
      const req = createMockRequest({
        ip: '192.168.1.100',
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const result = securityService.analyzeRequest(req);

      expect(result.isBot).toBe(false);
      expect(result.riskScore).toBeLessThan(0.5);
      expect(result.fingerprint).toBeDefined();
      expect(result.reasons).toBeInstanceOf(Array);
    });

    it('should detect bot-like requests', () => {
      const req = createMockRequest({
        headers: {
          'user-agent': 'curl/7.68.0',
        },
      });

      const result = securityService.analyzeRequest(req);

      expect(result.isBot).toBe(true);
      expect(result.riskScore).toBeGreaterThan(0.5);
      expect(result.reasons).toContain('Suspicious user agent');
    });

    it('should detect suspicious patterns', () => {
      const req = createMockRequest({
        ip: '1.1.1.1', // Known suspicious pattern
        headers: {
          'user-agent': 'python-requests/2.25.1',
        },
      });

      const result = securityService.analyzeRequest(req);

      expect(result.riskScore).toBeGreaterThan(0.3);
      expect(result.reasons.length).toBeGreaterThan(0);
    });
  });

  describe('Two-Factor Authentication', () => {
    it('should setup 2FA for user', async () => {
      mockDatabaseService.client.user.findUnique.mockResolvedValue({
        id: 'user-123',
        username: 'testuser',
        discriminator: '1234',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockDatabaseService.client.user.update.mockResolvedValue({
        id: 'user-123',
        username: 'testuser',
        discriminator: '1234',
        twoFactorEnabled: false,
        twoFactorSecret: 'test-secret',
        twoFactorBackupCodes: JSON.stringify(['code1', 'code2']),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await securityService.setup2FA('user-123');

      expect(result.secret).toBeDefined();
      expect(result.qrCode).toBeDefined();
      expect(result.backupCodes).toHaveLength(10);
      expect(mockDatabaseService.client.user.update).toHaveBeenCalled();
    });

    it('should verify valid 2FA token', async () => {
      mockDatabaseService.client.user.findUnique.mockResolvedValue({
        id: 'user-123',
        username: 'testuser',
        discriminator: '1234',
        twoFactorEnabled: true,
        twoFactorSecret: 'JBSWY3DPEHPK3PXP', // Base32 encoded secret
        twoFactorBackupCodes: JSON.stringify([]),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Generate a valid token for testing
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: 'JBSWY3DPEHPK3PXP',
        encoding: 'base32',
      });

      const result = await securityService.verify2FA('user-123', token);
      expect(result).toBe(true);
    });

    it('should reject invalid 2FA token', async () => {
      mockDatabaseService.client.user.findUnique.mockResolvedValue({
        id: 'user-123',
        username: 'testuser',
        discriminator: '1234',
        twoFactorEnabled: true,
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
        twoFactorBackupCodes: JSON.stringify([]),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await securityService.verify2FA('user-123', '000000');
      expect(result).toBe(false);
    });
  });

  describe('Security Statistics', () => {
    it('should return security stats', () => {
      // Generate some data first
      securityService.generateCaptcha();
      securityService.checkRateLimit('user-123', 'command', 10, 60000);

      const stats = securityService.getSecurityStats();

      expect(stats.activeCaptchas).toBeGreaterThanOrEqual(0);
      expect(stats.suspiciousIPs).toBeGreaterThanOrEqual(0);
      expect(stats.rateLimitEntries).toBeGreaterThanOrEqual(0);
    });

    it('should track multiple rate limit entries', () => {
      securityService.checkRateLimit('user-1', 'command', 10, 60000);
      securityService.checkRateLimit('user-2', 'message', 5, 30000);
      securityService.checkRateLimit('user-3', 'reaction', 20, 120000);

      const stats = securityService.getSecurityStats();
      expect(stats.rateLimitEntries).toBe(3);
    });
  });

  describe('Request Security Analysis', () => {
    it('should generate consistent fingerprints', () => {
      const req1 = createMockRequest({ ip: '192.168.1.1' });
      const req2 = createMockRequest({ ip: '192.168.1.1' });

      const analysis1 = securityService.analyzeRequest(req1);
      const analysis2 = securityService.analyzeRequest(req2);

      expect(analysis1.fingerprint).toBe(analysis2.fingerprint);
    });

    it('should generate different fingerprints for different requests', () => {
      const req1 = createMockRequest({ ip: '192.168.1.1' });
      const req2 = createMockRequest({ ip: '192.168.1.2' });

      const analysis1 = securityService.analyzeRequest(req1);
      const analysis2 = securityService.analyzeRequest(req2);

      expect(analysis1.fingerprint).not.toBe(analysis2.fingerprint);
    });
  });

  describe('Cleanup and Maintenance', () => {
    it('should clean expired captchas automatically', () => {
      const captcha1 = securityService.generateCaptcha();
      const captcha2 = securityService.generateCaptcha();

      let initialStats = securityService.getSecurityStats();
      expect(initialStats.activeCaptchas).toBe(2);

      // Manually expire captchas by advancing time
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60 * 1000);

      // Trigger cleanup (normally done by interval)
      (securityService as any).cleanExpiredCaptchas();

      const stats = securityService.getSecurityStats();
      expect(stats.activeCaptchas).toBe(0);

      jest.restoreAllMocks();
    });

    it('should clean suspicious IPs after timeout', () => {
      const req = createMockRequest({ ip: '192.168.1.100' });
      
      // Trigger suspicious activity
      for (let i = 0; i < 5; i++) {
        securityService.analyzeRequest(req);
      }

      let initialStats = securityService.getSecurityStats();
      expect(initialStats.suspiciousIPs).toBeGreaterThan(0);

      // Advance time by 2 hours
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 60 * 60 * 1000);

      // Trigger cleanup
      (securityService as any).cleanSuspiciousIPs();

      const stats = securityService.getSecurityStats();
      expect(stats.suspiciousIPs).toBe(0);

      jest.restoreAllMocks();
    });
  });

  describe('Integration Tests', () => {
    it('should handle multiple concurrent operations', () => {
      const promises = [];
      
      // Generate multiple captchas concurrently
      for (let i = 0; i < 10; i++) {
        promises.push(Promise.resolve(securityService.generateCaptcha()));
      }
      
      // Check rate limits concurrently
      for (let i = 0; i < 10; i++) {
        promises.push(Promise.resolve(
          securityService.checkRateLimit(`user-${i}`, 'command', 5, 60000)
        ));
      }

      return Promise.all(promises).then(results => {
        expect(results).toHaveLength(20);
        
        const stats = securityService.getSecurityStats();
        expect(stats.activeCaptchas).toBe(10);
        expect(stats.rateLimitEntries).toBe(10);
      });
    });
  });
});