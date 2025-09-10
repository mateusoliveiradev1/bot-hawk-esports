# 🚀 Guia Completo de Deploy Gratuito 24/7

## Bot Hawk Esports - Deploy em Produção com Custo Zero

### 📋 Índice
1. [Pré-requisitos](#pré-requisitos)
2. [Fase 1: Deploy Básico](#fase-1-deploy-básico)
3. [Fase 2: Domínio e SSL](#fase-2-domínio-e-ssl)
4. [Fase 3: Monitoramento](#fase-3-monitoramento)
5. [Fase 4: Backup e CI/CD](#fase-4-backup-e-cicd)
6. [Fase 5: Otimizações](#fase-5-otimizações)
7. [Manutenção](#manutenção)
8. [Troubleshooting](#troubleshooting)

---

## 🎯 Pré-requisitos

### Contas Necessárias (Todas Gratuitas)
- [ ] **GitHub** - Repositório e CI/CD
- [ ] **Railway.app** - Deploy do bot (500h/mês grátis)
- [ ] **Vercel** - Deploy da dashboard (ilimitado)
- [ ] **Freenom** - Domínio gratuito (.tk, .ml, .ga)
- [ ] **Cloudflare** - SSL e CDN gratuito
- [ ] **UptimeRobot** - Monitoramento (50 monitores grátis)
- [ ] **Google Drive** - Backup automático (15GB grátis)
- [ ] **Discord** - Webhooks para notificações

### Variáveis de Ambiente Necessárias
```env
# Discord
DISCORD_TOKEN=seu_token_aqui
DISCORD_CLIENT_ID=seu_client_id_aqui
WEBHOOK_URL=sua_webhook_url_aqui

# APIs
PUBG_API_KEY=sua_api_key_aqui
JWT_SECRET=seu_jwt_secret_aqui

# Banco de Dados (Railway fornece automaticamente)
REDIS_URL=redis://...
MONGODB_URI=mongodb://...

# Monitoramento
UPTIMEROBOT_API_KEY=sua_api_key_aqui

# Backup
GOOGLE_DRIVE_CREDENTIALS=suas_credenciais_json
GOOGLE_DRIVE_FOLDER_ID=id_da_pasta

# Deploy
RAILWAY_TOKEN=seu_token_aqui
VERCEL_TOKEN=seu_token_aqui
VERCEL_ORG_ID=seu_org_id
VERCEL_PROJECT_ID=seu_project_id
```

---

## 🚀 Fase 1: Deploy Básico

### 1.1 Deploy do Bot no Railway

1. **Criar conta no Railway.app**
   ```bash
   # Instalar Railway CLI
   npm install -g @railway/cli
   
   # Login
   railway login
   ```

2. **Configurar projeto**
   ```bash
   # Inicializar projeto Railway
   railway init
   
   # Conectar ao repositório GitHub
   railway connect
   ```

3. **Configurar variáveis de ambiente**
   ```bash
   # Via CLI
   railway variables set DISCORD_TOKEN=seu_token
   railway variables set DISCORD_CLIENT_ID=seu_client_id
   
   # Ou via dashboard: railway.app/project/seu-projeto/variables
   ```

4. **Deploy automático**
   - O arquivo `railway.json` já está configurado
   - Push para main/master fará deploy automático
   - URL: `https://seu-projeto.up.railway.app`

### 1.2 Deploy da Dashboard no Vercel

1. **Instalar Vercel CLI**
   ```bash
   npm install -g vercel
   vercel login
   ```

2. **Deploy da dashboard**
   ```bash
   cd dashboard
   vercel --prod
   ```

3. **Configurar domínio personalizado**
   - Acesse: vercel.com/dashboard
   - Vá em Settings > Domains
   - Adicione seu domínio gratuito

---

## 🌐 Fase 2: Domínio e SSL

### 2.1 Registrar Domínio Gratuito

1. **Freenom (Domínios .tk, .ml, .ga)**
   - Acesse: freenom.com
   - Pesquise domínio disponível
   - Registre por 12 meses (gratuito)
   - Exemplo: `hawkesports.tk`

2. **Configurar DNS no Cloudflare**
   ```bash
   # Adicionar registros DNS
   A     @              railway-ip
   A     www            railway-ip
   CNAME dashboard      seu-projeto.vercel.app
   CNAME monitoring     seu-projeto.up.railway.app
   ```

### 2.2 SSL Automático

1. **Cloudflare SSL**
   - SSL/TLS > Overview > Full (strict)
   - Edge Certificates > Always Use HTTPS: ON
   - Automatic HTTPS Rewrites: ON

2. **Verificar SSL**
   ```bash
   curl -I https://hawkesports.tk
   # Deve retornar 200 OK com certificado válido
   ```

---

## 📊 Fase 3: Monitoramento

### 3.1 Configurar UptimeRobot

1. **Criar monitores**
   ```bash
   node scripts/monitoring.js setup
   ```

2. **Monitores criados automaticamente:**
   - Bot Health: `https://hawkesports.tk/health`
   - Bot API: `https://hawkesports.tk/api/status`
   - Dashboard: `https://dashboard.hawkesports.tk`
   - Grafana: `https://monitoring.hawkesports.tk`

3. **Configurar alertas**
   - Email, SMS, Discord webhook
   - Intervalo: 5 minutos
   - Timeout: 30 segundos

### 3.2 Dashboard de Monitoramento

1. **Acessar Grafana**
   - URL: `https://monitoring.hawkesports.tk`
   - Login: admin/admin (alterar na primeira vez)

2. **Dashboards disponíveis:**
   - Bot Performance
   - System Metrics
   - Discord Statistics
   - Error Tracking

---

## 💾 Fase 4: Backup e CI/CD

### 4.1 Backup Automático

1. **Configurar Google Drive API**
   ```bash
   # Criar projeto no Google Cloud Console
   # Ativar Drive API
   # Criar Service Account
   # Baixar credenciais JSON
   ```

2. **Configurar backup diário**
   ```bash
   # Testar backup manual
   node scripts/backup.js
   
   # Configurar cron job (Railway)
   # Via dashboard: Settings > Cron Jobs
   # Schedule: 0 2 * * * (diário às 2h)
   ```

### 4.2 CI/CD com GitHub Actions

1. **Configurar secrets no GitHub**
   ```
   RAILWAY_TOKEN
   VERCEL_TOKEN
   VERCEL_ORG_ID
   VERCEL_PROJECT_ID
   DISCORD_WEBHOOK
   GOOGLE_DRIVE_CREDENTIALS
   GOOGLE_DRIVE_FOLDER_ID
   ```

2. **Pipeline automático:**
   - Push → Tests → Deploy → Backup → Notify
   - Rollback automático em caso de falha
   - Notificações no Discord

---

## ⚡ Fase 5: Otimizações

### 5.1 Performance

1. **Cache Redis**
   ```javascript
   // Já implementado no bot
   // Cache de comandos, dados de usuários, etc.
   ```

2. **CDN Cloudflare**
   - Cache automático de assets estáticos
   - Compressão Gzip/Brotli
   - Minificação automática

### 5.2 Segurança

1. **Rate Limiting**
   ```javascript
   // Implementado no Nginx
   // 10 req/s para API
   // 1 req/s para login
   ```

2. **Headers de Segurança**
   - HSTS, CSP, X-Frame-Options
   - Configurados no Nginx

### 5.3 Monitoramento Avançado

1. **Métricas customizadas**
   ```bash
   # Endpoint de métricas
   curl https://hawkesports.tk/metrics
   ```

2. **Alertas inteligentes**
   - CPU > 80%
   - Memória > 90%
   - Erro rate > 5%
   - Response time > 2s

---

## 🔧 Manutenção

### Tarefas Diárias Automáticas
- ✅ Health checks (5 min)
- ✅ Backup incremental (2h)
- ✅ Limpeza de logs (6h)
- ✅ Relatório de status (9h)

### Tarefas Semanais
- [ ] Verificar uso de recursos
- [ ] Atualizar dependências
- [ ] Revisar logs de erro
- [ ] Testar backups

### Tarefas Mensais
- [ ] Renovar domínio (se necessário)
- [ ] Revisar métricas de performance
- [ ] Atualizar documentação
- [ ] Backup completo

---

## 🚨 Troubleshooting

### Problemas Comuns

#### Bot Offline
```bash
# Verificar logs
railway logs

# Verificar health
curl https://hawkesports.tk/health

# Restart manual
railway restart
```

#### Dashboard Não Carrega
```bash
# Verificar deploy Vercel
vercel logs

# Redeploy
vercel --prod
```

#### SSL Inválido
```bash
# Verificar Cloudflare
# SSL/TLS > Edge Certificates
# Purge Cache se necessário
```

#### Backup Falhou
```bash
# Verificar credenciais Google Drive
# Verificar espaço disponível
# Executar backup manual
node scripts/backup.js
```

### Contatos de Emergência
- **Discord Webhook**: Alertas automáticos
- **Email UptimeRobot**: Status dos serviços
- **GitHub Issues**: Bugs e melhorias

---

## 📈 Métricas de Sucesso

### Uptime Target: 99.9%
- **Bot**: > 99.9% uptime
- **Dashboard**: > 99.9% uptime
- **API**: < 200ms response time
- **Backup**: 100% success rate

### Custos
- **Total mensal**: $0.00 💰
- **Railway**: 500h grátis (suficiente)
- **Vercel**: Ilimitado grátis
- **Cloudflare**: Grátis
- **Domínio**: Grátis por 12 meses

---

## 🎉 Deploy Completo!

### URLs Finais
- **Bot**: https://hawkesports.tk
- **Dashboard**: https://dashboard.hawkesports.tk
- **Monitoring**: https://monitoring.hawkesports.tk
- **Status**: https://stats.uptimerobot.com/seu-id

### Próximos Passos
1. Adicionar bot ao servidor Discord
2. Configurar comandos personalizados
3. Monitorar métricas iniciais
4. Documentar processos específicos
5. Treinar equipe de moderação

**🚀 Parabéns! Seu Bot Hawk Esports está 100% operacional em produção com custo zero!**