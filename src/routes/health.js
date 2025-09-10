const express = require('express');
const router = express.Router();
const { client } = require('../bot');
const redis = require('../utils/redis');
const mongoose = require('mongoose');

// Render.com specific configurations
const RENDER_CONFIG = {
  platform: 'render.com',
  region: process.env.RENDER_REGION || 'oregon',
  service: process.env.RENDER_SERVICE_NAME || 'bot-hawk-esports',
  externalUrl: process.env.RENDER_EXTERNAL_URL || 'https://bot-hawk-esports.onrender.com'
};

// Health check endpoint optimized for Render.com
router.get('/health', async (req, res) => {
  try {
    const startTime = Date.now();
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      platform: RENDER_CONFIG,
      environment: {
        nodeEnv: process.env.NODE_ENV || 'production',
        port: process.env.PORT || 10000,
        timezone: process.env.TZ || 'America/Sao_Paulo'
      },
      services: {
        discord: {
          status: client && client.isReady() ? 'connected' : 'disconnected',
          guilds: client ? client.guilds.cache.size : 0,
          users: client ? client.users.cache.size : 0,
          latency: client ? client.ws.ping : null
        },
        database: {
          status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
          name: mongoose.connection.name || 'unknown',
          readyState: mongoose.connection.readyState
        },
        redis: {
          status: 'unknown',
          connected: false
        }
      }
    };

    // Test Redis connection with timeout for Render
    try {
      const redisPromise = redis.ping();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis timeout')), 5000)
      );
      
      await Promise.race([redisPromise, timeoutPromise]);
      healthStatus.services.redis.status = 'connected';
      healthStatus.services.redis.connected = true;
    } catch (error) {
      healthStatus.services.redis.status = 'disconnected';
      healthStatus.services.redis.connected = false;
      healthStatus.services.redis.error = error.message;
    }

    // Check if all critical services are healthy
    const criticalServices = ['discord', 'database', 'redis'];
    const unhealthyServices = criticalServices.filter(service => 
      healthStatus.services[service].status !== 'connected'
    );

    // Add response time
    healthStatus.responseTime = Date.now() - startTime;
    
    if (unhealthyServices.length > 0) {
      healthStatus.status = 'unhealthy';
      healthStatus.unhealthyServices = unhealthyServices;
      // For Render, return 200 but with unhealthy status to avoid restart loops
      return res.status(process.env.RENDER ? 200 : 503).json(healthStatus);
    }

    res.status(200).json(healthStatus);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Readiness check endpoint
router.get('/ready', async (req, res) => {
  try {
    const isReady = client && client.isReady() && 
                   mongoose.connection.readyState === 1;
    
    if (isReady) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Metrics endpoint for monitoring
router.get('/metrics', async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      discord: {
        guilds: client ? client.guilds.cache.size : 0,
        users: client ? client.users.cache.size : 0,
        channels: client ? client.channels.cache.size : 0,
        commands: client ? client.commands?.size || 0 : 0
      },
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        pid: process.pid
      }
    };

    res.status(200).json(metrics);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;