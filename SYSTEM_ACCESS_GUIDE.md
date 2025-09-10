# 🚀 Guia de Acesso ao Sistema Bot Hawk eSports

## 📋 Status do Deploy

### ✅ Concluído
- [x] Dashboard React no Vercel
- [x] Configurações do Render.com
- [x] Arquivos de ambiente
- [x] Health checks validados
- [x] Repositório atualizado

### 🔄 Pendente (Deploy Manual)
- [ ] Bot Discord no Render.com
- [ ] Configuração das variáveis de ambiente de produção

## 🌐 URLs do Sistema

### Dashboard (Vercel)
- **URL Principal**: https://bot-hawk-esports.vercel.app
- **Status**: ✅ Online
- **SSL**: ✅ Habilitado
- **Auto Deploy**: ✅ Ativo (branch main)

### Bot Discord (Render.com)
- **URL da API**: https://bot-hawk-esports.onrender.com
- **Health Check**: https://bot-hawk-esports.onrender.com/health
- **Status**: ⏳ Aguardando deploy manual

## 🔑 Variáveis de Ambiente Necessárias

### Para o Bot (Render.com)
```env
# Discord
DISCORD_TOKEN=seu_token_aqui
DISCORD_CLIENT_ID=seu_client_id_aqui

# Banco de Dados
DATABASE_URL=postgresql://usuario:senha@host:porta/database

# Cache
REDIS_URL=redis://usuario:senha@host:porta

# Ambiente
NODE_ENV=production
PORT=3000

# API
API_BASE_URL=https://bot-hawk-esports.onrender.com
JWT_SECRET=seu_jwt_secret_super_seguro

# CORS
CORS_ORIGIN=https://bot-hawk-esports.vercel.app
```

### Para o Dashboard (Vercel)
```env
# Já configurado automaticamente
VITE_API_URL=https://bot-hawk-esports.onrender.com
VITE_BOT_INVITE_URL=https://discord.com/api/oauth2/authorize?client_id=SEU_CLIENT_ID&permissions=8&scope=bot
```

## 📖 Como Obter as Chaves

### 1. Discord Developer Portal
1. Acesse: https://discord.com/developers/applications
2. Selecione sua aplicação
3. **Bot Tab**: Copie o `Token` → `DISCORD_TOKEN`
4. **General Information**: Copie `Application ID` → `DISCORD_CLIENT_ID`

### 2. Banco de Dados PostgreSQL
- **Render.com**: Crie um PostgreSQL database no Render
- **Supabase**: Use o connection string do projeto
- **Railway**: Use o connection string fornecido

### 3. Redis Cache
- **Render.com**: Crie um Redis instance (gratuito)
- **Railway**: Use Redis add-on
- **Upstash**: Redis serverless gratuito

## 🚀 Passos para Deploy no Render.com

### 1. Criar Web Service
1. Acesse https://render.com
2. Clique em "New" → "Web Service"
3. Conecte seu repositório GitHub
4. Configure:
   - **Name**: `bot-hawk-esports`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`

### 2. Configurar Variáveis de Ambiente
Adicione todas as variáveis listadas acima na seção "Environment Variables"

### 3. Deploy
1. Clique em "Create Web Service"
2. Aguarde o build e deploy (5-10 minutos)
3. Teste o health check: `https://seu-app.onrender.com/health`

## 🧪 Testes e Validação

### Health Check Local
```bash
node health-check.js
```
**Status**: ✅ Todos os testes passaram

### Endpoints para Testar
- `GET /health` - Status do sistema
- `GET /api/stats` - Estatísticas do bot
- `GET /api/guilds` - Servidores conectados

## 📱 Funcionalidades do Sistema

### Dashboard Web
- 📊 Estatísticas em tempo real
- 🏆 Sistema de gamificação
- 👥 Gerenciamento de usuários
- 🎮 Configurações de torneios
- 📈 Analytics e relatórios

### Bot Discord
- 🤖 Comandos slash interativos
- 🏆 Sistema de ranking
- 🎯 Gerenciamento de torneios
- 📊 Estatísticas de jogadores
- 🔔 Notificações automáticas

## 💰 Custos

### Vercel (Dashboard)
- **Plano**: Hobby (Gratuito)
- **Limites**: 100GB bandwidth/mês
- **Custom Domain**: ✅ Incluído

### Render.com (Bot)
- **Web Service**: $7/mês (após 750h gratuitas)
- **PostgreSQL**: $7/mês (após período gratuito)
- **Redis**: Gratuito (25MB)

**Total Estimado**: $0-14/mês dependendo do uso

## 🆘 Troubleshooting

### Dashboard 404
- ✅ **Resolvido**: Corrigido roteamento no vercel.json

### Bot Offline
- Verifique variáveis de ambiente no Render
- Confirme se o DISCORD_TOKEN está correto
- Teste o health check endpoint

### Banco de Dados
- Verifique CONNECTION_STRING
- Confirme se as migrations foram aplicadas
- Teste conexão local primeiro

## 📞 Suporte

### Documentação Adicional
- `DEPLOY_RENDER_INSTRUCTIONS.md` - Instruções detalhadas do Render
- `.env.production` - Template de variáveis
- `render.yaml` - Configuração completa

### Logs e Monitoramento
- **Vercel**: https://vercel.com/dashboard
- **Render**: https://dashboard.render.com
- **Health Check**: Execute `node health-check.js`

---

**🎯 Próximos Passos:**
1. Configure as variáveis de ambiente no Render.com
2. Faça o deploy do bot
3. Teste todas as funcionalidades
4. Configure o bot no seu servidor Discord

**Status Atual**: ✅ Sistema pronto para produção!