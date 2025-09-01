# CI/CD Setup - Hawk Esports Bot

Este documento descreve a configuração completa de CI/CD (Continuous Integration/Continuous Deployment) para o Hawk Esports Bot usando GitHub Actions.

## 📋 Visão Geral

O sistema de CI/CD é composto por três workflows principais:

- **CI (Continuous Integration)**: Executa testes, linting e verificações de segurança
- **Deploy**: Gerencia deployments para staging e produção
- **Release**: Automatiza o processo de criação de releases

## 🔧 Workflows Disponíveis

### 1. CI Workflow (`ci.yml`)

**Triggers:**
- Push para qualquer branch
- Pull requests para `main` e `develop`
- Execução manual

**Jobs:**
- **Lint**: ESLint e verificação de formatação
- **Test**: Testes unitários com cobertura
- **Build**: Compilação do projeto
- **Docker**: Build e teste da imagem Docker
- **Security**: Auditoria de segurança e CodeQL
- **Notify**: Notificações de resultado

**Serviços:**
- PostgreSQL para testes de integração
- Redis para testes de cache

### 2. Deploy Workflow (`deploy.yml`)

**Triggers:**
- Push para branch `main`
- Tags de versão (`v*`)
- Execução manual com seleção de ambiente

**Jobs:**
- **Pre-deploy**: Verificações e determinação do ambiente
- **CI**: Reutiliza o workflow de CI
- **Build-and-Push**: Constrói e envia imagem Docker
- **Deploy-Staging**: Deploy automático para staging
- **Deploy-Production**: Deploy para produção (manual ou por tag)
- **Post-deploy**: Tarefas pós-deploy e notificações

**Ambientes:**
- **Staging**: Deploy automático da branch `main`
- **Production**: Deploy manual ou por tags de versão

### 3. Release Workflow (`release.yml`)

**Triggers:**
- Tags de versão (`v*.*.*`)
- Execução manual

**Jobs:**
- **Validate**: Validação da versão e geração de changelog
- **Test**: Testes de release
- **Build**: Construção de artefatos
- **Create-Release**: Criação da release no GitHub
- **Deploy**: Deploy automático para produção
- **Post-Release**: Tarefas pós-release
- **Rollback**: Rollback em caso de falha

## 🚀 Como Usar

### Pré-requisitos

1. **GitHub CLI** instalado e autenticado:
   ```powershell
   # Instalar GitHub CLI
   winget install GitHub.cli
   
   # Autenticar
   gh auth login
   ```

2. **Secrets do GitHub** configurados:
   ```
   DOCKER_USERNAME     # Usuário do Docker Hub
   DOCKER_PASSWORD     # Senha/Token do Docker Hub
   DISCORD_WEBHOOK     # Webhook para notificações
   SLACK_WEBHOOK       # Webhook do Slack (opcional)
   ```

### Usando o Script de Gerenciamento

O script `scripts/github-actions.ps1` facilita o gerenciamento dos workflows:

```powershell
# Ver status dos workflows
.\scripts\github-actions.ps1 -Action status

# Disparar CI manualmente
.\scripts\github-actions.ps1 -Action trigger -Workflow ci

# Deploy para staging
.\scripts\github-actions.ps1 -Action deploy -Environment staging

# Deploy para produção
.\scripts\github-actions.ps1 -Action deploy -Environment production

# Criar release
.\scripts\github-actions.ps1 -Action release -Version v1.0.0

# Ver logs dos workflows
.\scripts\github-actions.ps1 -Action logs

# Listar workflows disponíveis
.\scripts\github-actions.ps1 -Action list
```

### Fluxo de Desenvolvimento

#### 1. Desenvolvimento Normal

```bash
# 1. Criar feature branch
git checkout -b feature/nova-funcionalidade

# 2. Fazer alterações e commits
git add .
git commit -m "feat: adicionar nova funcionalidade"

# 3. Push da branch (dispara CI)
git push origin feature/nova-funcionalidade

# 4. Criar Pull Request
gh pr create --title "Nova Funcionalidade" --body "Descrição da funcionalidade"
```

#### 2. Deploy para Staging

```bash
# 1. Merge para main (dispara deploy automático para staging)
git checkout main
git merge feature/nova-funcionalidade
git push origin main

# 2. Ou deploy manual
.\scripts\github-actions.ps1 -Action deploy -Environment staging
```

#### 3. Deploy para Produção

**Opção 1: Via Tag (Recomendado)**
```bash
# Criar e push da tag (dispara release e deploy automático)
git tag v1.0.0
git push origin v1.0.0

# Ou usar o script
.\scripts\github-actions.ps1 -Action release -Version v1.0.0
```

**Opção 2: Deploy Manual**
```bash
.\scripts\github-actions.ps1 -Action deploy -Environment production
```

## 🔍 Monitoramento e Logs

### Acompanhar Execuções

```powershell
# Status geral
.\scripts\github-actions.ps1 -Action status

# Logs detalhados
.\scripts\github-actions.ps1 -Action logs

# Via GitHub CLI
gh run list
gh run view <run-id>
gh run watch <run-id>
```

### URLs Importantes

- **Actions**: `https://github.com/seu-usuario/bot-hawk-esports/actions`
- **Releases**: `https://github.com/seu-usuario/bot-hawk-esports/releases`
- **Environments**: `https://github.com/seu-usuario/bot-hawk-esports/settings/environments`

## 🛡️ Segurança e Boas Práticas

### Proteção de Branches

1. **Branch `main`**:
   - Require pull request reviews
   - Require status checks (CI deve passar)
   - Restrict pushes to matching branches
   - Require branches to be up to date

2. **Branch `develop`**:
   - Require status checks (CI deve passar)
   - Allow force pushes (para desenvolvimento)

### Environments

1. **Staging**:
   - Deploy automático da branch `main`
   - Sem proteções especiais

2. **Production**:
   - Require reviewers (pelo menos 1)
   - Deployment branches: `main` e tags `v*`
   - Wait timer: 5 minutos

### Secrets Management

```yaml
# Secrets necessários
DOCKER_USERNAME: "seu-usuario-docker"
DOCKER_PASSWORD: "seu-token-docker"
DISCORD_WEBHOOK: "https://discord.com/api/webhooks/..."
SLACK_WEBHOOK: "https://hooks.slack.com/services/..."

# Environment secrets (opcional)
STAGING_DATABASE_URL: "postgresql://..."
PRODUCTION_DATABASE_URL: "postgresql://..."
```

## 📊 Métricas e Relatórios

### Artefatos Gerados

- **Build artifacts**: Código compilado
- **Test reports**: Relatórios de cobertura
- **Security reports**: Relatórios de vulnerabilidades
- **Docker images**: Imagens para deploy
- **Release packages**: Pacotes de release

### Notificações

- **Discord**: Notificações de deploy e falhas
- **Slack**: Notificações opcionais
- **Email**: Notificações do GitHub (configurável)

## 🔧 Configuração Avançada

### Customizar Workflows

1. **Adicionar novos jobs**:
   ```yaml
   jobs:
     custom-job:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - name: Custom step
           run: echo "Custom action"
   ```

2. **Modificar triggers**:
   ```yaml
   on:
     push:
       branches: [main, develop]
       paths-ignore: ['docs/**', '*.md']
   ```

3. **Adicionar environments**:
   ```yaml
   environment:
     name: custom-env
     url: https://custom-env.example.com
   ```

### Matrix Builds

```yaml
strategy:
  matrix:
    node-version: [18, 20]
    os: [ubuntu-latest, windows-latest]
```

### Conditional Jobs

```yaml
if: github.ref == 'refs/heads/main'
# ou
if: startsWith(github.ref, 'refs/tags/v')
```

## 🚨 Troubleshooting

### Problemas Comuns

1. **CI falhando**:
   ```bash
   # Verificar logs
   .\scripts\github-actions.ps1 -Action logs
   
   # Executar testes localmente
   npm test
   npm run lint
   ```

2. **Deploy falhando**:
   ```bash
   # Verificar secrets
   gh secret list
   
   # Testar build Docker localmente
   docker build -t test .
   ```

3. **Permissions negadas**:
   - Verificar permissões do token GitHub
   - Verificar configurações do repositório
   - Verificar proteções de branch

### Logs e Debug

```bash
# Habilitar debug nos workflows
env:
  ACTIONS_STEP_DEBUG: true
  ACTIONS_RUNNER_DEBUG: true

# Ver logs detalhados
gh run view <run-id> --log
```

## 📚 Recursos Adicionais

### Documentação

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [GitHub CLI Manual](https://cli.github.com/manual/)

### Marketplace Actions

- [actions/checkout](https://github.com/actions/checkout)
- [actions/setup-node](https://github.com/actions/setup-node)
- [docker/build-push-action](https://github.com/docker/build-push-action)
- [github/codeql-action](https://github.com/github/codeql-action)

### Exemplos de Uso

```bash
# Workflow completo de release
git checkout main
git pull origin main
git tag v1.2.0
git push origin v1.2.0

# Acompanhar progresso
.\scripts\github-actions.ps1 -Action status

# Verificar release criada
gh release list
gh release view v1.2.0
```

## 🔄 Atualizações e Manutenção

### Atualizar Actions

```yaml
# Usar versões específicas
- uses: actions/checkout@v4
- uses: actions/setup-node@v4

# Ou usar tags de versão
- uses: actions/checkout@main  # não recomendado para produção
```

### Renovar Secrets

```bash
# Atualizar secrets
gh secret set DOCKER_PASSWORD
gh secret set DISCORD_WEBHOOK
```

### Backup de Configurações

```bash
# Fazer backup dos workflows
cp -r .github/workflows/ backup/workflows/

# Exportar secrets (lista apenas)
gh secret list > secrets-list.txt
```

---

**Nota**: Lembre-se de atualizar as URLs e nomes de usuário nos exemplos acima para corresponder ao seu repositório específico.