import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiService } from '../services/api';

interface User {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  guildId: string;
  roles: string[];
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (code: string, guildId: string) => Promise<boolean>;
  logout: () => void;
  refreshToken: () => Promise<boolean>;
  validateSession: () => Promise<boolean>;
  clearAllSessions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;

  const logout = () => {
    setUser(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    apiService.setToken('');
  };

  const refreshToken = async (): Promise<boolean> => {
    try {
      const storedRefreshToken = localStorage.getItem('refresh_token');
      if (!storedRefreshToken) {
        return false;
      }

      const response = await fetch('http://localhost:3002/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      
      if (data.success) {
        localStorage.setItem('auth_token', data.data.token);
        apiService.setToken(data.data.token);
        // Update refresh token if provided
        if (data.data.refreshToken) {
          localStorage.setItem('refresh_token', data.data.refreshToken);
        }
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Token refresh error:', error);
      logout(); // Clear invalid tokens
      return false;
    }
  };

  // Check for existing token on mount
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('auth_token');
      if (token) {
        apiService.setToken(token);
        try {
          // Verify token by fetching user data
          const userData = await apiService.getCurrentUser();
          // Ensure userData has all required properties
          const completeUserData: User = {
            ...userData,
            guildId: (userData as any).guildId || '',
            roles: (userData as any).roles || [],
            permissions: (userData as any).permissions || []
          };
          setUser(completeUserData);
        } catch (error) {
          console.error('Token validation failed:', error);
          // Try to refresh token before giving up
          const storedRefreshToken = localStorage.getItem('refresh_token');
          if (storedRefreshToken) {
            try {
              const response = await fetch('http://localhost:3002/api/auth/refresh', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ refreshToken: storedRefreshToken }),
              });

              if (response.ok) {
                const data = await response.json();
                if (data.success) {
                  localStorage.setItem('auth_token', data.data.token);
                  apiService.setToken(data.data.token);
                  if (data.data.refreshToken) {
                    localStorage.setItem('refresh_token', data.data.refreshToken);
                  }
                  const userData = await apiService.getCurrentUser();
                  // Ensure userData has all required properties
                  const completeUserData: User = {
                    ...userData,
                    guildId: (userData as any).guildId || '',
                    roles: (userData as any).roles || [],
                    permissions: (userData as any).permissions || []
                  };
                  setUser(completeUserData);
                } else {
                  localStorage.removeItem('auth_token');
                  localStorage.removeItem('refresh_token');
                }
              } else {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('refresh_token');
              }
            } catch (refreshError) {
              console.error('Token refresh error:', refreshError);
              localStorage.removeItem('auth_token');
              localStorage.removeItem('refresh_token');
            }
          } else {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('refresh_token');
          }
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (code: string, guildId: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      
      // Exchange code for tokens
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
      const response = await fetch(`${apiUrl}/auth/discord`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, guildId }),
      });

      if (!response.ok) {
        throw new Error('Authentication failed');
      }

      const data = await response.json();
      
      if (data.success) {
        // Store tokens
        localStorage.setItem('auth_token', data.data.token);
        if (data.data.refreshToken) {
          localStorage.setItem('refresh_token', data.data.refreshToken);
        }

        // Update API service token
        apiService.setToken(data.data.token);

        // Set user data if provided, otherwise fetch it
        if (data.data.user) {
          setUser(data.data.user);
        } else {
          const userData = await apiService.getCurrentUser();
          // Ensure userData has all required properties
          const completeUserData: User = {
            ...userData,
            guildId: (userData as any).guildId || guildId,
            roles: (userData as any).roles || [],
            permissions: (userData as any).permissions || []
          };
          setUser(completeUserData);
        }
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };


  // Validate current session
  const validateSession = async (): Promise<boolean> => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return false;

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3002/api'}/auth/validate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.user) {
          setUser(data.user);
          return true;
        }
      }
      
      // Session invalid, clear local data
      logout();
      return false;
    } catch (error) {
      console.error('Session validation error:', error);
      logout();
      return false;
    }
  };

  // Clear all user sessions
  const clearAllSessions = async (): Promise<void> => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3002/api'}/auth/clear-sessions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });
      }
    } catch (error) {
      console.error('Clear sessions error:', error);
    } finally {
      logout();
    }
  };

  // Session validation on focus
  useEffect(() => {
    const handleFocus = () => {
      if (isAuthenticated) {
        validateSession();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isAuthenticated]);

  // Periodic session validation
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      validateSession();
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    refreshToken,
    validateSession,
    clearAllSessions,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};