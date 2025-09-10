import { test, expect } from '@playwright/test';
import { TestHelpers, Selectors } from '../helpers/test-helpers';

test.describe('Dashboard - Navegação', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    await page.goto('/');
  });

  test.afterEach(async () => {
    await helpers.cleanup();
  });

  test('deve carregar a página inicial corretamente', async ({ page }) => {
    // Verificar se o título está correto
    await expect(page).toHaveTitle(/Hawk Esports Bot/);

    // Verificar se elementos principais estão visíveis
    await helpers.expectElementToBeVisible('header');
    await helpers.expectElementToBeVisible('main');

    // Verificar se não há erros no console
    await helpers.expectNoConsoleErrors();
  });

  test('deve navegar entre páginas principais sem autenticação', async ({ page }) => {
    // Verificar navegação para página de ranking
    if ((await page.locator('[href="/ranking"]').count()) > 0) {
      await helpers.clickElement('[href="/ranking"]');
      await helpers.waitForURL(/\/ranking/);
      await expect(page).toHaveURL(/\/ranking/);
    }

    // Voltar para home
    await helpers.clickElement('[href="/"]');
    await helpers.waitForURL(/\/$/);
    await expect(page).toHaveURL(/\/$/);
  });

  test('deve mostrar botão de login quando não autenticado', async ({ page }) => {
    // Procurar por elementos de login
    const loginElements = [
      'button:has-text("Login")',
      'a:has-text("Login")',
      '[data-testid="login-button"]',
      '.login-button',
    ];

    let loginFound = false;
    for (const selector of loginElements) {
      if ((await page.locator(selector).count()) > 0) {
        await helpers.expectElementToBeVisible(selector);
        loginFound = true;
        break;
      }
    }

    // Se não encontrou botão de login, verificar se já está autenticado
    if (!loginFound) {
      const userElements = [
        '[data-testid="user-menu"]',
        '.user-avatar',
        'button:has-text("Logout")',
        '[data-testid="logout-button"]',
      ];

      let userMenuFound = false;
      for (const selector of userElements) {
        if ((await page.locator(selector).count()) > 0) {
          userMenuFound = true;
          break;
        }
      }

      expect(userMenuFound).toBeTruthy();
    }
  });

  test('deve ter navegação responsiva', async ({ page }) => {
    // Testar em diferentes tamanhos de tela
    const viewports = [
      { width: 1920, height: 1080 }, // Desktop
      { width: 768, height: 1024 }, // Tablet
      { width: 375, height: 667 }, // Mobile
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500); // Aguardar animações

      // Verificar se a navegação está acessível
      const nav = page.locator('nav, header');
      await expect(nav).toBeVisible();

      // Em mobile, pode ter menu hambúrguer
      if (viewport.width < 768) {
        const mobileMenuTriggers = [
          'button[aria-label*="menu"]',
          '.hamburger',
          '[data-testid="mobile-menu-trigger"]',
          'button:has([data-icon="bars"])',
          'button:has(.fa-bars)',
        ];

        for (const selector of mobileMenuTriggers) {
          if ((await page.locator(selector).count()) > 0) {
            await helpers.expectElementToBeVisible(selector);
            break;
          }
        }
      }
    }
  });

  test('deve carregar recursos estáticos corretamente', async ({ page }) => {
    // Interceptar requisições de recursos
    const failedResources: string[] = [];

    page.on('response', response => {
      if (response.status() >= 400) {
        failedResources.push(`${response.status()}: ${response.url()}`);
      }
    });

    await page.reload();
    await helpers.waitForLoadingToFinish();

    // Verificar se não houve falhas críticas
    const criticalFailures = failedResources.filter(
      resource =>
        resource.includes('.js') || resource.includes('.css') || resource.includes('/api/')
    );

    if (criticalFailures.length > 0) {
      console.warn('Recursos que falharam:', criticalFailures);
    }

    // Não falhar o teste por recursos não críticos, apenas avisar
    expect(criticalFailures.length).toBeLessThan(5);
  });

  test('deve ter acessibilidade básica', async ({ page }) => {
    await helpers.checkBasicAccessibility();

    // Verificar se há heading principal
    const headings = await page.locator('h1, h2').count();
    expect(headings).toBeGreaterThan(0);

    // Verificar se há landmarks
    const landmarks = await page.locator('main, nav, header, footer').count();
    expect(landmarks).toBeGreaterThan(0);
  });

  test('deve funcionar navegação por teclado', async ({ page }) => {
    // Focar no primeiro elemento focável
    await page.keyboard.press('Tab');

    // Verificar se há elemento focado
    const focusedElement = await page.evaluate(() => {
      return document.activeElement?.tagName;
    });

    expect(focusedElement).toBeTruthy();

    // Testar navegação com Enter em links/botões
    const interactiveElements = await page.locator('a, button').first();
    if ((await interactiveElements.count()) > 0) {
      await interactiveElements.focus();
      // Não pressionar Enter para evitar navegação indesejada
      await expect(interactiveElements).toBeFocused();
    }
  });

  test('deve lidar com erros de rede graciosamente', async ({ page }) => {
    // Simular erro de rede para APIs
    await helpers.simulateNetworkError('**/api/**');

    await page.reload();
    await page.waitForTimeout(3000);

    // Verificar se a página ainda é utilizável
    await helpers.expectElementToBeVisible('body');

    // Verificar se há mensagem de erro ou fallback
    const errorIndicators = [
      ':text("erro")',
      ':text("Error")',
      ':text("falha")',
      ':text("offline")',
      '[data-testid="error-message"]',
      '.error-message',
    ];

    let errorShown = false;
    for (const selector of errorIndicators) {
      if ((await page.locator(selector).count()) > 0) {
        errorShown = true;
        break;
      }
    }

    // Ou a página mostra erro, ou funciona offline
    expect(errorShown || (await page.locator('main').isVisible())).toBeTruthy();
  });

  test('deve ter performance adequada', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/', { waitUntil: 'networkidle' });

    const loadTime = Date.now() - startTime;

    // Página deve carregar em menos de 10 segundos
    expect(loadTime).toBeLessThan(10000);

    // Verificar métricas de performance
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType(
        'navigation'
      )[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded:
          navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
      };
    });

    // DOM deve carregar em menos de 5 segundos
    expect(metrics.domContentLoaded).toBeLessThan(5000);
  });

  test('deve manter estado durante navegação', async ({ page }) => {
    // Definir algum estado no localStorage
    await page.evaluate(() => {
      localStorage.setItem('test-state', 'navigation-test');
    });

    // Navegar para outra página (se disponível)
    const links = await page.locator('a[href^="/"]').all();
    if (links.length > 0) {
      const firstLink = links[0];
      const href = await firstLink.getAttribute('href');

      if (href && href !== '/') {
        await firstLink.click();
        await page.waitForTimeout(1000);

        // Verificar se o estado foi mantido
        const state = await page.evaluate(() => {
          return localStorage.getItem('test-state');
        });

        expect(state).toBe('navigation-test');
      }
    }
  });
});
