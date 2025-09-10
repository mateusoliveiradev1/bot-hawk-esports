import React from 'react';
import { cn } from '../../lib/utils';
import { Spinner, LoadingDots, PulseLoader } from './spinner';

interface LoadingOverlayProps {
  isLoading: boolean;
  children: React.ReactNode;
  className?: string;
  spinnerSize?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'spinner' | 'dots' | 'pulse';
  message?: string;
  blur?: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isLoading,
  children,
  className,
  spinnerSize = 'lg',
  variant = 'spinner',
  message,
  blur = true,
}) => {
  const renderLoader = () => {
    switch (variant) {
      case 'dots':
        return <LoadingDots className='scale-150' />;
      case 'pulse':
        return <PulseLoader className='scale-150' />;
      default:
        return <Spinner size={spinnerSize} />;
    }
  };

  return (
    <div className={cn('relative', className)}>
      {children}
      {isLoading && (
        <div className='absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm'>
          <div
            className={cn(
              'flex flex-col items-center space-y-4 p-6 rounded-lg bg-card border shadow-lg',
              blur && 'backdrop-blur-md'
            )}
          >
            {renderLoader()}
            {message && (
              <p className='text-sm text-muted-foreground text-center max-w-xs'>{message}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const FullPageLoader: React.FC<{
  message?: string;
  variant?: 'spinner' | 'dots' | 'pulse';
}> = ({ message = 'Carregando...', variant = 'spinner' }) => {
  const renderLoader = () => {
    switch (variant) {
      case 'dots':
        return <LoadingDots className='scale-150' />;
      case 'pulse':
        return <PulseLoader className='scale-150' />;
      default:
        return <Spinner size='xl' />;
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex flex-col items-center justify-center bg-background'>
      <div className='flex flex-col items-center space-y-6'>
        {renderLoader()}
        <div className='text-center space-y-2'>
          <h3 className='text-lg font-semibold text-foreground'>{message}</h3>
          <p className='text-sm text-muted-foreground'>Por favor, aguarde um momento...</p>
        </div>
      </div>
    </div>
  );
};

export const InlineLoader: React.FC<{
  size?: 'sm' | 'md' | 'lg';
  variant?: 'spinner' | 'dots' | 'pulse';
  message?: string;
  className?: string;
}> = ({ size = 'md', variant = 'spinner', message, className }) => {
  const renderLoader = () => {
    switch (variant) {
      case 'dots':
        return <LoadingDots />;
      case 'pulse':
        return <PulseLoader />;
      default:
        return <Spinner size={size} />;
    }
  };

  return (
    <div className={cn('flex items-center space-x-3', className)}>
      {renderLoader()}
      {message && <span className='text-sm text-muted-foreground'>{message}</span>}
    </div>
  );
};

export const ButtonLoader: React.FC<{
  isLoading: boolean;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}> = ({ isLoading, children, className, disabled }) => {
  return (
    <button
      className={cn('relative inline-flex items-center justify-center', className)}
      disabled={disabled || isLoading}
    >
      {isLoading && (
        <div className='absolute inset-0 flex items-center justify-center'>
          <Spinner size='sm' />
        </div>
      )}
      <span className={cn(isLoading && 'opacity-0')}>{children}</span>
    </button>
  );
};
