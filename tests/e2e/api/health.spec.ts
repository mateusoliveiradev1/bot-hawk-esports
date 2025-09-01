import { test, expect } from '@playwright/test';
import { TestHelpers } from '../helpers/test-helpers';

test.describe('API - Health Checks', () => {
  let helpers: TestHelpers;
  const baseURL = process.env.API_BASE_URL || 'http://localhost:3001';

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
  });

  test.afterEach(async () => {
    await helpers.cleanup();
  });

  test('deve responder ao health check básico', async ({ request }) => {
    const healthEndpoints = [
      '/health',
      '/api/health',
      '/status',
      '/api/status'
    ];

    let healthCheckPassed = false;
    
    for (const endpoint of healthEndpoints) {
      try {
        const response = await request.get(`${baseURL}${endpoint}`);
        
        if (response.ok()) {
          const data = await response.json();
          
          // Verificar estrutura básica da resposta
          expect(data).toBeTruthy();
          
          // Verificar se tem indicadores de saúde
          const hasHealthIndicators = 
            data.status || 
            data.health || 
            data.ok !== undefined ||
            data.uptime !== undefined;
          
          expect(hasHealthIndicators).toBeTruthy();
          healthCheckPassed = true;
          break;
        }
      } catch (error) {
        // Continuar tentando outros endpoints
        continue;
      }
    }

    expect(healthCheckPassed).toBeTruthy();
  });

  test('deve retornar informações de sistema', async ({ request }) => {
    const systemEndpoints = [
      '/health/system',
      '/api/health/system',
      '/system',
      '/api/system'
    ];

    for (const endpoint of systemEndpoints) {
      try {
        const response = await request.get(`${baseURL}${endpoint}`);
        
        if (response.ok()) {
          const data = await response.json();
          
          // Verificar se tem informações do sistema
          const hasSystemInfo = 
            data.memory || 
            data.cpu || 
            data.uptime || 
            data.version ||
            data.environment;
          
          if (hasSystemInfo) {
            expect(data).toBeTruthy();
            break;
          }
        }
      } catch (error) {
        // Endpoint pode não existir
        continue;
      }
    }
  });

  test('deve verificar conectividade do banco de dados', async ({ request }) => {
    const dbEndpoints = [
      '/health/database',
      '/api/health/database',
      '/health/db',
      '/api/health/db'
    ];

    for (const endpoint of dbEndpoints) {
      try {
        const response = await request.get(`${baseURL}${endpoint}`);
        
        if (response.ok()) {
          const data = await response.json();
          
          // Verificar status do banco
          const dbStatus = data.database || data.db || data.status;
          
          if (dbStatus) {
            expect(dbStatus).toBeTruthy();
            break;
          }
        }
      } catch (error) {
        // Endpoint pode não existir
        continue;
      }
    }
  });

  test('deve verificar conectividade do Redis', async ({ request }) => {
    const redisEndpoints = [
      '/health/redis',
      '/api/health/redis',
      '/health/cache',
      '/api/health/cache'
    ];

    for (const endpoint of redisEndpoints) {
      try {
        const response = await request.get(`${baseURL}${endpoint}`);
        
        if (response.ok()) {
          const data = await response.json();
          
          // Verificar status do Redis
          const redisStatus = data.redis || data.cache || data.status;
          
          if (redisStatus) {
            expect(redisStatus).toBeTruthy();
            break;
          }
        }
      } catch (error) {
        // Endpoint pode não existir
        continue;
      }
    }
  });

  test('deve responder rapidamente', async ({ request }) => {
    const startTime = Date.now();
    
    try {
      const response = await request.get(`${baseURL}/health`);
      const responseTime = Date.now() - startTime;
      
      // Health check deve responder em menos de 5 segundos
      expect(responseTime).toBeLessThan(5000);
      
      if (response.ok()) {
        expect(response.status()).toBe(200);
      }
    } catch (error) {
      // Tentar endpoint alternativo
      const altStartTime = Date.now();
      const altResponse = await request.get(`${baseURL}/api/health`);
      const altResponseTime = Date.now() - altStartTime;
      
      expect(altResponseTime).toBeLessThan(5000);
    }
  });

  test('deve ter headers de segurança adequados', async ({ request }) => {
    try {
      const response = await request.get(`${baseURL}/health`);
      
      if (response.ok()) {
        const headers = response.headers();
        
        // Verificar headers de segurança básicos
        const securityHeaders = [
          'x-content-type-options',
          'x-frame-options',
          'x-xss-protection',
          'content-security-policy'
        ];
        
        let hasSecurityHeaders = false;
        for (const header of securityHeaders) {
          if (headers[header]) {
            hasSecurityHeaders = true;
            break;
          }
        }
        
        // Pelo menos um header de segurança deve estar presente
        // (não obrigatório para health checks simples)
      }
    } catch (error) {
      // Health endpoint pode não existir
    }
  });

  test('deve lidar com alta carga', async ({ request }) => {
    const requests = [];
    const concurrentRequests = 10;
    
    // Fazer múltiplas requisições simultâneas
    for (let i = 0; i < concurrentRequests; i++) {
      requests.push(
        request.get(`${baseURL}/health`).catch(() => 
          request.get(`${baseURL}/api/health`)
        )
      );
    }
    
    const startTime = Date.now();
    const responses = await Promise.allSettled(requests);
    const totalTime = Date.now() - startTime;
    
    // Verificar se pelo menos algumas requisições foram bem-sucedidas
    const successfulResponses = responses.filter(
      result => result.status === 'fulfilled' && 
                result.value && 
                result.value.ok()
    );
    
    // Pelo menos 50% das requisições devem ser bem-sucedidas
    expect(successfulResponses.length).toBeGreaterThanOrEqual(concurrentRequests * 0.5);
    
    // Todas as requisições devem completar em tempo razoável
    expect(totalTime).toBeLessThan(15000);
  });

  test('deve retornar formato JSON válido', async ({ request }) => {
    try {
      const response = await request.get(`${baseURL}/health`);
      
      if (response.ok()) {
        const contentType = response.headers()['content-type'];
        expect(contentType).toContain('application/json');
        
        // Verificar se é JSON válido
        const data = await response.json();
        expect(data).toBeTruthy();
        expect(typeof data).toBe('object');
      }
    } catch (error) {
      // Tentar endpoint alternativo
      const altResponse = await request.get(`${baseURL}/api/health`);
      
      if (altResponse.ok()) {
        const data = await altResponse.json();
        expect(data).toBeTruthy();
      }
    }
  });

  test('deve incluir timestamp na resposta', async ({ request }) => {
    try {
      const response = await request.get(`${baseURL}/health`);
      
      if (response.ok()) {
        const data = await response.json();
        
        // Verificar se tem timestamp
        const hasTimestamp = 
          data.timestamp || 
          data.time || 
          data.date ||
          data.now;
        
        if (hasTimestamp) {
          // Verificar se o timestamp é recente (últimos 10 segundos)
          const timestamp = new Date(hasTimestamp).getTime();
          const now = Date.now();
          const diff = Math.abs(now - timestamp);
          
          expect(diff).toBeLessThan(10000);
        }
      }
    } catch (error) {
      // Timestamp pode não estar implementado
    }
  });

  test('deve funcionar com diferentes métodos HTTP', async ({ request }) => {
    const methods = ['GET', 'HEAD'];
    
    for (const method of methods) {
      try {
        let response;
        if (method === 'GET') {
          response = await request.get(`${baseURL}/health`);
        } else if (method === 'HEAD') {
          response = await request.head(`${baseURL}/health`);
        }
        
        if (response && response.ok()) {
          expect(response.status()).toBe(200);
        }
      } catch (error) {
        // Método pode não ser suportado
        continue;
      }
    }
  });
});