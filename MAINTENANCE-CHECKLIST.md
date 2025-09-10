# 🔧 Hawk Bot Esports - Checklist de Manutenção

## 📋 Checklist Diário

### ✅ Verificações Básicas (5 minutos)

- [ ] **Status dos Containers**
  ```bash
  docker-compose -f docker-compose.prod.yml ps
  ```
  - [ ] hawk-bot: Up
  - [ ] hawk-redis: Up
  - [ ] hawk-prometheus: Up
  - [ ] hawk-grafana: Up
  - [ ] hawk-nginx: Up
  - [ ] hawk-node-exporter: Up

- [ ] **Conectividade do Bot**
  - [ ] Bot online no Discord
  - [ ] Responde a comandos básicos
  - [ ] Latência < 200ms

- [ ] **Recursos do Sistema**
  ```bash
  docker stats --no-stream
  ```
  - [ ] CPU < 70%
  - [ ] RAM < 80%
  - [ ] Disco < 85%

- [ ] **Logs de Erro**
  ```bash
  docker logs hawk-bot --since 24h | grep -i error
  ```
  - [ ] Sem erros críticos nas últimas 24h

### 🚨 Alertas Ativos

- [ ] **Verificar Grafana**
  - [ ] Acessar: https://bot.seudominio.com:3000
  - [ ] Verificar alertas ativos
  - [ ] Confirmar dashboards funcionando

- [ ] **Verificar Prometheus**
  - [ ] Acessar: https://bot.seudominio.com:9090
  - [ ] Verificar targets (Status > Targets)
  - [ ] Confirmar coleta de métricas

---

## 📅 Checklist Semanal

### 🧹 Limpeza e Otimização (15 minutos)

- [ ] **Limpeza Docker**
  ```bash
  docker container prune -f
  docker image prune -f
  docker volume prune -f
  docker network prune -f
  ```

- [ ] **Verificação de Logs**
  ```bash
  # Verificar tamanho dos logs
  du -sh logs/
  
  # Limpar logs antigos (>7 dias)
  find logs/ -name "*.log" -mtime +7 -exec truncate -s 0 {} \;
  ```

- [ ] **Backup Verification**
  ```bash
  # Verificar backups da semana
  ls -la /backups/ | grep $(date -d '7 days ago' +%Y%m)
  
  # Testar integridade do último backup
  tar -tzf /backups/$(ls -t /backups/ | head -1) > /dev/null
  ```

- [ ] **Atualizações de Segurança**
  ```bash
  sudo apt update
  sudo apt list --upgradable
  sudo unattended-upgrades --dry-run
  ```

### 📊 Análise de Performance

- [ ] **Métricas da Semana**
  - [ ] Comandos executados
  - [ ] Tempo de resposta médio
  - [ ] Uptime do bot
  - [ ] Uso de recursos

- [ ] **Tendências**
  - [ ] Crescimento de usuários
  - [ ] Padrões de uso
  - [ ] Picos de atividade

---

## 🗓️ Checklist Mensal

### 🔄 Manutenção Completa (30 minutos)

- [ ] **Reinicialização Completa**
  ```bash
  # Backup antes da manutenção
  sudo bash scripts/backup.sh
  
  # Reiniciar todos os serviços
  docker-compose -f docker-compose.prod.yml down
  docker-compose -f docker-compose.prod.yml up -d
  
  # Aguardar inicialização (2-3 minutos)
  sleep 180
  
  # Verificar status
  docker-compose -f docker-compose.prod.yml ps
  ```

- [ ] **Limpeza Profunda**
  ```bash
  # Limpar sistema Docker completamente
  docker system prune -a --volumes
  
  # Limpar logs antigos (>30 dias)
  find logs/ -name "*.log" -mtime +30 -delete
  
  # Limpar backups antigos (>30 dias)
  find /backups/ -name "*.tar.gz" -mtime +30 -delete
  ```

- [ ] **Atualizações**
  ```bash
  # Atualizar sistema operacional
  sudo apt update && sudo apt upgrade -y
  
  # Atualizar Docker
  sudo apt update docker-ce docker-ce-cli containerd.io
  
  # Atualizar imagens Docker
  docker-compose -f docker-compose.prod.yml pull
  docker-compose -f docker-compose.prod.yml up -d
  ```

### 🔒 Segurança

- [ ] **Certificados SSL**
  ```bash
  # Verificar expiração
  openssl x509 -in nginx/ssl/fullchain.pem -noout -enddate
  
  # Testar renovação
  sudo certbot renew --dry-run
  ```

- [ ] **Senhas e Tokens**
  - [ ] Verificar força das senhas
  - [ ] Rotacionar tokens se necessário
  - [ ] Verificar permissões do bot Discord

- [ ] **Logs de Segurança**
  ```bash
  # Verificar tentativas de acesso
  grep -i "failed\|error\|unauthorized" logs/access.log
  
  # Verificar logs do sistema
  sudo journalctl --since "1 month ago" | grep -i "failed\|error"
  ```

---

## 🚨 Troubleshooting Rápido

### 🔴 Bot Offline

**Sintomas**: Bot aparece offline no Discord

**Diagnóstico**:
```bash
# 1. Verificar container
docker ps | grep hawk-bot

# 2. Verificar logs
docker logs hawk-bot --tail=50

# 3. Verificar conectividade
curl -H "Authorization: Bot $DISCORD_TOKEN" https://discord.com/api/v10/gateway
```

**Soluções**:
- [ ] Reiniciar container: `docker-compose -f docker-compose.prod.yml restart hawk-bot`
- [ ] Verificar token Discord
- [ ] Verificar conectividade de rede
- [ ] Verificar rate limits

### 🟡 Alto Uso de CPU

**Sintomas**: CPU > 80% por mais de 10 minutos

**Diagnóstico**:
```bash
# 1. Identificar processo
docker stats --no-stream

# 2. Verificar logs de erro
docker logs hawk-bot --tail=100 | grep -i error

# 3. Verificar sistema
htop
```

**Soluções**:
- [ ] Reiniciar container problemático
- [ ] Verificar loops infinitos nos logs
- [ ] Aumentar recursos se necessário
- [ ] Otimizar código se recorrente

### 🟠 Redis Connection Error

**Sintomas**: Erros de conexão com Redis

**Diagnóstico**:
```bash
# 1. Verificar Redis
docker logs hawk-redis --tail=50

# 2. Testar conexão
docker exec hawk-redis redis-cli ping

# 3. Verificar rede
docker network ls
```

**Soluções**:
- [ ] Reiniciar Redis: `docker-compose -f docker-compose.prod.yml restart hawk-redis`
- [ ] Verificar configuração de rede
- [ ] Verificar senha Redis
- [ ] Limpar cache se necessário

### 🔵 SSL Certificate Issues

**Sintomas**: Avisos de certificado no navegador

**Diagnóstico**:
```bash
# 1. Verificar certificado
openssl x509 -in nginx/ssl/fullchain.pem -text -noout

# 2. Verificar expiração
openssl x509 -in nginx/ssl/fullchain.pem -noout -enddate

# 3. Testar conexão
curl -I https://bot.seudominio.com
```

**Soluções**:
- [ ] Renovar certificado: `sudo certbot renew`
- [ ] Recriar certificado: `sudo bash scripts/setup-ssl.sh --force`
- [ ] Verificar configuração DNS
- [ ] Reiniciar Nginx

---

## 📈 Monitoramento de KPIs

### 🎯 Métricas Principais

| Métrica | Meta | Crítico |
|---------|------|----------|
| Uptime | >99.5% | <95% |
| Latência | <200ms | >1000ms |
| CPU | <70% | >90% |
| RAM | <80% | >95% |
| Disco | <85% | >95% |
| Comandos/min | Variável | 0 por >10min |

### 📊 Dashboard URLs

- **Grafana**: https://bot.seudominio.com:3000
- **Prometheus**: https://bot.seudominio.com:9090
- **Bot Status**: https://bot.seudominio.com/status

### 🔔 Alertas Configurados

- [ ] Bot Offline (>5min) → Discord + Email
- [ ] High CPU (>80% por 10min) → Discord
- [ ] High Memory (>90% por 5min) → Discord + Email
- [ ] Disk Full (>85%) → Discord + Email
- [ ] Redis Down (>2min) → Discord + Email
- [ ] SSL Expiry (7 dias) → Email

---

## 🔧 Comandos de Emergência

### 🚨 Parada de Emergência
```bash
# Parar todos os serviços imediatamente
docker-compose -f docker-compose.prod.yml down

# Parar apenas o bot (manter monitoramento)
docker stop hawk-bot
```

### 🔄 Restart Rápido
```bash
# Restart completo
docker-compose -f docker-compose.prod.yml restart

# Restart apenas do bot
docker-compose -f docker-compose.prod.yml restart hawk-bot
```

### 💾 Backup de Emergência
```bash
# Backup rápido
sudo bash scripts/backup.sh

# Backup manual
tar -czf emergency-backup-$(date +%Y%m%d-%H%M%S).tar.gz \
    .env logs/ data/ nginx/ssl/
```

### 🔍 Diagnóstico Rápido
```bash
# Status geral
docker-compose -f docker-compose.prod.yml ps
docker stats --no-stream
df -h
free -h

# Logs de erro
docker-compose -f docker-compose.prod.yml logs --tail=50 | grep -i error

# Conectividade
ping discord.com
curl -I https://discord.com/api/v10/gateway
```

---

## 📞 Contatos de Emergência

### 🆘 Suporte Técnico
- **Email**: admin@seudominio.com
- **Discord**: @admin#1234
- **Telefone**: +55 11 99999-9999

### 🏢 Fornecedores
- **Hosting**: suporte@provedor.com
- **DNS**: suporte@cloudflare.com
- **Monitoramento**: suporte@grafana.com

---

## 📝 Log de Manutenção

### Template de Registro
```
Data: ____/____/____
Horário: ____:____
Técnico: ________________
Tipo: [ ] Diário [ ] Semanal [ ] Mensal [ ] Emergência

Atividades Realizadas:
- [ ] _________________________________
- [ ] _________________________________
- [ ] _________________________________

Problemas Encontrados:
- _____________________________________
- _____________________________________

Ações Corretivas:
- _____________________________________
- _____________________________________

Observações:
_________________________________________
_________________________________________

Próxima Manutenção: ____/____/____
Assinatura: _____________________________
```

---

## 🎯 Metas de SLA

### 📊 Service Level Agreement

| Serviço | Disponibilidade | Tempo de Resposta | Tempo de Recuperação |
|---------|----------------|-------------------|---------------------|
| Bot Discord | 99.5% | <200ms | <5min |
| Monitoramento | 99.9% | <1s | <2min |
| Backup | 100% | N/A | <30min |
| SSL/HTTPS | 99.9% | <500ms | <10min |

### 📈 Métricas de Sucesso

- **MTBF** (Mean Time Between Failures): >720h (30 dias)
- **MTTR** (Mean Time To Recovery): <15min
- **RTO** (Recovery Time Objective): <30min
- **RPO** (Recovery Point Objective): <1h

---

**Última atualização**: $(date '+%Y-%m-%d %H:%M:%S')
**Versão**: 1.0.0
**Responsável**: Administrador do Sistema

> 🦅 **Hawk Bot Esports** - Manutenção preventiva para máxima disponibilidade!