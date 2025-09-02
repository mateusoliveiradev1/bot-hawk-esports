/**
 * Production Monitoring Configuration
 * Defines default settings for production monitoring system
 */

export interface ProductionMonitoringConfig {
  // Health check intervals (in milliseconds)
  healthCheckInterval: number;
  metricsCollectionInterval: number;
  
  // Health check timeouts (in milliseconds)
  healthCheckTimeout: number;
  
  // Performance thresholds
  performance: {
    memoryUsageThreshold: number; // Percentage (0-100)
    cpuUsageThreshold: number; // Percentage (0-100)
    diskUsageThreshold: number; // Percentage (0-100)
    responseTimeThreshold: number; // Milliseconds
  };
  
  // Discord-specific thresholds
  discord: {
    latencyThreshold: number; // Milliseconds
    maxReconnectAttempts: number;
    guildCountThreshold: number; // Minimum expected guilds
  };
  
  // Database thresholds
  database: {
    connectionTimeout: number; // Milliseconds
    queryTimeout: number; // Milliseconds
    maxConnections: number;
  };
  
  // Redis/Cache thresholds
  cache: {
    connectionTimeout: number; // Milliseconds
    operationTimeout: number; // Milliseconds
    memoryUsageThreshold: number; // Percentage
  };
  
  // Alert settings
  alerts: {
    maxActiveAlerts: number;
    alertCooldown: number; // Milliseconds
    criticalAlertThreshold: number; // Number of critical alerts before escalation
  };
  
  // Metrics retention
  metrics: {
    retentionPeriod: number; // Milliseconds
    maxMetricsInMemory: number;
  };
}

/**
 * Default production monitoring configuration
 */
export const defaultProductionMonitoringConfig: ProductionMonitoringConfig = {
  // Check health every 30 seconds
  healthCheckInterval: 30 * 1000,
  
  // Collect metrics every 60 seconds
  metricsCollectionInterval: 60 * 1000,
  
  // Health check timeout of 10 seconds
  healthCheckTimeout: 10 * 1000,
  
  performance: {
    // Alert when memory usage exceeds 85%
    memoryUsageThreshold: 85,
    
    // Alert when CPU usage exceeds 80%
    cpuUsageThreshold: 80,
    
    // Alert when disk usage exceeds 90%
    diskUsageThreshold: 90,
    
    // Alert when response time exceeds 5 seconds
    responseTimeThreshold: 5000,
  },
  
  discord: {
    // Alert when Discord latency exceeds 1 second
    latencyThreshold: 1000,
    
    // Maximum reconnection attempts before alerting
    maxReconnectAttempts: 5,
    
    // Alert if guild count drops below this threshold
    guildCountThreshold: 1,
  },
  
  database: {
    // Database connection timeout
    connectionTimeout: 5000,
    
    // Query timeout
    queryTimeout: 10000,
    
    // Maximum database connections
    maxConnections: 10,
  },
  
  cache: {
    // Redis connection timeout
    connectionTimeout: 3000,
    
    // Redis operation timeout
    operationTimeout: 5000,
    
    // Alert when Redis memory usage exceeds 80%
    memoryUsageThreshold: 80,
  },
  
  alerts: {
    // Maximum number of active alerts
    maxActiveAlerts: 50,
    
    // Cooldown period between similar alerts (5 minutes)
    alertCooldown: 5 * 60 * 1000,
    
    // Number of critical alerts before escalation
    criticalAlertThreshold: 3,
  },
  
  metrics: {
    // Keep metrics for 24 hours
    retentionPeriod: 24 * 60 * 60 * 1000,
    
    // Maximum metrics to keep in memory
    maxMetricsInMemory: 1000,
  },
};

/**
 * Environment-specific configuration overrides
 */
export const getProductionMonitoringConfig = (): ProductionMonitoringConfig => {
  const config = { ...defaultProductionMonitoringConfig };
  
  // Override with environment variables if available
  if (process.env.MONITORING_HEALTH_CHECK_INTERVAL) {
    config.healthCheckInterval = parseInt(process.env.MONITORING_HEALTH_CHECK_INTERVAL, 10);
  }
  
  if (process.env.MONITORING_METRICS_INTERVAL) {
    config.metricsCollectionInterval = parseInt(process.env.MONITORING_METRICS_INTERVAL, 10);
  }
  
  if (process.env.MONITORING_MEMORY_THRESHOLD) {
    config.performance.memoryUsageThreshold = parseInt(process.env.MONITORING_MEMORY_THRESHOLD, 10);
  }
  
  if (process.env.MONITORING_CPU_THRESHOLD) {
    config.performance.cpuUsageThreshold = parseInt(process.env.MONITORING_CPU_THRESHOLD, 10);
  }
  
  if (process.env.MONITORING_DISCORD_LATENCY_THRESHOLD) {
    config.discord.latencyThreshold = parseInt(process.env.MONITORING_DISCORD_LATENCY_THRESHOLD, 10);
  }
  
  return config;
};

/**
 * Validate monitoring configuration
 */
export const validateMonitoringConfig = (config: ProductionMonitoringConfig): boolean => {
  // Validate intervals
  if (config.healthCheckInterval < 1000 || config.healthCheckInterval > 300000) {
    throw new Error('Health check interval must be between 1 second and 5 minutes');
  }
  
  if (config.metricsCollectionInterval < 1000 || config.metricsCollectionInterval > 600000) {
    throw new Error('Metrics collection interval must be between 1 second and 10 minutes');
  }
  
  // Validate thresholds
  if (config.performance.memoryUsageThreshold < 50 || config.performance.memoryUsageThreshold > 95) {
    throw new Error('Memory usage threshold must be between 50% and 95%');
  }
  
  if (config.performance.cpuUsageThreshold < 50 || config.performance.cpuUsageThreshold > 95) {
    throw new Error('CPU usage threshold must be between 50% and 95%');
  }
  
  if (config.discord.latencyThreshold < 100 || config.discord.latencyThreshold > 10000) {
    throw new Error('Discord latency threshold must be between 100ms and 10 seconds');
  }
  
  return true;
};