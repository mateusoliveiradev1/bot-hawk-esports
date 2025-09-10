import { useState, useEffect } from 'react';
import { TrendingUp, Star, Zap, Crown, Users, Award } from 'lucide-react';
import { apiService } from '../../services/api';

interface XPData {
  currentXP: number;
  currentLevel: number;
  xpToNextLevel: number;
  totalXPForNextLevel: number;
  rank: number;
  totalUsers: number;
  weeklyXP: number;
  monthlyXP: number;
}

interface XPWidgetProps {
  userId?: string;
  guildId: string;
  showRanking?: boolean;
  showProgress?: boolean;
}

export default function XPWidget({
  userId,
  guildId,
  showRanking = true,
  showProgress = true,
}: XPWidgetProps) {
  const [xpData, setXpData] = useState<XPData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchXPData = async () => {
      try {
        setLoading(true);
        let data;

        if (userId) {
          // Fetch user-specific XP data
          data = await apiService.getUserXP(userId, guildId);
        } else {
          // Fetch guild XP overview
          data = await apiService.getGuildXPOverview(guildId);
        }

        setXpData(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch XP data:', err);
        setError('Erro ao carregar dados de XP');
        // Mock data for development
        setXpData({
          currentXP: 2750,
          currentLevel: 15,
          xpToNextLevel: 250,
          totalXPForNextLevel: 3000,
          rank: 3,
          totalUsers: 1247,
          weeklyXP: 450,
          monthlyXP: 1850,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchXPData();
  }, [userId, guildId]);

  const getProgressPercentage = () => {
    if (!xpData) return 0;
    const currentLevelXP = xpData.totalXPForNextLevel - xpData.xpToNextLevel;
    const levelXPRange =
      xpData.totalXPForNextLevel -
      (xpData.totalXPForNextLevel - xpData.xpToNextLevel - (xpData.currentXP - currentLevelXP));
    return (currentLevelXP / levelXPRange) * 100;
  };

  const getLevelIcon = (level: number) => {
    if (level >= 50) return Crown;
    if (level >= 25) return Award;
    if (level >= 10) return Star;
    return Zap;
  };

  const getRankColor = (rank: number) => {
    if (rank <= 3) return 'text-yellow-600 dark:text-yellow-400';
    if (rank <= 10) return 'text-blue-600 dark:text-blue-400';
    if (rank <= 50) return 'text-green-600 dark:text-green-400';
    return 'text-gray-600 dark:text-gray-400';
  };

  if (loading) {
    return (
      <div className='bg-card border border-border rounded-lg p-6 shadow-sm'>
        <h3 className='text-lg font-semibold text-card-foreground mb-4'>Experiência</h3>
        <div className='animate-pulse space-y-4'>
          <div className='bg-gray-200 dark:bg-gray-700 rounded h-4 w-3/4'></div>
          <div className='bg-gray-200 dark:bg-gray-700 rounded h-8 w-full'></div>
          <div className='bg-gray-200 dark:bg-gray-700 rounded h-4 w-1/2'></div>
        </div>
      </div>
    );
  }

  if (error && !xpData) {
    return (
      <div className='bg-card border border-border rounded-lg p-6 shadow-sm'>
        <h3 className='text-lg font-semibold text-card-foreground mb-4'>Experiência</h3>
        <div className='text-center py-8'>
          <p className='text-muted-foreground'>{error}</p>
        </div>
      </div>
    );
  }

  if (!xpData) return null;

  const LevelIcon = getLevelIcon(xpData.currentLevel);
  const progressPercentage = getProgressPercentage();

  return (
    <div className='bg-card border border-border rounded-lg p-6 shadow-sm'>
      <div className='flex items-center justify-between mb-4'>
        <h3 className='text-lg font-semibold text-card-foreground'>Experiência</h3>
        {showRanking && (
          <div className={`flex items-center space-x-1 ${getRankColor(xpData.rank)}`}>
            <Users className='h-4 w-4' />
            <span className='text-sm font-medium'>
              #{xpData.rank} de {xpData.totalUsers.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Level and XP Display */}
      <div className='flex items-center space-x-4 mb-4'>
        <div className='flex items-center space-x-2'>
          <div className='p-3 bg-primary/10 rounded-lg'>
            <LevelIcon className='h-8 w-8 text-primary' />
          </div>
          <div>
            <div className='text-2xl font-bold text-card-foreground'>
              Nível {xpData.currentLevel}
            </div>
            <div className='text-sm text-muted-foreground'>
              {xpData.currentXP.toLocaleString()} XP total
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {showProgress && (
        <div className='mb-4'>
          <div className='flex justify-between text-sm text-muted-foreground mb-2'>
            <span>Progresso para o próximo nível</span>
            <span>{xpData.xpToNextLevel} XP restantes</span>
          </div>
          <div className='bg-gray-200 dark:bg-gray-700 rounded-full h-3'>
            <div
              className='bg-gradient-to-r from-primary to-primary/80 rounded-full h-3 transition-all duration-500 ease-out'
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
          <div className='flex justify-between text-xs text-muted-foreground mt-1'>
            <span>{(xpData.totalXPForNextLevel - xpData.xpToNextLevel).toLocaleString()}</span>
            <span>{xpData.totalXPForNextLevel.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* XP Statistics */}
      <div className='grid grid-cols-2 gap-4'>
        <div className='bg-primary/5 rounded-lg p-3'>
          <div className='flex items-center space-x-2 mb-1'>
            <TrendingUp className='h-4 w-4 text-green-600' />
            <span className='text-sm font-medium text-card-foreground'>Esta Semana</span>
          </div>
          <div className='text-lg font-bold text-green-600'>
            +{xpData.weeklyXP.toLocaleString()} XP
          </div>
        </div>

        <div className='bg-primary/5 rounded-lg p-3'>
          <div className='flex items-center space-x-2 mb-1'>
            <Star className='h-4 w-4 text-blue-600' />
            <span className='text-sm font-medium text-card-foreground'>Este Mês</span>
          </div>
          <div className='text-lg font-bold text-blue-600'>
            +{xpData.monthlyXP.toLocaleString()} XP
          </div>
        </div>
      </div>

      {/* Level Milestones */}
      <div className='mt-4 pt-4 border-t border-border'>
        <div className='text-sm text-muted-foreground mb-2'>Próximos marcos:</div>
        <div className='space-y-1'>
          {[
            { level: Math.ceil(xpData.currentLevel / 5) * 5, reward: 'Badge especial' },
            { level: Math.ceil(xpData.currentLevel / 10) * 10, reward: 'Título exclusivo' },
            { level: 50, reward: 'Acesso VIP' },
          ]
            .filter(milestone => milestone.level > xpData.currentLevel)
            .slice(0, 2)
            .map((milestone, index) => (
              <div key={index} className='flex justify-between text-xs'>
                <span className='text-muted-foreground'>Nível {milestone.level}</span>
                <span className='text-primary font-medium'>{milestone.reward}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
