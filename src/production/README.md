# Sistema de Monitoramento de Produção

Este diretório contém o sistema completo de monitoramento para o ambiente de produção do Bot Hawk Esports.

## Arquivos

### `production-monitoring.service.ts`
Serviço principal de monitoramento que fornece:
- **Health Checks**: Verificações automáticas de saúde dos serviços
- **Métricas do Sistema**: Coleta de métricas de CPU, memória, Discord, banco de dados
- **Sistema de Alertas**: Criação e gerenciamento de alertas baseados em thresholds
- **Contadores**: Rastreamento de eventos e estatísticas
- **Middleware de API**: Monitoramento de performance das requisições

### `production-monitoring.config.ts`
Arquivo de configuração que define:
- Intervalos de verificação de saúde e coleta de métricas
- Thresholds para alertas de performance
- Configurações específicas do Discord, banco de dados e cache
- Configurações de retenção de dados

### `production-integration.service.ts`
Serviço de integração que conecta o sistema de monitoramento com o cliente Discord principal.

## Funcionalidades

### Health Checks
- **Sistema**: Verifica uso de memória e CPU
- **Banco de Dados**: Testa conectividade e tempo de resposta
- **Cache/Redis**: Verifica disponibilidade e performance
- **Discord**: Monitora latência e status de conexão

### Métricas Coletadas
- **CPU**: Uso e load average
- **Memória**: Uso total, heap, percentual
- **Processo**: Uptime, PID, versão do Node.js
- **Discord**: Número de guilds, usuários, canais, latência
- **Banco de Dados**: Conexões ativas, queries, tempo de resposta
- **Cache**: Hits, misses, chaves, uso de memória

### Sistema de Alertas
- **Tipos**: Performance, saúde, erro, aviso
- **Severidade**: Baixa, média, alta, crítica
- **Auto-resolução**: Alertas podem ser resolvidos automaticamente
- **Cooldown**: Previne spam de alertas similares

## Configuração

### Variáveis de Ambiente
```bash
# Intervalos (em milissegundos)
MONITORING_HEALTH_CHECK_INTERVAL=30000
MONITORING_METRICS_INTERVAL=60000

# Thresholds de performance
MONITORING_MEMORY_THRESHOLD=85
MONITORING_CPU_THRESHOLD=80
MONITORING_DISCORD_LATENCY_THRESHOLD=1000
```

### Uso no Código

```typescript
import { ProductionMonitoringService } from './production/production-monitoring.service';
import { ProductionIntegrationService } from './production/production-integration.service';

// Inicializar o serviço de monitoramento
const monitoringService = new ProductionMonitoringService(
  databaseService,
  cacheService
);

// Configurar cliente Discord e serviço de métricas
monitoringService.setDiscordClient(discordClient);
monitoringService.setMetricsService(metricsService);

// Iniciar monitoramento
await monitoringService.start();

// Integração com Discord (opcional)
const integrationService = new ProductionIntegrationService(
  discordClient,
  monitoringService
);
await integrationService.initialize();
```

## API Endpoints

Quando integrado com o `APIService`, os seguintes endpoints ficam disponíveis:

### `GET /api/monitoring/status`
Retorna o status geral do sistema:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "healthChecks": [...],
    "metrics": {...},
    "alerts": [...],
    "uptime": 3600
  }
}
```

### `GET /api/monitoring/metrics`
Retorna todas as métricas coletadas:
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2024-01-20T10:00:00.000Z",
      "cpu": {...},
      "memory": {...},
      "discord": {...}
    }
  ]
}
```

### `GET /api/monitoring/alerts`
Retorna alertas ativos:
```json
{
  "success": true,
  "data": [
    {
      "id": "alert_123",
      "type": "performance",
      "severity": "high",
      "service": "system",
      "message": "High memory usage: 87%",
      "timestamp": "2024-01-20T10:00:00.000Z",
      "resolved": false
    }
  ]
}
```

### `POST /api/monitoring/alerts/:id/resolve`
Resolve um alerta específico:
```json
{
  "success": true,
  "message": "Alert resolved successfully"
}
```

### `GET /api/monitoring/counters`
Retorna contadores de eventos:
```json
{
  "success": true,
  "data": [
    {
      "name": "api_requests_total",
      "value": 1250,
      "timestamp": "2024-01-20T10:00:00.000Z"
    }
  ]
}
```

## Middleware de Monitoramento

O serviço inclui um middleware para monitorar automaticamente as requisições da API:

```typescript
// No APIService
app.use(monitoringService.apiMonitoringMiddleware());
```

Este middleware:
- Conta requisições por método HTTP
- Conta respostas por código de status
- Detecta requisições lentas
- Cria alertas para problemas de performance

## Alertas Automáticos

O sistema cria alertas automaticamente para:
- **Alto uso de memória** (>85% por padrão)
- **Alto uso de CPU** (>80% por padrão)
- **Alta latência do Discord** (>1000ms por padrão)
- **Falhas de health check**
- **Requisições API lentas** (>5000ms por padrão)
- **Exceções não capturadas**
- **Rejeições de Promise não tratadas**

## Logs

Todos os eventos de monitoramento são registrados com diferentes níveis:
- **INFO**: Inicialização, status normal
- **WARN**: Alertas, problemas menores
- **ERROR**: Falhas críticas, exceções

## Shutdown Gracioso

O serviço implementa shutdown gracioso:
- Escuta sinais `SIGTERM` e `SIGINT`
- Para coleta de métricas e health checks
- Limpa recursos e intervalos
- Registra eventos de shutdown

## Considerações de Performance

- **Retenção de Métricas**: Por padrão, mantém métricas por 24 horas
- **Limite de Memória**: Máximo de 1000 métricas em memória
- **Cooldown de Alertas**: 5 minutos entre alertas similares
- **Timeouts**: Health checks têm timeout de 10 segundos

## Monitoramento em Produção

Para ambiente de produção, recomenda-se:
1. Configurar alertas externos (email, Slack, etc.)
2. Integrar com sistemas de monitoramento (Prometheus, Grafana)
3. Configurar logs centralizados
4. Implementar dashboards de visualização
5. Definir runbooks para resposta a incidentes