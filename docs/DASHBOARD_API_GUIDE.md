# 🎛️ Guia de APIs do Dashboard - Hawk Esports Bot

**Data:** 2025-01-16  
**Versão:** 1.0  
**Status:** ✅ Completo

## 📋 Visão Geral

Este guia documenta especificamente as APIs utilizadas pelo dashboard web do Hawk Esports Bot, incluindo integração frontend-backend, WebSocket events e fluxos de dados.

### 🔗 Configuração do Dashboard
- **Frontend:** React + TypeScript + Vite
- **Backend API:** Express.js + Socket.IO
- **Base URL:** `http://localhost:3002` (dev) / `https://api.hawkesports.com` (prod)
- **WebSocket:** `ws://localhost:3002` (dev) / `wss://api.hawkesports.com` (prod)

---

## 🔧 Configuração do Cliente API

### ApiService Class
Localização: `dashboard/src/services/api.ts`

```typescript
class ApiService {
  private baseURL: string;
  private token: string | null = null;

  constructor() {
    this.baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';
  }

  // Configuração automática de headers
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token && { Authorization: `Bearer ${this.token}` }),
      ...options?.headers,
    };

    const response = await fetch(`${this.baseURL}/api${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    return response.json();
  }
}
```

---

## 🏠 Endpoints Principais do Dashboard

### 1. Autenticação e Usuário

#### `getCurrentUser()`
**Endpoint:** `GET /api/users/me`  
**Uso:** Obter dados do usuário logado

```typescript
// Frontend
const user = await apiService.getCurrentUser();

// Resposta
interface User {
  id: string;
  username: string;
  avatar: string;
  activeGuilds: Guild[];
  roles: string[];
  permissions: string[];
}
```

### 2. Estatísticas da Guild

#### `getGuildStats(guildId: string)`
**Endpoint:** `GET /api/dev/stats/${guildId}` (temporário)  
**Uso:** Dashboard principal com métricas

```typescript
// Frontend
const stats = await apiService.getGuildStats('123456789');

// Interface
interface GuildStats {
  members: {
    total: number;
    active: number;
    new_this_week: number;
  };
  activity: {
    messages_today: number;
    commands_used: number;
    voice_minutes: number;
  };
  features: {
    music_sessions: number;
    games_played: number;
    clips_submitted: number;
  };
}
```

### 3. Informações da Guild

#### `getGuild(guildId: string)`
**Endpoint:** `GET /api/dev/guild/${guildId}` (temporário)  
**Uso:** Configurações e informações básicas

```typescript
// Frontend
const guild = await apiService.getGuild('123456789');

// Interface
interface Guild {
  id: string;
  name: string;
  icon: string;
  memberCount: number;
  settings: {
    prefix: string;
    language: string;
    welcomeChannel: string;
  };
  features: string[];
}
```

---

## 🎖️ Sistema de Badges

### `getUserBadges(userId: string)`
**Endpoint:** `GET /api/badges/user/${userId}`  
**Uso:** Exibir badges do usuário no perfil

```typescript
const badges = await apiService.getUserBadges('123456789');

// Estrutura de resposta
interface UserBadge {
  badgeId: string;
  earnedAt: string;
  badge: {
    name: string;
    icon: string;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    description: string;
  };
}
```

### `getAllBadges()`
**Endpoint:** `GET /api/badges`  
**Uso:** Lista completa de badges disponíveis

---

## 📍 Sistema de Presença

### `getUserPresenceStats(userId: string)`
**Endpoint:** `GET /api/presence/stats/${userId}`  
**Uso:** Estatísticas de presença no dashboard

```typescript
const presenceStats = await apiService.getUserPresenceStats('123456789');

// Interface
interface PresenceStats {
  totalSessions: number;
  totalTime: number; // em segundos
  averageSession: number;
  currentStreak: number;
  longestStreak: number;
  thisWeek: {
    sessions: number;
    time: number;
  };
}
```

---

## 🎮 Jogos Ativos

### `getActiveGames(guildId: string)`
**Endpoint:** `GET /api/games/active/${guildId}`  
**Uso:** Widget de jogos ativos no dashboard

```typescript
const activeGames = await apiService.getActiveGames('123456789');

// Interface
interface ActiveGame {
  id: string;
  type: 'quiz' | 'minigame' | 'challenge';
  title: string;
  participants: number;
  status: 'active' | 'waiting' | 'finished';
  startedAt: string;
  endsAt: string;
}
```

---

## 🎬 Sistema de Clipes

### `getClips(guildId, status?, limit?, offset?)`
**Endpoint:** `GET /api/clips/${guildId}`  
**Uso:** Gerenciamento de clipes no dashboard

```typescript
// Buscar clipes pendentes
const pendingClips = await apiService.getClips('123456789', 'pending', 10, 0);

// Interface
interface Clip {
  id: string;
  title: string;
  description: string;
  url: string;
  submittedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  votes: number;
  thumbnail?: string;
}
```

---

## 🛠️ Comandos do Bot

### `getCommands()`
**Endpoint:** `GET /api/dev/commands`  
**Uso:** Painel de comandos e estatísticas

```typescript
const commands = await apiService.getCommands();

// Interface
interface BotCommand {
  name: string;
  description: string;
  category: 'GENERAL' | 'MUSIC' | 'GAMES' | 'ADMIN';
  usage_count: number;
  success_rate: number;
  avg_response_time: number;
  last_used?: string;
}
```

---

## 🔍 Health Check

### `healthCheck()`
**Endpoint:** `GET /health`  
**Uso:** Monitoramento de status do sistema

```typescript
const health = await apiService.healthCheck();

// Interface
interface HealthStatus {
  success: boolean;
  data: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    uptime: number;
    version: string;
    services: {
      database: 'healthy' | 'degraded' | 'unhealthy';
      discord: 'healthy' | 'degraded' | 'unhealthy';
      cache: 'healthy' | 'degraded' | 'unhealthy';
    };
  };
}
```

---

## 🔄 WebSocket Events

### Configuração do Socket.IO
```typescript
// Frontend - Conexão WebSocket
import { io } from 'socket.io-client';

const socket = io(import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002', {
  auth: {
    token: localStorage.getItem('auth_token')
  }
});
```

### Eventos Disponíveis

#### 1. Dashboard Updates
```typescript
// Subscrever atualizações do dashboard
socket.emit('dashboard:subscribe', { guildId: '123456789' });

// Receber atualizações
socket.on('dashboard:update', (data) => {
  console.log('Dashboard update:', data);
  // data.type: 'stats' | 'members' | 'activity'
  // data.data: dados atualizados
});
```

#### 2. Real-time Notifications
```typescript
// Notificações em tempo real
socket.on('notification', (notification) => {
  // notification.type: 'info' | 'success' | 'warning' | 'error'
  // notification.message: string
  // notification.data?: any
});
```

#### 3. Command Execution
```typescript
// Monitorar execução de comandos
socket.on('command:executed', (data) => {
  // data.command: string
  // data.user: string
  // data.success: boolean
  // data.responseTime: number
});
```

#### 4. Music Events
```typescript
// Eventos de música
socket.on('music:track_changed', (track) => {
  // Atualizar player no dashboard
});

socket.on('music:queue_updated', (queue) => {
  // Atualizar fila de música
});
```

---

## 🎨 Componentes do Dashboard

### 1. StatsWidget
```typescript
interface StatsWidgetProps {
  guildId: string;
  refreshInterval?: number; // ms, padrão: 30000
}

// Uso
<StatsWidget guildId="123456789" refreshInterval={60000} />
```

### 2. UserProfile
```typescript
interface UserProfileProps {
  userId: string;
  showBadges?: boolean;
  showPresence?: boolean;
}

// Uso
<UserProfile userId="123456789" showBadges={true} showPresence={true} />
```

### 3. ClipsManager
```typescript
interface ClipsManagerProps {
  guildId: string;
  moderatorMode?: boolean;
}

// Uso
<ClipsManager guildId="123456789" moderatorMode={true} />
```

---

## 🔐 Autenticação no Dashboard

### Fluxo de Login
1. **Redirecionamento para Discord OAuth**
```typescript
const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=identify%20guilds`;
window.location.href = discordAuthUrl;
```

2. **Callback e Troca de Token**
```typescript
// No callback (/auth/callback)
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');

if (code) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      code, 
      redirect_uri: window.location.origin + '/auth/callback' 
    })
  });
  
  const { token } = await response.json();
  localStorage.setItem('auth_token', token);
  apiService.setToken(token);
}
```

3. **Middleware de Autenticação**
```typescript
// Verificar token em cada requisição
apiService.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Tratar expiração de token
apiService.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

---

## 📊 Tratamento de Erros

### Error Boundaries
```typescript
class ApiErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('API Error:', error, errorInfo);
    // Enviar erro para serviço de monitoramento
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

### Retry Logic
```typescript
class ApiService {
  private async requestWithRetry<T>(
    endpoint: string, 
    options?: RequestInit, 
    maxRetries = 3
  ): Promise<T> {
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await this.request<T>(endpoint, options);
      } catch (error) {
        if (i === maxRetries || error.status === 401 || error.status === 403) {
          throw error;
        }
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }
}
```

---

## 🚀 Performance e Otimização

### 1. Caching
```typescript
class ApiService {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutos

  private getCachedData<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  private setCachedData(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }
}
```

### 2. Debouncing
```typescript
import { debounce } from 'lodash';

// Debounce para busca em tempo real
const debouncedSearch = debounce(async (query: string) => {
  const results = await apiService.searchUsers(query);
  setSearchResults(results);
}, 300);
```

### 3. Lazy Loading
```typescript
// Componentes lazy
const StatsWidget = lazy(() => import('./components/StatsWidget'));
const ClipsManager = lazy(() => import('./components/ClipsManager'));

// Uso com Suspense
<Suspense fallback={<LoadingSpinner />}>
  <StatsWidget guildId={guildId} />
</Suspense>
```

---

## 🔧 Configuração de Desenvolvimento

### Variáveis de Ambiente
```env
# .env.development
VITE_API_BASE_URL=http://localhost:3002
VITE_WS_URL=ws://localhost:3002
VITE_DISCORD_CLIENT_ID=your_discord_client_id
VITE_ENVIRONMENT=development
```

### Proxy de Desenvolvimento
```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false
      },
      '/socket.io': {
        target: 'http://localhost:3002',
        ws: true
      }
    }
  }
});
```

---

## 📝 Checklist de Integração

### ✅ Backend
- [x] Endpoints de API implementados
- [x] Autenticação JWT configurada
- [x] WebSocket events configurados
- [x] Rate limiting implementado
- [x] CORS configurado
- [x] Logging estruturado

### ✅ Frontend
- [x] ApiService implementado
- [x] Autenticação OAuth Discord
- [x] WebSocket client configurado
- [x] Error boundaries implementados
- [x] Loading states
- [x] Retry logic

### 🔄 Próximos Passos
- [ ] Migrar endpoints `/dev/*` para rotas definitivas
- [ ] Implementar cache Redis no backend
- [ ] Adicionar testes E2E
- [ ] Configurar CI/CD para dashboard
- [ ] Implementar PWA features

---

## 🤝 Suporte

Para dúvidas sobre integração do dashboard:
- 📧 Email: frontend@hawkesports.com
- 💬 Discord: #dashboard-dev
- 📖 Docs: [Dashboard Wiki]

---

**Última atualização:** 2025-01-16  
**Próxima revisão:** 2025-02-01