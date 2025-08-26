import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp?: string;
}

interface UseWebSocketOptions {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  reconnectAttempts?: number;
  reconnectInterval?: number;
}

/**
 * Generic WebSocket hook using Socket.IO
 */
export function useWebSocket<T = any>(
  url: string,
  options: UseWebSocketOptions = {}
) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const {
    onOpen,
    onClose,
    onError,
    reconnectAttempts = 5,
    reconnectInterval = 3000,
  } = options;

  const connect = useCallback(() => {
    try {
      const socket = io(url, {
        transports: ['websocket', 'polling'],
        timeout: 5000,
      });

      socket.on('connect', () => {
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        onOpen?.();
      });

      socket.on('disconnect', () => {
        setIsConnected(false);
        onClose?.();
      });

      socket.on('connect_error', (err) => {
        setError(`Connection error: ${err.message}`);
        onError?.(err as any);
        attemptReconnect();
      });

      socket.on('dashboard:update', (message: WebSocketMessage) => {
        setLastMessage(message);
      });

      socketRef.current = socket;
    } catch (err) {
      setError('Failed to connect to WebSocket');
      onError?.(err as Event);
      attemptReconnect();
    }
  }, [url, onOpen, onClose, onError]);

  const attemptReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current < reconnectAttempts) {
      reconnectAttemptsRef.current++;
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, reconnectInterval);
    }
  }, [connect, reconnectAttempts, reconnectInterval]);

  const sendMessage = useCallback((event: string, data: any) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit(event, data);
    }
  }, [isConnected]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  return {
    isConnected,
    lastMessage,
    error,
    sendMessage,
    disconnect,
  };
}

// Hook específico para o dashboard
export function useDashboardWebSocket(guildId: string) {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  const { isConnected, connectionStatus, sendMessage } = useWebSocket({
    url: `ws://localhost:3001/ws?guildId=${guildId}`,
    onMessage: (message) => {
      switch (message.type) {
        case 'stats_update':
          setStats(message.data);
          break;
        case 'user_update':
          setUsers(prev => {
            const index = prev.findIndex(u => u.id === message.data.id);
            if (index >= 0) {
              const newUsers = [...prev];
              newUsers[index] = message.data;
              return newUsers;
            }
            return [...prev, message.data];
          });
          break;
        case 'user_activity':
          setActivities(prev => [message.data, ...prev.slice(0, 49)]); // Keep last 50 activities
          break;
        case 'initial_data':
          setStats(message.data.stats);
          setUsers(message.data.users);
          setActivities(message.data.activities || []);
          break;
        default:
          console.log('Unknown message type:', message.type);
      }
    },
    onConnect: () => {
      console.log('Dashboard WebSocket connected');
      // Request initial data
      sendMessage({ type: 'subscribe', guildId });
    },
    onDisconnect: () => {
      console.log('Dashboard WebSocket disconnected');
    },
    onError: (error) => {
      console.error('Dashboard WebSocket error:', error);
    }
  });

  return {
    isConnected,
    connectionStatus,
    stats,
    users,
    activities,
    sendMessage
  };
}