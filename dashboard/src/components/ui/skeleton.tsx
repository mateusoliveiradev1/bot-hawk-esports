import React from 'react';
import { cn } from '../../lib/utils';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className }) => {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
};

export const CardSkeleton: React.FC = () => {
  return (
    <div className='rounded-lg border bg-card p-6 space-y-4'>
      <div className='flex items-center space-x-4'>
        <Skeleton className='h-12 w-12 rounded-full' />
        <div className='space-y-2'>
          <Skeleton className='h-4 w-[200px]' />
          <Skeleton className='h-4 w-[160px]' />
        </div>
      </div>
      <div className='space-y-2'>
        <Skeleton className='h-4 w-full' />
        <Skeleton className='h-4 w-[80%]' />
        <Skeleton className='h-4 w-[60%]' />
      </div>
    </div>
  );
};

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className='space-y-3'>
      {/* Header */}
      <div className='flex space-x-4'>
        <Skeleton className='h-4 w-[100px]' />
        <Skeleton className='h-4 w-[150px]' />
        <Skeleton className='h-4 w-[120px]' />
        <Skeleton className='h-4 w-[80px]' />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className='flex space-x-4'>
          <Skeleton className='h-4 w-[100px]' />
          <Skeleton className='h-4 w-[150px]' />
          <Skeleton className='h-4 w-[120px]' />
          <Skeleton className='h-4 w-[80px]' />
        </div>
      ))}
    </div>
  );
};

export const StatCardSkeleton: React.FC = () => {
  return (
    <div className='rounded-lg border bg-card p-6'>
      <div className='flex items-center justify-between'>
        <div className='space-y-2'>
          <Skeleton className='h-4 w-[120px]' />
          <Skeleton className='h-8 w-[80px]' />
        </div>
        <Skeleton className='h-8 w-8 rounded' />
      </div>
      <div className='mt-4'>
        <Skeleton className='h-3 w-[60px]' />
      </div>
    </div>
  );
};

export const ChartSkeleton: React.FC<{ height?: string }> = ({ height = 'h-[300px]' }) => {
  return (
    <div className={cn('rounded-lg border bg-card p-6', height)}>
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <Skeleton className='h-6 w-[150px]' />
          <Skeleton className='h-4 w-[80px]' />
        </div>
        <div className='flex items-end space-x-2 h-[200px]'>
          {Array.from({ length: 12 }).map((_, index) => (
            <Skeleton
              key={index}
              className={`w-8 rounded-t h-${Math.floor(Math.random() * 8 + 2)}`}
            />
          ))}
        </div>
        <div className='flex justify-between'>
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className='h-3 w-8' />
          ))}
        </div>
      </div>
    </div>
  );
};
