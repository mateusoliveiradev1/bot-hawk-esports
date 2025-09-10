#!/usr/bin/env node

/**
 * Script de verificação de saúde do bot
 * Testa todos os serviços críticos e reporta o status
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

class HealthChecker {
  constructor() {
    this.results = [];
    this.prisma = new PrismaClient();
  }

  async checkDatabase() {
    try {
      await this.prisma.$connect();
      await this.prisma.$queryRaw`SELECT 1`;
      this.addResult('Database', 'OK', 'Conexão com SQLite estabelecida');
    } catch (error) {
      this.addResult('Database', 'ERROR', `Falha na conexão: ${error.message}`);
    }
  }

  async checkEnvironmentVariables() {
    const requiredVars = [
      'DISCORD_TOKEN',
      'DISCORD_CLIENT_ID',
      'DATABASE_URL',
      'JWT_SECRET'
    ];

    const missing = [];
    const present = [];

    requiredVars.forEach(varName => {
      if (process.env[varName]) {
        present.push(varName);
      } else {
        missing.push(varName);
      }
    });

    if (missing.length === 0) {
      this.addResult('Environment', 'OK', `Todas as variáveis obrigatórias presentes (${present.length})`);
    } else {
      this.addResult('Environment', 'ERROR', `Variáveis faltando: ${missing.join(', ')}`);
    }
  }

  checkFileStructure() {
    const criticalFiles = [
      'src/index.ts',
      'src/database/database.service.ts',
      'src/services/cache.service.ts',
      'src/services/health.service.ts',
      'package.json'
    ];

    const missing = [];
    const present = [];

    criticalFiles.forEach(file => {
      if (fs.existsSync(path.join(__dirname, file))) {
        present.push(file);
      } else {
        missing.push(file);
      }
    });

    if (missing.length === 0) {
      this.addResult('File Structure', 'OK', `Todos os arquivos críticos presentes (${present.length})`);
    } else {
      this.addResult('File Structure', 'WARNING', `Arquivos faltando: ${missing.join(', ')}`);
    }
  }

  checkDependencies() {
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const deps = Object.keys(packageJson.dependencies || {});
      const devDeps = Object.keys(packageJson.devDependencies || {});
      
      this.addResult('Dependencies', 'OK', `${deps.length} dependências + ${devDeps.length} dev dependencies`);
    } catch (error) {
      this.addResult('Dependencies', 'ERROR', `Erro ao ler package.json: ${error.message}`);
    }
  }

  addResult(service, status, message) {
    this.results.push({
      service,
      status,
      message,
      timestamp: new Date().toISOString()
    });
  }

  async runAllChecks() {
    console.log('🔍 Iniciando verificação de saúde do bot...');
    console.log('=' .repeat(50));

    await this.checkDatabase();
    this.checkEnvironmentVariables();
    this.checkFileStructure();
    this.checkDependencies();

    await this.prisma.$disconnect();

    this.printResults();
    return this.getOverallStatus();
  }

  printResults() {
    console.log('\n📊 Resultados da verificação:');
    console.log('-'.repeat(50));

    this.results.forEach(result => {
      const icon = result.status === 'OK' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌';
      console.log(`${icon} ${result.service}: ${result.status}`);
      console.log(`   ${result.message}`);
    });
  }

  getOverallStatus() {
    const errors = this.results.filter(r => r.status === 'ERROR').length;
    const warnings = this.results.filter(r => r.status === 'WARNING').length;
    const ok = this.results.filter(r => r.status === 'OK').length;

    console.log('\n🎯 Status Geral:');
    console.log(`   ✅ OK: ${ok}`);
    console.log(`   ⚠️  Warnings: ${warnings}`);
    console.log(`   ❌ Errors: ${errors}`);

    if (errors === 0 && warnings === 0) {
      console.log('\n🎉 Bot está 100% funcional!');
      return 'HEALTHY';
    } else if (errors === 0) {
      console.log('\n✅ Bot está funcional com alguns avisos.');
      return 'FUNCTIONAL';
    } else {
      console.log('\n❌ Bot tem problemas críticos que precisam ser corrigidos.');
      return 'CRITICAL';
    }
  }
}

// Executar verificação se chamado diretamente
if (require.main === module) {
  const checker = new HealthChecker();
  checker.runAllChecks()
    .then(status => {
      process.exit(status === 'CRITICAL' ? 1 : 0);
    })
    .catch(error => {
      console.error('❌ Erro durante verificação:', error);
      process.exit(1);
    });
}

module.exports = HealthChecker;