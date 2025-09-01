# 🔒 Documentação de Endpoints Críticos e Segurança

**Data:** 2025-01-16  
**Versão:** 1.0  
**Status:** ✅ Completo

## 📋 Visão Geral

Este documento detalha os endpoints críticos do sistema Hawk Esports Bot, suas configurações de segurança, rate limiting e medidas de proteção implementadas.

---

## 🎯 Classificação de Endpoints

### 🔴 Críticos (Nível 1)
Endpoints que lidam com autenticação, dados sensíveis ou operações administrativas.

### 🟠 Importantes (Nível 2)
Endpoints com funcionalidades essenciais que requerem autenticação.

### 🟡 Moderados (Nível 3)
Endpoints públicos ou com baixo impacto de segurança.

---

## 🔴 Endpoints Críticos (Nível 1)

### 1. Autenticação

#### `POST /api/auth/login`
**Criticidade:** 🔴 Máxima  
**Função:** Login via Discord OAuth

**Configurações de Segurança:**
```typescript
// Rate Limiting
windowMs: 15 * 60 * 1000, // 15 minutos
max: 5, // 5 tentativas por IP
message: 'Too many login attempts, please try again later.'

// Headers de Segurança
'Cache-Control': 'no-store, no-cache, must-revalidate'
'X-Content-Type-Options': 'nosniff'
'X-XSS-Protection': '1; mode=block'
```

**Validações:**
- ✅ Validação do código OAuth Discord
- ✅ Verificação de redirect_uri
- ✅ Sanitização de inputs
- ✅ Geração segura de JWT
- ✅ Logging de tentativas de login

**Monitoramento:**
```typescript
// Métricas monitoradas
- login_attempts_total
- login_failures_total
- login_success_rate
- suspicious_login_attempts
```

#### `POST /api/auth/refresh`
**Criticidade:** 🔴 Máxima  
**Função:** Renovação de tokens JWT

**Configurações:**
```typescript
// Rate Limiting
windowMs: 15 * 60 * 1000,
max: 10, // 10 renovações por 15 min

// Validações
- Verificação de token válido
- Verificação de expiração
- Blacklist de tokens revogados
```

### 2. Administração

#### `GET /api/guilds/:guildId`
**Criticidade:** 🔴 Alta  
**Função:** Informações administrativas da guild

**Proteções:**
```typescript
// Autenticação + Autorização
middleware: [
  authenticateToken,
  requireRole(['Moderador', 'Administrador', 'Admin', 'Mod'])
]

// Rate Limiting
windowMs: 15 * 60 * 1000,
max: 50, // 50 requests por 15 min
```

**Validações:**
- ✅ Token JWT válido
- ✅ Permissões de moderador+
- ✅ Verificação de acesso à guild
- ✅ Sanitização de parâmetros

#### `GET /api/stats/:guildId`
**Criticidade:** 🔴 Alta  
**Função:** Estatísticas sensíveis da guild

**Dados Protegidos:**
- Métricas de usuários
- Estatísticas de atividade
- Informações de performance
- Dados de uso de comandos

### 3. Dados Pessoais

#### `GET /api/users/me`
**Criticidade:** 🔴 Alta  
**Função:** Dados pessoais do usuário

**Proteções:**
```typescript
// Headers específicos
'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
'Pragma': 'no-cache'
'Expires': '0'

// Filtragem de dados
- Remove campos sensíveis
- Sanitiza informações pessoais
- Aplica GDPR compliance
```

---

## 🟠 Endpoints Importantes (Nível 2)

### 1. Upload de Arquivos

#### `POST /api/clips/upload`
**Criticidade:** 🟠 Alta  
**Função:** Upload de clipes de vídeo

**Configurações:**
```typescript
// Rate Limiting
windowMs: 15 * 60 * 1000,
max: 10, // 10 uploads por 15 min

// Validações de arquivo
maxFileSize: 50 * 1024 * 1024, // 50MB
allowedTypes: ['video/mp4', 'video/webm']
virusScan: true
```

**Proteções:**
- ✅ Validação de tipo MIME
- ✅ Verificação de tamanho
- ✅ Scan de malware
- ✅ Sanitização de metadados
- ✅ Quarentena temporária

### 2. API Externa (PUBG)

#### `GET /api/pubg/*`
**Criticidade:** 🟠 Moderada  
**Função:** Integração com API PUBG

**Configurações:**
```typescript
// Rate Limiting específico
windowMs: 60 * 1000, // 1 minuto
max: 30, // 30 requests por minuto

// Proteção de API Key
- API Key em variável de ambiente
- Rotação automática de chaves
- Monitoramento de quota
```

### 3. WebSocket Connections

#### `WS /socket.io`
**Criticidade:** 🟠 Moderada  
**Função:** Conexões em tempo real

**Proteções:**
```typescript
// Rate Limiting
windowMs: 60 * 1000,
max: 20, // 20 conexões por minuto

// Autenticação WebSocket
auth: {
  token: 'jwt_token_required'
}

// Validação de eventos
- Whitelist de eventos permitidos
- Validação de payloads
- Rate limiting por evento
```

---

## 🟡 Endpoints Moderados (Nível 3)

### 1. Health Checks

#### `GET /health`
**Criticidade:** 🟡 Baixa  
**Função:** Status do sistema

**Configurações:**
```typescript
// Rate Limiting relaxado
windowMs: 60 * 1000,
max: 60, // 60 requests por minuto

// Informações limitadas
- Status básico apenas
- Sem dados sensíveis
- Métricas agregadas
```

### 2. Métricas Públicas

#### `GET /metrics`
**Criticidade:** 🟡 Baixa  
**Função:** Métricas do sistema

**Filtragem:**
- ✅ Remove dados pessoais
- ✅ Agrega informações
- ✅ Limita detalhes técnicos

---

## 🛡️ Configurações de Segurança Globais

### 1. Headers de Segurança
```typescript
// Aplicados a todos os endpoints
app.use((req, res, next) => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Feature Policy
  res.setHeader('Permissions-Policy', [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()'
  ].join(', '));
  
  next();
});
```

### 2. CORS Configuration
```typescript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400 // 24 hours
}));
```

### 3. Session Security
```typescript
app.use(session({
  secret: process.env.JWT_SECRET,
  name: 'hawk.sid', // Custom session name
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
    httpOnly: true, // Prevent XSS
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict' // CSRF protection
  },
  store: new RedisStore({
    client: redisClient,
    prefix: 'hawk:sess:'
  })
}));
```

---

## 🚨 Sistema de Rate Limiting Avançado

### Configurações por Categoria

```typescript
// Configurações específicas por tipo de endpoint
const rateLimitConfigs = {
  // Autenticação - Muito restritivo
  AUTH_LOGIN: {
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // 5 tentativas
    message: 'Too many login attempts',
    keyGenerator: (req) => `auth-${req.ip}`,
    skipSuccessfulRequests: true
  },
  
  // Geral - Moderado
  GENERAL: {
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Rate limit exceeded',
    keyGenerator: (req) => `general-${req.ip}`
  },
  
  // Upload - Restritivo
  UPLOAD_GENERAL: {
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Upload rate limit exceeded',
    keyGenerator: (req) => `upload-${req.user?.id || req.ip}`
  },
  
  // API Externa - Baseado em quota
  API_PUBG: {
    windowMs: 60 * 1000, // 1 minuto
    max: 30,
    message: 'PUBG API rate limit exceeded',
    keyGenerator: (req) => `pubg-${req.user?.id || req.ip}`
  },
  
  // Admin - Moderado mas monitorado
  ADMIN_GENERAL: {
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: 'Admin rate limit exceeded',
    keyGenerator: (req) => `admin-${req.user?.id}`,
    onLimitReached: (req, res, options) => {
      // Log tentativas suspeitas de admin
      logger.warn('Admin rate limit exceeded', {
        userId: req.user?.id,
        ip: req.ip,
        endpoint: req.path
      });
    }
  }
};
```

### Rate Limiting Inteligente

```typescript
class AdvancedRateLimitService {
  // Rate limiting baseado em reputação do usuário
  getUserRateLimit(userId: string, baseConfig: RateLimitConfig): RateLimitConfig {
    const userReputation = this.getUserReputation(userId);
    
    // Usuários com boa reputação têm limites mais altos
    if (userReputation > 0.8) {
      return {
        ...baseConfig,
        max: Math.floor(baseConfig.max * 1.5)
      };
    }
    
    // Usuários suspeitos têm limites mais baixos
    if (userReputation < 0.3) {
      return {
        ...baseConfig,
        max: Math.floor(baseConfig.max * 0.5)
      };
    }
    
    return baseConfig;
  }
  
  // Whitelist/Blacklist dinâmica
  shouldBypassRateLimit(req: Request): boolean {
    const ip = req.ip;
    const userId = req.user?.id;
    
    // Whitelist de IPs confiáveis
    if (this.trustedIPs.includes(ip)) {
      return true;
    }
    
    // Blacklist de usuários banidos
    if (userId && this.bannedUsers.includes(userId)) {
      throw new Error('User is banned');
    }
    
    return false;
  }
}
```

---

## 📊 Monitoramento e Alertas

### Métricas de Segurança

```typescript
// Métricas monitoradas em tempo real
const securityMetrics = {
  // Rate limiting
  'rate_limit_violations_total': 'counter',
  'rate_limit_violations_by_endpoint': 'counter',
  'rate_limit_violations_by_ip': 'counter',
  
  // Autenticação
  'auth_attempts_total': 'counter',
  'auth_failures_total': 'counter',
  'auth_suspicious_attempts': 'counter',
  
  // Endpoints críticos
  'critical_endpoint_access_total': 'counter',
  'admin_endpoint_access_total': 'counter',
  'failed_authorization_attempts': 'counter',
  
  // Performance de segurança
  'security_check_duration': 'histogram',
  'jwt_validation_duration': 'histogram'
};
```

### Alertas Automáticos

```typescript
// Configuração de alertas
const alertThresholds = {
  // Rate limiting
  rateLimitViolations: {
    warning: 10, // 10 violações em 5 min
    critical: 50  // 50 violações em 5 min
  },
  
  // Falhas de autenticação
  authFailures: {
    warning: 20,  // 20 falhas em 15 min
    critical: 100 // 100 falhas em 15 min
  },
  
  // Tentativas de acesso não autorizado
  unauthorizedAccess: {
    warning: 5,   // 5 tentativas em 5 min
    critical: 20  // 20 tentativas em 5 min
  }
};

// Sistema de alertas
class SecurityAlertService {
  async checkThresholds(): Promise<void> {
    const metrics = await this.getSecurityMetrics();
    
    // Verificar cada threshold
    for (const [metric, thresholds] of Object.entries(alertThresholds)) {
      const currentValue = metrics[metric];
      
      if (currentValue >= thresholds.critical) {
        await this.sendCriticalAlert(metric, currentValue);
      } else if (currentValue >= thresholds.warning) {
        await this.sendWarningAlert(metric, currentValue);
      }
    }
  }
  
  private async sendCriticalAlert(metric: string, value: number): Promise<void> {
    // Enviar para Discord, email, Slack, etc.
    await this.alertService.sendAlert({
      level: 'critical',
      title: `🚨 Security Alert: ${metric}`,
      message: `Critical threshold exceeded: ${value}`,
      timestamp: new Date().toISOString()
    });
  }
}
```

---

## 🔍 Logging de Segurança

### Eventos Logados

```typescript
// Todos os eventos de segurança são logados
const securityEvents = {
  // Autenticação
  'auth.login.success': { level: 'info', retention: '90d' },
  'auth.login.failure': { level: 'warn', retention: '1y' },
  'auth.token.expired': { level: 'info', retention: '30d' },
  'auth.token.invalid': { level: 'warn', retention: '1y' },
  
  // Autorização
  'authz.access.granted': { level: 'info', retention: '30d' },
  'authz.access.denied': { level: 'warn', retention: '1y' },
  'authz.privilege.escalation': { level: 'error', retention: '5y' },
  
  // Rate limiting
  'ratelimit.exceeded': { level: 'warn', retention: '90d' },
  'ratelimit.suspicious': { level: 'error', retention: '1y' },
  
  // Endpoints críticos
  'endpoint.critical.access': { level: 'info', retention: '1y' },
  'endpoint.admin.access': { level: 'info', retention: '1y' },
  
  // Segurança geral
  'security.violation': { level: 'error', retention: '5y' },
  'security.scan.malware': { level: 'error', retention: '5y' }
};
```

### Formato de Log Estruturado

```typescript
// Exemplo de log de segurança
{
  "timestamp": "2025-01-16T10:30:00.000Z",
  "level": "warn",
  "event": "auth.login.failure",
  "message": "Failed login attempt",
  "context": {
    "category": "SECURITY",
    "userId": "attempted_user_id",
    "ip": "192.168.1.100",
    "userAgent": "Mozilla/5.0...",
    "reason": "invalid_credentials",
    "attemptCount": 3,
    "metadata": {
      "endpoint": "/api/auth/login",
      "method": "POST",
      "geoLocation": "BR",
      "isSuspicious": true
    }
  },
  "correlationId": "req-123456789",
  "traceId": "trace-987654321"
}
```

---

## 🚀 Melhores Práticas Implementadas

### ✅ Autenticação e Autorização
- [x] JWT com expiração adequada
- [x] Refresh tokens seguros
- [x] Verificação de roles/permissões
- [x] Blacklist de tokens revogados
- [x] Rate limiting em endpoints de auth

### ✅ Proteção de Dados
- [x] Headers de segurança obrigatórios
- [x] Sanitização de inputs
- [x] Validação de tipos MIME
- [x] Criptografia de dados sensíveis
- [x] GDPR compliance

### ✅ Rate Limiting
- [x] Configurações específicas por endpoint
- [x] Rate limiting inteligente
- [x] Whitelist/Blacklist dinâmica
- [x] Monitoramento em tempo real

### ✅ Monitoramento
- [x] Logging estruturado de segurança
- [x] Métricas de segurança
- [x] Alertas automáticos
- [x] Dashboards de monitoramento

### ✅ Resposta a Incidentes
- [x] Alertas em tempo real
- [x] Logs detalhados para investigação
- [x] Procedimentos de bloqueio automático
- [x] Escalação de incidentes críticos

---

## 🔄 Próximas Melhorias

### 🎯 Curto Prazo (1-2 semanas)
- [ ] Implementar 2FA para admins
- [ ] Adicionar CAPTCHA em endpoints sensíveis
- [ ] Melhorar detecção de bots
- [ ] Implementar honeypots

### 🎯 Médio Prazo (1-2 meses)
- [ ] Integração com WAF (Web Application Firewall)
- [ ] Machine Learning para detecção de anomalias
- [ ] Audit logs completos
- [ ] Compliance LGPD/GDPR avançado

### 🎯 Longo Prazo (3-6 meses)
- [ ] Zero Trust Architecture
- [ ] Criptografia end-to-end
- [ ] Certificação de segurança
- [ ] Penetration testing regular

---

## 📞 Contatos de Segurança

### 🚨 Emergência
- **Security Team:** security@hawkesports.com
- **Discord:** #security-alerts
- **Phone:** +55 11 99999-9999 (24/7)

### 📋 Relatórios
- **Bug Bounty:** bounty@hawkesports.com
- **Vulnerabilidades:** vuln@hawkesports.com
- **Compliance:** compliance@hawkesports.com

---

**Classificação:** 🔒 CONFIDENCIAL  
**Última atualização:** 2025-01-16  
**Próxima revisão:** 2025-02-16  
**Aprovado por:** Security Team