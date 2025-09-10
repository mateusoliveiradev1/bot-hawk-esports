import React, { useState, useEffect } from 'react';
import { Trophy, Star, Crown, Zap, Target, Award, Medal, Shield } from 'lucide-react';
import { apiService } from '../../services/api';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  earnedAt?: string;
  progress?: number;
  maxProgress?: number;
}

interface BadgesWidgetProps {
  userId?: string;
  guildId: string;
  showProgress?: boolean;
  maxDisplay?: number;
}

const rarityColors = {
  common: 'bg-gray-100 text-gray-800 border-gray-300',
  rare: 'bg-blue-100 text-blue-800 border-blue-300',
  epic: 'bg-purple-100 text-purple-800 border-purple-300',
  legendary: 'bg-yellow-100 text-yellow-800 border-yellow-300',
};

const rarityIcons = {
  common: Shield,
  rare: Star,
  epic: Crown,
  legendary: Trophy,
};

export default function BadgesWidget({
  userId,
  guildId,
  showProgress = true,
  maxDisplay = 6,
}: BadgesWidgetProps) {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBadges = async () => {
      try {
        setLoading(true);
        let badgeData;

        if (userId) {
          // Fetch user-specific badges
          badgeData = await apiService.getUserBadges(userId);
        } else {
          // Fetch guild badges overview
          badgeData = await apiService.getGuildBadges(guildId);
        }

        setBadges(badgeData.slice(0, maxDisplay));
        setError(null);
      } catch (err) {
        console.error('Failed to fetch badges:', err);
        setError('Erro ao carregar badges');
        // Mock data for development
        setBadges([
          {
            id: '1',
            name: 'First Kill',
            description: 'Primeira eliminação no PUBG',
            icon: 'target',
            rarity: 'common',
            earnedAt: '2024-01-15T10:30:00Z',
          },
          {
            id: '2',
            name: 'Chicken Dinner',
            description: 'Primeira vitória no PUBG',
            icon: 'crown',
            rarity: 'epic',
            earnedAt: '2024-01-16T15:45:00Z',
          },
          {
            id: '3',
            name: 'Headshot Master',
            description: '100 headshots',
            icon: 'zap',
            rarity: 'rare',
            progress: 75,
            maxProgress: 100,
          },
          {
            id: '4',
            name: 'Survivor',
            description: 'Sobreviver 10 minutos',
            icon: 'shield',
            rarity: 'common',
            earnedAt: '2024-01-14T12:20:00Z',
          },
          {
            id: '5',
            name: 'Legend',
            description: '10 vitórias consecutivas',
            icon: 'trophy',
            rarity: 'legendary',
            progress: 3,
            maxProgress: 10,
          },
          {
            id: '6',
            name: 'Marksman',
            description: 'Acerto de 90% com sniper',
            icon: 'target',
            rarity: 'rare',
            earnedAt: '2024-01-13T09:15:00Z',
          },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchBadges();
  }, [userId, guildId, maxDisplay]);

  const getIconComponent = (iconName: string, rarity: string) => {
    const iconMap: { [key: string]: any } = {
      trophy: Trophy,
      star: Star,
      crown: Crown,
      zap: Zap,
      target: Target,
      award: Award,
      medal: Medal,
      shield: Shield,
    };

    const IconComponent = iconMap[iconName] || rarityIcons[rarity as keyof typeof rarityIcons];
    return IconComponent;
  };

  if (loading) {
    return (
      <div className='bg-card border border-border rounded-lg p-6 shadow-sm'>
        <h3 className='text-lg font-semibold text-card-foreground mb-4'>Badges</h3>
        <div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className='animate-pulse'>
              <div className='bg-gray-200 dark:bg-gray-700 rounded-lg p-4 h-24'></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && badges.length === 0) {
    return (
      <div className='bg-card border border-border rounded-lg p-6 shadow-sm'>
        <h3 className='text-lg font-semibold text-card-foreground mb-4'>Badges</h3>
        <div className='text-center py-8'>
          <p className='text-muted-foreground'>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className='bg-card border border-border rounded-lg p-6 shadow-sm'>
      <div className='flex items-center justify-between mb-4'>
        <h3 className='text-lg font-semibold text-card-foreground'>Badges</h3>
        <div className='text-sm text-muted-foreground'>
          {badges.filter(b => b.earnedAt).length} / {badges.length} conquistadas
        </div>
      </div>

      <div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
        {badges.map(badge => {
          const IconComponent = getIconComponent(badge.icon, badge.rarity);
          const isEarned = !!badge.earnedAt;
          const hasProgress = badge.progress !== undefined && badge.maxProgress !== undefined;

          return (
            <div
              key={badge.id}
              className={`relative rounded-lg p-4 border-2 transition-all duration-200 hover:scale-105 ${
                isEarned
                  ? rarityColors[badge.rarity]
                  : 'bg-gray-50 text-gray-400 border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700'
              }`}
            >
              <div className='flex flex-col items-center text-center space-y-2'>
                <div
                  className={`p-2 rounded-full ${
                    isEarned ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <IconComponent className='h-6 w-6' />
                </div>

                <div>
                  <h4 className='font-semibold text-sm'>{badge.name}</h4>
                  <p className='text-xs opacity-80'>{badge.description}</p>
                </div>

                {showProgress && hasProgress && !isEarned && (
                  <div className='w-full'>
                    <div className='bg-gray-200 dark:bg-gray-700 rounded-full h-2'>
                      <div
                        className='bg-primary rounded-full h-2 transition-all duration-300'
                        style={{ width: `${(badge.progress! / badge.maxProgress!) * 100}%` }}
                      ></div>
                    </div>
                    <p className='text-xs mt-1'>
                      {badge.progress} / {badge.maxProgress}
                    </p>
                  </div>
                )}

                {isEarned && (
                  <div className='absolute -top-1 -right-1'>
                    <div className='bg-green-500 text-white rounded-full p-1'>
                      <Trophy className='h-3 w-3' />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {badges.length === maxDisplay && (
        <div className='mt-4 text-center'>
          <button className='text-primary hover:text-primary/80 text-sm font-medium'>
            Ver todas as badges →
          </button>
        </div>
      )}
    </div>
  );
}
