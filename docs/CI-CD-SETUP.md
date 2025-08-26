# 🚀 CI/CD Setup - Hawk Esports Bot

## 📋 Configurações Implementadas

### 🔧 Husky + Git Hooks
- **Pre-commit**: Executa TypeScript compiler (`tsc --noEmit`) antes de cada commit
- **Commit-msg**: Valida mensagens de commit usando commitlint

### 📝 Commitlint (Conventional Commits)
Todos os commits devem seguir o padrão:
```
type(scope): description

body (opcional)

footer (opcional)
```

#### Tipos permitidos:
- `feat`: Nova funcionalidade
- `fix`: Correção de bug
- `docs`: Documentação
- `style`: Formatação, ponto e vírgula, etc
- `refactor`: Refatoração de código
- `perf`: Melhoria de performance
- `test`: Adição ou correção de testes
- `chore`: Tarefas de build, configurações, etc
- `ci`: Mudanças em CI/CD
- `build`: Mudanças no sistema de build
- `revert`: Reverter commit anterior

#### Exemplos válidos:
```bash
git commit -m "feat: adicionar comando de música"
git commit -m "fix: corrigir erro no sistema de ranking"
git commit -m "docs: atualizar README com instruções"
```

### 🤖 GitHub Actions

#### Workflow CI (`ci.yml`)
- **Trigger**: Push/PR para `main` e `develop`
- **Node.js**: Testa nas versões 18.x e 20.x
- **Steps**:
  1. TypeScript compilation check
  2. ESLint (quando configurado)
  3. Testes (quando implementados)
  4. Verificação de commit message
  5. Build do projeto
  6. Security audit

#### Workflow Deploy (`deploy.yml`)
- **Trigger**: Push para `main` ou manual
- **Steps**:
  1. Build do projeto
  2. Geração de package de deploy
  3. Upload de artifacts

### 🎨 Prettier
Configuração para formatação consistente:
- Single quotes
- Semicolons
- 100 caracteres por linha
- 2 espaços de indentação

## 🚀 Como usar

### Instalação inicial
```bash
npm install
npm run prepare  # Configura Husky
```

### Scripts disponíveis
```bash
npm run dev          # Desenvolvimento com watch
npm run build        # Build para produção
npm run start        # Executar versão buildada
npm run lint         # Executar ESLint
npm run lint:fix     # Corrigir erros do ESLint
npm run format       # Formatar código com Prettier
npm run typecheck    # Verificar tipos TypeScript
```

### Fazendo commits
```bash
git add .
git commit -m "feat: sua nova funcionalidade"
```

### Testando hooks localmente
```bash
# Testar pre-commit
npx husky run pre-commit

# Testar commitlint
echo "feat: test message" | npx commitlint
```

## 🔍 Troubleshooting

### Commit rejeitado por mensagem inválida
```bash
# ❌ Inválido
git commit -m "update code"

# ✅ Válido
git commit -m "refactor: update code structure"
```

### Pre-commit falhou
- Verifique erros de TypeScript: `npx tsc --noEmit`
- Corrija os erros e tente novamente

### ESLint com muitos erros
- Execute: `npm run lint:fix` para correções automáticas
- Configure `.eslintignore` para arquivos específicos

## 📊 Status Badges
Adicione ao README principal:
```markdown
![CI](https://github.com/seu-usuario/hawk-esports-bot/workflows/CI%2FCD%20Pipeline/badge.svg)
![Deploy](https://github.com/seu-usuario/hawk-esports-bot/workflows/Deploy/badge.svg)
```