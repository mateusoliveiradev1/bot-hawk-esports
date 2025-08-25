# 🦅 Hawk Esports Bot

> Bot Discord avançado para comunidades de esports com foco em PUBG, sistema de gamificação completo e recursos de gerenciamento de comunidade.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.js.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)](https://www.prisma.io/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)

## 📋 Índice

- [🚀 Características](#-características)
- [🛠️ Tecnologias](#️-tecnologias)
- [📦 Instalação](#-instalação)
- [⚙️ Configuração](#️-configuração)
- [🎮 Comandos](#-comandos)
- [🏗️ Arquitetura](#️-arquitetura)
- [🔧 Desenvolvimento](#-desenvolvimento)
- [📊 API](#-api)
- [🤝 Contribuição](#-contribuição)
- [📄 Licença](#-licença)

## 🚀 Características

### 🎯 Sistema PUBG Integrado
- **Rankings Automáticos**: Diário, semanal e mensal com dados da API oficial
- **Estatísticas Detalhadas**: K/D, damage, headshots, wins e muito mais
- **Validação de Conta**: Sistema seguro de verificação de contas PUBG
- **Automação de Cargos**: Atribuição automática baseada em rank e performance

### 🏆 Sistema de Gamificação
- **Sistema de XP e Níveis**: Progressão baseada em atividades
- **Badges Automáticas**: 25+ badges com diferentes raridades
- **Desafios Diários/Semanais**: Objetivos dinâmicos com recompensas
- **Sistema de Moedas**: Economia interna com recompensas

### 🎮 Mini-Games e Entretenimento
- **Quiz PUBG**: Perguntas sobre o jogo com diferentes dificuldades
- **Teste de Reação**: Jogos de velocidade e reflexo
- **Corrida de Digitação**: Competições de velocidade de digitação
- **Desafios Matemáticos**: Problemas matemáticos cronometrados
- **Jogo da Memória**: Sequências de emojis para memorizar

### 🎬 Sistema de Clips
- **Upload de Vídeos**: Suporte para MP4, WebM, MOV, AVI (até 50MB)
- **Sistema de Votação**: Curtidas e descurtidas da comunidade
- **Filtros Avançados**: Por jogo, popularidade, data, autor
- **Tags Personalizadas**: Organização e busca por tags
- **Clips em Destaque**: Sistema de moderação para destacar conteúdo

### 🎵 Sistema de Música
- **Reprodução de Áudio**: YouTube, Spotify, SoundCloud
- **Fila de Reprodução**: Gerenciamento avançado de playlist
- **Filtros de Áudio**: Bassboost, nightcore, 8D e mais
- **Controles Interativos**: Botões para pausar, pular, repetir

### 👥 Gerenciamento de Comunidade
- **Sistema de Presença**: Check-in/check-out com recompensas
- **Onboarding Automático**: Processo de boas-vindas personalizado
- **Sistema de Tickets**: Suporte e atendimento organizado
- **Logs de Auditoria**: Rastreamento completo de ações

### 📊 Analytics e Relatórios
- **Dashboard Web**: Interface administrativa completa
- **Métricas em Tempo Real**: Estatísticas de uso e engagement
- **Relatórios Automáticos**: Resumos semanais e mensais
- **API RESTful**: Integração com sistemas externos

## 🛠️ Tecnologias

### Backend
- **Node.js 18+**: Runtime JavaScript
- **TypeScript**: Tipagem estática e desenvolvimento seguro
- **Discord.js v14**: Biblioteca para interação com Discord
- **Prisma ORM**: Gerenciamento de banco de dados
- **PostgreSQL**: Banco de dados relacional

### Serviços Externos
- **PUBG API**: Dados oficiais de estatísticas
- **YouTube API**: Reprodução de música
- **Spotify API**: Integração com playlists
- **Discord API**: Funcionalidades avançadas do Discord

### Ferramentas de Desenvolvimento
- **ESLint + Prettier**: Padronização de código
- **Husky**: Git hooks para qualidade
- **Commitlint**: Conventional commits
- **GitHub Actions**: CI/CD automatizado

## 📦 Instalação

### Pré-requisitos

```bash
# Node.js 18 ou superior
node --version

# PostgreSQL 14 ou superior
psql --version

# Git
git --version
```

### Clonagem e Instalação

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/bot-hawk-esports.git
cd bot-hawk-esports

# Instale as dependências
npm install

# Configure o banco de dados
npm run db:setup

# Execute as migrações
npm run db:migrate

# Gere o cliente Prisma
npm run db:generate
```

## ⚙️ Configuração

### Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# Discord Bot
DISCORD_TOKEN=seu_token_do_bot
DISCORD_CLIENT_ID=id_do_cliente
DISCORD_GUILD_ID=id_do_servidor_teste

# Database
DATABASE_URL="postgresql://usuario:senha@localhost:5432/hawk_esports"

# PUBG API
PUBG_API_KEY=sua_chave_da_api_pubg

# APIs Externas
YOUTUBE_API_KEY=sua_chave_youtube
SPOTIFY_CLIENT_ID=seu_client_id_spotify
SPOTIFY_CLIENT_SECRET=seu_client_secret_spotify

# Configurações
ENVIRONMENT=development
LOG_LEVEL=info
API_PORT=3000
JWT_SECRET=seu_jwt_secret_super_seguro

# Cache (Redis - Opcional)
REDIS_URL=redis://localhost:6379
```

### Configuração do Discord

1. **Crie uma aplicação** no [Discord Developer Portal](https://discord.com/developers/applications)
2. **Configure o bot** com as permissões necessárias:
   - `Send Messages`
   - `Use Slash Commands`
   - `Connect` (para música)
   - `Speak` (para música)
   - `Manage Roles` (para automação)
   - `Read Message History`
   - `Add Reactions`

3. **Convide o bot** para seu servidor com o link gerado

### Configuração do Banco de Dados

```bash
# Criar banco de dados
createdb hawk_esports

# Executar migrações
npm run db:migrate

# Seed inicial (opcional)
npm run db:seed
```

## 🎮 Comandos

### 🏆 Comandos PUBG

| Comando | Descrição | Uso |
|---------|-----------|-----|
| `/pubg link` | Vincular conta PUBG | `/pubg link username:PlayerName platform:steam` |
| `/pubg stats` | Ver estatísticas | `/pubg stats [usuario]` |
| `/pubg ranking` | Rankings do servidor | `/pubg ranking tipo:daily` |
| `/pubg compare` | Comparar jogadores | `/pubg compare usuario1 usuario2` |

### 🏅 Comandos de Gamificação

| Comando | Descrição | Uso |
|---------|-----------|-----|
| `/badges minhas` | Suas badges | `/badges minhas [usuario]` |
| `/badges disponiveis` | Badges disponíveis | `/badges disponiveis [categoria]` |
| `/level` | Seu nível e XP | `/level [usuario]` |
| `/daily` | Recompensa diária | `/daily` |
| `/challenge list` | Desafios ativos | `/challenge list` |
| `/challenge progress` | Seu progresso | `/challenge progress` |

### 🎮 Comandos de Jogos

| Comando | Descrição | Uso |
|---------|-----------|-----|
| `/quiz start` | Iniciar quiz | `/quiz start categoria:pubg dificuldade:medium` |
| `/minigame` | Mini-jogos | `/minigame tipo:reaction` |
| `/leaderboard` | Ranking de jogos | `/leaderboard tipo:quiz` |

### 🎬 Comandos de Clips

| Comando | Descrição | Uso |
|---------|-----------|-----|
| `/clips upload` | Enviar clip | `/clips upload video:arquivo.mp4 title:"Meu Clip"` |
| `/clips list` | Listar clips | `/clips list filter:top` |
| `/clips vote` | Votar em clip | `/clips vote clip_id:123 vote_type:like` |
| `/clips info` | Info do clip | `/clips info clip_id:123` |
| `/clips delete` | Deletar clip | `/clips delete clip_id:123` |

### 🎵 Comandos de Música

| Comando | Descrição | Uso |
|---------|-----------|-----|
| `/play` | Tocar música | `/play query:"nome da música"` |
| `/queue` | Ver fila | `/queue` |
| `/skip` | Pular música | `/skip` |
| `/pause` | Pausar/Retomar | `/pause` |
| `/volume` | Ajustar volume | `/volume level:50` |
| `/filter` | Aplicar filtro | `/filter type:bassboost` |

### 👥 Comandos de Comunidade

| Comando | Descrição | Uso |
|---------|-----------|-----|
| `/checkin` | Fazer check-in | `/checkin` |
| `/checkout` | Fazer check-out | `/checkout` |
| `/presence stats` | Estatísticas | `/presence stats [usuario]` |
| `/ticket create` | Criar ticket | `/ticket create assunto:"Ajuda"` |

## 🏗️ Arquitetura

### Estrutura do Projeto

```
src/
├── commands/           # Comandos do Discord
│   ├── general/       # Comandos gerais
│   ├── pubg/          # Comandos PUBG
│   ├── music/         # Comandos de música
│   └── admin/         # Comandos administrativos
├── services/          # Serviços de negócio
│   ├── pubg.service.ts
│   ├── game.service.ts
│   ├── badge.service.ts
│   ├── music.service.ts
│   ├── clip.service.ts
│   └── ...
├── database/          # Camada de dados
│   └── database.service.ts
├── events/            # Event handlers
├── utils/             # Utilitários
├── types/             # Definições de tipos
└── index.ts           # Ponto de entrada
```

### Fluxo de Dados

```mermaid
graph TD
    A[Discord Event] --> B[Command Handler]
    B --> C[Service Layer]
    C --> D[Database Layer]
    D --> E[PostgreSQL]
    C --> F[External APIs]
    F --> G[PUBG API]
    F --> H[YouTube API]
    C --> I[Cache Layer]
    I --> J[Redis]
```

### Padrões Utilizados

- **Service Layer**: Lógica de negócio isolada
- **Repository Pattern**: Abstração do acesso a dados
- **Event-Driven**: Arquitetura baseada em eventos
- **Dependency Injection**: Inversão de controle
- **Factory Pattern**: Criação de objetos complexos

## 🔧 Desenvolvimento

### Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev          # Modo desenvolvimento com hot-reload
npm run build        # Build para produção
npm run start        # Iniciar em produção

# Banco de Dados
npm run db:migrate   # Executar migrações
npm run db:generate  # Gerar cliente Prisma
npm run db:seed      # Popular banco com dados iniciais
npm run db:reset     # Resetar banco de dados

# Qualidade de Código
npm run lint         # Verificar código
npm run lint:fix     # Corrigir problemas automáticos
npm run format       # Formatar código
npm run type-check   # Verificar tipos TypeScript

# Testes
npm run test         # Executar testes
npm run test:watch   # Testes em modo watch
npm run test:coverage # Cobertura de testes
```

### Configuração do Ambiente de Desenvolvimento

1. **Clone e instale** conforme instruções de instalação
2. **Configure o VSCode** com as extensões recomendadas:
   - TypeScript
   - Prisma
   - ESLint
   - Prettier
3. **Configure o debugger** usando o arquivo `.vscode/launch.json`
4. **Execute em modo desenvolvimento**: `npm run dev`

### Contribuindo

1. **Fork** o repositório
2. **Crie uma branch** para sua feature: `git checkout -b feature/nova-funcionalidade`
3. **Commit** suas mudanças: `git commit -m 'feat: adicionar nova funcionalidade'`
4. **Push** para a branch: `git push origin feature/nova-funcionalidade`
5. **Abra um Pull Request**

### Padrões de Commit

Utilizamos [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` Nova funcionalidade
- `fix:` Correção de bug
- `docs:` Documentação
- `style:` Formatação
- `refactor:` Refatoração
- `test:` Testes
- `chore:` Tarefas de manutenção

## 📊 API

### Endpoints Principais

```bash
# Autenticação
POST /api/auth/login
POST /api/auth/refresh

# Usuários
GET /api/users/:id
GET /api/users/:id/stats
GET /api/users/:id/badges

# Rankings
GET /api/rankings/:guildId
GET /api/rankings/:guildId/pubg
GET /api/rankings/:guildId/internal

# Clips
GET /api/clips/:guildId
POST /api/clips
PUT /api/clips/:id/vote

# Estatísticas
GET /api/stats/:guildId
GET /api/stats/:guildId/activity
```

### Autenticação

A API utiliza JWT para autenticação:

```javascript
// Headers necessários
{
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
}
```

## 🚀 Deploy

### Docker

```bash
# Build da imagem
docker build -t hawk-esports-bot .

# Executar container
docker run -d \
  --name hawk-bot \
  --env-file .env \
  -p 3000:3000 \
  hawk-esports-bot
```

### Docker Compose

```yaml
version: '3.8'
services:
  bot:
    build: .
    env_file: .env
    depends_on:
      - postgres
      - redis
    ports:
      - "3000:3000"
  
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: hawk_esports
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### Produção

1. **Configure variáveis de ambiente** para produção
2. **Execute migrações**: `npm run db:migrate`
3. **Build do projeto**: `npm run build`
4. **Inicie o bot**: `npm start`
5. **Configure proxy reverso** (Nginx) se necessário
6. **Configure monitoramento** (PM2, Docker Health Checks)

## 📈 Monitoramento

### Logs

O bot utiliza um sistema de logs estruturado:

```typescript
// Níveis de log disponíveis
logger.error('Erro crítico', error);
logger.warn('Aviso importante');
logger.info('Informação geral');
logger.debug('Debug detalhado');
```

### Métricas

- **Uptime**: Tempo de atividade do bot
- **Comandos/min**: Taxa de uso de comandos
- **Usuários ativos**: Usuários únicos por período
- **Performance**: Tempo de resposta e uso de recursos

### Health Checks

```bash
# Verificar saúde da aplicação
curl http://localhost:3000/health

# Verificar banco de dados
curl http://localhost:3000/health/database

# Verificar APIs externas
curl http://localhost:3000/health/external
```

## 🤝 Contribuição

### Como Contribuir

1. **Reporte bugs** através das [Issues](https://github.com/seu-usuario/bot-hawk-esports/issues)
2. **Sugira melhorias** com descrições detalhadas
3. **Contribua com código** seguindo os padrões estabelecidos
4. **Melhore a documentação** com exemplos e explicações
5. **Teste novas funcionalidades** e reporte problemas

### Diretrizes

- **Código limpo**: Siga os padrões ESLint/Prettier
- **Testes**: Adicione testes para novas funcionalidades
- **Documentação**: Documente APIs e funcionalidades complexas
- **Performance**: Considere impacto na performance
- **Segurança**: Nunca exponha tokens ou dados sensíveis

## 📄 Licença

Este projeto está licenciado sob a [MIT License](LICENSE).

## 🙏 Agradecimentos

- **Discord.js Community** - Pela excelente biblioteca
- **PUBG Corporation** - Pela API oficial
- **Prisma Team** - Pelo ORM fantástico
- **TypeScript Team** - Pela tipagem estática
- **Contribuidores** - Por todas as melhorias e correções

---

<div align="center">
  <p>Feito com ❤️ para a comunidade de esports</p>
  <p>
    <a href="https://discord.gg/seu-servidor">Discord</a> •
    <a href="https://github.com/seu-usuario/bot-hawk-esports/issues">Issues</a> •
    <a href="https://github.com/seu-usuario/bot-hawk-esports/wiki">Wiki</a>
  </p>
</div>