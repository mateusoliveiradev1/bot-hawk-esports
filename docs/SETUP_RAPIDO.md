# 🚀 Configuração Rápida - Hawk Esports Bot

## ⚡ Configuração Automática (Recomendado)

### Opção 1: Script PowerShell (Windows)
```bash
npm run setup:complete:ps
```

### Opção 2: Script Node.js (Multiplataforma)
```bash
npm run setup:complete
```

### Opção 3: Execução Direta
```bash
# PowerShell
powershell -ExecutionPolicy Bypass -File setup-complete.ps1

# Node.js
node setup-complete.js
```

## 🔧 O que os scripts fazem automaticamente:

✅ **Instalam dependências necessárias:**
- Node.js (se não estiver instalado)
- Docker Desktop (se não estiver instalado)
- Chocolatey (Windows, se necessário)

✅ **Configuram o projeto:**
- Instalam dependências npm
- Configuram Spotify (Client ID e Secret)
- Criam arquivo .env a partir do .env.example
- Iniciam PostgreSQL e Redis via Docker
- Executam migrações do banco de dados
- Compilam o projeto TypeScript

✅ **Segurança:**
- Arquivo .env já está no .gitignore
- Credenciais não vazam para o GitHub
- Validação automática das credenciais

## 🎯 Após a configuração:

### Iniciar o bot:
```bash
# Desenvolvimento (com hot reload)
npm run dev

# Produção
npm start
```

### Parar serviços:
```bash
docker compose down
```

### Gerenciar banco de dados:
```bash
# Visualizar dados
npm run db:studio

# Aplicar mudanças no schema
npm run db:push

# Gerar cliente Prisma
npm run db:generate
```

## 🛠️ Configuração Manual (se necessário)

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
```bash
cp .env.example .env
# Edite o arquivo .env com suas credenciais
```

### 3. Configurar Spotify
```bash
npm run setup:spotify
```

### 4. Iniciar serviços
```bash
docker compose up -d postgres redis
```

### 5. Configurar banco
```bash
npx prisma generate
npx prisma db push
```

### 6. Compilar e iniciar
```bash
npm run build
npm run dev
```

## 📋 Variáveis de Ambiente Obrigatórias

### Discord
- `DISCORD_TOKEN` - Token do bot Discord
- `DISCORD_CLIENT_ID` - ID do aplicativo Discord
- `DISCORD_GUILD_ID` - ID do servidor Discord

### Spotify (Configurado automaticamente)
- `SPOTIFY_CLIENT_ID` - Client ID do Spotify
- `SPOTIFY_CLIENT_SECRET` - Client Secret do Spotify

### Banco de Dados (Configurado automaticamente)
- `DATABASE_URL` - URL de conexão PostgreSQL
- `REDIS_URL` - URL de conexão Redis

## 🆘 Solução de Problemas

### Docker não instalado
- **Windows:** Execute o script, ele instalará automaticamente
- **Manual:** https://docs.docker.com/desktop/windows/install/

### Erro de permissão PowerShell
```bash
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Spotify não configurado
```bash
npm run setup:spotify
```

### Banco de dados não conecta
```bash
docker compose up -d postgres
npx prisma db push
```

## 🎉 Pronto!

Após executar um dos scripts de configuração automática, seu bot estará 100% funcional com:

- ✅ Integração completa com Spotify
- ✅ Banco de dados PostgreSQL
- ✅ Cache Redis
- ✅ Sistema de comandos
- ✅ API REST
- ✅ Dashboard web
- ✅ Sistema de clips
- ✅ Gamificação e rankings
- ✅ Integração PUBG

**Comando para iniciar:** `npm run dev`