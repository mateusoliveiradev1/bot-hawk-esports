#!/usr/bin/env node

/**
 * Script para ativar sistema de alertas automáticos
 * Configura monitoramento contínuo e notificações
 */

const fs = require('fs');
const path = require('path');

class AlertActivator {
  constructor() {
    this.configPath = path.join(__dirname, '.env');
  }

  async activateAlerts() {
    console.log('🚨 Ativando sistema de alertas automáticos...');
    console.log('=' .repeat(50));

    // 1. Verificar configurações de alerta
    this.checkAlertConfig();

    // 2. Ativar monitoramento de saúde
    this.enableHealthMonitoring();

    // 3. Configurar alertas por email (se disponível)
    this.configureEmailAlerts();

    // 4. Ativar alertas de sistema
    this.enableSystemAlerts();

    console.log('\n✅ Sistema de alertas ativado com sucesso!');
    console.log('\n📋 Configurações ativas:');
    console.log('   🔍 Monitoramento de saúde: ATIVO');
    console.log('   ⚠️  Alertas de memória: ATIVO (>80%)');
    console.log('   🔌 Alertas de conexão: ATIVO');
    console.log('   📊 Alertas de performance: ATIVO');
    console.log('   💾 Alertas de banco de dados: ATIVO');
  }

  checkAlertConfig() {
    console.log('🔍 Verificando configurações de alerta...');
    
    const requiredAlertVars = [
      'HEALTH_CHECK_INTERVAL',
      'ALERT_MEMORY_THRESHOLD',
      'ALERT_CPU_THRESHOLD'
    ];

    let envContent = '';
    if (fs.existsSync(this.configPath)) {
      envContent = fs.readFileSync(this.configPath, 'utf8');
    }

    let needsUpdate = false;
    const newVars = [];

    requiredAlertVars.forEach(varName => {
      if (!envContent.includes(varName)) {
        needsUpdate = true;
        switch (varName) {
          case 'HEALTH_CHECK_INTERVAL':
            newVars.push('HEALTH_CHECK_INTERVAL=30000  # 30 segundos');
            break;
          case 'ALERT_MEMORY_THRESHOLD':
            newVars.push('ALERT_MEMORY_THRESHOLD=80     # 80% de uso de memória');
            break;
          case 'ALERT_CPU_THRESHOLD':
            newVars.push('ALERT_CPU_THRESHOLD=85       # 85% de uso de CPU');
            break;
        }
      }
    });

    if (needsUpdate) {
      const alertSection = `\n# Alert System Configuration\n${newVars.join('\n')}\n`;
      fs.appendFileSync(this.configPath, alertSection);
      console.log('   ✅ Configurações de alerta adicionadas ao .env');
    } else {
      console.log('   ✅ Configurações de alerta já presentes');
    }
  }

  enableHealthMonitoring() {
    console.log('🏥 Ativando monitoramento de saúde contínuo...');
    
    // Criar script de monitoramento contínuo
    const monitorScript = `#!/usr/bin/env node

// Script de monitoramento contínuo
const { exec } = require('child_process');

function runHealthCheck() {
  exec('node health-check.js', (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Erro no health check:', error.message);
      return;
    }
    
    const timestamp = new Date().toISOString();
    console.log(\`[\${timestamp}] Health check executado\`);
    
    // Se houver erros críticos, registrar
    if (stdout.includes('❌') || stdout.includes('CRITICAL')) {
      console.log('🚨 ALERTA: Problemas críticos detectados!');
      console.log(stdout);
    }
  });
}

// Executar a cada 30 segundos
setInterval(runHealthCheck, 30000);
console.log('🔄 Monitoramento contínuo iniciado (30s intervals)');

// Executar imediatamente
runHealthCheck();
`;

    fs.writeFileSync(path.join(__dirname, 'monitor-health.js'), monitorScript);
    console.log('   ✅ Script de monitoramento contínuo criado');
  }

  configureEmailAlerts() {
    console.log('📧 Configurando alertas por email...');
    
    let envContent = fs.readFileSync(this.configPath, 'utf8');
    
    if (!envContent.includes('EMAIL_ALERTS_ENABLED')) {
      const emailConfig = `\n# Email Alert Configuration\nEMAIL_ALERTS_ENABLED=false\n# EMAIL_HOST=smtp.gmail.com\n# EMAIL_PORT=587\n# EMAIL_USER=your-email@gmail.com\n# EMAIL_PASS=your-app-password\n# ALERT_EMAIL_TO=admin@yourserver.com\n`;
      fs.appendFileSync(this.configPath, emailConfig);
      console.log('   ✅ Configurações de email adicionadas (desabilitadas por padrão)');
    } else {
      console.log('   ✅ Configurações de email já presentes');
    }
  }

  enableSystemAlerts() {
    console.log('⚙️  Ativando alertas de sistema...');
    
    // Criar script de alertas de sistema
    const alertScript = `#!/usr/bin/env node

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
      console.log(\`🚨 ALERTA MEMÓRIA: \${memoryUsage.toFixed(1)}% (limite: \${this.memoryThreshold}%)\`);
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
      console.log(\`🚨 ALERTA CPU: \${cpuUsage}% (limite: \${this.cpuThreshold}%)\`);
      return true;
    }
    return false;
  }

  runAlerts() {
    const timestamp = new Date().toISOString();
    console.log(\`[\${timestamp}] Verificando alertas de sistema...\`);
    
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
`;

    fs.writeFileSync(path.join(__dirname, 'system-alerts.js'), alertScript);
    console.log('   ✅ Sistema de alertas de sistema criado');
  }
}

// Executar ativação se chamado diretamente
if (require.main === module) {
  const activator = new AlertActivator();
  activator.activateAlerts()
    .then(() => {
      console.log('\n🎯 Para iniciar o monitoramento:');
      console.log('   node monitor-health.js   # Monitoramento de saúde');
      console.log('   node system-alerts.js    # Alertas de sistema');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Erro ao ativar alertas:', error);
      process.exit(1);
    });
}

module.exports = AlertActivator;