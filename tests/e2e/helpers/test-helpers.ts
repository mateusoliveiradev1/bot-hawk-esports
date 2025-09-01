import { Page, Locator, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

/**
 * Helpers utilitários para testes E2E
 */
export class TestHelpers {
  private page: Page;
  private prisma: PrismaClient;

  constructor(page: Page) {
    this.page = page;
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
        }
      }
    });
  }

  /**
   * Aguardar elemento estar visível e interagível
   */
  async waitForElement(selector: string, timeout = 10000): Promise<Locator> {
    const element = this.page.locator(selector);
    await element.waitFor({ state: 'visible', timeout });
    return element;
  }

  /**
   * Aguardar e clicar em elemento
   */
  async clickElement(selector: string, timeout = 10000): Promise<void> {
    const element = await this.waitForElement(selector, timeout);
    await element.click();
  }

  /**
   * Aguardar e preencher campo
   */
  async fillField(selector: string, value: string, timeout = 10000): Promise<void> {
    const element = await this.waitForElement(selector, timeout);
    await element.clear();
    await element.fill(value);
  }

  /**
   * Aguardar texto aparecer na página
   */
  async waitForText(text: string, timeout = 10000): Promise<void> {
    await this.page.waitForFunction(
      (searchText) => document.body.innerText.includes(searchText),
      text,
      { timeout }
    );
  }

  /**
   * Aguardar URL específica
   */
  async waitForURL(url: string | RegExp, timeout = 10000): Promise<void> {
    await this.page.waitForURL(url, { timeout });
  }

  /**
   * Fazer screenshot com nome personalizado
   */
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `test-results/screenshots/${name}-${Date.now()}.png`,
      fullPage: true
    });
  }

  /**
   * Aguardar requisição de API específica
   */
  async waitForAPICall(urlPattern: string | RegExp, timeout = 10000): Promise<any> {
    const response = await this.page.waitForResponse(
      (response) => {
        const url = response.url();
        if (typeof urlPattern === 'string') {
          return url.includes(urlPattern);
        }
        return urlPattern.test(url);
      },
      { timeout }
    );
    return response.json();
  }

  /**
   * Simular login (mock)
   */
  async mockLogin(userData = {
    id: 'test-user-123',
    username: 'TestUser',
    discriminator: '0001',
    avatar: null
  }): Promise<void> {
    // Interceptar requisições de autenticação
    await this.page.route('**/api/auth/**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user: userData, authenticated: true })
        });
      } else {
        await route.continue();
      }
    });

    // Definir localStorage com dados do usuário
    await this.page.addInitScript((user) => {
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('authenticated', 'true');
    }, userData);
  }

  /**
   * Limpar autenticação
   */
  async clearAuth(): Promise<void> {
    await this.page.evaluate(() => {
      localStorage.removeItem('user');
      localStorage.removeItem('authenticated');
      sessionStorage.clear();
    });
  }

  /**
   * Aguardar loading desaparecer
   */
  async waitForLoadingToFinish(timeout = 30000): Promise<void> {
    // Aguardar spinners/loaders desaparecerem
    const loadingSelectors = [
      '[data-testid="loading"]',
      '.loading',
      '.spinner',
      '[aria-label="Loading"]'
    ];

    for (const selector of loadingSelectors) {
      try {
        await this.page.waitForSelector(selector, { state: 'hidden', timeout: 5000 });
      } catch {
        // Ignorar se o seletor não existir
      }
    }

    // Aguardar requisições de rede terminarem
    await this.page.waitForLoadState('networkidle', { timeout });
  }

  /**
   * Verificar se elemento contém texto
   */
  async expectElementToContainText(selector: string, text: string): Promise<void> {
    const element = await this.waitForElement(selector);
    await expect(element).toContainText(text);
  }

  /**
   * Verificar se elemento está visível
   */
  async expectElementToBeVisible(selector: string): Promise<void> {
    const element = this.page.locator(selector);
    await expect(element).toBeVisible();
  }

  /**
   * Verificar se elemento está oculto
   */
  async expectElementToBeHidden(selector: string): Promise<void> {
    const element = this.page.locator(selector);
    await expect(element).toBeHidden();
  }

  /**
   * Criar usuário de teste no banco
   */
  async createTestUser(userData: any = {}) {
    const defaultUser = {
      discordId: `test-user-${Date.now()}`,
      username: 'TestUser',
      discriminator: '0001',
      avatar: null,
      xp: 1000,
      level: 5,
      coins: 500,
      pubgUsername: 'TestPUBGUser',
      ...userData
    };

    return await this.prisma.user.create({
      data: defaultUser
    });
  }

  /**
   * Criar ticket de teste no banco
   */
  async createTestTicket(userId: string, ticketData: any = {}) {
    const defaultTicket = {
      id: `test-ticket-${Date.now()}`,
      userId,
      guildId: 'test-guild-123',
      channelId: `test-channel-${Date.now()}`,
      category: 'support',
      status: 'open',
      subject: 'Ticket de Teste',
      description: 'Descrição do ticket de teste',
      ...ticketData
    };

    return await this.prisma.ticket.create({
      data: defaultTicket
    });
  }

  /**
   * Limpar dados de teste específicos
   */
  async cleanupTestData(prefix: string): Promise<void> {
    await this.prisma.ticket.deleteMany({
      where: {
        id: {
          startsWith: prefix
        }
      }
    });

    await this.prisma.user.deleteMany({
      where: {
        discordId: {
          startsWith: prefix
        }
      }
    });
  }

  /**
   * Simular erro de rede
   */
  async simulateNetworkError(urlPattern: string | RegExp): Promise<void> {
    await this.page.route(urlPattern, async (route) => {
      await route.abort('failed');
    });
  }

  /**
   * Simular resposta lenta da API
   */
  async simulateSlowAPI(urlPattern: string | RegExp, delay: number = 5000): Promise<void> {
    await this.page.route(urlPattern, async (route) => {
      await new Promise(resolve => setTimeout(resolve, delay));
      await route.continue();
    });
  }

  /**
   * Verificar console errors
   */
  async expectNoConsoleErrors(): Promise<void> {
    const errors: string[] = [];
    
    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Aguardar um pouco para capturar erros
    await this.page.waitForTimeout(1000);

    if (errors.length > 0) {
      throw new Error(`Console errors encontrados: ${errors.join(', ')}`);
    }
  }

  /**
   * Verificar acessibilidade básica
   */
  async checkBasicAccessibility(): Promise<void> {
    // Verificar se há elementos com aria-labels apropriados
    const buttons = await this.page.locator('button').all();
    for (const button of buttons) {
      const text = await button.textContent();
      const ariaLabel = await button.getAttribute('aria-label');
      
      if (!text?.trim() && !ariaLabel) {
        throw new Error('Botão encontrado sem texto ou aria-label');
      }
    }

    // Verificar se há imagens sem alt text
    const images = await this.page.locator('img').all();
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      const ariaLabel = await img.getAttribute('aria-label');
      
      if (!alt && !ariaLabel) {
        const src = await img.getAttribute('src');
        throw new Error(`Imagem sem alt text encontrada: ${src}`);
      }
    }
  }

  /**
   * Fechar conexão com banco
   */
  async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

/**
 * Dados de teste padrão
 */
export const TestData = {
  users: {
    admin: {
      discordId: 'test-admin-123',
      username: 'AdminUser',
      discriminator: '0001',
      xp: 10000,
      level: 50,
      coins: 5000,
      isAdmin: true
    },
    regular: {
      discordId: 'test-user-456',
      username: 'RegularUser',
      discriminator: '0002',
      xp: 1000,
      level: 5,
      coins: 500,
      isAdmin: false
    },
    newbie: {
      discordId: 'test-newbie-789',
      username: 'NewbieUser',
      discriminator: '0003',
      xp: 0,
      level: 1,
      coins: 0,
      isAdmin: false
    }
  },
  
  tickets: {
    support: {
      category: 'support',
      subject: 'Preciso de ajuda',
      description: 'Estou com dificuldades para usar o bot'
    },
    bug: {
      category: 'bug',
      subject: 'Bug encontrado',
      description: 'O comando /rank não está funcionando'
    },
    suggestion: {
      category: 'suggestion',
      subject: 'Sugestão de melhoria',
      description: 'Seria legal ter um comando de música'
    }
  }
};

/**
 * Seletores comuns para testes
 */
export const Selectors = {
  // Navegação
  nav: {
    home: '[data-testid="nav-home"]',
    dashboard: '[data-testid="nav-dashboard"]',
    tickets: '[data-testid="nav-tickets"]',
    ranking: '[data-testid="nav-ranking"]',
    profile: '[data-testid="nav-profile"]'
  },
  
  // Botões comuns
  buttons: {
    login: '[data-testid="login-button"]',
    logout: '[data-testid="logout-button"]',
    save: '[data-testid="save-button"]',
    cancel: '[data-testid="cancel-button"]',
    delete: '[data-testid="delete-button"]',
    edit: '[data-testid="edit-button"]'
  },
  
  // Formulários
  forms: {
    ticketCreate: '[data-testid="ticket-create-form"]',
    profileEdit: '[data-testid="profile-edit-form"]'
  },
  
  // Modais
  modals: {
    confirm: '[data-testid="confirm-modal"]',
    ticketDetails: '[data-testid="ticket-details-modal"]'
  },
  
  // Loading states
  loading: {
    spinner: '[data-testid="loading-spinner"]',
    skeleton: '[data-testid="loading-skeleton"]'
  },
  
  // Mensagens
  messages: {
    success: '[data-testid="success-message"]',
    error: '[data-testid="error-message"]',
    warning: '[data-testid="warning-message"]'
  }
};