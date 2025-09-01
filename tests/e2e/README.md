# 🧪 Testes E2E - Hawk Esports Bot

Sistema completo de testes End-to-End (E2E) para o projeto Hawk Esports Bot, implementado com Playwright.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Estrutura dos Testes](#estrutura-dos-testes)
- [Configuração](#configuração)
- [Executando os Testes](#executando-os-testes)
- [Tipos de Testes](#tipos-de-testes)
- [Utilitários](#utilitários)
- [Relatórios](#relatórios)
- [Troubleshooting](#troubleshooting)

## 🎯 Visão Geral

Este sistema de testes E2E garante a qualidade e funcionalidade de todos os componentes do Hawk Esports Bot:

- **Dashboard Web**: Interface de administração
- **API Backend**: Endpoints e serviços
- **Bot Discord**: Comandos e funcionalidades
- **Integração**: Fluxos completos entre componentes
- **Performance**: Testes de carga e stress

## 📁 Estrutura dos Testes

```
tests/e2e/
├── 📄 playwright.config.ts          # Configuração do Playwright
├── 📄 global-setup.ts               # Setup global dos testes
├── 📄 global-teardown.ts            # Limpeza global dos testes
├── 📄 README.md                     # Esta documentação
│
├── 📁 helpers/
│   └── 📄 test-helpers.ts           # Utilitários e helpers
│
├── 📁 dashboard/                    # Testes do Dashboard
│   ├── 📄 navigation.spec.ts        # Navegação e UI
│   ├── 📄 auth.spec.ts              # Autenticação
│   ├── 📄 tickets.spec.ts           # Sistema de tickets
│   └── 📄 ranking.spec.ts           # Sistema de ranking
│
├── 📁 api/                          # Testes da API
│   ├── 📄 health.spec.ts            # Health checks
│   ├── 📄 auth.spec.ts              # Autenticação API
│   └── 📄 tickets.spec.ts           # Endpoints de tickets
│
├── 📁 bot/                          # Testes do Bot Discord
│   └── 📄 commands.spec.ts          # Comandos do bot
│
├── 📁 integration/                  # Testes de Integração
│   └── 📄 bot-dashboard.spec.ts     # Integração bot-dashboard
│
├── 📁 workflows/                    # Fluxos Completos
│   └── 📄 complete-flows.spec.ts    # Cenários end-to-end
│
└── 📁 performance/                  # Testes de Performance
    └── 📄 stress-tests.spec.ts      # Testes de carga e stress
```

## ⚙️ Configuração

### Variáveis de Ambiente

Crie um arquivo `.env.test` na raiz do projeto:

```env
# URLs dos Serviços
DASHBOARD_URL=http://localhost:3002
API_BASE_URL=http://localhost:3001
BOT_URL=http://localhost:3000

# Banco de Dados de Teste
TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/hawk_test

# Redis de Teste
TEST_REDIS_URL=redis://localhost:6379/1

# Discord (para testes)
TEST_DISCORD_TOKEN=your_test_bot_token
TEST_GUILD_ID=your_test_guild_id

# Configurações de Teste
CI=false
HEADLESS=true
SLOW_MO=0
```

### Dependências

As dependências já estão instaladas no projeto:

```json
{
  "@playwright/test": "^1.40.0",
  "@prisma/client": "^5.0.0",
  "redis": "^4.6.0"
}
```

## 🚀 Executando os Testes

### Comandos Básicos

```bash
# Executar todos os testes E2E
npx playwright test

# Executar testes específicos
npx playwright test dashboard
npx playwright test api
npx playwright test integration

# Executar com interface gráfica
npx playwright test --ui

# Executar em modo debug
npx playwright test --debug

# Executar testes específicos
npx playwright test auth.spec.ts
```

### Opções Avançadas

```bash
# Executar em navegador específico
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Executar com cabeça (não headless)
npx playwright test --headed

# Executar com trace
npx playwright test --trace=on

# Executar testes em paralelo
npx playwright test --workers=4

# Executar apenas testes que falharam
npx playwright test --last-failed
```

### Scripts NPM

Adicione ao `package.json`:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:dashboard": "playwright test dashboard",
    "test:e2e:api": "playwright test api",
    "test:e2e:performance": "playwright test performance",
    "test:e2e:report": "playwright show-report"
  }
}
```

## 🧩 Tipos de Testes

### 1. Dashboard Tests

**Localização**: `tests/e2e/dashboard/`

- **Navigation**: Navegação, responsividade, acessibilidade
- **Auth**: Login/logout, sessões, proteção de rotas
- **Tickets**: CRUD de tickets, filtros, comentários
- **Ranking**: Listagem de usuários, ordenação, paginação

### 2. API Tests

**Localização**: `tests/e2e/api/`

- **Health**: Verificações de saúde dos serviços
- **Auth**: Autenticação JWT, rate limiting
- **Tickets**: Endpoints CRUD, validações

### 3. Bot Tests

**Localização**: `tests/e2e/bot/`

- **Commands**: Comandos Discord, respostas, permissões

### 4. Integration Tests

**Localização**: `tests/e2e/integration/`

- **Bot-Dashboard**: Sincronização de dados
- **Cross-Service**: Fluxos entre serviços

### 5. Workflow Tests

**Localização**: `tests/e2e/workflows/`

- **Complete Flows**: Cenários completos de usuário
- **Business Logic**: Regras de negócio end-to-end

### 6. Performance Tests

**Localização**: `tests/e2e/performance/`

- **Load Testing**: Testes de carga
- **Stress Testing**: Testes de stress
- **Memory Usage**: Monitoramento de memória

## 🛠️ Utilitários

### TestHelpers Class

**Localização**: `tests/e2e/helpers/test-helpers.ts`

```typescript
const helpers = new TestHelpers(page);

// Interações com elementos
await helpers.waitForElement('.my-element');
await helpers.clickElement('button');
await helpers.fillField('input[name="title"]', 'Valor');

// Navegação e aguardas
await helpers.waitForURL('/dashboard');
await helpers.waitForLoadingToFinish();

// Autenticação
await helpers.mockLogin(userData);
await helpers.clearAuth();

// Dados de teste
const user = await helpers.createTestUser();
const ticket = await helpers.createTestTicket();

// Screenshots e debugging
await helpers.takeScreenshot('test-state');

// Asserções
await helpers.expectElementToContainText('.title', 'Esperado');
await helpers.expectElementToBeVisible('.modal');

// Limpeza
await helpers.cleanup();
```

### TestData

Dados padronizados para testes:

```typescript
import { TestData } from '../helpers/test-helpers';

// Usuário padrão
const user = TestData.defaultUser;

// Ticket padrão
const ticket = TestData.defaultTicket;
```

### Selectors

Seletores reutilizáveis:

```typescript
import { Selectors } from '../helpers/test-helpers';

// Elementos comuns
const loginButton = page.locator(Selectors.loginButton);
const loadingSpinner = page.locator(Selectors.loadingSpinner);
```

## 📊 Relatórios

### Visualizar Relatórios

```bash
# Gerar e abrir relatório HTML
npx playwright show-report

# Relatório em formato específico
npx playwright test --reporter=html
npx playwright test --reporter=json
npx playwright test --reporter=junit
```

### Tipos de Relatórios

1. **HTML Report**: Interface visual interativa
2. **JSON Report**: Dados estruturados para CI/CD
3. **JUnit Report**: Compatível com Jenkins/GitLab
4. **Allure Report**: Relatórios avançados

### Screenshots e Videos

Configurados automaticamente:

- **Screenshots**: Capturados em falhas
- **Videos**: Gravados para testes que falham
- **Traces**: Disponíveis para debugging

**Localização**: `test-results/`

## 🔧 Troubleshooting

### Problemas Comuns

#### 1. Serviços não estão rodando

```bash
# Verificar se os serviços estão ativos
curl http://localhost:3001/api/health  # API
curl http://localhost:3002             # Dashboard
curl http://localhost:3000/health      # Bot

# Iniciar serviços se necessário
npm run dev:api
npm run dev:dashboard
npm run dev:bot
```

#### 2. Banco de dados de teste

```bash
# Resetar banco de teste
npx prisma migrate reset --force
npx prisma db push
npx prisma generate
```

#### 3. Timeouts nos testes

```bash
# Executar com timeout maior
npx playwright test --timeout=60000

# Ou configurar no playwright.config.ts
```

#### 4. Testes instáveis (flaky)

```bash
# Executar múltiplas vezes
npx playwright test --repeat-each=3

# Executar com retry
npx playwright test --retries=2
```

### Debug Avançado

```bash
# Modo debug com Playwright Inspector
npx playwright test --debug

# Executar com trace detalhado
npx playwright test --trace=on

# Executar com logs verbose
DEBUG=pw:* npx playwright test
```

### Configuração de CI/CD

**GitHub Actions** (`.github/workflows/e2e.yml`):

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright
        run: npx playwright install --with-deps
      
      - name: Start services
        run: |
          npm run dev:api &
          npm run dev:dashboard &
          npm run dev:bot &
          sleep 30
      
      - name: Run E2E tests
        run: npm run test:e2e
      
      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## 📈 Métricas e Monitoramento

### Métricas Coletadas

- **Performance**: Tempo de carregamento, navegação
- **Reliability**: Taxa de sucesso dos testes
- **Coverage**: Cobertura de funcionalidades
- **Stability**: Detecção de testes instáveis

### Alertas

- Falhas em testes críticos
- Degradação de performance
- Testes instáveis (flaky)

## 🤝 Contribuindo

### Adicionando Novos Testes

1. **Identifique o tipo**: Dashboard, API, Bot, Integration, etc.
2. **Escolha a localização**: Pasta apropriada em `tests/e2e/`
3. **Use os helpers**: Aproveite `TestHelpers` e utilitários
4. **Siga os padrões**: Nomenclatura e estrutura consistentes
5. **Documente**: Adicione comentários explicativos

### Padrões de Código

```typescript
// ✅ Bom
test('deve criar ticket com sucesso', async ({ page }) => {
  const helpers = new TestHelpers(page);
  
  // Setup
  const testUser = await helpers.createTestUser();
  await helpers.mockLogin(testUser);
  
  // Ação
  await page.goto('/tickets/new');
  await helpers.fillField('[data-testid="title"]', 'Novo Ticket');
  await helpers.clickElement('[data-testid="submit"]');
  
  // Verificação
  await helpers.expectElementToContainText('.success', 'criado');
  
  // Limpeza
  await helpers.cleanup();
});

// ❌ Evitar
test('test ticket', async ({ page }) => {
  await page.goto('/tickets');
  await page.click('button');
  // Sem verificações adequadas
});
```

### Revisão de Código

- **Funcionalidade**: O teste verifica o comportamento correto?
- **Estabilidade**: O teste é confiável e não flaky?
- **Performance**: O teste executa em tempo razoável?
- **Manutenibilidade**: O código é claro e bem estruturado?

---

## 📞 Suporte

Para dúvidas ou problemas:

1. **Documentação**: Consulte este README
2. **Issues**: Abra uma issue no repositório
3. **Logs**: Verifique os logs dos testes
4. **Debug**: Use as ferramentas de debug do Playwright

---

**Hawk Esports Bot E2E Tests** - Garantindo qualidade e confiabilidade! 🚀