import { chromium, FullConfig } from '@playwright/test';
import { execSync } from 'child_process';
import path from 'path';

/**
 * Global setup para testes E2E
 * Executa antes de todos os testes E2E
 */
async function globalSetup(config: FullConfig) {
  console.log('🚀 Iniciando setup global dos testes E2E...');

  try {
    // 1. Verificar se as variáveis de ambiente estão configuradas
    await checkEnvironmentVariables();

    // 2. Preparar banco de dados de teste
    await setupTestDatabase();

    // 3. Limpar cache Redis de teste
    await clearTestRedis();

    // 4. Aguardar serviços estarem prontos
    await waitForServices();

    // 5. Criar dados de teste básicos
    await seedTestData();

    console.log('✅ Setup global dos testes E2E concluído com sucesso!');
  } catch (error) {
    console.error('❌ Erro no setup global dos testes E2E:', error);
    throw error;
  }
}

/**
 * Verificar variáveis de ambiente necessárias
 */
async function checkEnvironmentVariables() {
  console.log('🔍 Verificando variáveis de ambiente...');

  const requiredEnvVars = ['DATABASE_URL', 'REDIS_URL', 'DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias não encontradas: ${missingVars.join(', ')}`
    );
  }

  console.log('✅ Variáveis de ambiente verificadas');
}

/**
 * Configurar banco de dados de teste
 */
async function setupTestDatabase() {
  console.log('🗄️ Configurando banco de dados de teste...');

  try {
    // Reset do banco de dados de teste
    execSync('npx prisma db push --force-reset', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
      },
    });

    // Gerar cliente Prisma
    execSync('npx prisma generate', { stdio: 'inherit' });

    console.log('✅ Banco de dados de teste configurado');
  } catch (error) {
    console.error('❌ Erro ao configurar banco de dados:', error);
    throw error;
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

    await redis.flushall();
    await redis.quit();

    console.log('✅ Cache Redis limpo');
  } catch (error) {
    console.warn('⚠️ Aviso: Não foi possível limpar o Redis:', error.message);
    // Não falhar o setup se o Redis não estiver disponível
  }
}

/**
 * Aguardar serviços estarem prontos
 */
async function waitForServices() {
  console.log('⏳ Aguardando serviços estarem prontos...');

  const maxRetries = 30;
  const retryDelay = 2000; // 2 segundos

  // Aguardar dashboard (frontend)
  await waitForService('http://localhost:5173', 'Dashboard', maxRetries, retryDelay);

  // Aguardar API (backend)
  await waitForService('http://localhost:3000/health', 'API Backend', maxRetries, retryDelay);

  console.log('✅ Todos os serviços estão prontos');
}

/**
 * Aguardar um serviço específico estar pronto
 */
async function waitForService(
  url: string,
  serviceName: string,
  maxRetries: number,
  retryDelay: number
) {
  const axios = require('axios');

  for (let i = 0; i < maxRetries; i++) {
    try {
      await axios.get(url, { timeout: 5000 });
      console.log(`✅ ${serviceName} está pronto`);
      return;
    } catch (error) {
      console.log(`⏳ Aguardando ${serviceName}... (tentativa ${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  throw new Error(`${serviceName} não ficou pronto após ${maxRetries} tentativas`);
}

/**
 * Criar dados de teste básicos
 */
async function seedTestData() {
  console.log('🌱 Criando dados de teste básicos...');

  try {
    // Importar dinamicamente o PrismaClient
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
        },
      },
    });

    // Criar usuário de teste
    const testUser = await prisma.user.upsert({
      where: { discordId: 'test-user-123' },
      update: {},
      create: {
        discordId: 'test-user-123',
        username: 'TestUser',
        discriminator: '0001',
        avatar: null,
        xp: 1000,
        level: 5,
        coins: 500,
        pubgUsername: 'TestPUBGUser',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Criar guild de teste
    const testGuild = await prisma.guild.upsert({
      where: { discordId: 'test-guild-123' },
      update: {},
      create: {
        discordId: 'test-guild-123',
        name: 'Test Guild',
        icon: null,
        ownerId: 'test-owner-123',
        memberCount: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Criar alguns tickets de teste
    await prisma.ticket.createMany({
      data: [
        {
          id: 'test-ticket-1',
          userId: testUser.id,
          guildId: testGuild.id,
          channelId: 'test-channel-1',
          category: 'support',
          status: 'open',
          subject: 'Teste de Suporte',
          description: 'Ticket de teste para E2E',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'test-ticket-2',
          userId: testUser.id,
          guildId: testGuild.id,
          channelId: 'test-channel-2',
          category: 'bug',
          status: 'closed',
          subject: 'Bug Report',
          description: 'Relatório de bug para teste',
          createdAt: new Date(Date.now() - 86400000), // 1 dia atrás
          updatedAt: new Date(),
        },
      ],
      skipDuplicates: true,
    });

    await prisma.$disconnect();
    console.log('✅ Dados de teste criados');
  } catch (error) {
    console.error('❌ Erro ao criar dados de teste:', error);
    throw error;
  }
}

/**
 * Configurar autenticação para testes (se necessário)
 */
async function setupAuthentication() {
  console.log('🔐 Configurando autenticação para testes...');

  // Criar um token de teste ou configurar autenticação mock
  // Isso pode ser usado para testes que requerem autenticação

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Fazer login ou configurar estado de autenticação
    // await page.goto('/login');
    // await page.fill('[data-testid="username"]', 'test-user');
    // await page.fill('[data-testid="password"]', 'test-password');
    // await page.click('[data-testid="login-button"]');

    // Salvar estado de autenticação
    // await context.storageState({ path: 'tests/e2e/auth-state.json' });

    console.log('✅ Autenticação configurada');
  } catch (error) {
    console.error('❌ Erro ao configurar autenticação:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
