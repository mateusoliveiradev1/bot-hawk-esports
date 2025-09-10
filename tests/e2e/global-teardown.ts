import { FullConfig } from '@playwright/test';

/**
 * Global teardown para testes E2E
 * Executa após todos os testes E2E
 */
async function globalTeardown(config: FullConfig) {
  console.log('🧹 Iniciando limpeza global dos testes E2E...');

  try {
    // 1. Limpar dados de teste do banco
    await cleanupTestDatabase();

    // 2. Limpar cache Redis de teste
    await clearTestRedis();

    // 3. Limpar arquivos temporários
    await cleanupTempFiles();

    // 4. Limpar logs de teste
    await cleanupTestLogs();

    console.log('✅ Limpeza global dos testes E2E concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro na limpeza global dos testes E2E:', error);
    // Não falhar o teardown, apenas logar o erro
  }
}

/**
 * Limpar dados de teste do banco de dados
 */
async function cleanupTestDatabase() {
  console.log('🗄️ Limpando dados de teste do banco...');

  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
        },
      },
    });

    // Limpar dados de teste em ordem (respeitando foreign keys)
    await prisma.ticketMessage.deleteMany({
      where: {
        ticket: {
          id: {
            startsWith: 'test-',
          },
        },
      },
    });

    await prisma.ticket.deleteMany({
      where: {
        id: {
          startsWith: 'test-',
        },
      },
    });

    await prisma.userBadge.deleteMany({
      where: {
        user: {
          discordId: {
            startsWith: 'test-',
          },
        },
      },
    });

    await prisma.userStats.deleteMany({
      where: {
        user: {
          discordId: {
            startsWith: 'test-',
          },
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        discordId: {
          startsWith: 'test-',
        },
      },
    });

    await prisma.guild.deleteMany({
      where: {
        discordId: {
          startsWith: 'test-',
        },
      },
    });

    await prisma.$disconnect();
    console.log('✅ Dados de teste do banco limpos');
  } catch (error) {
    console.error('❌ Erro ao limpar banco de dados:', error);
    // Não falhar o teardown
  }
}

/**
 * Limpar cache Redis de teste
 */
async function clearTestRedis() {
  console.log('🧹 Limpando cache Redis de teste...');

  try {
    const Redis = require('ioredis');
    const redis = new Redis(process.env.TEST_REDIS_URL || process.env.REDIS_URL);

    // Limpar apenas chaves de teste
    const testKeys = await redis.keys('test:*');
    if (testKeys.length > 0) {
      await redis.del(...testKeys);
    }

    // Limpar chaves de sessão de teste
    const sessionKeys = await redis.keys('sess:test-*');
    if (sessionKeys.length > 0) {
      await redis.del(...sessionKeys);
    }

    await redis.quit();
    console.log('✅ Cache Redis de teste limpo');
  } catch (error) {
    console.warn('⚠️ Aviso: Não foi possível limpar o Redis:', error.message);
    // Não falhar o teardown se o Redis não estiver disponível
  }
}

/**
 * Limpar arquivos temporários criados durante os testes
 */
async function cleanupTempFiles() {
  console.log('📁 Limpando arquivos temporários...');

  try {
    const fs = require('fs').promises;
    const path = require('path');

    // Limpar screenshots de teste antigos (manter apenas os mais recentes)
    const testResultsDir = path.join(process.cwd(), 'test-results');

    try {
      const files = await fs.readdir(testResultsDir);
      const now = Date.now();
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 dias

      for (const file of files) {
        const filePath = path.join(testResultsDir, file);
        const stats = await fs.stat(filePath);

        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
        }
      }
    } catch (error) {
      // Diretório pode não existir, ignorar
    }

    // Limpar uploads de teste
    const uploadsDir = path.join(process.cwd(), 'uploads', 'test');
    try {
      await fs.rmdir(uploadsDir, { recursive: true });
    } catch (error) {
      // Diretório pode não existir, ignorar
    }

    console.log('✅ Arquivos temporários limpos');
  } catch (error) {
    console.error('❌ Erro ao limpar arquivos temporários:', error);
  }
}

/**
 * Limpar logs de teste antigos
 */
async function cleanupTestLogs() {
  console.log('📋 Limpando logs de teste antigos...');

  try {
    const fs = require('fs').promises;
    const path = require('path');

    const logsDir = path.join(process.cwd(), 'logs');

    try {
      const files = await fs.readdir(logsDir);
      const now = Date.now();
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 dias

      for (const file of files) {
        if (file.includes('test') || file.includes('e2e')) {
          const filePath = path.join(logsDir, file);
          const stats = await fs.stat(filePath);

          if (now - stats.mtime.getTime() > maxAge) {
            await fs.unlink(filePath);
          }
        }
      }
    } catch (error) {
      // Diretório pode não existir, ignorar
    }

    console.log('✅ Logs de teste antigos limpos');
  } catch (error) {
    console.error('❌ Erro ao limpar logs de teste:', error);
  }
}

/**
 * Gerar relatório de limpeza
 */
async function generateCleanupReport() {
  console.log('📊 Gerando relatório de limpeza...');

  try {
    const fs = require('fs').promises;
    const path = require('path');

    const report = {
      timestamp: new Date().toISOString(),
      cleanup: {
        database: 'completed',
        redis: 'completed',
        tempFiles: 'completed',
        logs: 'completed',
      },
      testResults: {
        location: 'test-results/',
        htmlReport: 'test-results/index.html',
        jsonReport: 'test-results/e2e-results.json',
        junitReport: 'test-results/e2e-results.xml',
      },
    };

    const reportPath = path.join(process.cwd(), 'test-results', 'cleanup-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log('✅ Relatório de limpeza gerado:', reportPath);
  } catch (error) {
    console.error('❌ Erro ao gerar relatório de limpeza:', error);
  }
}

/**
 * Verificar se há processos pendentes
 */
async function checkPendingProcesses() {
  console.log('🔍 Verificando processos pendentes...');

  try {
    // Verificar se há conexões de banco abertas
    // Verificar se há conexões Redis abertas
    // Verificar se há servidores de teste ainda rodando

    console.log('✅ Verificação de processos concluída');
  } catch (error) {
    console.error('❌ Erro ao verificar processos pendentes:', error);
  }
}

export default globalTeardown;
