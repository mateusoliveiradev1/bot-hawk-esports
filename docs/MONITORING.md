# Sistema de Monitoramento - Bot Hawk Esports

Este documento descreve o sistema de monitoramento robusto implementado no Bot Hawk Esports, incluindo health checks, logging estruturado e alertas automatizados.

## Visão Geral

O sistema de monitoramento é composto por três componentes principais:

1. **HealthService** - Monitoramento de saúde dos serviços
2. **StructuredLogger** - Sistema de logging estruturado
3. **AlertService** - Sistema de alertas automatizados

## Componentes

### 1. HealthService

O `HealthService` monitora continuamente a saúde do sistema e seus componentes.

#### Funcionalidades:
- Monitoramento de memória e CPU
- Verificação de conectividade com banco de dados
- Verificação de status do Discord
- Health checks de serviços individuais
- Métricas de performance da API
- Endpoints `/health`, `/health/detailed` e `/metrics`

#### Configuração:
```typescript
const healthService = HealthService.getInstance(
  client,
  database,
  cache,
  alertConfig,
  loggerConfig
);

// Iniciar monitoramento
await healthService.startMonitoring();
```

### 2. StructuredLogger

Sistema de logging estruturado usando Winston com suporte a múltiplos transportes.

#### Transportes Suportados:
- **Console** - Output colorido para desenvolvimento
- **Arquivo** - Logs rotativos em arquivos separados por nível
- **ElasticSearch** - Integração com ELK Stack
- **Discord** - Webhooks para logs críticos

#### Tipos de Log:
- `logError()` - Erros do sistema
- `logWarning()` - Avisos importantes
- `logInfo()` - Informações gerais
- `logDebug()` - Informações de debug
- `logHttpRequest()` - Requisições HTTP
- `logDiscordCommand()` - Comandos Discord executados
- `logDatabaseOperation()` - Operações de banco de dados
- `logExternalApiCall()` - Chamadas para APIs externas
- `logPerformance()` - Métricas de performance
- `logSecurityEvent()` - Eventos de segurança

#### Exemplo de Uso:
```typescript
const logger = new StructuredLogger({
  level: 'info',
  environment: 'production',
  version: '1.0.0'
});

logger.logInfo('Serviço iniciado', { service: 'api' });
logger.logError('Erro na conexão', error);
```

### 3. AlertService

Sistema de alertas que monitora métricas e envia notificações quando thresholds são ultrapassados.

#### Canais de Alerta:
- **Discord** - Webhooks com embeds formatados
- **Email** - SMTP para notificações por email
- **Webhook** - HTTP webhooks customizados

#### Regras de Alerta Padrão:
- **Uso de Memória** - Warning: 80%, Critical: 90%
- **Taxa de Erro** - Warning: 5%, Critical: 10%
- **Conexão com Banco** - Falha de conectividade
- **Conexão Discord** - Perda de conexão
- **Tempo de Resposta API** - Warning: 1s, Critical: 5s

#### Configuração:
```typescript
const alertService = new AlertService({
  enabled: true,
  channels: {
    discord: {
      enabled: true,
      webhook: 'https://discord.com/api/webhooks/...'
    },
    email: {
      enabled: true,
      smtp: { /* configuração SMTP */ },
      to: ['admin@example.com']
    }
  }
});
```

## Configuração

### Variáveis de Ambiente

#### Logging
```env
# Nível de log (error, warn, info, debug)
LOG_LEVEL=info

# Diretório de logs
LOG_DIR=./logs

# Tamanho máximo dos arquivos de log (bytes)
LOG_MAX_SIZE=20971520

# Número máximo de arquivos de log
LOG_MAX_FILES=14

# Habilitar/desabilitar transportes
LOG_CONSOLE=true
LOG_FILE=true

# ElasticSearch
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_INDEX=bot-hawk-logs
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=password

# Discord Logging
DISCORD_LOG_WEBHOOK=https://discord.com/api/webhooks/...
```

#### Alertas
```env
# Habilitar alertas
ALERTS_ENABLED=true

# Discord Alerts
DISCORD_ALERT_WEBHOOK=https://discord.com/api/webhooks/...
DISCORD_ALERT_USERNAME=Bot Hawk Alerts

# Email Alerts
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=alerts@example.com
SMTP_PASS=password
ALERT_EMAIL_FROM=alerts@example.com
ALERT_EMAIL_TO=admin@example.com,dev@example.com

# Webhook Alerts
ALERT_WEBHOOK_URL=https://api.example.com/alerts
ALERT_WEBHOOK_HEADERS={"Authorization":"Bearer token"}

# Thresholds
MEMORY_WARNING_THRESHOLD=80
MEMORY_CRITICAL_THRESHOLD=90
ERROR_RATE_WARNING=5
ERROR_RATE_CRITICAL=10
API_RESPONSE_WARNING=1000
API_RESPONSE_CRITICAL=5000
```

#### Health Checks
```env
# Intervalo de health checks (ms)
HEALTH_CHECK_INTERVAL=30000

# Timeout para health checks (ms)
HEALTH_CHECK_TIMEOUT=5000

# Número de tentativas
HEALTH_CHECK_RETRIES=3
```

#### Métricas
```env
# Habilitar coleta de métricas
METRICS_ENABLED=true

# Intervalo de coleta (ms)
METRICS_COLLECT_INTERVAL=60000

# Retenção de métricas (dias)
METRICS_RETENTION_DAYS=30
```

## Endpoints de Monitoramento

### Health Check Básico
```
GET /health
```
Retorna status básico do sistema.

### Health Check Detalhado
```
GET /health/detailed
```
Retorna informações detalhadas sobre todos os componentes.

### Health Check de Serviço Específico
```
GET /health/service/:serviceName
```
Retorna status de um serviço específico.

### Métricas Prometheus
```
GET /metrics
```
Retorna métricas no formato Prometheus.

### Métricas JSON
```
GET /metrics/json
```
Retorna métricas em formato JSON (requer autenticação de admin).

## Estrutura de Logs

Todos os logs seguem uma estrutura consistente:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Mensagem do log",
  "service": "api",
  "environment": "production",
  "version": "1.0.0",
  "context": {
    "userId": "123456789",
    "guildId": "987654321",
    "additional": "data"
  },
  "metadata": {
    "duration": 150,
    "statusCode": 200
  }
}
```

## Alertas

### Tipos de Alerta

#### Critical
- Falha total do sistema
- Perda de conexão com banco de dados
- Uso de memória > 90%
- Taxa de erro > 10%

#### Warning
- Uso de memória > 80%
- Taxa de erro > 5%
- Tempo de resposta da API > 1s
- Conexão instável com Discord

#### Info
- Início/parada de serviços
- Atualizações de configuração
- Eventos de manutenção

### Formato de Alerta Discord

Os alertas no Discord são enviados como embeds formatados:

```javascript
{
  title: "🚨 CRITICAL: High Memory Usage",
  description: "Memory usage has exceeded 90%",
  color: 0xFF0000, // Vermelho para critical
  fields: [
    { name: "Current Usage", value: "92%", inline: true },
    { name: "Threshold", value: "90%", inline: true },
    { name: "Service", value: "API Service", inline: true }
  ],
  timestamp: new Date().toISOString()
}
```

## Monitoramento de Performance

O sistema coleta automaticamente métricas de performance:

- **Tempo de resposta da API**
- **Uso de memória e CPU**
- **Latência do banco de dados**
- **Tempo de execução de comandos**
- **Taxa de erro por endpoint**
- **Número de usuários ativos**

## Troubleshooting

### Logs não aparecem
1. Verificar permissões do diretório de logs
2. Verificar configuração do `LOG_LEVEL`
3. Verificar se `LOG_FILE=true`

### Alertas não funcionam
1. Verificar `ALERTS_ENABLED=true`
2. Verificar configuração dos webhooks
3. Verificar conectividade de rede
4. Verificar logs de erro do AlertService

### Health checks falham
1. Verificar conectividade com banco de dados
2. Verificar status do Discord
3. Verificar configuração de timeouts
4. Verificar logs do HealthService

## Melhores Práticas

1. **Configurar alertas graduais** - Use thresholds de warning antes de critical
2. **Monitorar logs regularmente** - Configure dashboards para visualização
3. **Testar alertas** - Verifique se os canais de alerta funcionam
4. **Rotacionar logs** - Configure retenção adequada para evitar uso excessivo de disco
5. **Monitorar métricas** - Use as métricas para otimização de performance

## Integração com Ferramentas Externas

### ELK Stack
Para integrar com ElasticSearch/Kibana:
1. Configure `ELASTICSEARCH_URL`
2. Crie índices apropriados
3. Configure dashboards no Kibana

### Prometheus/Grafana
Para integrar com Prometheus:
1. Configure scraping do endpoint `/metrics`
2. Crie dashboards no Grafana
3. Configure alertas no AlertManager

### Sentry
Para integração com Sentry (erro tracking):
```typescript
import * as Sentry from '@sentry/node';

// No StructuredLogger
if (level === 'error') {
  Sentry.captureException(error);
}
```

Este sistema de monitoramento fornece visibilidade completa sobre o estado e performance do Bot Hawk Esports, permitindo detecção proativa de problemas e resposta rápida a incidentes.