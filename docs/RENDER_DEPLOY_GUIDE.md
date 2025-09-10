# 🚀 Guia de Deploy - Render.com

## Bot Hawk Esports - Deploy Gratuito 24/7

### 📋 Visão Geral

Este guia detalha como fazer o deploy do Bot Hawk Esports no Render.com, uma plataforma que oferece 750 horas gratuitas mensais, perfeita para manter o bot online 24/7 sem custos.

### 🎯 Vantagens do Render.com

- ✅ **750 horas gratuitas/mês** (suficiente para 24/7)
- ✅ **SSL automático** e domínio gratuito
- ✅ **Deploy automático** via GitHub
- ✅ **Logs em tempo real** e monitoramento
- ✅ **Escalabilidade automática**
- ✅ **Backup automático** e recovery
- ✅ **Zero configuração** de infraestrutura

---

## 🛠️ Pré-requisitos

### 1. Contas Necessárias
- [x] Conta no GitHub (gratuita)
- [x] Conta no Render.com (gratuita)
- [x] Repositório do projeto no GitHub

### 2. Variáveis de Ambiente
Tenha em mãos os seguintes tokens e chaves:

```bash
# Discord
DISCORD_TOKEN=seu_token_do_bot
DISCORD_CLIENT_ID=seu_client_id
DISCORD_CLIENT_SECRET=seu_client_secret

# APIs Externas
PUBG_API_KEY=sua_chave_pubg
SPOTIFY_CLIENT_ID=seu_spotify_id
SPOTIFY_CLIENT_SECRET=seu_spotify_secret
YOUTUBE_API_KEY=sua_chave_youtube

# Segurança
JWT_SECRET=sua_chave_jwt_32_caracteres
ENCRYPTION_KEY=sua_chave_criptografia_32_caracteres
```

---

## 🚀 Passo a Passo do Deploy

### Fase 1: Preparação do Repositório

#### 1.1 Verificar Arquivos de Configuração

Certifique-se de que os seguintes arquivos estão no seu repositório:

```
📁 bot-hawk-esports/
├── 📄 render.yaml              # ✅ Configuração do Render
├── 📄 Dockerfile               # ✅ Container otimizado
├── 📄 .env.render              # ✅ Exemplo de variáveis
├── 📁 .github/workflows/
│   └── 📄 render-deploy.yml    # ✅ CI/CD automático
└── 📁 src/routes/
    └── 📄 health.js            # ✅ Health checks otimizados
```

#### 1.2 Commit e Push

```bash
# Adicionar todos os arquivos
git add .

# Commit das alterações
git commit -m "feat: configuração para deploy no Render.com"

# Push para o repositório
git push origin main
```

### Fase 2: Configuração no Render.com

#### 2.1 Criar Conta e Conectar GitHub

1. Acesse [render.com](https://render.com)
2. Clique em **"Get Started for Free"**
3. Conecte sua conta do GitHub
4. Autorize o acesso ao repositório

#### 2.2 Criar Novo Web Service

1. No dashboard, clique em **"New +"**
2. Selecione **"Web Service"**
3. Conecte seu repositório `bot-hawk-esports`
4. Configure os seguintes campos:

```yaml
Name: bot-hawk-esports
Region: Oregon (US West)
Branch: main
Root Directory: .
Runtime: Docker
Build Command: (deixe vazio - usa Dockerfile)
Start Command: (deixe vazio - usa Dockerfile)
```

#### 2.3 Configurar Variáveis de Ambiente

Na seção **"Environment Variables"**, adicione:

```bash
# Configurações Básicas
NODE_ENV=production
PORT=10000
TZ=America/Sao_Paulo

# Discord (OBRIGATÓRIO)
DISCORD_TOKEN=seu_token_aqui
DISCORD_CLIENT_ID=seu_client_id_aqui
DISCORD_CLIENT_SECRET=seu_client_secret_aqui

# APIs Externas
PUBG_API_KEY=sua_chave_pubg
SPOTIFY_CLIENT_ID=seu_spotify_id
SPOTIFY_CLIENT_SECRET=seu_spotify_secret
YOUTUBE_API_KEY=sua_chave_youtube

# Segurança
JWT_SECRET=sua_chave_jwt_32_caracteres
ENCRYPTION_KEY=sua_chave_criptografia_32_caracteres

# Render Específico
RENDER=true
RENDER_SERVICE_NAME=bot-hawk-esports
```

#### 2.4 Configurar Banco de Dados Redis

1. Clique em **"New +"** → **"Redis"**
2. Configure:
   ```yaml
   Name: bot-redis
   Region: Oregon (US West)
   Plan: Free
   ```
3. Após criação, copie a **Redis URL**
4. Adicione como variável de ambiente:
   ```bash
   REDIS_URL=redis://username:password@hostname:port
   ```

### Fase 3: Deploy e Verificação

#### 3.1 Iniciar Deploy

1. Clique em **"Create Web Service"**
2. O Render iniciará o build automaticamente
3. Acompanhe os logs em tempo real
4. Aguarde a conclusão (5-10 minutos)

#### 3.2 Verificar Deploy

Após o deploy, verifique:

```bash
# Health Check
curl https://bot-hawk-esports.onrender.com/health

# Métricas
curl https://bot-hawk-esports.onrender.com/metrics

# Status
curl https://bot-hawk-esports.onrender.com/ready
```

**Resposta esperada do health check:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "platform": {
    "platform": "render.com",
    "region": "oregon",
    "service": "bot-hawk-esports"
  },
  "services": {
    "discord": { "status": "connected" },
    "database": { "status": "connected" },
    "redis": { "status": "connected" }
  }
}
```

---

## 🔄 Deploy Automático (CI/CD)

### GitHub Actions Configurado

O arquivo `.github/workflows/render-deploy.yml` já está configurado para:

- ✅ **Testes automáticos** a cada push
- ✅ **Security scan** de vulnerabilidades
- ✅ **Deploy automático** na branch main
- ✅ **Health check** pós-deploy
- ✅ **Notificações** de status

### Configurar Secrets no GitHub

1. Vá para **Settings** → **Secrets and variables** → **Actions**
2. Adicione os seguintes secrets:

```bash
RENDER_SERVICE_ID=srv-xxxxxxxxxx  # ID do seu serviço no Render
RENDER_API_KEY=rnd_xxxxxxxxxx    # API Key do Render
```

**Como obter os valores:**
- **Service ID**: Na URL do seu serviço no Render
- **API Key**: Render Dashboard → Account Settings → API Keys

---

## 📊 Monitoramento e Logs

### 1. Logs em Tempo Real

```bash
# Via Render Dashboard
1. Acesse seu serviço no Render
2. Clique na aba "Logs"
3. Visualize logs em tempo real

# Via API
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://api.render.com/v1/services/YOUR_SERVICE_ID/logs"
```

### 2. Métricas de Performance

```bash
# CPU e Memória
curl https://bot-hawk-esports.onrender.com/metrics

# Status dos Serviços
curl https://bot-hawk-esports.onrender.com/health

# Uptime
curl https://bot-hawk-esports.onrender.com/ready
```

### 3. Alertas Automáticos

O Render enviará emails automáticos para:
- ✅ Deploy bem-sucedido
- ❌ Falha no deploy
- ⚠️ Serviço inativo
- 📊 Uso de recursos

---

## 🛡️ Segurança e Backup

### 1. Configurações de Segurança

```yaml
# Headers de Segurança (já configurados)
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000
```

### 2. Backup Automático

- ✅ **Código**: Backup automático via GitHub
- ✅ **Configurações**: Versionadas no repositório
- ✅ **Logs**: Retidos por 7 dias no Render
- ✅ **Dados**: Redis com persistência automática

### 3. Recovery em Caso de Falha

```bash
# 1. Verificar logs
Render Dashboard → Logs

# 2. Restart manual
Render Dashboard → Manual Deploy

# 3. Rollback
Render Dashboard → Deployments → Deploy anterior

# 4. Health check
curl https://bot-hawk-esports.onrender.com/health
```

---

## 🔧 Troubleshooting

### Problemas Comuns

#### 1. Bot não conecta ao Discord

```bash
# Verificar token
echo $DISCORD_TOKEN

# Verificar logs
Render Dashboard → Logs → Filtrar "discord"

# Solução
1. Verificar se o token está correto
2. Verificar se o bot tem permissões
3. Regenerar token se necessário
```

#### 2. Redis não conecta

```bash
# Verificar URL
echo $REDIS_URL

# Testar conexão
curl https://bot-hawk-esports.onrender.com/health

# Solução
1. Verificar se o Redis está ativo
2. Verificar a URL de conexão
3. Recriar instância Redis se necessário
```

#### 3. Deploy falha

```bash
# Verificar logs do build
Render Dashboard → Logs → Build Logs

# Verificar GitHub Actions
GitHub → Actions → Último workflow

# Soluções comuns
1. Verificar sintaxe do render.yaml
2. Verificar dependências no package.json
3. Verificar variáveis de ambiente
```

#### 4. Performance lenta

```bash
# Verificar métricas
curl https://bot-hawk-esports.onrender.com/metrics

# Otimizações
1. Verificar uso de memória
2. Otimizar queries do banco
3. Implementar cache adicional
4. Considerar upgrade do plano
```

---

## 📈 Otimizações de Performance

### 1. Cache Inteligente

```javascript
// Já implementado no projeto
- Cache Redis para comandos frequentes
- Cache de usuários e guilds
- Cache de configurações
```

### 2. Monitoramento Proativo

```bash
# Health checks automáticos
- Verificação a cada 30 segundos
- Timeout de 10 segundos
- Retry automático em caso de falha
```

### 3. Otimização de Recursos

```yaml
# Limites configurados
Memory: 512MB
CPU: 0.5 cores
Timeout: 300 segundos
Instances: 1 (free tier)
```

---

## 💰 Custos e Limites

### Plano Gratuito (Free Tier)

```yaml
Horas mensais: 750h (suficiente para 24/7)
Memória: 512MB
CPU: 0.5 cores
Bandwidth: 100GB/mês
Builds: Ilimitados
SSL: Incluído
Domínio: Incluído (.onrender.com)
Supporte: Community
```

### Monitoramento de Uso

```bash
# Via Dashboard
Render → Usage → Visualizar consumo atual

# Via API
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://api.render.com/v1/services/YOUR_SERVICE_ID/usage"
```

---

## 🎯 Próximos Passos

### 1. Domínio Personalizado (Opcional)

```bash
# Configurar domínio próprio
1. Render Dashboard → Settings → Custom Domains
2. Adicionar seu domínio
3. Configurar DNS (CNAME)
4. SSL automático será configurado
```

### 2. Upgrade para Plano Pago (Se necessário)

```yaml
# Starter Plan ($7/mês)
Memória: 1GB
CPU: 1 core
Bandwidth: 500GB/mês
Supporte: Email

# Standard Plan ($25/mês)
Memória: 2GB
CPU: 2 cores
Bandwidth: 1TB/mês
Supporte: Priority
```

### 3. Integrações Adicionais

- ✅ **Sentry**: Monitoramento de erros
- ✅ **DataDog**: Métricas avançadas
- ✅ **Slack**: Notificações personalizadas
- ✅ **Discord Webhooks**: Logs em canal

---

## 📞 Suporte

### Recursos de Ajuda

- 📖 **Documentação**: [render.com/docs](https://render.com/docs)
- 💬 **Community**: [community.render.com](https://community.render.com)
- 📧 **Email**: support@render.com
- 🐦 **Twitter**: [@render](https://twitter.com/render)

### Contato do Projeto

- 🔗 **GitHub**: [bot-hawk-esports](https://github.com/your-username/bot-hawk-esports)
- 📊 **Status**: https://bot-hawk-esports.onrender.com/health
- 📈 **Métricas**: https://bot-hawk-esports.onrender.com/metrics

---

## ✅ Checklist Final

### Antes do Deploy
- [ ] Repositório no GitHub atualizado
- [ ] Variáveis de ambiente configuradas
- [ ] Tokens do Discord válidos
- [ ] APIs externas funcionando
- [ ] Arquivos de configuração presentes

### Durante o Deploy
- [ ] Build executado com sucesso
- [ ] Logs sem erros críticos
- [ ] Health check respondendo
- [ ] Bot conectado ao Discord
- [ ] Redis funcionando

### Após o Deploy
- [ ] Comandos do bot funcionando
- [ ] Dashboard acessível
- [ ] Monitoramento ativo
- [ ] Backup configurado
- [ ] CI/CD funcionando

---

**🎉 Parabéns! Seu Bot Hawk Esports está agora rodando 24/7 no Render.com gratuitamente!**

*Última atualização: Janeiro 2024*