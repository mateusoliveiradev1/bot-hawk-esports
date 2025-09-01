import { test, expect } from '@playwright/test';
import { TestHelpers, TestData } from '../helpers/test-helpers';

test.describe('Testes de Performance e Stress', () => {
  let helpers: TestHelpers;
  const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3002';
  const API_URL = process.env.API_BASE_URL || 'http://localhost:3001';

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
  });

  test.afterEach(async () => {
    await helpers.cleanup();
  });

  test('performance: carregamento inicial do dashboard', async ({ page }) => {
    const startTime = Date.now();
    
    // Navegar para o dashboard
    await page.goto(DASHBOARD_URL);
    
    // Aguardar carregamento completo
    await helpers.waitForLoadingToFinish();
    
    const loadTime = Date.now() - startTime;
    
    // Dashboard deve carregar em menos de 5 segundos
    expect(loadTime).toBeLessThan(5000);
    
    // Verificar métricas de performance
    const performanceMetrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime || 0,
        firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0
      };
    });
    
    // DOM deve carregar em menos de 2 segundos
    expect(performanceMetrics.domContentLoaded).toBeLessThan(2000);
    
    // First Contentful Paint deve ser rápido
    if (performanceMetrics.firstContentfulPaint > 0) {
      expect(performanceMetrics.firstContentfulPaint).toBeLessThan(3000);
    }
    
    console.log('Performance Metrics:', performanceMetrics);
  });

  test('performance: navegação entre páginas', async ({ page }) => {
    await page.goto(DASHBOARD_URL);
    await helpers.waitForLoadingToFinish();
    
    const pages = [
      '/tickets',
      '/ranking',
      '/users',
      '/'
    ];
    
    const navigationTimes: number[] = [];
    
    for (const pagePath of pages) {
      const startTime = Date.now();
      
      await page.goto(`${DASHBOARD_URL}${pagePath}`);
      await helpers.waitForLoadingToFinish();
      
      const navigationTime = Date.now() - startTime;
      navigationTimes.push(navigationTime);
      
      // Cada navegação deve ser rápida
      expect(navigationTime).toBeLessThan(3000);
      
      // Aguardar um pouco entre navegações
      await page.waitForTimeout(500);
    }
    
    // Tempo médio de navegação deve ser aceitável
    const averageTime = navigationTimes.reduce((a, b) => a + b, 0) / navigationTimes.length;
    expect(averageTime).toBeLessThan(2000);
    
    console.log('Navigation Times:', navigationTimes);
    console.log('Average Navigation Time:', averageTime);
  });

  test('performance: carregamento de listas grandes', async ({ page, request }) => {
    // Criar múltiplos tickets para testar performance
    const ticketPromises = [];
    
    for (let i = 0; i < 50; i++) {
      const ticketData = {
        title: `Ticket de Performance ${i + 1}`,
        description: `Descrição do ticket ${i + 1} para teste de performance`,
        userId: 'test-user-id',
        status: 'open',
        priority: i % 3 === 0 ? 'high' : i % 2 === 0 ? 'medium' : 'low'
      };
      
      ticketPromises.push(
        request.post(`${API_URL}/api/tickets`, {
          data: ticketData,
          headers: { 'Content-Type': 'application/json' }
        }).catch(() => null)
      );
    }
    
    // Aguardar criação dos tickets (com timeout)
    await Promise.allSettled(ticketPromises);
    
    // Testar carregamento da lista de tickets
    const startTime = Date.now();
    
    await page.goto(`${DASHBOARD_URL}/tickets`);
    await helpers.waitForLoadingToFinish();
    
    const loadTime = Date.now() - startTime;
    
    // Lista deve carregar em tempo razoável mesmo com muitos itens
    expect(loadTime).toBeLessThan(8000);
    
    // Verificar se a paginação funciona corretamente
    const ticketItems = page.locator('.ticket-item, [data-testid*="ticket"]');
    const itemCount = await ticketItems.count();
    
    // Deve haver paginação ou limite de itens por página
    expect(itemCount).toBeLessThanOrEqual(50);
    
    // Testar scroll performance (se aplicável)
    if (itemCount > 10) {
      const scrollStartTime = Date.now();
      
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      await page.waitForTimeout(1000);
      
      const scrollTime = Date.now() - scrollStartTime;
      expect(scrollTime).toBeLessThan(2000);
    }
    
    console.log('Large List Load Time:', loadTime);
    console.log('Items Loaded:', itemCount);
  });

  test('stress: múltiplas requisições simultâneas', async ({ page, request }) => {
    const concurrentRequests = 20;
    const requests = [];
    
    // Fazer múltiplas requisições simultâneas para a API
    for (let i = 0; i < concurrentRequests; i++) {
      requests.push(
        request.get(`${API_URL}/api/health`).catch(() => null)
      );
    }
    
    const startTime = Date.now();
    const results = await Promise.allSettled(requests);
    const endTime = Date.now();
    
    const successfulRequests = results.filter(result => 
      result.status === 'fulfilled' && result.value?.ok()
    ).length;
    
    const totalTime = endTime - startTime;
    
    // Pelo menos 80% das requisições devem ser bem-sucedidas
    expect(successfulRequests).toBeGreaterThanOrEqual(concurrentRequests * 0.8);
    
    // Todas as requisições devem completar em tempo razoável
    expect(totalTime).toBeLessThan(10000);
    
    console.log(`Stress Test: ${successfulRequests}/${concurrentRequests} requests successful in ${totalTime}ms`);
  });

  test('stress: criação rápida de múltiplos tickets', async ({ page, request }) => {
    await page.goto(`${DASHBOARD_URL}/tickets`);
    await helpers.waitForLoadingToFinish();
    
    const ticketCount = 10;
    const creationTimes: number[] = [];
    
    for (let i = 0; i < ticketCount; i++) {
      const startTime = Date.now();
      
      // Tentar criar via interface
      const createButton = page.locator('button:has-text("Criar"), button:has-text("Novo")').first();
      
      if (await createButton.count() > 0) {
        await createButton.click();
        
        // Preencher formulário rapidamente
        await helpers.fillField('input[name="title"]', `Ticket Stress ${i + 1}`);
        await helpers.fillField('textarea[name="description"]', `Descrição rápida ${i + 1}`);
        
        const submitButton = page.locator('button[type="submit"]').first();
        if (await submitButton.count() > 0) {
          await submitButton.click();
          
          // Aguardar confirmação
          await helpers.waitForText('criado', { timeout: 5000 }).catch(() => {});
        }
      } else {
        // Fallback: criar via API
        try {
          await request.post(`${API_URL}/api/tickets`, {
            data: {
              title: `Ticket Stress API ${i + 1}`,
              description: `Descrição via API ${i + 1}`,
              userId: 'test-user-id',
              status: 'open'
            },
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          // Ignorar erros de API
        }
      }
      
      const creationTime = Date.now() - startTime;
      creationTimes.push(creationTime);
      
      // Cada criação deve ser relativamente rápida
      expect(creationTime).toBeLessThan(10000);
      
      // Pequena pausa entre criações
      await page.waitForTimeout(200);
    }
    
    const averageCreationTime = creationTimes.reduce((a, b) => a + b, 0) / creationTimes.length;
    expect(averageCreationTime).toBeLessThan(5000);
    
    console.log('Ticket Creation Times:', creationTimes);
    console.log('Average Creation Time:', averageCreationTime);
  });

  test('performance: busca e filtros', async ({ page }) => {
    await page.goto(`${DASHBOARD_URL}/tickets`);
    await helpers.waitForLoadingToFinish();
    
    // Testar performance da busca
    const searchField = page.locator('input[name="search"], [data-testid="search"]').first();
    
    if (await searchField.count() > 0) {
      const searchTerms = ['bug', 'feature', 'urgent', 'test'];
      const searchTimes: number[] = [];
      
      for (const term of searchTerms) {
        const startTime = Date.now();
        
        await searchField.fill(term);
        
        // Aguardar resultados da busca
        await page.waitForTimeout(1000);
        
        const searchTime = Date.now() - startTime;
        searchTimes.push(searchTime);
        
        // Busca deve ser rápida
        expect(searchTime).toBeLessThan(3000);
        
        // Limpar campo de busca
        await searchField.fill('');
        await page.waitForTimeout(500);
      }
      
      const averageSearchTime = searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length;
      expect(averageSearchTime).toBeLessThan(2000);
      
      console.log('Search Times:', searchTimes);
    }
    
    // Testar performance dos filtros
    const statusFilter = page.locator('select[name="status"], [data-testid="status-filter"]').first();
    
    if (await statusFilter.count() > 0) {
      const filterOptions = ['open', 'in_progress', 'resolved', 'closed'];
      const filterTimes: number[] = [];
      
      for (const option of filterOptions) {
        const startTime = Date.now();
        
        await statusFilter.selectOption(option);
        
        // Aguardar aplicação do filtro
        await page.waitForTimeout(1000);
        
        const filterTime = Date.now() - startTime;
        filterTimes.push(filterTime);
        
        // Filtro deve ser aplicado rapidamente
        expect(filterTime).toBeLessThan(3000);
      }
      
      const averageFilterTime = filterTimes.reduce((a, b) => a + b, 0) / filterTimes.length;
      expect(averageFilterTime).toBeLessThan(2000);
      
      console.log('Filter Times:', filterTimes);
    }
  });

  test('performance: ranking com muitos usuários', async ({ page, request }) => {
    // Criar múltiplos usuários para testar performance do ranking
    const userPromises = [];
    
    for (let i = 0; i < 100; i++) {
      const userData = {
        discordId: `${1000000000000000000 + i}`,
        username: `User${i.toString().padStart(3, '0')}`,
        discriminator: '0001',
        xp: Math.floor(Math.random() * 10000),
        level: Math.floor(Math.random() * 50)
      };
      
      userPromises.push(
        request.post(`${API_URL}/api/users`, {
          data: userData,
          headers: { 'Content-Type': 'application/json' }
        }).catch(() => null)
      );
    }
    
    // Aguardar criação dos usuários
    await Promise.allSettled(userPromises);
    
    // Testar carregamento do ranking
    const startTime = Date.now();
    
    await page.goto(`${DASHBOARD_URL}/ranking`);
    await helpers.waitForLoadingToFinish();
    
    const loadTime = Date.now() - startTime;
    
    // Ranking deve carregar em tempo razoável
    expect(loadTime).toBeLessThan(10000);
    
    // Verificar se a ordenação está correta
    const userElements = page.locator('.user-item, [data-testid*="user"]');
    const userCount = await userElements.count();
    
    if (userCount >= 2) {
      // Verificar se os primeiros usuários estão ordenados por XP
      const firstUserXP = await helpers.extractNumberFromElement(userElements.nth(0));
      const secondUserXP = await helpers.extractNumberFromElement(userElements.nth(1));
      
      if (firstUserXP !== null && secondUserXP !== null) {
        expect(firstUserXP).toBeGreaterThanOrEqual(secondUserXP);
      }
    }
    
    // Testar paginação se existir
    const nextPageButton = page.locator('button:has-text("Próximo"), button:has-text("Next"), [data-testid="next-page"]').first();
    
    if (await nextPageButton.count() > 0) {
      const paginationStartTime = Date.now();
      
      await nextPageButton.click();
      await helpers.waitForLoadingToFinish();
      
      const paginationTime = Date.now() - paginationStartTime;
      expect(paginationTime).toBeLessThan(5000);
    }
    
    console.log('Ranking Load Time:', loadTime);
    console.log('Users Displayed:', userCount);
  });

  test('stress: navegação rápida entre páginas', async ({ page }) => {
    const pages = [
      '/',
      '/tickets',
      '/ranking',
      '/users',
      '/tickets',
      '/',
      '/ranking'
    ];
    
    const navigationTimes: number[] = [];
    
    for (let i = 0; i < pages.length; i++) {
      const startTime = Date.now();
      
      await page.goto(`${DASHBOARD_URL}${pages[i]}`);
      
      // Aguardar carregamento mínimo
      await page.waitForLoadState('domcontentloaded');
      
      const navigationTime = Date.now() - startTime;
      navigationTimes.push(navigationTime);
      
      // Navegação rápida deve ser eficiente
      expect(navigationTime).toBeLessThan(4000);
      
      // Pausa mínima entre navegações
      await page.waitForTimeout(100);
    }
    
    const averageTime = navigationTimes.reduce((a, b) => a + b, 0) / navigationTimes.length;
    expect(averageTime).toBeLessThan(3000);
    
    console.log('Rapid Navigation Times:', navigationTimes);
    console.log('Average Time:', averageTime);
  });

  test('performance: memory usage durante uso prolongado', async ({ page }) => {
    await page.goto(DASHBOARD_URL);
    await helpers.waitForLoadingToFinish();
    
    // Medir uso de memória inicial
    const initialMemory = await page.evaluate(() => {
      return (performance as any).memory ? {
        usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
        totalJSHeapSize: (performance as any).memory.totalJSHeapSize
      } : null;
    });
    
    // Simular uso prolongado
    const actions = [
      () => page.goto(`${DASHBOARD_URL}/tickets`),
      () => page.goto(`${DASHBOARD_URL}/ranking`),
      () => page.goto(`${DASHBOARD_URL}/users`),
      () => page.goto(`${DASHBOARD_URL}/`),
      () => page.reload()
    ];
    
    // Repetir ações múltiplas vezes
    for (let cycle = 0; cycle < 5; cycle++) {
      for (const action of actions) {
        await action();
        await helpers.waitForLoadingToFinish();
        await page.waitForTimeout(500);
      }
    }
    
    // Medir uso de memória final
    const finalMemory = await page.evaluate(() => {
      return (performance as any).memory ? {
        usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
        totalJSHeapSize: (performance as any).memory.totalJSHeapSize
      } : null;
    });
    
    if (initialMemory && finalMemory) {
      const memoryIncrease = finalMemory.usedJSHeapSize - initialMemory.usedJSHeapSize;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.usedJSHeapSize) * 100;
      
      // Aumento de memória deve ser controlado
      expect(memoryIncreasePercent).toBeLessThan(200); // Não mais que 200% de aumento
      
      console.log('Memory Usage:');
      console.log('Initial:', Math.round(initialMemory.usedJSHeapSize / 1024 / 1024), 'MB');
      console.log('Final:', Math.round(finalMemory.usedJSHeapSize / 1024 / 1024), 'MB');
      console.log('Increase:', Math.round(memoryIncreasePercent), '%');
    }
  });

  test('performance: API response times', async ({ request }) => {
    const endpoints = [
      '/api/health',
      '/api/tickets',
      '/api/users',
      '/api/stats'
    ];
    
    const responseTimes: { [key: string]: number[] } = {};
    
    // Testar cada endpoint múltiplas vezes
    for (const endpoint of endpoints) {
      responseTimes[endpoint] = [];
      
      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();
        
        try {
          const response = await request.get(`${API_URL}${endpoint}`);
          const responseTime = Date.now() - startTime;
          
          responseTimes[endpoint].push(responseTime);
          
          // Cada requisição deve ser rápida
          expect(responseTime).toBeLessThan(5000);
          
          // Verificar se a resposta é válida
          if (response.ok()) {
            const contentType = response.headers()['content-type'];
            if (contentType && contentType.includes('application/json')) {
              const data = await response.json();
              expect(data).toBeTruthy();
            }
          }
        } catch (error) {
          // Endpoint pode não estar disponível
          console.log(`Endpoint ${endpoint} not available:`, error);
        }
        
        // Pausa entre requisições
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // Calcular estatísticas
    for (const endpoint of endpoints) {
      const times = responseTimes[endpoint];
      if (times.length > 0) {
        const average = times.reduce((a, b) => a + b, 0) / times.length;
        const max = Math.max(...times);
        const min = Math.min(...times);
        
        console.log(`${endpoint}: avg=${Math.round(average)}ms, min=${min}ms, max=${max}ms`);
        
        // Tempo médio deve ser aceitável
        expect(average).toBeLessThan(3000);
      }
    }
  });

  test('stress: concurrent user sessions', async ({ browser }) => {
    const sessionCount = 5;
    const sessions = [];
    
    // Criar múltiplas sessões de usuário
    for (let i = 0; i < sessionCount; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      
      sessions.push({ context, page, id: i });
    }
    
    try {
      // Fazer todas as sessões navegarem simultaneamente
      const navigationPromises = sessions.map(async (session) => {
        const { page, id } = session;
        
        const startTime = Date.now();
        
        await page.goto(DASHBOARD_URL);
        await page.waitForLoadState('domcontentloaded');
        
        // Simular atividade do usuário
        await page.goto(`${DASHBOARD_URL}/tickets`);
        await page.waitForLoadState('domcontentloaded');
        
        await page.goto(`${DASHBOARD_URL}/ranking`);
        await page.waitForLoadState('domcontentloaded');
        
        const totalTime = Date.now() - startTime;
        
        console.log(`Session ${id} completed in ${totalTime}ms`);
        
        return totalTime;
      });
      
      const sessionTimes = await Promise.all(navigationPromises);
      
      // Todas as sessões devem completar em tempo razoável
      for (const time of sessionTimes) {
        expect(time).toBeLessThan(15000);
      }
      
      const averageSessionTime = sessionTimes.reduce((a, b) => a + b, 0) / sessionTimes.length;
      expect(averageSessionTime).toBeLessThan(10000);
      
      console.log('Concurrent Sessions Average Time:', averageSessionTime);
    } finally {
      // Limpar sessões
      for (const session of sessions) {
        await session.context.close();
      }
    }
  });
});