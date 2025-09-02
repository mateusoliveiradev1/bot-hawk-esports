# Sistema de Rate Limiting do Discord Bot

Este documento descreve o sistema robusto de rate limiting implementado para o Discord Bot Hawk Esports, projetado para prevenir spam, abuso e garantir uma experiência equilibrada para todos os usuários.

## Visão Geral

O sistema de rate limiting implementa múltiplas camadas de proteção:

1. **Rate Limiting Básico**: Cooldowns simples por comando
2. **Rate Limiting Avançado**: Sistema inteligente com penalidades progressivas
3. **Rate Limiting de API**: Proteção das rotas HTTP
4. **Monitoramento e Alertas**: Detecção de padrões suspeitos

## Arquitetura do Sistema

### Componentes Principais

#### 1. DiscordRateLimiterService
**Arquivo**: `src/services/discord-rate-limiter.service.ts`

Serviço principal que gerencia o rate limiting para comandos do Discord:

- **Configurações por Comando**: Diferentes limites para admin, música, PUBG, moderação e diversão
- **Sistema de Penalidades**: Multiplicadores que aumentam com violações
- **Timeouts Automáticos**: Suspensão temporária para usuários problemáticos
- **Limpeza Automática**: Remove dados antigos de usuários inativos

#### 2. Integração com CommandManager
**Arquivo**: `src/commands/index.ts`

O CommandManager foi atualizado para integrar o rate limiting:

```typescript
// Verificação de rate limit antes da execução do comando
const rateLimitResult = this.discordRateLimiter.checkRateLimit(userId, commandName);

if (!rateLimitResult.allowed) {
  // Resposta baseada na ação (timeout, cooldown, warn, ban)
  const response = this.getRateLimitResponse(rateLimitResult);
  await interaction.reply(response);
  return;
}
```

#### 3. Comando de Administração
**Arquivo**: `src/commands/admin/ratelimit.ts`

Comando `/ratelimit` para administradores gerenciarem o sistema:

- `status`: Visualizar status geral do sistema
- `user <usuário>`: Ver informações de rate limit de um usuário
- `reset <usuário>`: Resetar rate limit de um usuário
- `stats`: Estatísticas gerais do sistema

#### 4. API de Gerenciamento
**Rotas**: `/api/ratelimit/*`

API REST para monitoramento e gerenciamento via dashboard:

- `GET /api/ratelimit/status`: Status do sistema
- `GET /api/ratelimit/user/:userId`: Status de um usuário
- `POST /api/ratelimit/user/:userId/reset`: Reset de usuário
- `GET /api/ratelimit/stats`: Estatísticas gerais

## Configurações de Rate Limiting

### Configurações por Tipo de Comando

```typescript
const COMMAND_CONFIGS = {
  admin: {
    requests: 5,
    windowMs: 60000, // 1 minuto
    cooldownMs: 5000, // 5 segundos
    maxViolations: 3
  },
  music: {
    requests: 10,
    windowMs: 60000,
    cooldownMs: 2000,
    maxViolations: 5
  },
  pubg: {
    requests: 15,
    windowMs: 60000,
    cooldownMs: 3000,
    maxViolations: 4
  },
  moderation: {
    requests: 8,
    windowMs: 60000,
    cooldownMs: 4000,
    maxViolations: 2
  },
  fun: {
    requests: 20,
    windowMs: 60000,
    cooldownMs: 1000,
    maxViolations: 6
  }
};
```

### Sistema de Penalidades

1. **Primeira Violação**: Aviso + multiplicador 1.5x
2. **Segunda Violação**: Cooldown estendido + multiplicador 2x
3. **Terceira Violação**: Timeout de 5 minutos + multiplicador 3x
4. **Violações Subsequentes**: Timeouts progressivamente maiores

## Como Usar

### Para Administradores

#### Comando Discord

```bash
# Ver status geral
/ratelimit status

# Ver informações de um usuário
/ratelimit user @usuario

# Resetar rate limit de um usuário
/ratelimit reset @usuario

# Ver estatísticas
/ratelimit stats
```

#### API REST

```bash
# Status do sistema
GET /api/ratelimit/status

# Informações de usuário
GET /api/ratelimit/user/123456789

# Reset de usuário
POST /api/ratelimit/user/123456789/reset

# Estatísticas
GET /api/ratelimit/stats
```

### Para Desenvolvedores

#### Adicionando Rate Limiting a Novos Comandos

1. **Defina o tipo do comando** no `BaseCommand`:

```typescript
export class MeuComando extends BaseCommand {
  constructor() {
    super({
      name: 'meucomando',
      description: 'Meu comando personalizado',
      category: 'fun', // Define o tipo para rate limiting
      cooldown: 3000
    });
  }
}
```

2. **O rate limiting é aplicado automaticamente** pelo CommandManager

#### Configurando Novos Tipos de Comando

Para adicionar um novo tipo de comando com configurações específicas:

```typescript
// Em discord-rate-limiter.service.ts
const COMMAND_CONFIGS = {
  // ... configurações existentes
  
  meuTipo: {
    requests: 12,
    windowMs: 90000, // 1.5 minutos
    cooldownMs: 2500,
    maxViolations: 4
  }
};
```

## Monitoramento e Alertas

### Métricas Coletadas

- **Comandos por usuário**: Contagem de comandos executados
- **Violações**: Número de tentativas bloqueadas
- **Timeouts**: Usuários em timeout
- **Padrões de uso**: Análise de comportamento

### Logs Estruturados

Todos os eventos de rate limiting são registrados:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "warn",
  "category": "rate_limit",
  "event": "violation",
  "userId": "123456789",
  "command": "play",
  "violationLevel": 2,
  "action": "cooldown"
}
```

### Alertas Automáticos

O sistema pode ser configurado para enviar alertas quando:

- Usuário atinge múltiplas violações
- Padrões suspeitos são detectados
- Sistema de rate limiting falha

## Configuração de Produção

### Variáveis de Ambiente

```env
# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REDIS_URL=redis://localhost:6379
RATE_LIMIT_CLEANUP_INTERVAL=300000
RATE_LIMIT_MAX_USERS=10000

# Alertas
RATE_LIMIT_ALERT_THRESHOLD=5
RATE_LIMIT_ALERT_WEBHOOK=https://discord.com/api/webhooks/...
```

### Otimizações de Performance

1. **Cache Redis**: Dados de rate limiting armazenados em Redis
2. **Limpeza Automática**: Remove dados antigos a cada 5 minutos
3. **Índices Otimizados**: Acesso rápido aos dados de usuário
4. **Batch Operations**: Operações em lote para melhor performance

## Troubleshooting

### Problemas Comuns

#### Rate Limiting Muito Restritivo

**Sintoma**: Usuários legítimos sendo bloqueados
**Solução**: Ajustar configurações em `COMMAND_CONFIGS`

```typescript
// Aumentar limites
music: {
  requests: 15, // Era 10
  windowMs: 60000,
  cooldownMs: 1500, // Era 2000
  maxViolations: 7 // Era 5
}
```

#### Rate Limiting Não Funcionando

**Sintoma**: Spam não sendo bloqueado
**Verificações**:

1. Verificar se o serviço está inicializado
2. Verificar logs de erro
3. Testar conectividade com Redis
4. Verificar configurações de comando

#### Performance Degradada

**Sintoma**: Bot lento para responder
**Soluções**:

1. Aumentar intervalo de limpeza
2. Reduzir número máximo de usuários rastreados
3. Otimizar consultas Redis
4. Implementar cache local

### Comandos de Debug

```bash
# Verificar status do Redis
redis-cli ping

# Ver dados de rate limiting
redis-cli keys "ratelimit:*"

# Limpar todos os dados de rate limiting
redis-cli flushdb
```

## Segurança

### Proteções Implementadas

1. **Validação de Entrada**: Todos os parâmetros são validados
2. **Sanitização**: Dados limpos antes do armazenamento
3. **Rate Limiting da API**: Proteção das rotas de gerenciamento
4. **Autenticação**: Apenas admins podem gerenciar o sistema
5. **Logs de Auditoria**: Todas as ações são registradas

### Considerações de Privacidade

- Apenas IDs de usuário são armazenados
- Dados são automaticamente limpos
- Nenhuma informação pessoal é coletada
- Conformidade com LGPD/GDPR

## Roadmap

### Funcionalidades Planejadas

- [ ] Dashboard web para visualização
- [ ] Alertas em tempo real
- [ ] Machine learning para detecção de padrões
- [ ] Rate limiting baseado em reputação
- [ ] Integração com sistemas externos
- [ ] Métricas avançadas e relatórios

### Melhorias de Performance

- [ ] Cache distribuído
- [ ] Sharding de dados
- [ ] Otimizações de memória
- [ ] Compressão de dados

## Suporte

Para suporte técnico ou dúvidas sobre o sistema de rate limiting:

1. Verificar logs do sistema
2. Consultar esta documentação
3. Testar com comandos de debug
4. Contatar a equipe de desenvolvimento

---

**Última atualização**: Janeiro 2024
**Versão**: 1.0.0
**Autor**: Equipe Hawk Esports