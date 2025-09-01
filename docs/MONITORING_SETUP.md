# Guia de Configuração do Sistema de Monitoramento

## Visão Geral

Este guia detalha como configurar e usar o sistema de monitoramento completo do Hawk Esports Bot, incluindo Prometheus, Grafana, Alertmanager e exporters para coleta de métricas em tempo real.

## 🏗️ Arquitetura do Monitoramento

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Hawk Bot      │───▶│   Prometheus    │───▶│    Grafana      │
│  (Métricas)     │    │  (Coleta/Store) │    │ (Visualização)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Exporters     │    │  Alertmanager   │    │   Dashboards    │
│ (Node/DB/Redis) │    │   (Alertas)     │    │   (Painéis)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📋 Componentes

### 1. **Prometheus** (`:9090`)
- **Função**: Coleta e armazena métricas em time series
- **Configuração**: `monitoring/prometheus.yml`
- **Retenção**: 30 dias
- **Scrape Interval**: 15-30s

### 2. **Grafana** (`:3000`)
- **Função**: Visualização de métricas e dashboards
- **Login**: `admin` / `admin123` (configurável)
- **Dashboards**: Auto-provisionados
- **Datasource**: Prometheus (auto-configurado)

### 3. **Alertmanager** (`:9093`)
- **Função**: Gerenciamento e roteamento de alertas
- **Notificações**: Discord, Email, Webhook
- **Configuração**: `monitoring/alertmanager.yml`

### 4. **Exporters**
- **Node Exporter** (`:9100`): Métricas do sistema
- **PostgreSQL Exporter** (`:9187`): Métricas do banco
- **Redis Exporter** (`:9121`): Métricas do cache

## 🚀 Instalação e Configuração

### Pré-requisitos

```powershell
# Verificar Docker e Docker Compose
docker --version
docker-compose --version

# Verificar se o bot está funcionando
docker-compose ps
```

### 1. Setup Inicial

```powershell
# Executar setup do monitoramento
.\scripts\monitoring.ps1 -Action setup

# Verificar arquivos de configuração
ls monitoring/
```

### 2. Configurar Variáveis de Ambiente

Adicione ao seu `.env`:

```env
# Grafana Configuration
GRAFANA_PASSWORD=sua_senha_segura_aqui

# Alerting (opcional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu_email@gmail.com
SMTP_PASSWORD=sua_senha_app

# Discord Webhook para alertas
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN
```

### 3. Configurar Alertas Discord

Edite `monitoring/alertmanager.yml` e substitua:

```yaml
# Substitua YOUR_WEBHOOK_ID e YOUR_WEBHOOK_TOKEN
url: 'https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN'
```

### 4. Iniciar Serviços

```powershell
# Iniciar todos os serviços de monitoramento
.\scripts\monitoring.ps1 -Action start

# Verificar status
.\scripts\monitoring.ps1 -Action status
```

## 📊 Acessando os Serviços

### Grafana Dashboard
```
URL: http://localhost:3000
Usuário: admin
Senha: admin123 (ou valor do GRAFANA_PASSWORD)
```

**Dashboards Disponíveis:**
- **Hawk Esports Bot - Overview**: Visão geral do sistema
- **System Metrics**: Métricas detalhadas do sistema
- **Database Performance**: Performance do PostgreSQL
- **Cache Analytics**: Análise do Redis

### Prometheus
```
URL: http://localhost:9090
```

**Queries Úteis:**
```promql
# CPU Usage
hawk:system_cpu_usage_5m

# Discord Commands Rate
hawk:discord_commands_rate_5m

# Database Response Time
hawk:database_response_time_5m

# Cache Hit Rate
hawk:cache_hit_rate_5m

# System Health Score
hawk:system_health_score
```

### Alertmanager
```
URL: http://localhost:9093
```

## 🚨 Configuração de Alertas

### Tipos de Alertas

#### 🔴 **Críticos** (Notificação Imediata)
- Bot offline
- Banco de dados inacessível
- Uso de memória > 90%
- Falha de backup

#### 🟡 **Warnings** (Notificação em 5min)
- CPU > 80% por 10min
- Latência Discord > 1s
- Taxa de erro API > 5%
- Cache hit rate < 70%

#### 🔵 **Info** (Notificação em 1h)
- Violações de rate limit
- Performance degradada
- Uso de disco > 80%

### Personalizar Alertas

Edite `monitoring/alert_rules.yml`:

```yaml
# Exemplo: Alerta customizado
- alert: CustomAlert
  expr: your_metric > threshold
  for: 5m
  labels:
    severity: warning
    service: custom
  annotations:
    summary: "Descrição do alerta"
    description: "Detalhes do que aconteceu"
```

## 📈 Métricas Disponíveis

### Sistema
- `system_cpu_usage`: Uso de CPU (%)
- `system_memory_percentage`: Uso de memória (%)
- `system_load_average`: Load average
- `system_disk_usage`: Uso de disco (%)

### Discord
- `discord_connected`: Status da conexão (0/1)
- `discord_latency`: Latência em ms
- `discord_commands_total`: Total de comandos executados
- `discord_events_total`: Total de eventos processados

### Database
- `database_connections`: Conexões ativas
- `database_queries_total`: Total de queries
- `database_errors_total`: Total de erros
- `database_response_time`: Tempo de resposta (ms)

### Cache
- `cache_hits`: Cache hits
- `cache_misses`: Cache misses
- `cache_operations_total`: Total de operações
- `cache_response_time`: Tempo de resposta (ms)

### API
- `api_requests_total`: Total de requests
- `api_errors_total`: Total de erros
- `api_response_time`: Tempo de resposta (ms)
- `rate_limit_violations_total`: Violações de rate limit

### Health Checks
- `health_check_status`: Status do health check (0/0.5/1)
- `health_check_duration`: Duração do health check (ms)

## 🛠️ Comandos de Gerenciamento

### Script PowerShell

```powershell
# Iniciar monitoramento
.\scripts\monitoring.ps1 -Action start

# Parar monitoramento
.\scripts\monitoring.ps1 -Action stop

# Reiniciar serviços
.\scripts\monitoring.ps1 -Action restart

# Ver status
.\scripts\monitoring.ps1 -Action status

# Ver logs
.\scripts\monitoring.ps1 -Action logs

# Ver logs de serviço específico
.\scripts\monitoring.ps1 -Action logs -Service grafana

# Limpeza completa
.\scripts\monitoring.ps1 -Action cleanup
```

### Docker Compose Direto

```bash
# Iniciar com perfil de monitoramento
docker-compose --profile monitoring up -d

# Parar serviços de monitoramento
docker-compose --profile monitoring down

# Ver logs
docker-compose logs -f prometheus grafana alertmanager

# Reiniciar serviço específico
docker-compose restart hawk-prometheus
```

## 🔧 Troubleshooting

### Problemas Comuns

#### 1. **Grafana não carrega dashboards**
```powershell
# Verificar permissões
docker-compose logs hawk-grafana

# Recriar volumes
docker-compose down -v
docker volume rm hawk-esports-bot_grafana_data
.\scripts\monitoring.ps1 -Action start
```

#### 2. **Prometheus não coleta métricas**
```powershell
# Verificar configuração
docker-compose exec hawk-prometheus promtool check config /etc/prometheus/prometheus.yml

# Verificar targets
# Acesse: http://localhost:9090/targets
```

#### 3. **Alertas não funcionam**
```powershell
# Verificar Alertmanager
docker-compose logs hawk-alertmanager

# Testar configuração
docker-compose exec hawk-alertmanager amtool check-config /etc/alertmanager/alertmanager.yml
```

#### 4. **Exporters não respondem**
```powershell
# Verificar conectividade
curl http://localhost:9100/metrics  # Node Exporter
curl http://localhost:9187/metrics  # PostgreSQL Exporter
curl http://localhost:9121/metrics  # Redis Exporter
```

### Logs Úteis

```powershell
# Logs do Prometheus
docker-compose logs hawk-prometheus

# Logs do Grafana
docker-compose logs hawk-grafana

# Logs do Alertmanager
docker-compose logs hawk-alertmanager

# Logs de todos os exporters
docker-compose logs hawk-node-exporter hawk-postgres-exporter hawk-redis-exporter
```

## 📚 Recursos Adicionais

### Documentação Oficial
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Alertmanager Documentation](https://prometheus.io/docs/alerting/latest/alertmanager/)

### Queries PromQL Úteis
```promql
# Top 5 comandos Discord mais usados
topk(5, increase(discord_commands_total[1h]))

# Taxa de erro por serviço
rate(api_errors_total[5m]) / rate(api_requests_total[5m]) * 100

# Previsão de uso de disco
predict_linear(node_filesystem_avail_bytes[1h], 24*3600)

# Correlação CPU vs Latência
increase(system_cpu_usage[5m]) and increase(discord_latency[5m])
```

### Dashboards Personalizados

Para criar dashboards personalizados:

1. Acesse Grafana (http://localhost:3000)
2. Clique em "+" → "Dashboard"
3. Adicione painéis com queries PromQL
4. Salve o dashboard
5. Exporte como JSON e coloque em `monitoring/grafana/provisioning/dashboards/json/`

## 🔒 Segurança

### Recomendações

1. **Alterar senhas padrão**:
   ```env
   GRAFANA_PASSWORD=senha_forte_aqui
   ```

2. **Configurar HTTPS** (produção):
   - Use reverse proxy (nginx)
   - Certificados SSL/TLS
   - Autenticação adicional

3. **Restringir acesso**:
   - Firewall para portas de monitoramento
   - VPN para acesso remoto
   - Autenticação OAuth (Grafana)

4. **Backup de configurações**:
   ```powershell
   # Backup das configurações
   tar -czf monitoring-backup.tar.gz monitoring/
   ```

## 📞 Suporte

Para problemas ou dúvidas:

1. Verifique os logs dos serviços
2. Consulte a documentação oficial
3. Verifique issues no repositório
4. Entre em contato com a equipe de desenvolvimento

---

**Última atualização**: Janeiro 2024  
**Versão**: 1.0.0  
**Compatibilidade**: Docker Compose 3.8+, Prometheus 2.40+, Grafana 9.0+