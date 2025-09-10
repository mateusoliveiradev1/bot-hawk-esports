# 🦅 Hawk Bot Esports - Guia de Administração

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Instalação e Deploy](#instalação-e-deploy)
3. [Configuração](#configuração)
4. [Monitoramento](#monitoramento)
5. [Backup e Restauração](#backup-e-restauração)
6. [SSL/TLS](#ssltls)
7. [Manutenção](#manutenção)
8. [Troubleshooting](#troubleshooting)
9. [Comandos Úteis](#comandos-úteis)
10. [Logs](#logs)

---

## 🎯 Visão Geral

O Hawk Bot Esports é um bot Discord profissional para comunidades de esports, executado em containers Docker com monitoramento completo, backup automatizado e SSL/TLS.

### Arquitetura do Sistema

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Discord API   │◄──►│   Hawk Bot      │◄──►│     Redis       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Prometheus    │◄──►│     Nginx       │◄──►│    Grafana      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Componentes Principais

- **Hawk Bot**: Aplicação principal do bot Discord
- **Redis**: Cache e armazenamento de sessão
- **Nginx**: Reverse proxy e SSL termination
- **Prometheus**: Coleta de métricas
- **Grafana**: Visualização de métricas
- **Node Exporter**: Métricas do sistema
- **Watchtower**: Atualizações automáticas

---

## 🚀 Instalação e Deploy

### Pré-requisitos

- **Sistema Operacional**: Linux (Ubuntu 20.04+ recomendado)
- **Docker**: 20.10+
- **Docker Compose**: 1.29+
- **Memória RAM**: Mínimo 2GB, recomendado 4GB+
- **Armazenamento**: Mínimo 10GB livres
- **Rede**: Portas 80, 443, 3000, 9090 disponíveis

### Instalação Rápida

```bash
# 1. Clonar repositório
git clone https://github.com/seu-usuario/bot-hawk-esports.git
cd bot-hawk-esports

# 2. Configurar variáveis de ambiente
cp .env.example .env
nano .env

# 3. Executar deploy
sudo bash scripts/deploy.sh
```

### Deploy Manual

```bash
# 1. Construir imagens
docker-compose -f docker-compose.prod.yml build

# 2. Iniciar serviços
docker-compose -f docker-compose.prod.yml up -d

# 3. Verificar status
docker-compose -f docker-compose.prod.yml ps
```

---

## ⚙️ Configuração

### Variáveis de Ambiente (.env)

```bash
# Discord Bot
DISCORD_TOKEN=seu_token_aqui
DISCORD_CLIENT_ID=seu_client_id
DISCORD_GUILD_ID=seu_guild_id

# Redis
REDIS_URL=redis://hawk-redis:6379
REDIS_PASSWORD=senha_segura_redis

# Monitoramento
GRAFANA_ADMIN_PASSWORD=senha_admin_grafana
PROMETHEUS_RETENTION=30d

# Notificações
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu_email@gmail.com
SMTP_PASS=sua_senha_app

# SSL/TLS
DOMAIN=bot.seudominio.com
EMAIL=admin@seudominio.com

# Backup
BACKUP_RETENTION_DAYS=30
BACKUP_SCHEDULE="0 2 * * *"
```

### Configuração do Bot Discord

1. **Criar Aplicação**: https://discord.com/developers/applications
2. **Criar Bot**: Na seção "Bot", clique em "Add Bot"
3. **Copiar Token**: Salve o token na variável `DISCORD_TOKEN`
4. **Configurar Permissões**:
   - Send Messages
   - Embed Links
   - Read Message History
   - Use Slash Commands
   - Manage Messages

### Configuração de Domínio

```bash
# Configurar DNS (Tipo A)
bot.seudominio.com -> SEU_IP_SERVIDOR

# Configurar SSL
sudo bash scripts/setup-ssl.sh -d bot.seudominio.com -e admin@seudominio.com
```

---

## 📊 Monitoramento

### Acessos

- **Grafana**: https://bot.seudominio.com:3000
  - Usuário: `admin`
  - Senha: Definida em `GRAFANA_ADMIN_PASSWORD`

- **Prometheus**: https://bot.seudominio.com:9090

### Dashboards Principais

#### 1. Bot Status Dashboard
- Status de conexão do bot
- Comandos executados por minuto
- Latência de resposta
- Uso de memória e CPU

#### 2. System Metrics Dashboard
- CPU, memória e disco do servidor
- Rede e I/O
- Containers rodando

#### 3. Redis Dashboard
- Conexões ativas
- Uso de memória
- Operações por segundo
- Hit rate do cache

### Alertas Configurados

| Alerta | Condição | Ação |
|--------|----------|------|
| Bot Offline | Bot desconectado > 5min | Discord + Email |
| High CPU | CPU > 80% por 10min | Discord |
| High Memory | RAM > 90% por 5min | Discord + Email |
| Disk Full | Disco > 85% | Discord + Email |
| Redis Down | Redis offline > 2min | Discord + Email |
| SSL Expiry | Certificado expira em 7 dias | Email |

---

## 💾 Backup e Restauração

### Backup Automático

O sistema executa backups automáticos diariamente às 2:00 AM.

```bash
# Verificar status do backup
crontab -l | grep backup

# Executar backup manual
sudo bash scripts/backup.sh

# Listar backups
ls -la /backups/
```

### Conteúdo do Backup

- Dados da aplicação (`/app/data`)
- Logs do sistema (`/app/logs`)
- Configurações (`.env`)
- Dados do Redis (`dump.rdb`)
- Métricas do Prometheus
- Configurações do Grafana
- Metadados do backup

### Restauração

```bash
# 1. Parar serviços
docker-compose -f docker-compose.prod.yml down

# 2. Extrair backup
cd /backups
tar -xzf hawk-bot-backup_YYYYMMDD_HHMMSS.tar.gz

# 3. Restaurar dados
cp -r hawk-bot-backup_*/data/* /app/data/
cp hawk-bot-backup_*/.env.backup .env

# 4. Restaurar Redis
docker run --rm -v redis_data:/data -v /backups/hawk-bot-backup_*/redis-dump.rdb:/backup.rdb redis:alpine sh -c "cp /backup.rdb /data/dump.rdb"

# 5. Reiniciar serviços
docker-compose -f docker-compose.prod.yml up -d
```

---

## 🔒 SSL/TLS

### Configuração Inicial

```bash
# Configurar SSL com Let's Encrypt
sudo bash scripts/setup-ssl.sh -d bot.seudominio.com -e admin@seudominio.com

# Teste (ambiente staging)
sudo bash scripts/setup-ssl.sh -d bot.seudominio.com -e admin@seudominio.com --staging
```

### Renovação Automática

Os certificados são renovados automaticamente via cron job:

```bash
# Verificar agendamento
crontab -l | grep ssl

# Testar renovação
sudo bash scripts/renew-ssl.sh

# Verificar logs de renovação
tail -f logs/ssl-renewal.log
```

### Verificação Manual

```bash
# Verificar certificado
openssl x509 -in nginx/ssl/fullchain.pem -text -noout

# Verificar expiração
openssl x509 -in nginx/ssl/fullchain.pem -noout -enddate

# Testar conexão SSL
curl -I https://bot.seudominio.com
```

---

## 🔧 Manutenção

### Rotinas Diárias

```bash
# Verificar status dos containers
docker-compose -f docker-compose.prod.yml ps

# Verificar logs de erro
docker-compose -f docker-compose.prod.yml logs --tail=50 hawk-bot

# Verificar uso de recursos
docker stats --no-stream

# Verificar espaço em disco
df -h
```

### Rotinas Semanais

```bash
# Limpar containers parados
docker container prune -f

# Limpar imagens não utilizadas
docker image prune -f

# Limpar volumes órfãos
docker volume prune -f

# Verificar logs de backup
tail -f /backups/backup.log

# Atualizar sistema
sudo apt update && sudo apt upgrade -y
```

### Rotinas Mensais

```bash
# Reiniciar todos os serviços
docker-compose -f docker-compose.prod.yml restart

# Verificar integridade dos backups
for backup in /backups/hawk-bot-backup_*.tar.gz; do
    echo "Verificando: $backup"
    tar -tzf "$backup" > /dev/null && echo "OK" || echo "ERRO"
done

# Limpar logs antigos
find logs/ -name "*.log" -mtime +30 -delete

# Verificar atualizações de segurança
sudo unattended-upgrades --dry-run
```

---

## 🔍 Troubleshooting

### Bot Não Conecta ao Discord

```bash
# Verificar logs do bot
docker logs hawk-bot --tail=100

# Verificar token
echo $DISCORD_TOKEN | wc -c  # Deve ter ~70 caracteres

# Testar conectividade
curl -H "Authorization: Bot $DISCORD_TOKEN" https://discord.com/api/v10/gateway

# Reiniciar apenas o bot
docker-compose -f docker-compose.prod.yml restart hawk-bot
```

### Redis Connection Error

```bash
# Verificar status do Redis
docker logs hawk-redis --tail=50

# Testar conexão
docker exec hawk-redis redis-cli ping

# Verificar configuração
docker exec hawk-redis redis-cli config get "*"

# Reiniciar Redis
docker-compose -f docker-compose.prod.yml restart hawk-redis
```

### Alto Uso de CPU/Memória

```bash
# Identificar processo problemático
docker stats --no-stream

# Verificar logs de erro
docker-compose -f docker-compose.prod.yml logs --tail=100

# Reiniciar container específico
docker-compose -f docker-compose.prod.yml restart CONTAINER_NAME

# Verificar recursos do sistema
htop
free -h
df -h
```

### SSL Certificate Issues

```bash
# Verificar certificado
openssl x509 -in nginx/ssl/fullchain.pem -text -noout

# Testar renovação
sudo certbot renew --dry-run

# Recriar certificado
sudo bash scripts/setup-ssl.sh -d bot.seudominio.com -e admin@seudominio.com --force

# Verificar configuração do Nginx
nginx -t
```

### Grafana/Prometheus Issues

```bash
# Verificar Prometheus targets
curl http://localhost:9090/api/v1/targets

# Reiniciar Grafana
docker-compose -f docker-compose.prod.yml restart hawk-grafana

# Verificar datasources do Grafana
curl -u admin:$GRAFANA_ADMIN_PASSWORD http://localhost:3000/api/datasources

# Recriar dashboards
docker-compose -f docker-compose.prod.yml restart hawk-grafana
```

---

## 💻 Comandos Úteis

### Docker

```bash
# Ver todos os containers
docker ps -a

# Logs de um container específico
docker logs -f hawk-bot

# Executar comando em container
docker exec -it hawk-bot bash

# Verificar uso de recursos
docker stats

# Limpar sistema Docker
docker system prune -a
```

### Docker Compose

```bash
# Iniciar serviços
docker-compose -f docker-compose.prod.yml up -d

# Parar serviços
docker-compose -f docker-compose.prod.yml down

# Reiniciar serviço específico
docker-compose -f docker-compose.prod.yml restart hawk-bot

# Ver logs de todos os serviços
docker-compose -f docker-compose.prod.yml logs -f

# Atualizar e reiniciar
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

### Sistema

```bash
# Verificar portas em uso
sudo netstat -tlnp | grep :80
sudo netstat -tlnp | grep :443

# Verificar processos
ps aux | grep docker

# Verificar espaço em disco
du -sh /var/lib/docker
du -sh /backups

# Verificar logs do sistema
journalctl -u docker.service -f
```

---

## 📝 Logs

### Localização dos Logs

```
logs/
├── app.log              # Logs da aplicação
├── error.log            # Logs de erro
├── access.log           # Logs de acesso
├── backup.log           # Logs de backup
├── ssl-renewal.log      # Logs de renovação SSL
└── deploy.log           # Logs de deploy
```

### Comandos de Log

```bash
# Logs em tempo real
tail -f logs/app.log

# Logs com filtro
grep "ERROR" logs/app.log

# Logs por data
grep "2024-01-15" logs/app.log

# Logs de containers
docker-compose -f docker-compose.prod.yml logs -f hawk-bot

# Logs do sistema
journalctl -u docker.service --since "1 hour ago"
```

### Rotação de Logs

Os logs são automaticamente rotacionados pelo Docker. Para configurar manualmente:

```bash
# Configurar logrotate
sudo nano /etc/logrotate.d/hawk-bot

# Conteúdo:
/path/to/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
}
```

---

## 🆘 Suporte

### Contatos

- **Email**: admin@seudominio.com
- **Discord**: Servidor de suporte
- **GitHub**: Issues no repositório

### Informações para Suporte

Ao solicitar suporte, inclua:

```bash
# Informações do sistema
uname -a
docker --version
docker-compose --version

# Status dos containers
docker-compose -f docker-compose.prod.yml ps

# Logs recentes
docker-compose -f docker-compose.prod.yml logs --tail=100

# Uso de recursos
docker stats --no-stream
free -h
df -h
```

---

## 📚 Recursos Adicionais

- [Documentação do Discord.js](https://discord.js.org/)
- [Docker Documentation](https://docs.docker.com/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)

---

**Última atualização**: $(date '+%Y-%m-%d')
**Versão do guia**: 1.0.0

> 🦅 **Hawk Bot Esports** - Elevando sua comunidade de esports ao próximo nível!