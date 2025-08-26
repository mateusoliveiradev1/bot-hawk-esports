import React from 'react';
import { cn } from '../../lib/utils';

interface AdvancedSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12'
};

const colorClasses = {
  primary: 'border-primary',
  secondary: 'border-secondary',
  success: 'border-green-500',
  warning: 'border-yellow-500',
  error: 'border-red-500'
};

// Spinner com efeito de onda
export const WaveSpinner: React.FC<AdvancedSpinnerProps> = ({ 
  size = 'md', 
  className, 
  color = 'primary' 
}) => {
  return (
    <div className={cn('flex space-x-1', className)}>
      {[0, 1, 2, 3, 4].map((index) => (
        <div
          key={index}
          className={cn(
            'bg-current rounded-full animate-pulse',
            size === 'sm' ? 'h-2 w-1' : size === 'md' ? 'h-3 w-1.5' : size === 'lg' ? 'h-4 w-2' : 'h-6 w-3',
            colorClasses[color]
          )}
          style={{
            animationDelay: `${index * 0.1}s`,
            animationDuration: '1.2s'
          }}
        />
      ))}
    </div>
  );
};

// Spinner com efeito de crescimento
export const GrowSpinner: React.FC<AdvancedSpinnerProps> = ({ 
  size = 'md', 
  className, 
  color = 'primary' 
}) => {
  return (
    <div className={cn('flex space-x-1', className)}>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className={cn(
            'rounded-full animate-bounce',
            sizeClasses[size],
            colorClasses[color],
            'bg-current'
          )}
          style={{
            animationDelay: `${index * 0.16}s`
          }}
        />
      ))}
    </div>
  );
};

// Spinner orbital
export const OrbitSpinner: React.FC<AdvancedSpinnerProps> = ({ 
  size = 'md', 
  className, 
  color = 'primary' 
}) => {
  const containerSize = {
    sm: 'h-8 w-8',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
    xl: 'h-24 w-24'
  };

  const dotSize = {
    sm: 'h-1.5 w-1.5',
    md: 'h-2 w-2',
    lg: 'h-3 w-3',
    xl: 'h-4 w-4'
  };

  return (
    <div className={cn('relative', containerSize[size], className)}>
      <div className="absolute inset-0 animate-spin">
        <div className={cn(
          'absolute top-0 left-1/2 transform -translate-x-1/2 rounded-full bg-current',
          dotSize[size],
          colorClasses[color]
        )} />
      </div>
      <div className="absolute inset-0 animate-spin" style={{ animationDelay: '0.5s' }}>
        <div className={cn(
          'absolute bottom-0 left-1/2 transform -translate-x-1/2 rounded-full bg-current opacity-60',
          dotSize[size],
          colorClasses[color]
        )} />
      </div>
    </div>
  );
};

// Spinner com efeito de escala
export const ScaleSpinner: React.FC<AdvancedSpinnerProps> = ({ 
  size = 'md', 
  className, 
  color = 'primary' 
}) => {
  return (
    <div className={cn('grid grid-cols-3 gap-1', className)}>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => (
        <div
          key={index}
          className={cn(
            'rounded-sm bg-current',
            size === 'sm' ? 'h-1 w-1' : size === 'md' ? 'h-1.5 w-1.5' : size === 'lg' ? 'h-2 w-2' : 'h-3 w-3',
            colorClasses[color]
          )}
          style={{
            animation: 'pulse 1.5s ease-in-out infinite',
            animationDelay: `${index * 0.1}s`
          }}
        />
      ))}

    </div>
  );
};

// Spinner com efeito de DNA
export const DNASpinner: React.FC<AdvancedSpinnerProps> = ({ 
  size = 'md', 
  className, 
  color = 'primary' 
}) => {
  const containerHeight = {
    sm: 'h-8',
    md: 'h-12',
    lg: 'h-16',
    xl: 'h-24'
  };

  return (
    <div className={cn('flex items-center justify-center', containerHeight[size], className)}>
      <div className="relative">
        {[0, 1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className={cn(
              'absolute rounded-full bg-current',
              size === 'sm' ? 'h-1.5 w-1.5' : size === 'md' ? 'h-2 w-2' : size === 'lg' ? 'h-3 w-3' : 'h-4 w-4',
              colorClasses[color]
            )}
            style={{
              left: `${index * 8}px`,
              animation: 'spin 2s ease-in-out infinite',
              animationDelay: `${index * 0.15}s`
            }}
          />
        ))}

      </div>
    </div>
  );
};

// Spinner com efeito de coração pulsante
export const HeartbeatSpinner: React.FC<AdvancedSpinnerProps> = ({ 
  size = 'md', 
  className, 
  color = 'primary' 
}) => {
  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div
        className={cn(
          'rounded-full bg-current',
          sizeClasses[size],
          colorClasses[color]
        )}
        style={{
          animation: 'pulse 1.5s ease-in-out infinite'
        }}
      />

    </div>
  );
};