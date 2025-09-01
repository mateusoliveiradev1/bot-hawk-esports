import { RateLimitConfiguration, RateLimitMiddleware } from '../../src/config/rate-limit.config';
import { AdvancedRateLimitService } from '../../src/services/advanced-rate-limit.service';
import { Request, Response, NextFunction } from 'express';

// Mock dependencies
jest.mock('../../src/services/advanced-rate-limit.service');

describe('RateLimitConfiguration', () => {
  describe('getConfigByType', () => {
    it('should return general configuration', () => {
      const config = RateLimitConfiguration.getConfigByType('general');
      
      expect(config).toBeDefined();
      expect(config.maxRequests).toBe(100);
      expect(config.windowMs).toBe(15 * 60 * 1000);
      expect(config.skipHealthChecks).toBe(true);
    });

    it('should return auth configuration', () => {
      const config = RateLimitConfiguration.getConfigByType('auth');
      
      expect(config).toBeDefined();
      expect(config.maxRequests).toBe(5);
      expect(config.windowMs).toBe(15 * 60 * 1000);
      expect(config.skipSuccessfulRequests).toBe(true);
    });

    it('should return upload configuration', () => {
      const config = RateLimitConfiguration.getConfigByType('upload');
      
      expect(config).toBeDefined();
      expect(config.maxRequests).toBe(10);
      expect(config.windowMs).toBe(10 * 60 * 1000);
    });

    it('should return pubg_api configuration', () => {
      const config = RateLimitConfiguration.getConfigByType('pubg_api');
      
      expect(config).toBeDefined();
      expect(config.maxRequests).toBe(50);
      expect(config.windowMs).toBe(60 * 1000);
    });

    it('should return stats configuration', () => {
      const config = RateLimitConfiguration.getConfigByType('stats');
      
      expect(config).toBeDefined();
      expect(config.maxRequests).toBe(30);
      expect(config.windowMs).toBe(60 * 1000);
    });

    it('should return ranking configuration', () => {
      const config = RateLimitConfiguration.getConfigByType('ranking');
      
      expect(config).toBeDefined();
      expect(config.maxRequests).toBe(20);
      expect(config.windowMs).toBe(60 * 1000);
    });

    it('should return admin configuration', () => {
      const config = RateLimitConfiguration.getConfigByType('admin');
      
      expect(config).toBeDefined();
      expect(config.maxRequests).toBe(200);
      expect(config.windowMs).toBe(60 * 1000);
    });

    it('should return websocket configuration', () => {
      const config = RateLimitConfiguration.getConfigByType('websocket');
      
      expect(config).toBeDefined();
      expect(config.maxRequests).toBe(1000);
      expect(config.windowMs).toBe(60 * 1000);
    });

    it('should return bot_commands configuration', () => {
      const config = RateLimitConfiguration.getConfigByType('bot_commands');
      
      expect(config).toBeDefined();
      expect(config.maxRequests).toBe(10);
      expect(config.windowMs).toBe(60 * 1000);
    });

    it('should return security configuration', () => {
      const config = RateLimitConfiguration.getConfigByType('security');
      
      expect(config).toBeDefined();
      expect(config.maxRequests).toBe(3);
      expect(config.windowMs).toBe(60 * 60 * 1000);
    });

    it('should return general config for unknown type', () => {
      const config = RateLimitConfiguration.getConfigByType('unknown' as any);
      
      expect(config).toEqual(RateLimitConfiguration.getConfigByType('general'));
    });
  });

  describe('createCustomConfig', () => {
    it('should create custom configuration', () => {
      const customConfig = RateLimitConfiguration.createCustomConfig({
        maxRequests: 50,
        windowMs: 30000,
        message: 'Custom limit exceeded'
      });

      expect(customConfig.maxRequests).toBe(50);
      expect(customConfig.windowMs).toBe(30000);
      expect(customConfig.message).toBe('Custom limit exceeded');
      expect(customConfig.standardHeaders).toBe(true);
      expect(customConfig.legacyHeaders).toBe(false);
    });

    it('should merge with default values', () => {
      const customConfig = RateLimitConfiguration.createCustomConfig({
        maxRequests: 25
      });

      expect(customConfig.maxRequests).toBe(25);
      expect(customConfig.windowMs).toBe(15 * 60 * 1000); // Default value
      expect(customConfig.standardHeaders).toBe(true); // Default value
    });
  });
});

describe('RateLimitMiddleware', () => {
  it('should create middleware function', () => {
    const config = RateLimitConfiguration.getConfigByType('general');
    const mockAdvancedService = {} as any;
    
    const middleware = RateLimitMiddleware.createMiddleware(config, mockAdvancedService);
    
    expect(middleware).toBeDefined();
    expect(typeof middleware).toBe('function');
  });

  it('should create progressive rate limiting middleware', () => {
    const config = RateLimitConfiguration.getConfigByType('auth');
    const mockAdvancedService = {} as any;
    
    const middleware = RateLimitMiddleware.createProgressiveRateLimit(config, mockAdvancedService);
    
    expect(middleware).toBeDefined();
    expect(typeof middleware).toBe('function');
  });
});