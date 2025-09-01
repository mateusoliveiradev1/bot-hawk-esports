# 📚 Documentação das APIs - Hawk Esports Bot

**Data:** 2025-01-16  
**Versão:** 1.0  
**Status:** ✅ Completo

## 📋 Visão Geral

Esta documentação descreve todos os endpoints da API do Hawk Esports Bot, incluindo endpoints do dashboard, APIs críticas e rotas de desenvolvimento.

### 🔗 Base URL
- **Produção:** `https://api.hawkesports.com`
- **Desenvolvimento:** `http://localhost:3002`

### 🔐 Autenticação
A maioria dos endpoints requer autenticação via JWT token no header:
```
Authorization: Bearer <jwt_token>
```

---

## 🏠 Endpoints Públicos

### GET `/`
**Descrição:** Endpoint raiz da API com informações básicas

**Resposta:**
```json
{
  "success": true,
  "message": "Hawk Esports Bot API",
  "version": "1.0.0",
  "endpoints": {
    "health": "/health",
    "auth": "/api/auth",
    "users": "/api/users",
    "rankings": "/api/rankings",
    "badges": "/api/badges",
    "presence": "/api/presence",
    "music": "/api/music",
    "games": "/api/games",
    "clips": "/api/clips",
    "guilds": "/api/guilds",
    "stats": "/api/stats"
  }
}
```

### GET `/health`
**Descrição:** Health check do sistema

**Resposta (Healthy):**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-01-16T10:00:00.000Z",
    "uptime": 3600,
    "version": "1.0.0",
    "services": {
      "database": "healthy",
      "discord": "healthy",
      "cache": "healthy"
    }
  }
}
```

### GET `/metrics`
**Descrição:** Métricas do sistema em formato JSON

**Resposta:**
```json
{
  "success": true,
  "data": {
    "system": {
      "memory": {
        "used": 134217728,
        "total": 1073741824,
        "percentage": 12.5
      },
      "cpu": {
        "usage": 15.2
      }
    },
    "application": {
      "requests_total": 1250,
      "errors_total": 5,
      "response_time_avg": 125.5
    },
    "timestamp": "2025-01-16T10:00:00.000Z"
  }
}
```

---

## 🔐 Endpoints de Autenticação

### POST `/api/auth/login`
**Descrição:** Login via Discord OAuth

**Body:**
```json
{
  "code": "discord_oauth_code",
  "redirect_uri": "http://localhost:3000/callback"
}
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "token": "jwt_token_here",
    "user": {
      "id": "123456789",
      "username": "user#1234",
      "avatar": "avatar_hash",
      "roles": ["Member"]
    }
  }
}
```

### POST `/api/auth/refresh`
**Descrição:** Renovar token JWT

**Headers:** `Authorization: Bearer <refresh_token>`

**Resposta:**
```json
{
  "success": true,
  "data": {
    "token": "new_jwt_token",
    "expires_in": 3600
  }
}
```

---

## 👤 Endpoints de Usuários

### GET `/api/users/me`
**Descrição:** Obter dados do usuário atual
**Autenticação:** Requerida

**Resposta:**
```json
{
  "success": true,
  "data": {
    "id": "123456789",
    "username": "user#1234",
    "avatar": "avatar_hash",
    "activeGuilds": [
      {
        "id": "guild_id",
        "name": "Guild Name",
        "icon": "guild_icon",
        "joinedAt": "2025-01-01T00:00:00.000Z",
        "isActive": true
      }
    ],
    "roles": ["Member", "Verified"],
    "permissions": ["READ_MESSAGES", "SEND_MESSAGES"]
  }
}
```

---

## 🏆 Endpoints de Rankings

### GET `/api/rankings/:guildId`
**Descrição:** Obter ranking de XP da guild
**Autenticação:** Requerida

**Parâmetros:**
- `guildId` (string): ID da guild
- `limit` (query, opcional): Limite de resultados (padrão: 10)
- `offset` (query, opcional): Offset para paginação (padrão: 0)

**Resposta:**
```json
{
  "success": true,
  "data": {
    "rankings": [
      {
        "position": 1,
        "userId": "123456789",
        "username": "TopPlayer#1234",
        "avatar": "avatar_hash",
        "xp": 15000,
        "level": 25,
        "messages": 1250
      }
    ],
    "total": 150,
    "page": 1,
    "totalPages": 15
  }
}
```

---

## 🎖️ Endpoints de Badges

### GET `/api/badges`
**Descrição:** Listar todos os badges disponíveis
**Autenticação:** Requerida

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "early_adopter",
      "name": "Early Adopter",
      "description": "Usuário pioneiro do sistema",
      "icon": "🌟",
      "rarity": "legendary",
      "requirements": {
        "type": "date",
        "value": "2025-01-01"
      }
    }
  ]
}
```

### GET `/api/badges/user/:userId`
**Descrição:** Obter badges de um usuário
**Autenticação:** Requerida

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "badgeId": "early_adopter",
      "earnedAt": "2025-01-01T00:00:00.000Z",
      "badge": {
        "name": "Early Adopter",
        "icon": "🌟",
        "rarity": "legendary"
      }
    }
  ]
}
```

---

## 📍 Endpoints de Presença

### POST `/api/presence/checkin`
**Descrição:** Fazer check-in de presença
**Autenticação:** Requerida

**Resposta:**
```json
{
  "success": true,
  "message": "Check-in realizado com sucesso!",
  "data": {
    "sessionId": "session_id",
    "checkedInAt": "2025-01-16T10:00:00.000Z",
    "streak": 5
  }
}
```

### POST `/api/presence/checkout`
**Descrição:** Fazer check-out de presença
**Autenticação:** Requerida

**Resposta:**
```json
{
  "success": true,
  "message": "Check-out realizado com sucesso!",
  "data": {
    "sessionId": "session_id",
    "checkedOutAt": "2025-01-16T12:00:00.000Z",
    "duration": 7200,
    "xpEarned": 50
  }
}
```

### GET `/api/presence/stats/:userId`
**Descrição:** Obter estatísticas de presença
**Autenticação:** Requerida

**Resposta:**
```json
{
  "success": true,
  "data": {
    "totalSessions": 25,
    "totalTime": 180000,
    "averageSession": 7200,
    "currentStreak": 5,
    "longestStreak": 12,
    "thisWeek": {
      "sessions": 5,
      "time": 36000
    }
  }
}
```

---

## 🎵 Endpoints de Música

### GET `/api/music/queue/:guildId`
**Descrição:** Obter fila de música da guild
**Autenticação:** Requerida

**Resposta:**
```json
{
  "success": true,
  "data": {
    "current": {
      "title": "Song Title",
      "artist": "Artist Name",
      "duration": 240,
      "requestedBy": "user#1234",
      "position": 120
    },
    "queue": [
      {
        "title": "Next Song",
        "artist": "Next Artist",
        "duration": 180,
        "requestedBy": "user#5678"
      }
    ],
    "isPlaying": true,
    "volume": 50
  }
}
```

---

## 🎮 Endpoints de Jogos

### GET `/api/games/active/:guildId`
**Descrição:** Obter jogos ativos na guild
**Autenticação:** Requerida

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "game_id",
      "type": "quiz",
      "title": "Quiz Diário",
      "participants": 5,
      "status": "active",
      "startedAt": "2025-01-16T10:00:00.000Z",
      "endsAt": "2025-01-16T11:00:00.000Z"
    }
  ]
}
```

---

## 🎬 Endpoints de Clipes

### GET `/api/clips/:guildId`
**Descrição:** Obter clipes da guild
**Autenticação:** Requerida

**Parâmetros de Query:**
- `status` (opcional): Filtrar por status (pending, approved, rejected)
- `limit` (opcional): Limite de resultados (padrão: 20)
- `offset` (opcional): Offset para paginação (padrão: 0)

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "clip_id",
      "title": "Amazing Play",
      "description": "Epic moment in the game",
      "url": "https://clips.twitch.tv/clip_id",
      "submittedBy": "user#1234",
      "status": "approved",
      "submittedAt": "2025-01-16T10:00:00.000Z",
      "votes": 15
    }
  ],
  "pagination": {
    "total": 50,
    "page": 1,
    "totalPages": 3
  }
}
```

---

## 🏛️ Endpoints Administrativos

### GET `/api/guilds/:guildId`
**Descrição:** Obter informações da guild
**Autenticação:** Requerida (Moderador+)

**Resposta:**
```json
{
  "success": true,
  "data": {
    "id": "guild_id",
    "name": "Guild Name",
    "icon": "guild_icon",
    "memberCount": 150,
    "settings": {
      "prefix": "!",
      "language": "pt-BR",
      "welcomeChannel": "channel_id"
    },
    "features": ["MUSIC", "RANKINGS", "BADGES"]
  }
}
```

### GET `/api/stats/:guildId`
**Descrição:** Obter estatísticas da guild
**Autenticação:** Requerida (Moderador+)

**Resposta:**
```json
{
  "success": true,
  "data": {
    "members": {
      "total": 150,
      "active": 75,
      "new_this_week": 5
    },
    "activity": {
      "messages_today": 250,
      "commands_used": 45,
      "voice_minutes": 1200
    },
    "features": {
      "music_sessions": 8,
      "games_played": 12,
      "clips_submitted": 3
    }
  }
}
```

---

## 🛠️ Endpoints de Desenvolvimento

> **Nota:** Disponíveis apenas em modo de desenvolvimento

### GET `/api/dev/commands`
**Descrição:** Listar todos os comandos do bot

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "name": "ping",
      "description": "Verifica latência do bot",
      "category": "GENERAL",
      "usage_count": 150,
      "success_rate": 99.5,
      "avg_response_time": 125
    }
  ]
}
```

### GET `/api/dev/stats/:guildId`
**Descrição:** Estatísticas detalhadas para desenvolvimento

### GET `/api/dev/guild/:guildId`
**Descrição:** Informações detalhadas da guild para desenvolvimento

---

## 📊 Rate Limiting

Todos os endpoints possuem rate limiting configurado:

| Categoria | Limite | Janela |
|-----------|--------|--------|
| Geral | 100 req | 15 min |
| Autenticação | 5 req | 15 min |
| Upload | 10 req | 15 min |
| API PUBG | 30 req | 1 min |
| Admin | 50 req | 15 min |
| WebSocket | 20 req | 1 min |
| Comandos Bot | 60 req | 1 min |
| Desenvolvimento | 100 req | 1 min |

### Headers de Rate Limit
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642348800
```

---

## ❌ Códigos de Erro

### Códigos HTTP Padrão
- `200` - Sucesso
- `201` - Criado com sucesso
- `400` - Requisição inválida
- `401` - Não autorizado
- `403` - Proibido
- `404` - Não encontrado
- `429` - Rate limit excedido
- `500` - Erro interno do servidor

### Formato de Erro
```json
{
  "success": false,
  "error": "Mensagem de erro",
  "code": "ERROR_CODE",
  "details": {
    "field": "Detalhes específicos"
  }
}
```

### Códigos de Erro Específicos
- `INVALID_TOKEN` - Token JWT inválido
- `INSUFFICIENT_PERMISSIONS` - Permissões insuficientes
- `RATE_LIMIT_EXCEEDED` - Rate limit excedido
- `GUILD_NOT_FOUND` - Guild não encontrada
- `USER_NOT_FOUND` - Usuário não encontrado
- `FEATURE_DISABLED` - Funcionalidade desabilitada

---

## 🔒 Segurança

### Headers de Segurança
Todos os endpoints incluem headers de segurança:
```
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### Cache Control
Endpoints sensíveis (`/api/auth`, `/api/user`) incluem:
```
Cache-Control: no-store, no-cache, must-revalidate
Pragma: no-cache
Expires: 0
```

### CORS
Configurado para aceitar apenas origens autorizadas com credenciais.

---

## 📝 Changelog

### v1.0.0 (2025-01-16)
- ✅ Documentação inicial completa
- ✅ Todos os endpoints principais documentados
- ✅ Exemplos de requisição e resposta
- ✅ Códigos de erro e rate limiting
- ✅ Configurações de segurança

---

## 🤝 Suporte

Para dúvidas sobre a API:
- 📧 Email: dev@hawkesports.com
- 💬 Discord: [Servidor de Desenvolvimento]
- 📖 Wiki: [Link para Wiki]

---

**Última atualização:** 2025-01-16  
**Próxima revisão:** 2025-02-16