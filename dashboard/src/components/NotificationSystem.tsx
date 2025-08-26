import React, { useState, useEffect } from 'react';
import { Bell, X, AlertTriangle, Info, Users, Music, Trophy } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';

interface Notification {
  id: string;
  type: 'success' | 'warning' | 'info' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  icon?: React.ReactNode;
  autoClose?: boolean;
}

interface NotificationSystemProps {
  guildId: string;
}

const NotificationSystem: React.FC<NotificationSystemProps> = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // WebSocket connection for real-time notifications
  const { lastMessage } = useWebSocket('http://localhost:3002', {
    onOpen: () => {
      console.log('Notification WebSocket connected');
    },
  });

  // Handle incoming notification messages
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'notification') {
      const notificationData = lastMessage.data;
      
      const newNotification: Notification = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: notificationData.type || 'info',
        title: notificationData.title,
        message: notificationData.message,
        timestamp: new Date(),
        icon: getNotificationIcon(notificationData.category),
        autoClose: notificationData.autoClose !== false,
      };

      setNotifications(prev => [newNotification, ...prev.slice(0, 9)]); // Keep only 10 notifications

      // Auto-close notification after 5 seconds if enabled
      if (newNotification.autoClose) {
        setTimeout(() => {
          removeNotification(newNotification.id);
        }, 5000);
      }
    }
  }, [lastMessage]);

  // Simulate some notifications for demo purposes
  useEffect(() => {
    const simulateNotifications = () => {
      const demoNotifications = [
        {
          type: 'success' as const,
          title: 'Novo Membro',
          message: 'Um novo usuário entrou no servidor!',
          category: 'user',
        },
        {
          type: 'info' as const,
          title: 'Música Tocando',
          message: 'Agora tocando: "Imagine Dragons - Believer"',
          category: 'music',
        },
        {
          type: 'success' as const,
          title: 'Conquista Desbloqueada',
          message: 'Usuário @João desbloqueou o badge "Veterano"',
          category: 'achievement',
        },
        {
          type: 'warning' as const,
          title: 'Moderação',
          message: 'Mensagem removida por conteúdo inadequado',
          category: 'moderation',
        },
      ];

      const randomNotification = demoNotifications[Math.floor(Math.random() * demoNotifications.length)];
      
      const newNotification: Notification = {
        id: Date.now().toString(),
        type: randomNotification.type,
        title: randomNotification.title,
        message: randomNotification.message,
        timestamp: new Date(),
        icon: getNotificationIcon(randomNotification.category),
        autoClose: true,
      };

      setNotifications(prev => [newNotification, ...prev.slice(0, 9)]);

      setTimeout(() => {
        removeNotification(newNotification.id);
      }, 5000);
    };

    // Simulate notifications every 15 seconds
    const interval = setInterval(simulateNotifications, 15000);
    
    // Add initial notification
    setTimeout(simulateNotifications, 2000);

    return () => clearInterval(interval);
  }, []);

  const getNotificationIcon = (category: string) => {
    switch (category) {
      case 'user':
        return <Users className="w-4 h-4" />;
      case 'music':
        return <Music className="w-4 h-4" />;
      case 'achievement':
        return <Trophy className="w-4 h-4" />;
      case 'moderation':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const getNotificationColor = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-500';
      case 'warning':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-blue-500';
    }
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const unreadCount = notifications.length;

  return (
    <div className="relative">
      {/* Notification Bell */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-white transition-colors duration-200"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <div className="absolute right-0 top-12 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
          <div className="p-4 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-white font-semibold">Notificações</h3>
            <div className="flex items-center gap-2">
              {notifications.length > 0 && (
                <button
                  onClick={clearAllNotifications}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Limpar todas
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-400">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Nenhuma notificação</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="p-4 border-b border-gray-700 last:border-b-0 hover:bg-gray-750 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-1 rounded-full ${getNotificationColor(notification.type)} text-white flex-shrink-0`}>
                      {notification.icon || <Info className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-medium text-sm">
                        {notification.title}
                      </h4>
                      <p className="text-gray-300 text-sm mt-1">
                        {notification.message}
                      </p>
                      <p className="text-gray-500 text-xs mt-2">
                        {notification.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                    <button
                      onClick={() => removeNotification(notification.id)}
                      className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationSystem;