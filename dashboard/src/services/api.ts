const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface GuildStats {
  users: {
    total: number;
    active: number;
  };
  economy: {
    totalXP: number;
    totalCoins: number;
    totalMessages: number;
  };
  engagement: {
    badges: number;
    clips: number;
    presenceSessions: number;
    quizzes: number;
  };
}

interface User {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  level: number;
  totalXp: number;
  coins: number;
  lastSeen: string;
  joinedAt: string;
}

interface Guild {
  id: string;
  name: string;
  icon?: string;
  memberCount: number;
  config: any;
  users: Array<{
    user: User;
    isActive: boolean;
    joinedAt: string;
  }>;
}

class ApiService {
  private token: string | null = null;

  constructor() {
    // Initialize token from localStorage if available
    this.token = localStorage.getItem('auth_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async initializeAuth() {
    try {
      // For development, get a temporary token from the auth endpoint
      const response = await fetch(`${API_BASE_URL}/auth/discord`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: 'dev-code',
          guildId: 'mock-guild-id',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          this.setToken(data.data.token);
        }
      }
    } catch (error) {
      console.warn('Failed to get auth token, using mock token:', error);
      this.setToken('mock-token');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount = 0
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    // Ensure we have a token
    if (!this.token) {
      await this.initializeAuth();
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
        ...options.headers,
      },
    });

    if (!response.ok) {
      // If unauthorized, try to refresh token once
      if (response.status === 401 && retryCount === 0) {
        const refreshSuccess = await this.refreshToken();
        if (refreshSuccess) {
          // Retry the request with new token
          return this.request<T>(endpoint, options, retryCount + 1);
        }
      }

      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data: ApiResponse<T> = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'API request failed');
    }

    return data.data as T;
  }

  private async refreshToken(): Promise<boolean> {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        return false;
      }

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          this.setToken(data.data.token);
          if (data.data.refreshToken) {
            localStorage.setItem('refresh_token', data.data.refreshToken);
          }
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  }

  // Stats endpoints
  async getGuildStats(guildId: string): Promise<GuildStats> {
    // Use development endpoint for now
    return this.request<GuildStats>(`/dev/stats/${guildId}`);
  }

  // Guild endpoints
  async getGuild(guildId: string): Promise<Guild> {
    // Use development endpoint for now
    return this.request<Guild>(`/dev/guild/${guildId}`);
  }

  // User endpoints
  async getCurrentUser(): Promise<User> {
    return this.request<User>('/users/me');
  }

  // Badge endpoints
  async getUserBadges(userId: string): Promise<any[]> {
    return this.request<any[]>(`/badges/user/${userId}`);
  }

  async getAllBadges(): Promise<any[]> {
    return this.request<any[]>('/badges');
  }

  // Presence endpoints
  async getUserPresenceStats(userId: string): Promise<any> {
    return this.request<any>(`/presence/stats/${userId}`);
  }

  // Game endpoints
  async getActiveGames(guildId: string): Promise<any[]> {
    return this.request<any[]>(`/games/active/${guildId}`);
  }

  // Clips endpoints
  async getClips(guildId: string, status?: string, limit = 20, offset = 0): Promise<any[]> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
      ...(status && { status }),
    });
    return this.request<any[]>(`/clips/${guildId}?${params}`);
  }

  // Commands endpoints
  async getCommands(): Promise<any[]> {
    return this.request<any[]>('/dev/commands');
  }

  // Health check
  async healthCheck(): Promise<any> {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';
    const response = await fetch(`${baseUrl}/health`);
    return response.json();
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    const data = await this.request<T>(endpoint);
    return { success: true, data };
  }

  // Gamification API methods
  async getUserXP(userId: string, guildId: string): Promise<any> {
    return this.request(`/gamification/xp/${userId}/${guildId}`);
  }

  async getGuildXPOverview(guildId: string): Promise<any> {
    return this.request(`/gamification/xp/overview/${guildId}`);
  }

  async getRankings(
    guildId: string,
    type: 'overall' | 'weekly' | 'monthly' = 'overall',
    limit: number = 10
  ): Promise<any[]> {
    return this.request(`/gamification/rankings/${guildId}?type=${type}&limit=${limit}`);
  }

  async getActiveMiniGames(guildId: string): Promise<any[]> {
    return this.request(`/gamification/minigames/active/${guildId}`);
  }

  async getMiniGameStats(userId: string, guildId: string): Promise<any> {
    return this.request(`/gamification/minigames/stats/${userId}/${guildId}`);
  }

  async getUserAchievements(userId: string, guildId: string): Promise<any[]> {
    return this.request(`/gamification/achievements/${userId}/${guildId}`);
  }

  async getUserChallenges(userId: string, guildId: string): Promise<any[]> {
    return this.request(`/gamification/challenges/${userId}/${guildId}`);
  }

  async getGuildBadges(guildId: string, showProgress: boolean = false): Promise<any[]> {
    return this.request(`/gamification/badges/${guildId}?showProgress=${showProgress}`);
  }
}

export const apiService = new ApiService();
export type { GuildStats, User, Guild };
