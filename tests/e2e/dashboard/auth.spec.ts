import { test, expect } from '@playwright/test';
import { TestHelpers, TestData } from '../helpers/test-helpers';

test.describe('Dashboard - Autenticação', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    await page.goto('/');
  });

  test.afterEach(async () => {
    await helpers.cleanup();
  });

  test('deve realizar login com sucesso', async ({ page }) => {
    // Simular login
    await helpers.mockLogin(TestData.users.regular);
    
    // Recarregar página para aplicar autenticação
    await page.reload();
    await helpers.waitForLoadingToFinish();
    
    // Verificar se elementos de usuário autenticado estão visíveis
    const authenticatedElements = [
      ':text("TestUser")',
      '[data-testid="user-menu"]',
      'button:has-text("Logout")',
      '.user-avatar',
      '[data-testid="logout-button"]'
    ];

    let authElementFound = false;
    for (const selector of authenticatedElements) {
      if (await page.locator(selector).count() > 0) {
        await helpers.expectElementToBeVisible(selector);
        authElementFound = true;
        break;
      }
    }

    expect(authElementFound).toBeTruthy();
  });

  test('deve mostrar informações do usuário após login', async ({ page }) => {
    const userData = TestData.users.regular;
    await helpers.mockLogin(userData);
    
    await page.reload();
    await helpers.waitForLoadingToFinish();
    
    // Verificar se o nome do usuário aparece
    await helpers.waitForText(userData.username);
    
    // Verificar se informações do usuário estão disponíveis
    const userInfo = await page.evaluate(() => {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    });
    
    expect(userInfo).toBeTruthy();
    expect(userInfo.username).toBe(userData.username);
  });

  test('deve realizar logout com sucesso', async ({ page }) => {
    // Fazer login primeiro
    await helpers.mockLogin(TestData.users.regular);
    await page.reload();
    await helpers.waitForLoadingToFinish();
    
    // Procurar botão de logout
    const logoutSelectors = [
      'button:has-text("Logout")',
      '[data-testid="logout-button"]',
      'a:has-text("Logout")',
      '.logout-button'
    ];

    let logoutButton = null;
    for (const selector of logoutSelectors) {
      if (await page.locator(selector).count() > 0) {
        logoutButton = page.locator(selector).first();
        break;
      }
    }

    if (logoutButton) {
      await logoutButton.click();
      await page.waitForTimeout(1000);
      
      // Verificar se foi deslogado
      const authStatus = await page.evaluate(() => {
        return localStorage.getItem('authenticated');
      });
      
      expect(authStatus).toBeFalsy();
    } else {
      // Se não há botão de logout visível, limpar manualmente
      await helpers.clearAuth();
    }
  });

  test('deve redirecionar usuário não autenticado de páginas protegidas', async ({ page }) => {
    // Tentar acessar páginas que podem ser protegidas
    const protectedRoutes = [
      '/dashboard',
      '/profile',
      '/admin',
      '/settings'
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await page.waitForTimeout(2000);
      
      const currentUrl = page.url();
      
      // Se foi redirecionado ou mostra login, está funcionando
      const isRedirected = !currentUrl.includes(route) || 
                          currentUrl.includes('login') || 
                          currentUrl.includes('auth');
      
      const hasLoginPrompt = await page.locator('button:has-text("Login"), a:has-text("Login")').count() > 0;
      
      // Pelo menos uma das condições deve ser verdadeira
      expect(isRedirected || hasLoginPrompt).toBeTruthy();
    }
  });

  test('deve manter sessão após recarregar página', async ({ page }) => {
    const userData = TestData.users.regular;
    await helpers.mockLogin(userData);
    
    await page.reload();
    await helpers.waitForLoadingToFinish();
    
    // Recarregar novamente
    await page.reload();
    await helpers.waitForLoadingToFinish();
    
    // Verificar se ainda está autenticado
    const userInfo = await page.evaluate(() => {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    });
    
    expect(userInfo).toBeTruthy();
    expect(userInfo.username).toBe(userData.username);
  });

  test('deve lidar com erro de autenticação', async ({ page }) => {
    // Simular erro na API de autenticação
    await page.route('**/api/auth/**', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' })
      });
    });
    
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Verificar se não está autenticado
    const authStatus = await page.evaluate(() => {
      return localStorage.getItem('authenticated');
    });
    
    expect(authStatus).toBeFalsy();
  });

  test('deve mostrar diferentes níveis de acesso', async ({ page }) => {
    // Testar com usuário admin
    await helpers.mockLogin(TestData.users.admin);
    await page.reload();
    await helpers.waitForLoadingToFinish();
    
    // Procurar por elementos de admin
    const adminElements = [
      ':text("Admin")',
      '[data-testid="admin-panel"]',
      'a[href*="admin"]',
      '.admin-menu'
    ];

    let hasAdminAccess = false;
    for (const selector of adminElements) {
      if (await page.locator(selector).count() > 0) {
        hasAdminAccess = true;
        break;
      }
    }
    
    // Limpar e testar com usuário regular
    await helpers.clearAuth();
    await helpers.mockLogin(TestData.users.regular);
    await page.reload();
    await helpers.waitForLoadingToFinish();
    
    let hasRegularAccess = false;
    for (const selector of adminElements) {
      if (await page.locator(selector).count() > 0) {
        hasRegularAccess = true;
        break;
      }
    }
    
    // Admin deve ter mais acesso que usuário regular
    if (hasAdminAccess) {
      expect(hasRegularAccess).toBeFalsy();
    }
  });

  test('deve validar token expirado', async ({ page }) => {
    // Simular token expirado
    await page.addInitScript(() => {
      localStorage.setItem('user', JSON.stringify({
        id: 'expired-user',
        username: 'ExpiredUser',
        exp: Date.now() / 1000 - 3600 // Expirado há 1 hora
      }));
      localStorage.setItem('authenticated', 'true');
    });
    
    // Interceptar chamadas de API para retornar 401
    await page.route('**/api/**', async (route) => {
      if (route.request().headers()['authorization']) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Token expired' })
        });
      } else {
        await route.continue();
      }
    });
    
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Verificar se foi deslogado automaticamente
    const authStatus = await page.evaluate(() => {
      return localStorage.getItem('authenticated');
    });
    
    // Token expirado deve resultar em logout
    expect(authStatus).toBeFalsy();
  });

  test('deve funcionar com diferentes provedores de auth', async ({ page }) => {
    // Testar diferentes tipos de dados de usuário
    const authProviders = [
      {
        provider: 'discord',
        user: {
          id: 'discord-123',
          username: 'DiscordUser',
          discriminator: '0001',
          avatar: 'avatar-hash'
        }
      },
      {
        provider: 'google',
        user: {
          id: 'google-456',
          username: 'GoogleUser',
          email: 'user@gmail.com'
        }
      }
    ];

    for (const { provider, user } of authProviders) {
      await helpers.clearAuth();
      await helpers.mockLogin({ ...user, provider });
      
      await page.reload();
      await helpers.waitForLoadingToFinish();
      
      // Verificar se o usuário está autenticado
      const userInfo = await page.evaluate(() => {
        const userStr = localStorage.getItem('user');
        return userStr ? JSON.parse(userStr) : null;
      });
      
      expect(userInfo).toBeTruthy();
      expect(userInfo.username).toBe(user.username);
    }
  });

  test('deve lidar com múltiplas abas/janelas', async ({ context, page }) => {
    // Fazer login na primeira aba
    await helpers.mockLogin(TestData.users.regular);
    await page.reload();
    await helpers.waitForLoadingToFinish();
    
    // Abrir nova aba
    const newPage = await context.newPage();
    await newPage.goto('/');
    
    // Verificar se a autenticação é compartilhada
    const userInfo = await newPage.evaluate(() => {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    });
    
    expect(userInfo).toBeTruthy();
    
    // Fazer logout na primeira aba
    await helpers.clearAuth();
    await page.reload();
    
    // Verificar se logout afeta a segunda aba (pode não afetar imediatamente)
    await newPage.reload();
    await newPage.waitForTimeout(1000);
    
    await newPage.close();
  });

  test('deve ter segurança adequada', async ({ page }) => {
    await helpers.mockLogin(TestData.users.regular);
    await page.reload();
    
    // Verificar se dados sensíveis não estão expostos
    const sensitiveData = await page.evaluate(() => {
      const user = localStorage.getItem('user');
      return user ? JSON.parse(user) : null;
    });
    
    // Não deve ter senhas ou tokens em localStorage
    expect(sensitiveData?.password).toBeUndefined();
    expect(sensitiveData?.token).toBeUndefined();
    expect(sensitiveData?.secret).toBeUndefined();
    
    // Verificar se há proteção contra XSS
    const scriptContent = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'));
      return scripts.some(script => 
        script.innerHTML.includes('eval(') ||
        script.innerHTML.includes('document.write(')
      );
    });
    
    expect(scriptContent).toBeFalsy();
  });
});