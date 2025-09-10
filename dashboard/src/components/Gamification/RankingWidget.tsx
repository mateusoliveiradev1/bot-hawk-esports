import { useState, useEffect } from 'react';
import { Trophy, Medal, Award, Crown, TrendingUp, Users, Star } from 'lucide-react';
import { apiService } from '../../services/api';

interface RankingUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  level: number;
  xp: number;
  rank: number;
  weeklyXP: number;
  badges: number;
}

interface RankingWidgetProps {
  guildId: string;
  type?: 'overall' | 'weekly' | 'monthly';
  limit?: number;
  showBadges?: boolean;
}

export default function RankingWidget({
  guildId,
  type = 'overall',
  limit = 10,
  showBadges = true,
}: RankingWidgetProps) {
  const [rankings, setRankings] = useState<RankingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overall' | 'weekly' | 'monthly'>(type);

  useEffect(() => {
    const fetchRankings = async () => {
      try {
        setLoading(true);
        const data = await apiService.getRankings(guildId, activeTab, limit);
        setRankings(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch rankings:', err);
        setError('Erro ao carregar ranking');
        // Mock data for development
        setRankings([
          {
            id: '1',
            username: 'ProPlayer2024',
            discriminator: '0001',
            level: 45,
            xp: 125000,
            rank: 1,
            weeklyXP: 2500,
            badges: 28,
          },
          {
            id: '2',
            username: 'GamerElite',
            discriminator: '0002',
            level: 42,
            xp: 118000,
            rank: 2,
            weeklyXP: 2200,
            badges: 25,
          },
          {
            id: '3',
            username: 'PUBGMaster',
            discriminator: '0003',
            level: 40,
            xp: 112000,
            rank: 3,
            weeklyXP: 2000,
            badges: 22,
          },
          {
            id: '4',
            username: 'ChickenHunter',
            discriminator: '0004',
            level: 38,
            xp: 105000,
            rank: 4,
            weeklyXP: 1800,
            badges: 20,
          },
          {
            id: '5',
            username: 'SnipeKing',
            discriminator: '0005',
            level: 36,
            xp: 98000,
            rank: 5,
            weeklyXP: 1600,
            badges: 18,
          },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchRankings();
  }, [guildId, activeTab, limit]);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className='h-5 w-5 text-yellow-500' />;
      case 2:
        return <Medal className='h-5 w-5 text-gray-400' />;
      case 3:
        return <Award className='h-5 w-5 text-amber-600' />;
      default:
        return <span className='text-sm font-bold text-muted-foreground'>#{rank}</span>;
    }
  };

  const getRankBgColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 border-yellow-200 dark:border-yellow-700';
      case 2:
        return 'bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/20 dark:to-gray-700/20 border-gray-200 dark:border-gray-600';
      case 3:
        return 'bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 border-amber-200 dark:border-amber-700';
      default:
        return 'bg-card border-border hover:bg-accent/50';
    }
  };

  const getTabIcon = (tabType: string) => {
    switch (tabType) {
      case 'overall':
        return <Trophy className='h-4 w-4' />;
      case 'weekly':
        return <TrendingUp className='h-4 w-4' />;
      case 'monthly':
        return <Star className='h-4 w-4' />;
      default:
        return <Users className='h-4 w-4' />;
    }
  };

  const getTabLabel = (tabType: string) => {
    switch (tabType) {
      case 'overall':
        return 'Geral';
      case 'weekly':
        return 'Semanal';
      case 'monthly':
        return 'Mensal';
      default:
        return 'Geral';
    }
  };

  if (loading) {
    return (
      <div className='bg-card border border-border rounded-lg p-6 shadow-sm'>
        <h3 className='text-lg font-semibold text-card-foreground mb-4'>Ranking</h3>
        <div className='animate-pulse space-y-3'>
          {[...Array(5)].map((_, i) => (
            <div key={i} className='flex items-center space-x-3'>
              <div className='bg-gray-200 dark:bg-gray-700 rounded-full h-10 w-10'></div>
              <div className='flex-1'>
                <div className='bg-gray-200 dark:bg-gray-700 rounded h-4 w-3/4 mb-2'></div>
                <div className='bg-gray-200 dark:bg-gray-700 rounded h-3 w-1/2'></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && rankings.length === 0) {
    return (
      <div className='bg-card border border-border rounded-lg p-6 shadow-sm'>
        <h3 className='text-lg font-semibold text-card-foreground mb-4'>Ranking</h3>
        <div className='text-center py-8'>
          <p className='text-muted-foreground'>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className='bg-card border border-border rounded-lg p-6 shadow-sm'>
      <div className='flex items-center justify-between mb-4'>
        <h3 className='text-lg font-semibold text-card-foreground'>Ranking</h3>
        <div className='flex items-center space-x-1'>
          <Users className='h-4 w-4 text-muted-foreground' />
          <span className='text-sm text-muted-foreground'>{rankings.length} jogadores</span>
        </div>
      </div>

      {/* Tabs */}
      <div className='flex space-x-1 mb-4 bg-muted rounded-lg p-1'>
        {(['overall', 'weekly', 'monthly'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {getTabIcon(tab)}
            <span>{getTabLabel(tab)}</span>
          </button>
        ))}
      </div>

      {/* Rankings List */}
      <div className='space-y-2'>
        {rankings.map((user) => (
          <div
            key={user.id}
            className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${getRankBgColor(
              user.rank
            )}`}
          >
            {/* Rank */}
            <div className='flex items-center justify-center w-8'>{getRankIcon(user.rank)}</div>

            {/* Avatar */}
            <div className='relative'>
              {user.avatar ? (
                <img
                  src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`}
                  alt={user.username}
                  className='w-10 h-10 rounded-full'
                />
              ) : (
                <div className='w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center'>
                  <span className='text-sm font-bold text-primary'>
                    {user.username.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              {user.rank <= 3 && (
                <div className='absolute -top-1 -right-1 w-5 h-5 rounded-full bg-background border-2 border-background flex items-center justify-center'>
                  {getRankIcon(user.rank)}
                </div>
              )}
            </div>

            {/* User Info */}
            <div className='flex-1 min-w-0'>
              <div className='flex items-center space-x-2'>
                <span className='font-medium text-card-foreground truncate'>{user.username}</span>
                <span className='text-xs text-muted-foreground'>#{user.discriminator}</span>
              </div>
              <div className='flex items-center space-x-4 text-sm text-muted-foreground'>
                <span>Nível {user.level}</span>
                <span>{user.xp.toLocaleString()} XP</span>
                {showBadges && (
                  <span className='flex items-center space-x-1'>
                    <Award className='h-3 w-3' />
                    <span>{user.badges}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Weekly XP (for weekly/monthly tabs) */}
            {activeTab !== 'overall' && (
              <div className='text-right'>
                <div className='text-sm font-medium text-green-600'>
                  +{user.weeklyXP.toLocaleString()}
                </div>
                <div className='text-xs text-muted-foreground'>
                  {activeTab === 'weekly' ? 'esta semana' : 'este mês'}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* View More Button */}
      {rankings.length >= limit && (
        <div className='mt-4 text-center'>
          <button className='text-sm text-primary hover:text-primary/80 font-medium'>
            Ver ranking completo
          </button>
        </div>
      )}
    </div>
  );
}
