# Cache Optimization for Production

Este documento descreve as otimizações implementadas no sistema de cache para ambiente de produção.

## Arquivos Implementados

### 1. `cache.config.ts`
Configuração geral do sistema de cache com:
- Configurações detalhadas do Redis
- Cache em memória como fallback
- TTLs específicos por tipo de dados
- Configurações de performance e monitoramento

### 2. `optimized-cache.service.ts`
Serviço de cache otimizado que inclui:
- Suporte a clustering Redis
- Compressão de dados
- Pipeline para operações em lote
- Fallback automático para memória
- Monitoramento avançado
- Estatísticas de performance

### 3. `redis-production.config.ts`
Configuração específica do Redis para produção:
- Configurações de conexão otimizadas
- Pool de conexões
- Timeouts e retry logic
- Health checks automáticos
- Monitoramento de métricas

## Funcionalidades Implementadas

### 🚀 Performance
- **Compressão**: Dados são comprimidos automaticamente usando gzip
- **Pipeline**: Operações em lote para reduzir latência
- **Lazy Connect**: Conexão apenas quando necessário
- **Keep-Alive**: Mantém conexões ativas para reduzir overhead

### 🔄 Fallback Automático
- Cache em memória como backup quando Redis não está disponível
- Transição transparente entre Redis e memória
- Recuperação automática quando Redis volta online

### 📊 Monitoramento
- Health checks periódicos
- Coleta de métricas de performance
- Logs estruturados para debugging
- Alertas automáticos para problemas

### 🛡️ Confiabilidade
- Retry automático em caso de falhas
- Timeout configurável para operações
- Tratamento robusto de erros
- Graceful shutdown

## Configuração via Variáveis de Ambiente

### Redis Básico
```bash
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
REDIS_DB=0
REDIS_KEY_PREFIX=hawk:
```

### Timeouts e Retry
```bash
REDIS_CONNECT_TIMEOUT=10000
REDIS_COMMAND_TIMEOUT=5000
REDIS_MAX_RETRIES=3
```

### Health Check e Monitoramento
```bash
REDIS_HEALTH_CHECK=true
REDIS_HEALTH_CHECK_INTERVAL=30000
REDIS_MONITORING=true
REDIS_MONITORING_INTERVAL=60000
```

### Performance
```bash
REDIS_COMPRESSION=true
CACHE_MAX_MEMORY_SIZE=100
CACHE_DEFAULT_TTL=3600
```

## TTLs Otimizados por Tipo de Dados

| Tipo de Dados | TTL Padrão | Descrição |
|---------------|------------|-----------|
| Usuário | 1 hora | Dados de perfil do usuário |
| Guild | 30 minutos | Configurações do servidor |
| PUBG Stats | 15 minutos | Estatísticas de jogos |
| Rankings | 10 minutos | Classificações e leaderboards |
| Sessão | 24 horas | Dados de sessão do usuário |
| Música | 2 horas | Informações de faixas |
| Quiz | 1 hora | Dados de quiz e perguntas |
| Badges | 4 horas | Sistema de conquistas |
| Presence | 5 minutos | Status de presença |
| Clips | 30 minutos | Clipes de vídeo |

## Métricas Coletadas

### Redis
- Latência de comandos
- Taxa de hit/miss
- Uso de memória
- Número de conexões
- Comandos por segundo

### Cache em Memória
- Tamanho do cache
- Número de entradas
- Taxa de hit/miss
- Operações por segundo

### Performance Geral
- Tempo de resposta médio
- Throughput
- Taxa de erro
- Disponibilidade

## Integração com API Service

O `APIService` foi atualizado para:
1. Usar `OptimizedCacheService` em produção
2. Conectar automaticamente ao Redis no startup
3. Desconectar graciosamente no shutdown
4. Manter compatibilidade com cache original em desenvolvimento

## Alertas e Monitoramento

### Alertas Automáticos
- Uso de memória Redis > 85%
- Taxa de hit < 70%
- Latência de comandos > 50ms
- Falhas de conexão
- Chaves expiradas em excesso

### Logs Estruturados
- Conexões e desconexões
- Operações de cache
- Erros e warnings
- Métricas de performance

## Benefícios da Implementação

### 🎯 Performance
- **Redução de latência**: Pipeline e compressão
- **Maior throughput**: Conexões otimizadas
- **Menor uso de memória**: Compressão e TTLs adequados

### 🔒 Confiabilidade
- **Alta disponibilidade**: Fallback automático
- **Recuperação automática**: Reconexão inteligente
- **Monitoramento proativo**: Detecção precoce de problemas

### 📈 Escalabilidade
- **Suporte a clustering**: Redis Cluster ready
- **Pool de conexões**: Gerenciamento eficiente
- **Configuração flexível**: Adaptável a diferentes ambientes

### 🛠️ Manutenibilidade
- **Logs estruturados**: Debugging facilitado
- **Métricas detalhadas**: Análise de performance
- **Configuração centralizada**: Fácil ajuste de parâmetros

## Próximos Passos

1. **Implementar Redis Sentinel** para alta disponibilidade
2. **Adicionar cache distribuído** para múltiplas instâncias
3. **Implementar cache warming** para dados críticos
4. **Adicionar métricas customizadas** por funcionalidade
5. **Implementar cache invalidation** inteligente

## Troubleshooting

### Redis não conecta
1. Verificar `REDIS_URL` nas variáveis de ambiente
2. Testar conectividade de rede
3. Verificar logs de conexão
4. Confirmar credenciais de autenticação

### Performance baixa
1. Verificar latência de rede para Redis
2. Analisar taxa de hit/miss
3. Revisar TTLs configurados
4. Verificar uso de memória Redis

### Fallback para memória
1. Verificar logs de erro do Redis
2. Testar conectividade
3. Verificar health checks
4. Analisar métricas de monitoramento