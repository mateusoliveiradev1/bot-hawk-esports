# 🚀 Instruções de Deploy - Render.com

## Bot Hawk Esports - Deploy Gratuito 24/7

### 📋 Pré-requisitos

- [ ] Conta no GitHub com o repositório do projeto
- [ ] Conta no Render.com (gratuita)
- [ ] Tokens do Discord configurados
- [ ] Código commitado e enviado para o GitHub

---

## 🎯 Passo 1: Configurar Render.com

### 1.1 Criar Conta
1. Acesse [render.com](https://render.com/)
2. Clique em "Get Started for Free"
3. Conecte com sua conta do GitHub
4. Autorize o Render a acessar seus repositórios

### 1.2 Conectar Repositório
1. No dashboard do Render, clique em "New +"
2. Selecione "Web Service"
3. Conecte seu repositório `bot-hawk-esports`
4. Clique em "Connect"

---

## ⚙️ Passo 2: Configurar o Web Service

### 2.1 Configurações Básicas
```
Name: bot-hawk-esports
Region: Oregon (US West)
Branch: main
Root Directory: . (deixe vazio)
Runtime: Node
```

### 2.2 Build & Deploy
```
Build Command: npm install
Start Command: npm start
```

### 2.3 Plano
```
Instance Type: Free
(750 horas gratuitas por mês)
```

---

## 🔐 Passo 3: Configurar Variáveis de Ambiente

### 3.1 Variáveis Obrigatórias
No painel do Render, vá em "Environment" e adicione:

```env
NODE_ENV=production
PORT=10000
DISCORD_TOKEN=seu_token_do_discord
DISCORD_CLIENT_ID=seu_client_id_do_discord
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=sua_chave_jwt_secreta
```

### 3.2 Como Obter os Tokens

#### Discord Bot Token:
1. Acesse [Discord Developer Portal](https://discord.com/developers/applications)
2. Selecione sua aplicação
3. Vá na aba "Bot"
4. Copie o "Token"
5. Cole em `DISCORD_TOKEN`

#### Discord Client ID:
1. Na mesma aplicação do Discord
2. Vá na aba "General Information"
3. Copie o "Application ID"
4. Cole em `DISCORD_CLIENT_ID`

---

## 🗄️ Passo 4: Configurar Database (PostgreSQL)

### 4.1 Criar PostgreSQL no Render
1. No dashboard do Render, clique em "New +"
2. Selecione "PostgreSQL"
3. Configure:
   ```
   Name: bot-hawk-postgres
   Database: bot_hawk_db
   User: bot_user
   Region: Oregon (mesma do web service)
   Plan: Free
   ```
4. Clique em "Create Database"

### 4.2 Obter URL do Database
1. Após criado, clique no database
2. Vá na aba "Connect"
3. Copie a "External Database URL"
4. Cole em `DATABASE_URL` no web service

---

## 🔴 Passo 5: Configurar Redis

### 5.1 Opção 1: Redis no Render (Recomendado)
1. No dashboard do Render, clique em "New +"
2. Selecione "Redis"
3. Configure:
   ```
   Name: bot-hawk-redis
   Plan: Free
   Region: Oregon
   ```
4. Copie a Redis URL e cole em `REDIS_URL`

### 5.2 Opção 2: Upstash (Alternativa)
1. Acesse [upstash.com](https://upstash.com/)
2. Crie uma conta gratuita
3. Crie um database Redis
4. Copie a Redis URL
5. Cole em `REDIS_URL`

---

## 🚀 Passo 6: Deploy

### 6.1 Iniciar Deploy
1. Com todas as variáveis configuradas
2. Clique em "Create Web Service"
3. O Render iniciará o build automaticamente
4. Aguarde o deploy finalizar (5-10 minutos)

### 6.2 Verificar Deploy
1. Acesse a URL fornecida pelo Render
2. Adicione `/health` no final da URL
3. Deve retornar: `{"status": "ok", "timestamp": "..."}`

---

## 🔧 Passo 7: Configurações Avançadas

### 7.1 Auto Deploy
```
✅ Auto-Deploy: Yes
Branch: main
```
Cada push para `main` fará deploy automático

### 7.2 Health Checks
```
Health Check Path: /health
```
O Render verificará se o bot está funcionando

### 7.3 Custom Domain (Opcional)
1. Vá em "Settings" > "Custom Domains"
2. Adicione seu domínio personalizado
3. Configure DNS conforme instruções

---

## 📊 Passo 8: Monitoramento

### 8.1 Logs
1. No painel do Render, vá em "Logs"
2. Monitore erros e atividades do bot

### 8.2 Métricas
1. Vá em "Metrics"
2. Monitore CPU, memória e requests

### 8.3 Alertas
1. Configure notificações por email
2. Receba alertas de falhas ou crashes

---

## 🎮 Passo 9: Configurar Bot no Discord

### 9.1 Convidar Bot para Servidor
1. Use o link: `https://discord.com/api/oauth2/authorize?client_id=SEU_CLIENT_ID&permissions=8&scope=bot%20applications.commands`
2. Substitua `SEU_CLIENT_ID` pelo seu Client ID
3. Selecione o servidor
4. Autorize as permissões

### 9.2 Testar Comandos
```
/ping - Testa conectividade
/help - Lista comandos disponíveis
/status - Status do bot
```

---

## ✅ Checklist Final

- [ ] Web Service criado no Render
- [ ] PostgreSQL configurado
- [ ] Redis configurado
- [ ] Todas as variáveis de ambiente definidas
- [ ] Deploy realizado com sucesso
- [ ] Health check funcionando (`/health`)
- [ ] Bot convidado para o servidor Discord
- [ ] Comandos funcionando no Discord
- [ ] Dashboard no Vercel funcionando
- [ ] Logs sem erros críticos

---

## 🆘 Troubleshooting

### Erro: "Application failed to respond"
- Verifique se `PORT=10000` está configurado
- Confirme se o `npm start` está funcionando localmente

### Erro: "Database connection failed"
- Verifique se `DATABASE_URL` está correto
- Confirme se o PostgreSQL está rodando

### Erro: "Redis connection failed"
- Verifique se `REDIS_URL` está correto
- Teste a conexão Redis

### Bot não responde no Discord
- Verifique se `DISCORD_TOKEN` está correto
- Confirme se o bot tem permissões no servidor
- Verifique logs do Render

---

## 💰 Custos (Gratuito)

```
✅ Render Web Service: 750h/mês (gratuito)
✅ Render PostgreSQL: 1GB (gratuito)
✅ Render Redis: 25MB (gratuito)
✅ Vercel Dashboard: Ilimitado (gratuito)
✅ GitHub: Repositórios públicos (gratuito)

Total: R$ 0,00/mês 🎉
```

---

## 📞 Suporte

- **Render Docs**: [render.com/docs](https://render.com/docs)
- **Discord.js Guide**: [discordjs.guide](https://discordjs.guide)
- **GitHub Issues**: Reporte problemas no repositório

---

**🎯 Seu bot estará online 24/7 gratuitamente!**

*Última atualização: Janeiro 2025*