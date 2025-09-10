# 🤖 Bot Hawk Esports - Deploy Gratuito 24/7

[![Deploy Status](https://img.shields.io/badge/deploy-ready-brightgreen)](https://github.com/seu-usuario/bot-hawk-esports)
[![Uptime](https://img.shields.io/badge/uptime-99.9%25-brightgreen)](https://stats.uptimerobot.com)
[![Cost](https://img.shields.io/badge/cost-$0.00/month-brightgreen)](https://railway.app)

## 🎯 Visão Geral

Bot Discord completo para comunidades de esports com deploy gratuito 24/7 em produção. Sistema robusto com monitoramento, backup automático e CI/CD.

### ✨ Características Principais

- 🤖 **Bot Discord Avançado** - Comandos personalizados, moderação, gamificação
- 📊 **Dashboard React** - Interface administrativa completa
- 🔄 **Deploy Automático** - CI/CD com GitHub Actions
- 📈 **Monitoramento 24/7** - UptimeRobot + Grafana + Prometheus
- 💾 **Backup Automático** - Google Drive com retenção inteligente
- 🌐 **SSL Gratuito** - Cloudflare com domínio personalizado
- 💰 **Custo Zero** - Totalmente gratuito em produção

---

## 🚀 Deploy Rápido

### 1. Clone e Configure
```bash
git clone https://github.com/seu-usuario/bot-hawk-esports.git
cd bot-hawk-esports
npm install
```

### 2. Variáveis de Ambiente
```bash
cp .env.example .env
# Configure suas variáveis no .env
```

### 3. Deploy Automático
```bash
# Railway (Bot)
npm run deploy:railway

# Vercel (Dashboard)
npm run deploy:vercel
```

### 4. Configurar Domínio
- Registre domínio gratuito em [Freenom](https://freenom.com)
- Configure DNS no [Cloudflare](https://cloudflare.com)
- SSL automático ativado

**🎉 Pronto! Seu bot está online 24/7 com custo zero!**

---

## 📁 Estrutura do Projeto

```
bot-hawk-esports/
├── 🤖 src/                    # Código do bot Discord
│   ├── commands/              # Comandos do bot
│   ├── events/                # Event handlers
│   ├── utils/                 # Utilitários
│   └── routes/                # API endpoints
├── 📊 dashboard/              # Dashboard React
│   ├── src/components/        # Componentes React
│   ├── src/pages/             # Páginas da dashboard
│   └── public/                # Assets estáticos
├── 🔧 scripts/                # Scripts de automação
│   ├── backup.js              # Backup automático
│   └── monitoring.js          # Monitoramento
├── 🐳 docker/                 # Configurações Docker
├── 🌐 nginx/                  # Configuração Nginx
├── 📋 .github/workflows/      # CI/CD GitHub Actions
└── 📚 docs/                   # Documentação
```

---

## 🛠️ Tecnologias

### Backend
- **Node.js** - Runtime JavaScript
- **Discord.js** - Biblioteca Discord
- **Express** - Framework web
- **MongoDB** - Banco de dados
- **Redis** - Cache e sessões
- **JWT** - Autenticação

### Frontend
- **React** - Interface de usuário
- **Vite** - Build tool
- **Tailwind CSS** - Estilização
- **Chart.js** - Gráficos e métricas

### DevOps
- **Railway** - Deploy do bot
- **Vercel** - Deploy da dashboard
- **GitHub Actions** - CI/CD
- **Docker** - Containerização
- **Nginx** - Proxy reverso

### Monitoramento
- **UptimeRobot** - Monitoramento de uptime
- **Prometheus** - Métricas
- **Grafana** - Dashboards
- **Google Drive** - Backup

---

## 🎮 Funcionalidades do Bot

### Comandos Básicos
```
/ping              # Latência do bot
/help              # Lista de comandos
/stats             # Estatísticas do servidor
/userinfo @user    # Informações do usuário
```

### Moderação
```
/ban @user         # Banir usuário
/kick @user        # Expulsar usuário
/mute @user        # Silenciar usuário
/warn @user        # Advertir usuário
/clear 10          # Limpar mensagens
```

### Esports
```
/pubg stats        # Estatísticas PUBG
/match create      # Criar partida
/tournament list   # Listar torneios
/ranking show      # Ranking de jogadores
```

### Gamificação
```
/level             # Nível atual
/leaderboard       # Ranking XP
/daily             # Recompensa diária
/inventory         # Inventário
```

---

## 📊 Dashboard Features

### Visão Geral
- 📈 Métricas em tempo real
- 👥 Usuários online/offline
- 💬 Mensagens por canal
- 🎮 Estatísticas de jogos

### Moderação
- 🚫 Gerenciar banimentos
- ⚠️ Histórico de advertências
- 📝 Logs de moderação
- 🔧 Configurar auto-mod

### Configurações
- ⚙️ Comandos personalizados
- 🎨 Personalizar embeds
- 🔔 Configurar notificações
- 👑 Gerenciar permissões

---

## 🔧 Configuração Avançada

### Variáveis de Ambiente Completas

```env
# Discord
DISCORD_TOKEN=seu_token_discord
DISCORD_CLIENT_ID=seu_client_id
DISCORD_CLIENT_SECRET=seu_client_secret
WEBHOOK_URL=sua_webhook_url

# Banco de Dados
MONGODB_URI=mongodb://localhost:27017/hawkesports
REDIS_URL=redis://localhost:6379

# APIs Externas
PUBG_API_KEY=sua_pubg_api_key
STEAM_API_KEY=sua_steam_api_key
TWITCH_CLIENT_ID=seu_twitch_client_id
TWITCH_CLIENT_SECRET=seu_twitch_client_secret

# Autenticação
JWT_SECRET=seu_jwt_secret_super_seguro
SESSION_SECRET=seu_session_secret

# Deploy
RAILWAY_TOKEN=seu_railway_token
VERCEL_TOKEN=seu_vercel_token
VERCEL_ORG_ID=seu_vercel_org_id
VERCEL_PROJECT_ID=seu_vercel_project_id

# Monitoramento
UPTIMEROBOT_API_KEY=sua_uptimerobot_api_key
GRAFANA_API_KEY=sua_grafana_api_key

# Backup
GOOGLE_DRIVE_CREDENTIALS=suas_credenciais_google_drive_json
GOOGLE_DRIVE_FOLDER_ID=id_da_pasta_backup

# Notificações
DISCORD_WEBHOOK_ALERTS=webhook_para_alertas
EMAIL_SERVICE=gmail
EMAIL_USER=seu_email@gmail.com
EMAIL_PASS=sua_senha_app
```

### Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev          # Iniciar em modo desenvolvimento
npm run dev:dashboard # Dashboard em desenvolvimento
npm start           # Iniciar em produção

# Deploy
npm run deploy:railway  # Deploy bot no Railway
npm run deploy:vercel   # Deploy dashboard no Vercel
npm run deploy:all      # Deploy completo

# Manutenção
npm run backup          # Backup manual
npm run monitor         # Verificar status
npm run logs           # Ver logs
npm run health         # Health check

# Testes
npm test               # Executar testes
npm run test:coverage  # Cobertura de testes
npm run lint           # Verificar código
```

---

## 📈 Monitoramento

### URLs de Monitoramento

- **Status Page**: https://stats.uptimerobot.com/seu-id
- **Grafana**: https://monitoring.hawkesports.tk
- **Health Check**: https://hawkesports.tk/health
- **Metrics**: https://hawkesports.tk/metrics

### Métricas Principais

```javascript
// Métricas coletadas automaticamente
{
  "uptime": "99.98%",
  "response_time": "145ms",
  "memory_usage": "67%",
  "cpu_usage": "23%",
  "active_users": 1247,
  "commands_per_hour": 89,
  "errors_per_hour": 0
}
```

### Alertas Configurados

- 🚨 **Bot Offline** - Notificação imediata
- ⚠️ **Alta Latência** - > 2 segundos
- 💾 **Memória Alta** - > 90%
- 🔥 **CPU Alta** - > 80%
- ❌ **Taxa de Erro** - > 5%

---

## 💾 Backup e Recuperação

### Backup Automático

- **Frequência**: Diário às 2h (UTC)
- **Retenção**: 30 dias
- **Destino**: Google Drive
- **Compressão**: Gzip
- **Criptografia**: AES-256

### Itens Incluídos no Backup

- 📊 Banco de dados MongoDB
- 🔄 Cache Redis
- 📁 Arquivos de configuração
- 📝 Logs importantes
- 🖼️ Assets e uploads

### Recuperação de Desastre

```bash
# Restaurar backup específico
node scripts/backup.js restore --date=2024-01-15

# Restaurar último backup
node scripts/backup.js restore --latest

# Verificar integridade
node scripts/backup.js verify
```

---

## 🔒 Segurança

### Medidas Implementadas

- 🔐 **Autenticação JWT** - Tokens seguros
- 🛡️ **Rate Limiting** - Proteção contra spam
- 🔒 **HTTPS Obrigatório** - SSL/TLS
- 🚫 **Headers de Segurança** - CSP, HSTS, etc.
- 🔍 **Validação de Input** - Sanitização
- 📊 **Logs de Auditoria** - Rastreamento

### Configuração de Segurança

```javascript
// Headers de segurança (Nginx)
Content-Security-Policy: default-src 'self'
Strict-Transport-Security: max-age=31536000
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

---

## 🚀 Performance

### Otimizações Implementadas

- ⚡ **Cache Redis** - Comandos e dados frequentes
- 🗜️ **Compressão Gzip** - Redução de bandwidth
- 📦 **CDN Cloudflare** - Assets globais
- 🔄 **Connection Pooling** - Banco de dados
- 📊 **Lazy Loading** - Dashboard React

### Benchmarks

```
📊 Métricas de Performance:
├── Response Time: < 200ms (95th percentile)
├── Throughput: 1000+ req/min
├── Memory Usage: < 512MB
├── CPU Usage: < 50%
└── Uptime: 99.9%+
```

---

## 🤝 Contribuição

### Como Contribuir

1. **Fork** o repositório
2. **Clone** sua fork
3. **Crie** uma branch para sua feature
4. **Commit** suas mudanças
5. **Push** para a branch
6. **Abra** um Pull Request

### Padrões de Código

```bash
# Verificar código
npm run lint

# Formatar código
npm run format

# Executar testes
npm test
```

### Estrutura de Commits

```
feat: adicionar comando de torneio
fix: corrigir bug no sistema de XP
docs: atualizar README
style: formatar código
refactor: otimizar cache Redis
test: adicionar testes para moderação
```

---

## 📞 Suporte

### Canais de Suporte

- 📧 **Email**: suporte@hawkesports.tk
- 💬 **Discord**: [Servidor de Suporte](https://discord.gg/hawkesports)
- 🐛 **Issues**: [GitHub Issues](https://github.com/seu-usuario/bot-hawk-esports/issues)
- 📚 **Docs**: [Documentação Completa](https://docs.hawkesports.tk)

### FAQ

**Q: O bot está offline, o que fazer?**
A: Verifique o status em https://stats.uptimerobot.com/seu-id

**Q: Como adicionar novos comandos?**
A: Consulte a documentação em `/docs/commands.md`

**Q: Posso usar em servidor comercial?**
A: Sim, licença MIT permite uso comercial

**Q: Como configurar backup personalizado?**
A: Edite o arquivo `scripts/backup.js`

---

## 📄 Licença

MIT License - veja [LICENSE](LICENSE) para detalhes.

---

## 🏆 Créditos

Desenvolvido com ❤️ pela comunidade Hawk Esports

### Tecnologias Utilizadas

- [Discord.js](https://discord.js.org/) - Biblioteca Discord
- [React](https://reactjs.org/) - Interface de usuário
- [Railway](https://railway.app/) - Deploy do backend
- [Vercel](https://vercel.com/) - Deploy do frontend
- [Cloudflare](https://cloudflare.com/) - CDN e SSL
- [UptimeRobot](https://uptimerobot.com/) - Monitoramento

### Contribuidores

- [@seu-usuario](https://github.com/seu-usuario) - Desenvolvedor Principal
- [@contribuidor1](https://github.com/contribuidor1) - Frontend
- [@contribuidor2](https://github.com/contribuidor2) - DevOps

---

**🚀 Bot Hawk Esports - Elevando sua comunidade de esports ao próximo nível!**

[![Deploy](https://img.shields.io/badge/deploy-now-brightgreen?style=for-the-badge)](https://railway.app/new/template)
[![Discord](https://img.shields.io/badge/discord-join-7289da?style=for-the-badge)](https://discord.gg/hawkesports)
[![Docs](https://img.shields.io/badge/docs-read-blue?style=for-the-badge)](https://docs.hawkesports.tk)