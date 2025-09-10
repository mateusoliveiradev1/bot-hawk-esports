#!/usr/bin/env node

// Script de monitoramento de performance em tempo real
const os = require('os');
const process = require('process');

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      cpu: [],
      memory: [],
      responseTime: [],
      errorRate: []
    };
    this.startTime = Date.now();
  }

  collectMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptime = process.uptime();
    
    const metrics = {
      timestamp: new Date().toISOString(),
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024), // MB
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      system: {
        loadAvg: os.loadavg(),
        freeMem: Math.round(os.freemem() / 1024 / 1024),
        totalMem: Math.round(os.totalmem() / 1024 / 1024),
        uptime: Math.round(uptime)
      }
    };

    // Verificar thresholds
    this.checkThresholds(metrics);
    
    return metrics;
  }

  checkThresholds(metrics) {
    const memoryUsagePercent = (metrics.memory.rss / metrics.system.totalMem) * 100;
    
    if (memoryUsagePercent > 85) {
      console.log(`🚨 ALERTA: Uso de memória alto: ${memoryUsagePercent.toFixed(1)}%`);
    }
    
    if (metrics.system.loadAvg[0] > os.cpus().length) {
      console.log(`🚨 ALERTA: Load average alto: ${metrics.system.loadAvg[0].toFixed(2)}`);
    }
  }

  startMonitoring() {
    console.log('📊 Iniciando monitoramento de performance...');
    
    setInterval(() => {
      const metrics = this.collectMetrics();
      console.log(`[${metrics.timestamp}] RAM: ${metrics.memory.rss}MB | Load: ${metrics.system.loadAvg[0].toFixed(2)}`);
    }, 15000); // A cada 15 segundos
    
    console.log('✅ Monitoramento ativo (15s intervals)');
  }
}

const monitor = new PerformanceMonitor();
monitor.startMonitoring();
