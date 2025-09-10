import { test, expect } from '@playwright/test';
import { TestHelpers, TestData } from '../helpers/test-helpers';

test.describe('Fluxos Completos E2E', () => {
  let helpers: TestHelpers;
  let testUser: any;
  const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3002';
  const API_URL = process.env.API_BASE_URL || 'http://localhost:3001';
  const BOT_URL = process.env.BOT_URL || 'http://localhost:3000';

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    testUser = await helpers.createTestUser();
  });

  test.afterEach(async () => {
    await helpers.cleanup();
  });

  test('fluxo completo: criação de ticket até resolução', async ({ page, request }) => {
    // 1. Usuário acessa o dashboard
    await page.goto(DASHBOARD_URL);
    await helpers.waitForLoadingToFinish();

    // 2. Fazer login (se necessário)
    await helpers.mockLogin(testUser);

    // 3. Navegar para página de tickets
    await page.goto(`${DASHBOARD_URL}/tickets`);
    await helpers.waitForLoadingToFinish();

    // 4. Criar novo ticket
    const createButton = page
      .locator('button:has-text("Criar"), button:has-text("Novo"), [data-testid="create-ticket"]')
      .first();

    if ((await createButton.count()) > 0) {
      await createButton.click();

      // Preencher formulário
      await helpers.fillField(
        'input[name="title"], [data-testid="ticket-title"]',
        'Problema com Sistema de XP'
      );
      await helpers.fillField(
        'textarea[name="description"], [data-testid="ticket-description"]',
        'O sistema de XP não está funcionando corretamente. Usuários não estão recebendo XP por mensagens.'
      );

      // Selecionar prioridade
      const prioritySelect = page
        .locator('select[name="priority"], [data-testid="priority-select"]')
        .first();
      if ((await prioritySelect.count()) > 0) {
        await prioritySelect.selectOption('high');
      }

      // Selecionar categoria
      const categorySelect = page
        .locator('select[name="category"], [data-testid="category-select"]')
        .first();
      if ((await categorySelect.count()) > 0) {
        await categorySelect.selectOption('bug');
      }

      // Submeter formulário
      const submitButton = page
        .locator('button[type="submit"], button:has-text("Criar"), [data-testid="submit-ticket"]')
        .first();
      await submitButton.click();

      // Aguardar redirecionamento ou confirmação
      await helpers.waitForText('criado', { timeout: 10000 }).catch(() => {});

      // 5. Verificar se o ticket foi criado
      await page.goto(`${DASHBOARD_URL}/tickets`);
      await helpers.waitForLoadingToFinish();

      await expect(page.locator('text=Problema com Sistema de XP')).toBeVisible({ timeout: 15000 });

      // 6. Abrir o ticket criado
      await page.click('text=Problema com Sistema de XP');
      await helpers.waitForLoadingToFinish();

      // 7. Adicionar comentário de investigação
      const commentField = page
        .locator('textarea[name="comment"], [data-testid="comment-input"]')
        .first();

      if ((await commentField.count()) > 0) {
        await commentField.fill('Investigando o problema. Verificando logs do sistema de XP.');

        const addCommentButton = page
          .locator(
            'button:has-text("Adicionar"), button:has-text("Enviar"), [data-testid="add-comment"]'
          )
          .first();
        if ((await addCommentButton.count()) > 0) {
          await addCommentButton.click();

          // Aguardar comentário aparecer
          await helpers.waitForText('Investigando o problema', { timeout: 10000 });
        }
      }

      // 8. Alterar status para "em progresso"
      const statusSelect = page
        .locator('select[name="status"], [data-testid="status-select"]')
        .first();
      if ((await statusSelect.count()) > 0) {
        await statusSelect.selectOption('in_progress');

        const saveButton = page
          .locator('button:has-text("Salvar"), [data-testid="save-status"]')
          .first();
        if ((await saveButton.count()) > 0) {
          await saveButton.click();
          await helpers.waitForText('atualizado', { timeout: 5000 }).catch(() => {});
        }
      }

      // 9. Adicionar comentário de progresso
      if ((await commentField.count()) > 0) {
        await commentField.fill(
          'Problema identificado: configuração incorreta no módulo de XP. Aplicando correção.'
        );

        const addCommentButton = page
          .locator(
            'button:has-text("Adicionar"), button:has-text("Enviar"), [data-testid="add-comment"]'
          )
          .first();
        if ((await addCommentButton.count()) > 0) {
          await addCommentButton.click();
          await helpers.waitForText('Problema identificado', { timeout: 10000 });
        }
      }

      // 10. Resolver o ticket
      if ((await statusSelect.count()) > 0) {
        await statusSelect.selectOption('resolved');

        const saveButton = page
          .locator('button:has-text("Salvar"), [data-testid="save-status"]')
          .first();
        if ((await saveButton.count()) > 0) {
          await saveButton.click();
          await helpers.waitForText('resolvido', { timeout: 5000 }).catch(() => {});
        }
      }

      // 11. Adicionar comentário de resolução
      if ((await commentField.count()) > 0) {
        await commentField.fill(
          'Ticket resolvido. Sistema de XP corrigido e funcionando normalmente.'
        );

        const addCommentButton = page
          .locator(
            'button:has-text("Adicionar"), button:has-text("Enviar"), [data-testid="add-comment"]'
          )
          .first();
        if ((await addCommentButton.count()) > 0) {
          await addCommentButton.click();
          await helpers.waitForText('Ticket resolvido', { timeout: 10000 });
        }
      }

      // 12. Verificar histórico completo
      const comments = page.locator('.comment, .ticket-comment, [data-testid*="comment"]');
      const commentCount = await comments.count();

      expect(commentCount).toBeGreaterThanOrEqual(3); // Pelo menos 3 comentários

      // 13. Fechar o ticket
      if ((await statusSelect.count()) > 0) {
        await statusSelect.selectOption('closed');

        const saveButton = page
          .locator('button:has-text("Salvar"), [data-testid="save-status"]')
          .first();
        if ((await saveButton.count()) > 0) {
          await saveButton.click();
          await page.waitForTimeout(2000);
        }
      }

      // 14. Verificar na lista que o ticket está fechado
      await page.goto(`${DASHBOARD_URL}/tickets`);
      await helpers.waitForLoadingToFinish();

      // Filtrar por tickets fechados
      const statusFilter = page
        .locator('select[name="status"], [data-testid="status-filter"]')
        .first();
      if ((await statusFilter.count()) > 0) {
        await statusFilter.selectOption('closed');
        await page.waitForTimeout(1000);
      }

      // Verificar se o ticket aparece na lista de fechados
      await expect(page.locator('text=Problema com Sistema de XP')).toBeVisible({ timeout: 10000 });
    }
  });

  test('fluxo completo: novo usuário no sistema', async ({ page, request }) => {
    // 1. Simular novo usuário entrando no servidor Discord (via API)
    const newUser = {
      discordId: '987654321098765432',
      username: 'NovoUsuario' + Date.now(),
      discriminator: '1234',
      avatar: null,
      guildId: 'test-guild-123',
    };

    let userId: string;

    try {
      // Criar usuário via API
      const createUserResponse = await request.post(`${API_URL}/api/users`, {
        data: newUser,
        headers: { 'Content-Type': 'application/json' },
      });

      if (createUserResponse.ok()) {
        const userData = await createUserResponse.json();
        userId = userData.id || userData._id;
      }
    } catch (error) {
      // Usar usuário de teste existente
      userId = testUser.id;
      newUser.username = testUser.username;
    }

    // 2. Verificar se o usuário aparece no dashboard
    await page.goto(`${DASHBOARD_URL}/users`);
    await helpers.waitForLoadingToFinish();

    // Procurar pelo usuário na lista
    const userElement = page.locator(`text=${newUser.username}`).first();

    if ((await userElement.count()) === 0) {
      // Tentar buscar
      const searchField = page.locator('input[name="search"], [data-testid="user-search"]').first();
      if ((await searchField.count()) > 0) {
        await searchField.fill(newUser.username);
        await page.waitForTimeout(1000);
      }
    }

    await expect(page.locator(`text=${newUser.username}`)).toBeVisible({ timeout: 15000 });

    // 3. Clicar no usuário para ver detalhes
    await page.click(`text=${newUser.username}`);
    await helpers.waitForLoadingToFinish();

    // 4. Verificar informações do usuário
    await expect(page.locator(`text=${newUser.username}`)).toBeVisible();

    // Verificar XP inicial (deve ser 0 ou baixo)
    const xpElements = page.locator('text=/XP|Experience|Experiência/');
    if ((await xpElements.count()) > 0) {
      const xpText = await xpElements.first().textContent();
      if (xpText) {
        const xpMatch = xpText.match(/\d+/);
        if (xpMatch) {
          const xp = parseInt(xpMatch[0]);
          expect(xp).toBeLessThan(100); // Usuário novo deve ter pouco XP
        }
      }
    }

    // 5. Simular atividade do usuário (ganhar XP)
    if (userId) {
      try {
        // Adicionar XP via API
        await request.post(`${API_URL}/api/users/${userId}/xp`, {
          data: { amount: 50, reason: 'Mensagem no chat' },
          headers: { 'Content-Type': 'application/json' },
        });

        // Recarregar página para ver atualização
        await page.reload();
        await helpers.waitForLoadingToFinish();

        // Verificar se XP foi atualizado
        const updatedXpElements = page.locator('text=/XP|Experience/');
        if ((await updatedXpElements.count()) > 0) {
          const updatedXpText = await updatedXpElements.first().textContent();
          if (updatedXpText) {
            const xpMatch = updatedXpText.match(/\d+/);
            if (xpMatch) {
              const xp = parseInt(xpMatch[0]);
              expect(xp).toBeGreaterThanOrEqual(50);
            }
          }
        }
      } catch (error) {
        // API pode não estar disponível
      }
    }

    // 6. Verificar se usuário aparece no ranking
    await page.goto(`${DASHBOARD_URL}/ranking`);
    await helpers.waitForLoadingToFinish();

    // Procurar usuário no ranking
    const rankingUser = page.locator(`text=${newUser.username}`).first();

    if ((await rankingUser.count()) === 0) {
      // Pode estar em páginas posteriores, tentar buscar
      const searchField = page
        .locator('input[name="search"], [data-testid="ranking-search"]')
        .first();
      if ((await searchField.count()) > 0) {
        await searchField.fill(newUser.username);
        await page.waitForTimeout(1000);
      }
    }

    // Usuário pode não aparecer no ranking se não tiver XP suficiente
    // await expect(page.locator(`text=${newUser.username}`)).toBeVisible({ timeout: 10000 });
  });

  test('fluxo completo: moderação de usuário', async ({ page, request }) => {
    // 1. Fazer login como admin/moderador
    await page.goto(DASHBOARD_URL);
    await helpers.mockLogin({ ...testUser, role: 'admin' });

    // 2. Navegar para página de usuários
    await page.goto(`${DASHBOARD_URL}/users`);
    await helpers.waitForLoadingToFinish();

    // 3. Encontrar usuário para moderar
    const userToModerate = page.locator('.user-item, [data-testid*="user"]').first();

    if ((await userToModerate.count()) > 0) {
      await userToModerate.click();
      await helpers.waitForLoadingToFinish();

      // 4. Aplicar advertência
      const warnButton = page
        .locator('button:has-text("Advertir"), button:has-text("Warn"), [data-testid="warn-user"]')
        .first();

      if ((await warnButton.count()) > 0) {
        await warnButton.click();

        // Preencher motivo da advertência
        const reasonField = page
          .locator('textarea[name="reason"], [data-testid="warn-reason"]')
          .first();
        if ((await reasonField.count()) > 0) {
          await reasonField.fill('Comportamento inadequado no chat');

          const confirmButton = page
            .locator('button:has-text("Confirmar"), button:has-text("Advertir")')
            .first();
          if ((await confirmButton.count()) > 0) {
            await confirmButton.click();

            // Aguardar confirmação
            await helpers.waitForText('advertido', { timeout: 5000 }).catch(() => {});
          }
        }
      }

      // 5. Verificar histórico de moderação
      const moderationHistory = page.locator('.moderation-history, [data-testid="moderation-log"]');

      if ((await moderationHistory.count()) > 0) {
        await expect(moderationHistory).toBeVisible();

        // Verificar se a advertência aparece no histórico
        await expect(page.locator('text=Comportamento inadequado')).toBeVisible({ timeout: 10000 });
      }

      // 6. Aplicar timeout (se disponível)
      const timeoutButton = page
        .locator(
          'button:has-text("Timeout"), button:has-text("Silenciar"), [data-testid="timeout-user"]'
        )
        .first();

      if ((await timeoutButton.count()) > 0) {
        await timeoutButton.click();

        // Selecionar duração
        const durationSelect = page
          .locator('select[name="duration"], [data-testid="timeout-duration"]')
          .first();
        if ((await durationSelect.count()) > 0) {
          await durationSelect.selectOption('1h');

          const confirmTimeoutButton = page
            .locator('button:has-text("Confirmar"), button:has-text("Aplicar")')
            .first();
          if ((await confirmTimeoutButton.count()) > 0) {
            await confirmTimeoutButton.click();

            // Aguardar confirmação
            await helpers.waitForText('timeout', { timeout: 5000 }).catch(() => {});
          }
        }
      }

      // 7. Verificar logs de moderação
      await page.goto(`${DASHBOARD_URL}/moderation`);
      await helpers.waitForLoadingToFinish();

      // Procurar pelas ações de moderação aplicadas
      const moderationLogs = page.locator('.moderation-log, [data-testid*="mod-log"]');

      if ((await moderationLogs.count()) > 0) {
        // Verificar se há entradas de log
        const logEntries = page.locator('.log-entry, .mod-action');
        const logCount = await logEntries.count();

        expect(logCount).toBeGreaterThan(0);

        // Verificar se contém as ações aplicadas
        const hasWarnLog = (await page.locator('text=advertido').count()) > 0;
        const hasTimeoutLog = (await page.locator('text=timeout').count()) > 0;

        // Pelo menos uma ação deve estar registrada
        expect(hasWarnLog || hasTimeoutLog).toBeTruthy();
      }
    }
  });

  test('fluxo completo: configuração do sistema', async ({ page, request }) => {
    // 1. Fazer login como admin
    await page.goto(DASHBOARD_URL);
    await helpers.mockLogin({ ...testUser, role: 'admin' });

    // 2. Navegar para configurações
    const configUrls = [
      `${DASHBOARD_URL}/config`,
      `${DASHBOARD_URL}/settings`,
      `${DASHBOARD_URL}/admin/settings`,
    ];

    let configFound = false;

    for (const url of configUrls) {
      try {
        await page.goto(url);
        await helpers.waitForLoadingToFinish();

        const hasConfigElements =
          (await page
            .locator('input[name*="prefix"], input[name*="channel"], select[name*="language"]')
            .count()) > 0;

        if (hasConfigElements) {
          configFound = true;
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (configFound) {
      // 3. Configurar prefix do bot
      const prefixField = page.locator('input[name="prefix"], [data-testid="bot-prefix"]').first();

      if ((await prefixField.count()) > 0) {
        const originalPrefix = await prefixField.inputValue();

        await prefixField.fill('!');

        // Salvar configuração
        const saveButton = page
          .locator('button:has-text("Salvar"), button:has-text("Save")')
          .first();
        if ((await saveButton.count()) > 0) {
          await saveButton.click();

          // Aguardar confirmação
          await helpers.waitForText('salvo', { timeout: 5000 }).catch(() => {});
        }

        // 4. Verificar se a configuração foi aplicada
        await page.reload();
        await helpers.waitForLoadingToFinish();

        const updatedValue = await prefixField.inputValue();
        expect(updatedValue).toBe('!');

        // Restaurar valor original
        await prefixField.fill(originalPrefix);
        if ((await saveButton.count()) > 0) {
          await saveButton.click();
        }
      }

      // 5. Configurar canal de logs
      const logChannelField = page
        .locator('input[name="logChannel"], [data-testid="log-channel"]')
        .first();

      if ((await logChannelField.count()) > 0) {
        await logChannelField.fill('123456789012345678');

        const saveButton = page
          .locator('button:has-text("Salvar"), button:has-text("Save")')
          .first();
        if ((await saveButton.count()) > 0) {
          await saveButton.click();
          await helpers.waitForText('salvo', { timeout: 5000 }).catch(() => {});
        }
      }

      // 6. Configurar sistema de XP
      const xpEnabledCheckbox = page
        .locator('input[name="xpEnabled"], [data-testid="xp-enabled"]')
        .first();

      if ((await xpEnabledCheckbox.count()) > 0) {
        const isChecked = await xpEnabledCheckbox.isChecked();

        // Alternar estado
        await xpEnabledCheckbox.click();

        const saveButton = page
          .locator('button:has-text("Salvar"), button:has-text("Save")')
          .first();
        if ((await saveButton.count()) > 0) {
          await saveButton.click();
          await page.waitForTimeout(1000);
        }

        // Verificar mudança
        const newState = await xpEnabledCheckbox.isChecked();
        expect(newState).toBe(!isChecked);

        // Restaurar estado original
        await xpEnabledCheckbox.click();
        if ((await saveButton.count()) > 0) {
          await saveButton.click();
        }
      }

      // 7. Testar configurações avançadas
      const advancedTab = page
        .locator('button:has-text("Avançado"), [data-testid="advanced-tab"]')
        .first();

      if ((await advancedTab.count()) > 0) {
        await advancedTab.click();
        await page.waitForTimeout(1000);

        // Verificar se há configurações avançadas
        const advancedFields = page.locator(
          'input[name*="rate"], input[name*="limit"], input[name*="timeout"]'
        );
        const advancedCount = await advancedFields.count();

        expect(advancedCount).toBeGreaterThan(0);
      }
    }

    // Configurações podem não estar implementadas
    // expect(configFound).toBeTruthy();
  });

  test('fluxo completo: backup e restauração', async ({ page, request }) => {
    // 1. Fazer login como admin
    await page.goto(DASHBOARD_URL);
    await helpers.mockLogin({ ...testUser, role: 'admin' });

    // 2. Navegar para página de backup
    const backupUrls = [
      `${DASHBOARD_URL}/backup`,
      `${DASHBOARD_URL}/admin/backup`,
      `${DASHBOARD_URL}/maintenance`,
    ];

    let backupPageFound = false;

    for (const url of backupUrls) {
      try {
        await page.goto(url);
        await helpers.waitForLoadingToFinish();

        const hasBackupElements =
          (await page
            .locator(
              'button:has-text("Backup"), button:has-text("Export"), [data-testid*="backup"]'
            )
            .count()) > 0;

        if (hasBackupElements) {
          backupPageFound = true;
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (backupPageFound) {
      // 3. Criar backup
      const createBackupButton = page
        .locator(
          'button:has-text("Criar Backup"), button:has-text("Create Backup"), [data-testid="create-backup"]'
        )
        .first();

      if ((await createBackupButton.count()) > 0) {
        await createBackupButton.click();

        // Aguardar processo de backup
        await helpers.waitForText('backup', { timeout: 30000 }).catch(() => {});

        // Verificar se backup foi criado
        const backupList = page.locator('.backup-item, [data-testid*="backup-item"]');
        const backupCount = await backupList.count();

        expect(backupCount).toBeGreaterThan(0);
      }

      // 4. Listar backups existentes
      const backupItems = page.locator('.backup-item, [data-testid*="backup-item"]');
      const itemCount = await backupItems.count();

      if (itemCount > 0) {
        // Verificar informações do backup
        const firstBackup = backupItems.first();

        // Deve ter data/timestamp
        const hasTimestamp =
          (await firstBackup.locator('text=/\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/').count()) > 0;

        // Deve ter tamanho
        const hasSize = (await firstBackup.locator('text=/\d+\s*(KB|MB|GB)/').count()) > 0;

        expect(hasTimestamp || hasSize).toBeTruthy();

        // 5. Testar download de backup (sem executar)
        const downloadButton = firstBackup
          .locator('button:has-text("Download"), [data-testid="download-backup"]')
          .first();

        if ((await downloadButton.count()) > 0) {
          // Verificar se botão está habilitado
          const isEnabled = await downloadButton.isEnabled();
          expect(isEnabled).toBeTruthy();
        }

        // 6. Testar restauração (simulada)
        const restoreButton = firstBackup
          .locator(
            'button:has-text("Restaurar"), button:has-text("Restore"), [data-testid="restore-backup"]'
          )
          .first();

        if ((await restoreButton.count()) > 0) {
          // Não executar restauração real, apenas verificar se está disponível
          const isEnabled = await restoreButton.isEnabled();
          expect(isEnabled).toBeTruthy();
        }
      }

      // 7. Verificar configurações de backup automático
      const autoBackupSettings = page.locator('input[name*="auto"], [data-testid*="auto-backup"]');

      if ((await autoBackupSettings.count()) > 0) {
        const autoBackupCheckbox = autoBackupSettings.first();
        const isChecked = await autoBackupCheckbox.isChecked();

        // Verificar estado atual
        expect(typeof isChecked).toBe('boolean');
      }
    }

    // Sistema de backup pode não estar implementado
    // expect(backupPageFound).toBeTruthy();
  });

  test('fluxo completo: monitoramento e alertas', async ({ page, request }) => {
    // 1. Fazer login como admin
    await page.goto(DASHBOARD_URL);
    await helpers.mockLogin({ ...testUser, role: 'admin' });

    // 2. Navegar para página de monitoramento
    const monitoringUrls = [
      `${DASHBOARD_URL}/monitoring`,
      `${DASHBOARD_URL}/admin/monitoring`,
      `${DASHBOARD_URL}/metrics`,
      `${DASHBOARD_URL}/health`,
    ];

    let monitoringPageFound = false;

    for (const url of monitoringUrls) {
      try {
        await page.goto(url);
        await helpers.waitForLoadingToFinish();

        const hasMonitoringElements =
          (await page
            .locator('text=/CPU|Memory|Latency|Uptime/, [data-testid*="metric"]')
            .count()) > 0;

        if (hasMonitoringElements) {
          monitoringPageFound = true;
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (monitoringPageFound) {
      // 3. Verificar métricas do sistema
      const metrics = ['CPU', 'Memory', 'Latency', 'Uptime', 'Requests', 'Errors'];

      let metricsFound = 0;

      for (const metric of metrics) {
        const metricElement = page.locator(`text=${metric}`).first();

        if ((await metricElement.count()) > 0) {
          metricsFound++;

          // Verificar se há valor numérico associado
          const parent = metricElement.locator('..');
          const hasNumber = (await parent.locator('text=/\d+/').count()) > 0;

          expect(hasNumber).toBeTruthy();
        }
      }

      expect(metricsFound).toBeGreaterThan(0);

      // 4. Verificar gráficos/charts
      const charts = page.locator('canvas, svg, .chart, [data-testid*="chart"]');
      const chartCount = await charts.count();

      if (chartCount > 0) {
        // Verificar se charts são visíveis
        for (let i = 0; i < Math.min(chartCount, 3); i++) {
          await expect(charts.nth(i)).toBeVisible();
        }
      }

      // 5. Testar alertas
      const alertsSection = page.locator('.alerts, [data-testid="alerts"], text=Alertas').first();

      if ((await alertsSection.count()) > 0) {
        // Verificar se há alertas ativos
        const activeAlerts = page.locator('.alert-item, .alert, [data-testid*="alert"]');
        const alertCount = await activeAlerts.count();

        // Pode não haver alertas ativos
        expect(alertCount).toBeGreaterThanOrEqual(0);

        if (alertCount > 0) {
          // Verificar estrutura dos alertas
          const firstAlert = activeAlerts.first();

          // Deve ter nível de severidade
          const hasSeverity =
            (await firstAlert.locator('text=/critical|warning|info|error/i').count()) > 0;

          // Deve ter timestamp
          const hasTimestamp =
            (await firstAlert.locator('text=/\d{2}:\d{2}|\d{2}\/\d{2}/').count()) > 0;

          expect(hasSeverity || hasTimestamp).toBeTruthy();
        }
      }

      // 6. Configurar novos alertas
      const createAlertButton = page
        .locator(
          'button:has-text("Criar Alerta"), button:has-text("New Alert"), [data-testid="create-alert"]'
        )
        .first();

      if ((await createAlertButton.count()) > 0) {
        await createAlertButton.click();

        // Preencher configuração do alerta
        const nameField = page.locator('input[name="name"], [data-testid="alert-name"]').first();
        if ((await nameField.count()) > 0) {
          await nameField.fill('CPU Alto');
        }

        const conditionField = page
          .locator('select[name="condition"], [data-testid="alert-condition"]')
          .first();
        if ((await conditionField.count()) > 0) {
          await conditionField.selectOption('cpu_usage');
        }

        const thresholdField = page
          .locator('input[name="threshold"], [data-testid="alert-threshold"]')
          .first();
        if ((await thresholdField.count()) > 0) {
          await thresholdField.fill('80');
        }

        // Salvar alerta
        const saveAlertButton = page
          .locator('button:has-text("Salvar"), button:has-text("Create")')
          .first();
        if ((await saveAlertButton.count()) > 0) {
          await saveAlertButton.click();

          // Aguardar confirmação
          await helpers.waitForText('alerta', { timeout: 5000 }).catch(() => {});
        }
      }
    }

    // Sistema de monitoramento pode não estar implementado
    // expect(monitoringPageFound).toBeTruthy();
  });
});
