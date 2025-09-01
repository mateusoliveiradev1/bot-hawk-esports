import React, { useState, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

interface FeedbackProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  duration?: number;
  onClose?: () => void;
  className?: string;
  showIcon?: boolean;
  closable?: boolean;
}

const feedbackConfig = {
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
};

// Componente de Alert animado
export const AnimatedAlert: React.FC<FeedbackProps> = ({
  type,
  title,
  message,
  duration,
  onClose,
  className,
  showIcon = true,
  closable = true,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const config = feedbackConfig[type];
  const Icon = config.icon;

  useEffect(() => {
    if (duration && duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration]);

  const handleClose = () => {
    setIsAnimating(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, 300);
  };

  if (!isVisible) {return null;}

  return (
    <div
      className={cn(
        'relative rounded-lg border p-4 transition-all duration-300 ease-in-out',
        config.bgColor,
        config.borderColor,
        isAnimating ? 'opacity-0 transform scale-95' : 'opacity-100 transform scale-100',
        className,
      )}
    >
      <div className="flex items-start space-x-3">
        {showIcon && (
          <Icon className={cn('h-5 w-5 mt-0.5 flex-shrink-0', config.iconColor)} />
        )}
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className={cn('text-sm font-semibold mb-1', config.textColor)}>
              {title}
            </h4>
          )}
          <p className={cn('text-sm', config.textColor)}>
            {message}
          </p>
        </div>
        {closable && (
          <button
            onClick={handleClose}
            className={cn(
              'flex-shrink-0 rounded-md p-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors',
              config.textColor,
            )}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

// Componente de Progress com feedback visual
interface ProgressFeedbackProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'error';
  showPercentage?: boolean;
  animated?: boolean;
  className?: string;
  label?: string;
}

export const ProgressFeedback: React.FC<ProgressFeedbackProps> = ({
  value,
  max = 100,
  size = 'md',
  variant = 'default',
  showPercentage = true,
  animated = true,
  className,
  label,
}) => {
  const percentage = Math.min((value / max) * 100, 100);
  
  const sizeClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4',
  };

  const variantClasses = {
    default: 'bg-primary',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500',
  };

  return (
    <div className={cn('space-y-2', className)}>
      {(label || showPercentage) && (
        <div className="flex justify-between items-center text-sm">
          {label && <span className="text-muted-foreground">{label}</span>}
          {showPercentage && (
            <span className="font-medium">{Math.round(percentage)}%</span>
          )}
        </div>
      )}
      <div className={cn(
        'w-full bg-muted rounded-full overflow-hidden',
        sizeClasses[size],
      )}>
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            variantClasses[variant],
            animated && 'animate-pulse',
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

// Componente de Status Badge animado
interface StatusBadgeProps {
  status: 'online' | 'offline' | 'busy' | 'away';
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  size = 'md',
  animated = true,
  className,
}) => {
  const statusConfig = {
    online: {
      color: 'bg-green-500',
      label: 'Online',
    },
    offline: {
      color: 'bg-gray-400',
      label: 'Offline',
    },
    busy: {
      color: 'bg-red-500',
      label: 'Ocupado',
    },
    away: {
      color: 'bg-yellow-500',
      label: 'Ausente',
    },
  };

  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };

  const config = statusConfig[status];

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <div className="relative">
        <div
          className={cn(
            'rounded-full',
            config.color,
            sizeClasses[size],
          )}
        />
        {animated && status === 'online' && (
          <div
            className={cn(
              'absolute inset-0 rounded-full animate-ping',
              config.color,
              'opacity-75',
            )}
          />
        )}
      </div>
      {label && (
        <span className="text-sm text-muted-foreground">
          {label || config.label}
        </span>
      )}
    </div>
  );
};

// Componente de Loading State com mensagem dinâmica
interface LoadingStateProps {
  messages: string[];
  interval?: number;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  messages,
  interval = 2000,
  className,
}) => {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  useEffect(() => {
    if (messages.length <= 1) {return;}

    const timer = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % messages.length);
    }, interval);

    return () => clearInterval(timer);
  }, [messages.length, interval]);

  return (
    <div className={cn('text-center space-y-4', className)}>
      <div className="flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-muted border-t-primary" />
      </div>
      <div className="min-h-[1.5rem]">
        <p className="text-sm text-muted-foreground animate-fade-in">
          {messages[currentMessageIndex]}
        </p>
      </div>
    </div>
  );
};

// Componente de Skeleton com efeito shimmer aprimorado
interface ShimmerSkeletonProps {
  className?: string;
  lines?: number;
  avatar?: boolean;
}

export const ShimmerSkeleton: React.FC<ShimmerSkeletonProps> = ({
  className,
  lines = 3,
  avatar = false,
}) => {
  return (
    <div className={cn('animate-pulse space-y-3', className)}>
      {avatar && (
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 bg-muted rounded-full" />
          <div className="space-y-2">
            <div className="h-4 bg-muted rounded w-24" />
            <div className="h-3 bg-muted rounded w-16" />
          </div>
        </div>
      )}
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className={cn(
              'h-4 bg-muted rounded',
              index === lines - 1 ? 'w-3/4' : 'w-full',
            )}
          />
        ))}
      </div>
    </div>
  );
};