import React from 'react';
import { cn } from '../../lib/utils';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'error';
  showLabel?: boolean;
  label?: string;
}

const sizeClasses = {
  sm: 'h-2',
  md: 'h-3',
  lg: 'h-4'
};

const variantClasses = {
  default: 'bg-primary',
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
  error: 'bg-red-500'
};

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, size = 'lg', variant = 'default', showLabel = false, label, ...props }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

    return (
      <div className={cn('w-full', className)} {...props}>
        {(showLabel || label) && (
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-foreground">
              {label || 'Progress'}
            </span>
            <span className="text-sm text-muted-foreground">
              {Math.round(percentage)}%
            </span>
          </div>
        )}
        <div
          ref={ref}
          className={cn(
            'w-full bg-muted rounded-full overflow-hidden',
            sizeClasses[size]
          )}
        >
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300 ease-in-out',
              variantClasses[variant]
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  }
);

Progress.displayName = 'Progress';

export const CircularProgress: React.FC<{
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
  showLabel?: boolean;
}> = ({
  value,
  max = 100,
  size = 120,
  strokeWidth = 8,
  className,
  variant = 'default',
  showLabel = true
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const variantColors = {
    default: 'stroke-primary',
    success: 'stroke-green-500',
    warning: 'stroke-yellow-500',
    error: 'stroke-red-500'
  };

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-muted opacity-20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={cn('transition-all duration-300 ease-in-out', variantColors[variant])}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-medium text-foreground">
            {Math.round(percentage)}%
          </span>
        </div>
      )}
    </div>
  );
};

export const StepProgress: React.FC<{
  steps: string[];
  currentStep: number;
  className?: string;
}> = ({ steps, currentStep, className }) => {
  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isUpcoming = index > currentStep;

          return (
            <div key={index} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200',
                    {
                      'bg-primary text-primary-foreground': isCompleted || isCurrent,
                      'bg-muted text-muted-foreground': isUpcoming,
                      'ring-2 ring-primary ring-offset-2': isCurrent
                    }
                  )}
                >
                  {isCompleted ? '✓' : index + 1}
                </div>
                <span
                  className={cn(
                    'mt-2 text-xs text-center max-w-[80px] truncate',
                    {
                      'text-foreground font-medium': isCompleted || isCurrent,
                      'text-muted-foreground': isUpcoming
                    }
                  )}
                >
                  {step}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-4 transition-all duration-200',
                    {
                      'bg-primary': index < currentStep,
                      'bg-muted': index >= currentStep
                    }
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export { Progress };