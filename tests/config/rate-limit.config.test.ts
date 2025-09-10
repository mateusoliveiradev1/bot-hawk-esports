import { RateLimitConfiguration, RateLimitMiddleware } from '../../src/config/rate-limit.config';
import { AdvancedRateLimitService } from '../../src/services/advanced-rate-limit.service';
import { Request, Response, NextFunction } from 'express';

// Mock dependencies
jest.mock('../../src/services/advanced-rate-limit.service');

describe('RateLimitConfiguration', () => {
  describe('getConfig', () => {
    it('should return general configuration', () => {
      const config = RateLimitConfiguration.getConfig('general');

      expect(config).toBeDefined();
      expect(config.max).toBe(100);
      expect(config.windowMs).toBe(15 * 60 * 1000);
      expect(config.message).toBeDefined();
    });

    it('should return auth configuration', () => {
      const config = RateLimitConfiguration.getConfig('auth');

      expect(config).toBeDefined();
      expect(config.max).toBe(5);
      expect(config.windowMs).toBe(15 * 60 * 1000);
      expect(config.skipSuccessfulRequests).toBe(true);
    });

    it('should return upload configuration', () => {
      const config = RateLimitConfiguration.getConfig('upload');

      expect(config).toBeDefined();
      expect(config.max).toBe(10);
      expect(config.windowMs).toBe(10 * 60 * 1000);
    });

    it('should return pubg_api configuration', () => {
      const config = RateLimitConfiguration.getConfig('pubg_api');

      expect(config).toBeDefined();
      expect(config.max).toBe(10);
      expect(config.windowMs).toBe(60 * 1000);
    });

    it('should return stats configuration', () => {
      const config = RateLimitConfiguration.getConfig('stats');

      expect(config).toBeDefined();
      expect(config.max).toBe(30);
      expect(config.windowMs).toBe(5 * 60 * 1000);
    });

    it('should return ranking configuration', () => {
      const config = RateLimitConfiguration.getConfig('ranking');

      expect(config).toBeDefined();
      expect(config.max).toBe(20);
      expect(config.windowMs).toBe(60 * 1000);
    });

    it('should return admin configuration', () => {
      const config = RateLimitConfiguration.getConfig('admin');

      expect(config).toBeDefined();
      expect(config.max).toBe(50);
      expect(config.windowMs).toBe(60 * 1000);
    });

    it('should return websocket configuration', () => {
      const config = RateLimitConfiguration.getConfig('websocket');

      expect(config).toBeDefined();
      expect(config.max).toBe(10);
      expect(config.windowMs).toBe(60 * 1000);
    });

    it('should return bot_commands configuration', () => {
      const config = RateLimitConfiguration.getBotCommandConfig('general');

      expect(config).toBeDefined();
      expect(config.maxRequests).toBe(5);
      expect(config.windowMs).toBe(60 * 1000);
    });

    it('should return security configuration', () => {
      const config = RateLimitConfiguration.getConfig('security');

      expect(config).toBeDefined();
      expect(config.max).toBe(10);
      expect(config.windowMs).toBe(5 * 60 * 1000);
    });

    it('should return general config for unknown type', () => {
      const config = RateLimitConfiguration.getConfig('unknown' as any);

      expect(config).toEqual(RateLimitConfiguration.getConfig('general'));
    });
  });

  describe('createCustomConfig', () => {
    it('should create custom configuration', () => {
      const customConfig = RateLimitConfiguration.createCustomConfig(30000, 50, {
        message: 'Custom limit exceeded',
      });

      expect(customConfig.max).toBe(50);
      expect(customConfig.windowMs).toBe(30000);
      expect(customConfig.message).toBe('Custom limit exceeded');
    });

    it('should merge with default values', () => {
      const customConfig = RateLimitConfiguration.createCustomConfig(15 * 60 * 1000, 25);

      expect(customConfig.max).toBe(25);
      expect(customConfig.windowMs).toBe(15 * 60 * 1000);
    });
  });
});

describe('RateLimitMiddleware', () => {
  it('should create middleware configuration', () => {
    const config = RateLimitConfiguration.getConfig('general');

    const middlewareConfig = RateLimitMiddleware.create(config);

    expect(middlewareConfig).toBeDefined();
    expect(middlewareConfig.windowMs).toBe(config.windowMs);
    expect(middlewareConfig.max).toBe(config.max);
  });

  it('should create progressive rate limiting middleware', () => {
    const config = RateLimitConfiguration.getConfig('auth');

    const middlewareConfig = RateLimitMiddleware.createProgressive(config);

    expect(middlewareConfig).toBeDefined();
    expect(middlewareConfig.windowMs).toBe(config.windowMs);
    expect(middlewareConfig.max).toBe(config.max);
  });
});
