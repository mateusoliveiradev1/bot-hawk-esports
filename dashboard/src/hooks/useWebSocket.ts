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
export function useWebSocket(url: string, options: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const { onOpen, onClose, onError, reconnectAttempts = 5, reconnectInterval = 3000 } = options;

  const connect = useCallback(() => {
    // Prevent multiple connections
    if (socketRef.current?.connected) {
      return;
    }

    try {
      const socket = io(url, {
        transports: ['websocket', 'polling'],
        timeout: 5000,
        forceNew: true,
      });

      socket.on('connect', () => {
        console.log('WebSocket connected successfully');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        onOpen?.();
      });

      socket.on('disconnect', reason => {
        console.log('WebSocket disconnected:', reason);
        setIsConnected(false);
        onClose?.();

        // Only attempt reconnect for certain disconnect reasons
        if (reason === 'io server disconnect' || reason === 'transport close') {
          attemptReconnect();
        }
      });

      socket.on('connect_error', err => {
        console.error('WebSocket connection error:', err.message);
        setError(`Connection error: ${err.message}`);
        onError?.(err as any);
        attemptReconnect();
      });

      socket.on('dashboard:update', (message: WebSocketMessage) => {
        setLastMessage(message);
      });

      socketRef.current = socket;
    } catch (err) {
      console.error('Failed to create WebSocket connection:', err);
      setError('Failed to connect to WebSocket');
      onError?.(err as Event);
      attemptReconnect();
    }
  }, [url]);

  const attemptReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current < reconnectAttempts) {
      reconnectAttemptsRef.current++;
      console.log(`Attempting reconnect ${reconnectAttemptsRef.current}/${reconnectAttempts}`);

      // Clear existing timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, reconnectInterval);
    } else {
      console.log('Max reconnection attempts reached');
      setError('Connection failed after maximum attempts');
    }
  }, [connect, reconnectAttempts, reconnectInterval]);

  const sendMessage = useCallback(
    (event: string, data: any) => {
      if (socketRef.current && isConnected) {
        socketRef.current.emit(event, data);
      }
    },
    [isConnected]
  );

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
    return () => {
      disconnect();
    };
  }, [url]);

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

  const { isConnected, lastMessage, sendMessage, error } = useWebSocket(
    import.meta.env.VITE_WS_URL || 'ws://localhost:3002',
    {
      onOpen: () => {
        console.log('Dashboard WebSocket connected');
        // Subscribe to dashboard updates for this guild
        sendMessage('subscribe:dashboard', guildId);
      },
      onClose: () => {
        console.log('Dashboard WebSocket disconnected');
      },
      onError: error => {
        console.error('Dashboard WebSocket error:', error);
      },
      reconnectAttempts: 3,
      reconnectInterval: 5000,
    }
  );

  // Handle incoming messages
  useEffect(() => {
    if (lastMessage) {
      switch (lastMessage.type) {
        case 'stats':
          setStats(lastMessage.data);
          break;
        case 'user_update':
          setUsers(prev => {
            const index = prev.findIndex(u => u.id === lastMessage.data.id);
            if (index >= 0) {
              const newUsers = [...prev];
              newUsers[index] = lastMessage.data;
              return newUsers;
            }
            return [...prev, lastMessage.data];
          });
          break;
        case 'user_activity':
          setActivities(prev => [lastMessage.data, ...prev.slice(0, 49)]); // Keep last 50 activities
          break;
        case 'initial_data':
          setStats(lastMessage.data.stats);
          setUsers(lastMessage.data.users);
          setActivities(lastMessage.data.activities || []);
          break;
        default:
          console.log('Unknown message type:', lastMessage.type);
      }
    }
  }, [lastMessage]);

  return {
    isConnected,
    error,
    stats,
    users,
    activities,
    sendMessage,
  };
}
