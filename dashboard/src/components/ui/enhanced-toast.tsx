import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  persistent?: boolean;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useEnhancedToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useEnhancedToast must be used within a ToastProvider');
  }
  return context;
};

// Provider do sistema de toast
export const EnhancedToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration ?? 5000,
    };

    setToasts(prev => [...prev, newToast]);

    // Auto remove se não for persistente
    if (!toast.persistent && newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, newToast.duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearAll }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
};

// Container dos toasts
const ToastContainer: React.FC = () => {
  const { toasts } = useEnhancedToast();

  return (
    <div className='fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full'>
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
};

// Item individual do toast
const ToastItem: React.FC<{ toast: Toast }> = ({ toast }) => {
  const { removeToast } = useEnhancedToast();
  const [isVisible, setIsVisible] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    // Animação de entrada
    setTimeout(() => setIsVisible(true), 10);
  }, []);

  const handleRemove = () => {
    setIsRemoving(true);
    setTimeout(() => {
      removeToast(toast.id);
    }, 300);
  };

  const toastConfig = {
    success: {
      icon: CheckCircle,
      bgColor: 'bg-green-50 dark:bg-green-900/90',
      borderColor: 'border-green-200 dark:border-green-800',
      textColor: 'text-green-800 dark:text-green-200',
      iconColor: 'text-green-600 dark:text-green-400',
    },
    error: {
      icon: XCircle,
      bgColor: 'bg-red-50 dark:bg-red-900/90',
      borderColor: 'border-red-200 dark:border-red-800',
      textColor: 'text-red-800 dark:text-red-200',
      iconColor: 'text-red-600 dark:text-red-400',
    },
    warning: {
      icon: AlertCircle,
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/90',
      borderColor: 'border-yellow-200 dark:border-yellow-800',
      textColor: 'text-yellow-800 dark:text-yellow-200',
      iconColor: 'text-yellow-600 dark:text-yellow-400',
    },
    info: {
      icon: Info,
      bgColor: 'bg-blue-50 dark:bg-blue-900/90',
      borderColor: 'border-blue-200 dark:border-blue-800',
      textColor: 'text-blue-800 dark:text-blue-200',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
  };

  const config = toastConfig[toast.type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'transform transition-all duration-300 ease-in-out',
        isVisible && !isRemoving
          ? 'translate-x-0 opacity-100 scale-100'
          : 'translate-x-full opacity-0 scale-95'
      )}
    >
      <div
        className={cn(
          'rounded-lg border shadow-lg backdrop-blur-sm p-4',
          config.bgColor,
          config.borderColor
        )}
      >
        <div className='flex items-start space-x-3'>
          <Icon className={cn('h-5 w-5 mt-0.5 flex-shrink-0', config.iconColor)} />
          <div className='flex-1 min-w-0'>
            {toast.title && (
              <h4 className={cn('text-sm font-semibold mb-1', config.textColor)}>{toast.title}</h4>
            )}
            <p className={cn('text-sm', config.textColor)}>{toast.message}</p>
            {toast.action && (
              <button
                onClick={toast.action.onClick}
                className={cn(
                  'mt-2 text-xs font-medium underline hover:no-underline',
                  config.textColor
                )}
              >
                {toast.action.label}
              </button>
            )}
          </div>
          <button
            onClick={handleRemove}
            className={cn(
              'flex-shrink-0 rounded-md p-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors',
              config.textColor
            )}
          >
            <X className='h-4 w-4' />
          </button>
        </div>
      </div>
    </div>
  );
};

// Hook para facilitar o uso
export const toast = {
  success: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) => {
    const context = useContext(ToastContext);
    if (context) {
      context.addToast({ type: 'success', message, ...options });
    }
  },
  error: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) => {
    const context = useContext(ToastContext);
    if (context) {
      context.addToast({ type: 'error', message, ...options });
    }
  },
  warning: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) => {
    const context = useContext(ToastContext);
    if (context) {
      context.addToast({ type: 'warning', message, ...options });
    }
  },
  info: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message'>>) => {
    const context = useContext(ToastContext);
    if (context) {
      context.addToast({ type: 'info', message, ...options });
    }
  },
};

// Componente de notificação inline
interface InlineNotificationProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  className?: string;
  showIcon?: boolean;
  onClose?: () => void;
}

export const InlineNotification: React.FC<InlineNotificationProps> = ({
  type,
  title,
  message,
  className,
  showIcon = true,
  onClose,
}) => {
  const config = {
    success: {
      icon: CheckCircle,
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      borderColor: 'border-green-200 dark:border-green-800',
      textColor: 'text-green-800 dark:text-green-200',
      iconColor: 'text-green-600 dark:text-green-400',
    },
    error: {
      icon: XCircle,
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      borderColor: 'border-red-200 dark:border-red-800',
      textColor: 'text-red-800 dark:text-red-200',
      iconColor: 'text-red-600 dark:text-red-400',
    },
    warning: {
      icon: AlertCircle,
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
      borderColor: 'border-yellow-200 dark:border-yellow-800',
      textColor: 'text-yellow-800 dark:text-yellow-200',
      iconColor: 'text-yellow-600 dark:text-yellow-400',
    },
    info: {
      icon: Info,
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      borderColor: 'border-blue-200 dark:border-blue-800',
      textColor: 'text-blue-800 dark:text-blue-200',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
  }[type];

  const Icon = config.icon;

  return (
    <div className={cn('rounded-lg border p-4', config.bgColor, config.borderColor, className)}>
      <div className='flex items-start space-x-3'>
        {showIcon && <Icon className={cn('h-5 w-5 mt-0.5 flex-shrink-0', config.iconColor)} />}
        <div className='flex-1 min-w-0'>
          {title && <h4 className={cn('text-sm font-semibold mb-1', config.textColor)}>{title}</h4>}
          <p className={cn('text-sm', config.textColor)}>{message}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className={cn(
              'flex-shrink-0 rounded-md p-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors',
              config.textColor
            )}
          >
            <X className='h-4 w-4' />
          </button>
        )}
      </div>
    </div>
  );
};
