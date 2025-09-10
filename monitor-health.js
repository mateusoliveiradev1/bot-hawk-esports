#!/usr/bin/env node

// Script de monitoramento contínuo
const { exec } = require('child_process');

function runHealthCheck() {
  exec('node health-check.js', (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Erro no health check:', error.message);
      return;
    }
    
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Health check executado`);
    
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
