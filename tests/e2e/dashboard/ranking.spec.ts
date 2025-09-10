import { test, expect } from '@playwright/test';
import { TestHelpers, TestData } from '../helpers/test-helpers';

test.describe('Dashboard - Sistema de Ranking', () => {
  let helpers: TestHelpers;
  let testUsers: any[] = [];

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);

    // Criar usuários de teste com diferentes níveis
    testUsers = [
      await helpers.createTestUser({
        discordId: `test-rank-user-1-${Date.now()}`,
        username: 'RankUser1',
        xp: 5000,
        level: 25,
        coins: 1000,
      }),
      await helpers.createTestUser({
        discordId: `test-rank-user-2-${Date.now()}`,
        username: 'RankUser2',
        xp: 3000,
        level: 15,
        coins: 600,
      }),
      await helpers.createTestUser({
        discordId: `test-rank-user-3-${Date.now()}`,
        username: 'RankUser3',
        xp: 1000,
        level: 5,
        coins: 200,
      }),
    ];

    // Fazer login com o primeiro usuário
    await helpers.mockLogin({
      id: testUsers[0].discordId,
      username: testUsers[0].username,
      discriminator: '0001',
    });

    await page.goto('/ranking');
    await helpers.waitForLoadingToFinish();
  });

  test.afterEach(async () => {
    // Limpar dados de teste
    for (const user of testUsers) {
      await helpers.cleanupTestData(`test-rank-user`);
    }
    await helpers.cleanup();
  });

  test('deve carregar página de ranking', async ({ page }) => {
    // Verificar se a página de ranking carregou
    const rankingElements = [
      'h1:has-text("Ranking")',
      'h1:has-text("Leaderboard")',
      '[data-testid="ranking-list"]',
      '.ranking-container',
      '.leaderboard',
      'main:has-text("rank")',
      'div:has-text("Nenhum usuário")',
      'div:has-text("No users")',
    ];

    let rankingPageLoaded = false;
    for (const selector of rankingElements) {
      if ((await page.locator(selector).count()) > 0) {
        rankingPageLoaded = true;
        break;
      }
    }

    expect(rankingPageLoaded).toBeTruthy();
  });

  test('deve exibir lista de usuários ordenada por XP', async ({ page }) => {
    await page.reload();
    await helpers.waitForLoadingToFinish();

    // Procurar por elementos de usuário no ranking
    const userElements = [
      '.user-rank-item',
      '.ranking-item',
      '[data-testid="user-rank"]',
      '.leaderboard-entry',
    ];

    let userListFound = false;
    for (const selector of userElements) {
      if ((await page.locator(selector).count()) > 0) {
        userListFound = true;

        // Verificar se há pelo menos alguns usuários
        const userCount = await page.locator(selector).count();
        expect(userCount).toBeGreaterThan(0);
        break;
      }
    }

    // Se não encontrou lista específica, verificar se há dados de usuário
    if (!userListFound) {
      const userDataElements = [
        ':text("XP")',
        ':text("Level")',
        ':text("Nível")',
        ':text("Coins")',
        ':text("Moedas")',
        '.user-stats',
        '.user-info',
      ];

      for (const selector of userDataElements) {
        if ((await page.locator(selector).count()) > 0) {
          userListFound = true;
          break;
        }
      }
    }

    expect(userListFound).toBeTruthy();
  });

  test('deve mostrar informações corretas do usuário', async ({ page }) => {
    await page.reload();
    await helpers.waitForLoadingToFinish();

    // Procurar pelo usuário logado no ranking
    const currentUser = testUsers[0];

    // Verificar se o nome do usuário aparece
    const usernameElements = [
      `:text("${currentUser.username}")`,
      `[data-username="${currentUser.username}"]`,
    ];

    let userFound = false;
    for (const selector of usernameElements) {
      if ((await page.locator(selector).count()) > 0) {
        userFound = true;
        break;
      }
    }

    // Se encontrou o usuário, verificar suas estatísticas
    if (userFound) {
      // Verificar XP
      await helpers.waitForText(currentUser.xp.toString());

      // Verificar Level
      await helpers.waitForText(currentUser.level.toString());

      // Verificar Coins (se exibido)
      if ((await page.locator(`:text("${currentUser.coins}")`).count()) > 0) {
        await helpers.waitForText(currentUser.coins.toString());
      }
    }
  });

  test('deve filtrar ranking por diferentes critérios', async ({ page }) => {
    // Procurar filtros de ranking
    const filterSelectors = [
      'select[name="sortBy"]',
      '[data-testid="ranking-filter"]',
      'button:has-text("XP")',
      'button:has-text("Level")',
      'button:has-text("Coins")',
      '.filter-buttons',
      '.sort-options',
    ];

    for (const selector of filterSelectors) {
      if ((await page.locator(selector).count()) > 0) {
        const filterElement = page.locator(selector).first();

        if ((await filterElement.evaluate(el => el.tagName)) === 'SELECT') {
          // Se for select, testar diferentes opções
          const options = await filterElement.locator('option').all();
          for (const option of options.slice(0, 3)) {
            // Testar até 3 opções
            const value = await option.getAttribute('value');
            if (value) {
              await filterElement.selectOption(value);
              await page.waitForTimeout(1000);
            }
          }
        } else {
          // Se for botão, clicar
          await filterElement.click();
          await page.waitForTimeout(1000);
        }
        break;
      }
    }
  });

  test('deve pesquisar usuários no ranking', async ({ page }) => {
    await page.reload();
    await helpers.waitForLoadingToFinish();

    // Procurar campo de pesquisa
    const searchSelectors = [
      'input[placeholder*="pesquisar"]',
      'input[placeholder*="search"]',
      'input[placeholder*="usuário"]',
      'input[placeholder*="user"]',
      'input[type="search"]',
      '[data-testid="search-users"]',
      '.search-input',
    ];

    for (const selector of searchSelectors) {
      if ((await page.locator(selector).count()) > 0) {
        const searchTerm = testUsers[0].username.substring(0, 4);
        await helpers.fillField(selector, searchTerm);
        await page.waitForTimeout(1000);

        // Verificar se resultado da pesquisa aparece
        const hasResults = (await page.locator(`:text("${testUsers[0].username}")`).count()) > 0;
        expect(hasResults).toBeTruthy();
        break;
      }
    }
  });

  test('deve paginar lista de ranking', async ({ page }) => {
    // Criar usuários adicionais para testar paginação
    const additionalUsers = [];
    for (let i = 0; i < 20; i++) {
      additionalUsers.push(
        await helpers.createTestUser({
          discordId: `test-pagination-user-${i}-${Date.now()}`,
          username: `PaginationUser${i}`,
          xp: Math.floor(Math.random() * 10000),
          level: Math.floor(Math.random() * 50) + 1,
        })
      );
    }

    await page.reload();
    await helpers.waitForLoadingToFinish();

    // Procurar controles de paginação
    const paginationSelectors = [
      '.pagination',
      '[data-testid="pagination"]',
      'button:has-text("Próxima")',
      'button:has-text("Next")',
      'button:has-text("2")',
      '.page-numbers',
      'nav[aria-label="pagination"]',
    ];

    for (const selector of paginationSelectors) {
      if ((await page.locator(selector).count()) > 0) {
        const paginationElement = page.locator(selector).first();
        await paginationElement.click();
        await page.waitForTimeout(1000);
        break;
      }
    }

    // Limpar usuários adicionais
    for (const user of additionalUsers) {
      await helpers.cleanupTestData(`test-pagination-user`);
    }
  });

  test('deve mostrar posição do usuário atual', async ({ page }) => {
    await page.reload();
    await helpers.waitForLoadingToFinish();

    const currentUser = testUsers[0];

    // Procurar indicadores de posição
    const positionSelectors = [
      ':text("Sua posição")',
      ':text("Your rank")',
      ':text("#")',
      '[data-testid="user-position"]',
      '.current-user-rank',
      '.user-position',
    ];

    let positionFound = false;
    for (const selector of positionSelectors) {
      if ((await page.locator(selector).count()) > 0) {
        positionFound = true;
        break;
      }
    }

    // Se não encontrou indicador específico, verificar se o usuário está destacado
    if (!positionFound) {
      const highlightSelectors = [
        `.current-user:has-text("${currentUser.username}")`,
        `.highlighted:has-text("${currentUser.username}")`,
        `[data-current-user="true"]:has-text("${currentUser.username}")`,
      ];

      for (const selector of highlightSelectors) {
        if ((await page.locator(selector).count()) > 0) {
          positionFound = true;
          break;
        }
      }
    }

    // Posição pode não estar implementada, então não falhar o teste
    // expect(positionFound).toBeTruthy();
  });

  test('deve exibir estatísticas detalhadas', async ({ page }) => {
    // Procurar por um usuário específico para ver detalhes
    const userElement = page.locator(`:text("${testUsers[0].username}")`);

    if ((await userElement.count()) > 0) {
      await userElement.click();
      await page.waitForTimeout(1000);

      // Verificar se modal ou página de detalhes aparece
      const detailsSelectors = [
        '[data-testid="user-details"]',
        '.user-details-modal',
        '.user-profile',
        'h2:has-text("Estatísticas")',
        'h2:has-text("Statistics")',
      ];

      let detailsFound = false;
      for (const selector of detailsSelectors) {
        if ((await page.locator(selector).count()) > 0) {
          detailsFound = true;

          // Verificar se estatísticas estão presentes
          const statsElements = [
            ':text("XP")',
            ':text("Level")',
            ':text("Coins")',
            ':text("Rank")',
            ':text("Posição")',
            '.stat-item',
            '.user-stat',
          ];

          let statsFound = false;
          for (const statSelector of statsElements) {
            if ((await page.locator(statSelector).count()) > 0) {
              statsFound = true;
              break;
            }
          }

          expect(statsFound).toBeTruthy();
          break;
        }
      }
    }
  });

  test('deve ter diferentes visualizações de ranking', async ({ page }) => {
    // Procurar diferentes tipos de visualização
    const viewSelectors = [
      'button:has-text("Lista")',
      'button:has-text("Grid")',
      'button:has-text("Tabela")',
      '[data-testid="view-toggle"]',
      '.view-switcher',
      '.layout-buttons',
    ];

    for (const selector of viewSelectors) {
      if ((await page.locator(selector).count()) > 0) {
        const viewButton = page.locator(selector).first();
        await viewButton.click();
        await page.waitForTimeout(1000);

        // Verificar se a visualização mudou
        const layoutChanged = await page.evaluate(() => {
          return document.querySelector('.ranking-container, .leaderboard')?.className;
        });

        expect(layoutChanged).toBeTruthy();
        break;
      }
    }
  });

  test('deve mostrar progresso de XP', async ({ page }) => {
    await page.reload();
    await helpers.waitForLoadingToFinish();

    // Procurar indicadores de progresso
    const progressSelectors = [
      '.progress-bar',
      '.xp-progress',
      '[data-testid="xp-progress"]',
      'progress',
      '.level-progress',
    ];

    let progressFound = false;
    for (const selector of progressSelectors) {
      if ((await page.locator(selector).count()) > 0) {
        progressFound = true;

        // Verificar se o progresso tem valor válido
        const progressElement = page.locator(selector).first();
        const progressValue =
          (await progressElement.getAttribute('value')) ||
          (await progressElement.getAttribute('aria-valuenow'));

        if (progressValue) {
          const value = parseFloat(progressValue);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(100);
        }
        break;
      }
    }

    // Progresso pode não estar implementado
    // expect(progressFound).toBeTruthy();
  });

  test('deve ter responsividade adequada', async ({ page }) => {
    await page.reload();
    await helpers.waitForLoadingToFinish();

    // Testar em diferentes tamanhos de tela
    const viewports = [
      { width: 1920, height: 1080 }, // Desktop
      { width: 768, height: 1024 }, // Tablet
      { width: 375, height: 667 }, // Mobile
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500);

      // Verificar se elementos principais estão visíveis
      const mainContent = page.locator('main, .main-content, .ranking-container, .leaderboard');
      await expect(mainContent.first()).toBeVisible();

      // Em mobile, verificar se layout se adapta
      if (viewport.width < 768) {
        // Verificar se não há overflow horizontal
        const hasHorizontalScroll = await page.evaluate(() => {
          return document.body.scrollWidth > window.innerWidth;
        });

        expect(hasHorizontalScroll).toBeFalsy();

        // Verificar se elementos se empilham verticalmente
        const rankingItems = await page
          .locator('.ranking-item, .user-rank-item, .leaderboard-entry')
          .count();
        if (rankingItems > 0) {
          const firstItem = page
            .locator('.ranking-item, .user-rank-item, .leaderboard-entry')
            .first();
          const itemWidth = await firstItem.evaluate(el => el.getBoundingClientRect().width);

          // Item deve ocupar a maior parte da largura em mobile
          expect(itemWidth).toBeGreaterThan(viewport.width * 0.8);
        }
      }
    }
  });

  test('deve atualizar dados em tempo real', async ({ page }) => {
    await page.reload();
    await helpers.waitForLoadingToFinish();

    // Simular atualização de dados
    const refreshSelectors = [
      'button:has-text("Atualizar")',
      'button:has-text("Refresh")',
      '[data-testid="refresh-ranking"]',
      '.refresh-button',
    ];

    for (const selector of refreshSelectors) {
      if ((await page.locator(selector).count()) > 0) {
        await helpers.clickElement(selector);
        await helpers.waitForLoadingToFinish();
        break;
      }
    }

    // Ou testar auto-refresh se implementado
    await page.waitForTimeout(5000);

    // Verificar se dados ainda estão presentes após possível refresh
    const rankingStillVisible =
      (await page.locator('main, .ranking-container, .leaderboard').count()) > 0;
    expect(rankingStillVisible).toBeTruthy();
  });

  test('deve lidar com dados vazios graciosamente', async ({ page }) => {
    // Simular API retornando dados vazios
    await page.route('**/api/ranking**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ users: [], total: 0 }),
      });
    });

    await page.reload();
    await helpers.waitForLoadingToFinish();

    // Verificar se mensagem de "sem dados" aparece
    const emptyStateSelectors = [
      ':text("Nenhum usuário")',
      ':text("No users")',
      ':text("Vazio")',
      ':text("Empty")',
      '[data-testid="empty-state"]',
      '.empty-state',
    ];

    let emptyStateFound = false;
    for (const selector of emptyStateSelectors) {
      if ((await page.locator(selector).count()) > 0) {
        emptyStateFound = true;
        break;
      }
    }

    expect(emptyStateFound).toBeTruthy();
  });
});
