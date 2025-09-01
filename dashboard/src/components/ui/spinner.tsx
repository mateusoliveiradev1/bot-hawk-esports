import React from 'react';
import { cn } from '../../lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
};

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', className }) => {
  return (
    <div
      className={cn(
        'animate-spin rounded-full border-2 border-muted border-t-primary',
        sizeClasses[size],
        className,
      )}
    />
  );
};

export const LoadingDots: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn('flex space-x-1', className)}>
      <div className="h-2 w-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
      <div className="h-2 w-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
      <div className="h-2 w-2 bg-primary rounded-full animate-bounce"></div>
    </div>
  );
};

export const PulseLoader: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn('flex space-x-2', className)}>
      <div className="h-3 w-3 bg-primary rounded-full animate-pulse"></div>
      <div className="h-3 w-3 bg-primary rounded-full animate-pulse [animation-delay:0.2s]"></div>
      <div className="h-3 w-3 bg-primary rounded-full animate-pulse [animation-delay:0.4s]"></div>
    </div>
  );
};