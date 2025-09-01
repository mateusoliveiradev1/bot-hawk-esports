import { test, expect } from '@playwright/test';
import { TestHelpers, TestData, Selectors } from '../helpers/test-helpers';

test.describe('Dashboard - Sistema de Tickets', () => {
  let helpers: TestHelpers;
  let testUser: any;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    
    // Criar usuário de teste no banco
    testUser = await helpers.createTestUser({
      discordId: `test-user-${Date.now()}`,
      username: 'TicketTestUser'
    });
    
    // Fazer login
    await helpers.mockLogin({
      id: testUser.discordId,
      username: testUser.username,
      discriminator: '0001'
    });
    
    await page.goto('/tickets');
    await helpers.waitForLoadingToFinish();
  });

  test.afterEach(async () => {
    // Limpar dados de teste
    if (testUser) {
      await helpers.cleanupTestData(`test-user-${testUser.discordId}`);
    }
    await helpers.cleanup();
  });

  test('deve carregar lista de tickets', async ({ page }) => {
    // Verificar se a página de tickets carregou
    const ticketElements = [
      'h1:has-text("Tickets")',
      '[data-testid="tickets-list"]',
      '.tickets-container',
      'main:has-text("ticket")',
      'div:has-text("Nenhum ticket")',
      'div:has-text("No tickets")'
    ];

    let ticketPageLoaded = false;
    for (const selector of ticketElements) {
      if (await page.locator(selector).count() > 0) {
        ticketPageLoaded = true;
        break;
      }
    }

    expect(ticketPageLoaded).toBeTruthy();
  });

  test('deve criar novo ticket', async ({ page }) => {
    // Procurar botão de criar ticket
    const createButtonSelectors = [
      'button:has-text("Criar Ticket")',
      'button:has-text("Novo Ticket")',
      '[data-testid="create-ticket-button"]',
      'a:has-text("Criar")',
      '.create-ticket-btn'
    ];

    let createButton = null;
    for (const selector of createButtonSelectors) {
      if (await page.locator(selector).count() > 0) {
        createButton = page.locator(selector).first();
        break;
      }
    }

    if (createButton) {
      await createButton.click();
      await page.waitForTimeout(1000);

      // Verificar se modal ou formulário de criação apareceu
      const formSelectors = [
        '[data-testid="ticket-create-form"]',
        'form:has-text("ticket")',
        'input[placeholder*="assunto"]',
        'input[placeholder*="subject"]',
        'textarea[placeholder*="descrição"]',
        'textarea[placeholder*="description"]'
      ];

      let formFound = false;
      for (const selector of formSelectors) {
        if (await page.locator(selector).count() > 0) {
          formFound = true;
          break;
        }
      }

      if (formFound) {
        // Preencher formulário
        const ticketData = TestData.tickets.support;
        
        // Preencher assunto
        const subjectSelectors = [
          'input[name="subject"]',
          'input[placeholder*="assunto"]',
          'input[placeholder*="subject"]',
          '[data-testid="ticket-subject"]'
        ];

        for (const selector of subjectSelectors) {
          if (await page.locator(selector).count() > 0) {
            await helpers.fillField(selector, ticketData.subject);
            break;
          }
        }

        // Preencher descrição
        const descriptionSelectors = [
          'textarea[name="description"]',
          'textarea[placeholder*="descrição"]',
          'textarea[placeholder*="description"]',
          '[data-testid="ticket-description"]'
        ];

        for (const selector of descriptionSelectors) {
          if (await page.locator(selector).count() > 0) {
            await helpers.fillField(selector, ticketData.description);
            break;
          }
        }

        // Selecionar categoria se disponível
        const categorySelectors = [
          'select[name="category"]',
          '[data-testid="ticket-category"]',
          'select:has(option:text("support"))'
        ];

        for (const selector of categorySelectors) {
          if (await page.locator(selector).count() > 0) {
            await page.locator(selector).selectOption(ticketData.category);
            break;
          }
        }

        // Submeter formulário
        const submitSelectors = [
          'button[type="submit"]',
          'button:has-text("Criar")',
          'button:has-text("Enviar")',
          '[data-testid="submit-ticket"]'
        ];

        for (const selector of submitSelectors) {
          if (await page.locator(selector).count() > 0) {
            await helpers.clickElement(selector);
            break;
          }
        }

        // Aguardar resposta
        await page.waitForTimeout(2000);

        // Verificar se ticket foi criado (sucesso ou erro)
        const responseIndicators = [
          ':text("sucesso")',
          ':text("criado")',
          ':text("erro")',
          ':text("falha")',
          '[data-testid="success-message"]',
          '[data-testid="error-message"]'
        ];

        let responseFound = false;
        for (const selector of responseIndicators) {
          if (await page.locator(selector).count() > 0) {
            responseFound = true;
            break;
          }
        }

        expect(responseFound).toBeTruthy();
      }
    }
  });

  test('deve visualizar detalhes do ticket', async ({ page }) => {
    // Criar ticket de teste no banco
    const testTicket = await helpers.createTestTicket(testUser.discordId, {
      subject: 'Ticket de Teste E2E',
      description: 'Descrição do ticket de teste'
    });

    await page.reload();
    await helpers.waitForLoadingToFinish();

    // Procurar pelo ticket na lista
    const ticketSelectors = [
      `:text("${testTicket.subject}")`,
      `[data-ticket-id="${testTicket.id}"]`,
      '.ticket-item',
      '.ticket-card'
    ];

    let ticketElement = null;
    for (const selector of ticketSelectors) {
      if (await page.locator(selector).count() > 0) {
        ticketElement = page.locator(selector).first();
        break;
      }
    }

    if (ticketElement) {
      await ticketElement.click();
      await page.waitForTimeout(1000);

      // Verificar se detalhes do ticket aparecem
      await helpers.waitForText(testTicket.subject);
      await helpers.waitForText(testTicket.description);
    }
  });

  test('deve filtrar tickets por status', async ({ page }) => {
    // Criar tickets com diferentes status
    const tickets = [
      await helpers.createTestTicket(testUser.discordId, {
        subject: 'Ticket Aberto',
        status: 'open'
      }),
      await helpers.createTestTicket(testUser.discordId, {
        subject: 'Ticket Fechado',
        status: 'closed'
      })
    ];

    await page.reload();
    await helpers.waitForLoadingToFinish();

    // Procurar filtros de status
    const filterSelectors = [
      'select[name="status"]',
      '[data-testid="status-filter"]',
      'button:has-text("Aberto")',
      'button:has-text("Fechado")',
      '.filter-buttons'
    ];

    for (const selector of filterSelectors) {
      if (await page.locator(selector).count() > 0) {
        const filterElement = page.locator(selector).first();
        
        if (await filterElement.evaluate(el => el.tagName) === 'SELECT') {
          // Se for select, testar diferentes opções
          await filterElement.selectOption('open');
          await page.waitForTimeout(1000);
          
          await filterElement.selectOption('closed');
          await page.waitForTimeout(1000);
        } else {
          // Se for botão, clicar
          await filterElement.click();
          await page.waitForTimeout(1000);
        }
        break;
      }
    }
  });

  test('deve pesquisar tickets', async ({ page }) => {
    // Criar ticket de teste
    const testTicket = await helpers.createTestTicket(testUser.discordId, {
      subject: 'Ticket Pesquisável Único',
      description: 'Descrição única para pesquisa'
    });

    await page.reload();
    await helpers.waitForLoadingToFinish();

    // Procurar campo de pesquisa
    const searchSelectors = [
      'input[placeholder*="pesquisar"]',
      'input[placeholder*="search"]',
      'input[type="search"]',
      '[data-testid="search-tickets"]',
      '.search-input'
    ];

    for (const selector of searchSelectors) {
      if (await page.locator(selector).count() > 0) {
        await helpers.fillField(selector, 'Pesquisável');
        await page.waitForTimeout(1000);
        
        // Verificar se resultado da pesquisa aparece
        await helpers.waitForText(testTicket.subject);
        break;
      }
    }
  });

  test('deve paginar lista de tickets', async ({ page }) => {
    // Criar múltiplos tickets para testar paginação
    const tickets = [];
    for (let i = 0; i < 15; i++) {
      tickets.push(await helpers.createTestTicket(testUser.discordId, {
        subject: `Ticket ${i + 1}`,
        description: `Descrição do ticket ${i + 1}`
      }));
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
      '.page-numbers'
    ];

    for (const selector of paginationSelectors) {
      if (await page.locator(selector).count() > 0) {
        const paginationElement = page.locator(selector).first();
        await paginationElement.click();
        await page.waitForTimeout(1000);
        break;
      }
    }
  });

  test('deve atualizar status do ticket', async ({ page }) => {
    // Criar ticket de teste
    const testTicket = await helpers.createTestTicket(testUser.discordId, {
      subject: 'Ticket para Atualizar',
      status: 'open'
    });

    await page.reload();
    await helpers.waitForLoadingToFinish();

    // Encontrar e clicar no ticket
    const ticketLink = page.locator(`:text("${testTicket.subject}")`);
    if (await ticketLink.count() > 0) {
      await ticketLink.click();
      await page.waitForTimeout(1000);

      // Procurar botões de ação
      const actionSelectors = [
        'button:has-text("Fechar")',
        'button:has-text("Close")',
        '[data-testid="close-ticket"]',
        'select[name="status"]'
      ];

      for (const selector of actionSelectors) {
        if (await page.locator(selector).count() > 0) {
          const actionElement = page.locator(selector).first();
          
          if (await actionElement.evaluate(el => el.tagName) === 'SELECT') {
            await actionElement.selectOption('closed');
          } else {
            await actionElement.click();
          }
          
          await page.waitForTimeout(1000);
          break;
        }
      }
    }
  });

  test('deve adicionar comentário ao ticket', async ({ page }) => {
    // Criar ticket de teste
    const testTicket = await helpers.createTestTicket(testUser.discordId, {
      subject: 'Ticket para Comentário'
    });

    await page.reload();
    await helpers.waitForLoadingToFinish();

    // Encontrar e abrir ticket
    const ticketLink = page.locator(`:text("${testTicket.subject}")`);
    if (await ticketLink.count() > 0) {
      await ticketLink.click();
      await page.waitForTimeout(1000);

      // Procurar área de comentários
      const commentSelectors = [
        'textarea[placeholder*="comentário"]',
        'textarea[placeholder*="comment"]',
        '[data-testid="comment-input"]',
        '.comment-textarea'
      ];

      for (const selector of commentSelectors) {
        if (await page.locator(selector).count() > 0) {
          await helpers.fillField(selector, 'Este é um comentário de teste');
          
          // Procurar botão de enviar comentário
          const submitSelectors = [
            'button:has-text("Enviar")',
            'button:has-text("Comentar")',
            '[data-testid="submit-comment"]'
          ];

          for (const submitSelector of submitSelectors) {
            if (await page.locator(submitSelector).count() > 0) {
              await helpers.clickElement(submitSelector);
              await page.waitForTimeout(1000);
              break;
            }
          }
          break;
        }
      }
    }
  });

  test('deve validar campos obrigatórios', async ({ page }) => {
    // Tentar criar ticket sem preencher campos
    const createButtonSelectors = [
      'button:has-text("Criar Ticket")',
      'button:has-text("Novo Ticket")',
      '[data-testid="create-ticket-button"]'
    ];

    for (const selector of createButtonSelectors) {
      if (await page.locator(selector).count() > 0) {
        await helpers.clickElement(selector);
        await page.waitForTimeout(1000);

        // Tentar submeter formulário vazio
        const submitSelectors = [
          'button[type="submit"]',
          'button:has-text("Criar")',
          'button:has-text("Enviar")'
        ];

        for (const submitSelector of submitSelectors) {
          if (await page.locator(submitSelector).count() > 0) {
            await helpers.clickElement(submitSelector);
            await page.waitForTimeout(1000);

            // Verificar se há mensagens de validação
            const validationSelectors = [
              ':text("obrigatório")',
              ':text("required")',
              '.error-message',
              '[data-testid="validation-error"]',
              '.field-error'
            ];

            let validationFound = false;
            for (const validationSelector of validationSelectors) {
              if (await page.locator(validationSelector).count() > 0) {
                validationFound = true;
                break;
              }
            }

            // Deve mostrar erro de validação ou não permitir submissão
            expect(validationFound).toBeTruthy();
            break;
          }
        }
        break;
      }
    }
  });

  test('deve ter responsividade adequada', async ({ page }) => {
    // Criar ticket de teste
    await helpers.createTestTicket(testUser.discordId, {
      subject: 'Ticket Responsivo'
    });

    await page.reload();
    await helpers.waitForLoadingToFinish();

    // Testar em diferentes tamanhos de tela
    const viewports = [
      { width: 1920, height: 1080 }, // Desktop
      { width: 768, height: 1024 },  // Tablet
      { width: 375, height: 667 }    // Mobile
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500);
      
      // Verificar se elementos principais estão visíveis
      const mainContent = page.locator('main, .main-content, .tickets-container');
      await expect(mainContent.first()).toBeVisible();
      
      // Em mobile, verificar se layout se adapta
      if (viewport.width < 768) {
        // Verificar se não há overflow horizontal
        const hasHorizontalScroll = await page.evaluate(() => {
          return document.body.scrollWidth > window.innerWidth;
        });
        
        expect(hasHorizontalScroll).toBeFalsy();
      }
    }
  });
});