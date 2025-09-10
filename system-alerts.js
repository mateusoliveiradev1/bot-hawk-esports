#!/usr/bin/env node

// Sistema de alertas baseado em métricas
const os = require('os');

class SystemAlerts {
  constructor() {
    this.memoryThreshold = parseInt(process.env.ALERT_MEMORY_THRESHOLD) || 80;
    this.cpuThreshold = parseInt(process.env.ALERT_CPU_THRESHOLD) || 85;
  }

  checkMemoryUsage() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryUsage = (usedMem / totalMem) * 100;

    if (memoryUsage > this.memoryThreshold) {
      console.log(`🚨 ALERTA MEMÓRIA: ${memoryUsage.toFixed(1)}% (limite: ${this.memoryThreshold}%)`);
      return true;
    }
    return false;
  }

  checkCPUUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const cpuUsage = 100 - ~~(100 * idle / total);

    if (cpuUsage > this.cpuThreshold) {
      console.log(`🚨 ALERTA CPU: ${cpuUsage}% (limite: ${this.cpuThreshold}%)`);
      return true;
    }
    return false;
  }

  runAlerts() {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Verificando alertas de sistema...`);
    
    const memAlert = this.checkMemoryUsage();
    const cpuAlert = this.checkCPUUsage();
    
    if (!memAlert && !cpuAlert) {
      console.log('✅ Sistema operando normalmente');
    }
  }
}

const alerts = new SystemAlerts();

// Verificar a cada 60 segundos
setInterval(() => alerts.runAlerts(), 60000);
console.log('🚨 Sistema de alertas ativo (60s intervals)');

// Executar imediatamente
alerts.runAlerts();
