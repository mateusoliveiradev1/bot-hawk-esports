import React, { useState, useEffect } from 'react';
import { Award, Target, Clock, CheckCircle, Lock, Star, Trophy, Zap, Crown } from 'lucide-react';
import { apiService } from '../../services/api';

interface Achievement {
  id: string;
  name: string;
  description: string;
  category: 'combat' | 'social' | 'progression' | 'special' | 'seasonal';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  progress: number;
  maxProgress: number;
  completed: boolean;
  completedAt?: string;
  rewards: {
    xp: number;
    coins: number;
    badge?: string;
    title?: string;
  };
  icon: string;
}

interface Challenge {
  id: string;
  name: string;
  description: string;
  type: 'daily' | 'weekly' | 'monthly' | 'special';
  difficulty: 'easy' | 'medium' | 'hard';
  progress: number;
  maxProgress: number;
  completed: boolean;
  expiresAt: string;
  rewards: {
    xp: number;
    coins: number;
  };
}

interface AchievementsWidgetProps {
  userId: string;
  guildId: string;
  showChallenges?: boolean;
  showCompleted?: boolean;
}

export default function AchievementsWidget({
  userId,
  guildId,
  showChallenges = true,
  showCompleted = false,
}: AchievementsWidgetProps) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'achievements' | 'challenges'>('achievements');
  const [filter, setFilter] = useState<'all' | 'completed' | 'in-progress'>('all');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const [achievementsData, challengesData] = await Promise.all([
          apiService.getUserAchievements(userId, guildId),
          showChallenges ? apiService.getUserChallenges(userId, guildId) : Promise.resolve([]),
        ]);

        setAchievements(achievementsData);
        setChallenges(challengesData);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch achievements data:', err);
        setError('Erro ao carregar conquistas');

        // Mock data for development
        setAchievements([
          {
            id: '1',
            name: 'Primeiro Chicken Dinner',
            description: 'Conquiste sua primeira vitória no PUBG',
            category: 'combat',
            rarity: 'common',
            progress: 1,
            maxProgress: 1,
            completed: true,
            completedAt: '2024-01-15T10:30:00Z',
            rewards: { xp: 500, coins: 100, badge: 'chicken-dinner' },
            icon: '🏆',
          },
          {
            id: '2',
            name: 'Sniper Elite',
            description: 'Faça 100 kills com rifles de precisão',
            category: 'combat',
            rarity: 'rare',
            progress: 73,
            maxProgress: 100,
            completed: false,
            rewards: { xp: 1000, coins: 250, badge: 'sniper-elite' },
            icon: '🎯',
          },
          {
            id: '3',
            name: 'Socialite',
            description: 'Participe de 50 conversas no servidor',
            category: 'social',
            rarity: 'common',
            progress: 50,
            maxProgress: 50,
            completed: true,
            completedAt: '2024-01-20T15:45:00Z',
            rewards: { xp: 300, coins: 75 },
            icon: '💬',
          },
          {
            id: '4',
            name: 'Lenda do PUBG',
            description: 'Alcance o nível 50 no bot',
            category: 'progression',
            rarity: 'legendary',
            progress: 15,
            maxProgress: 50,
            completed: false,
            rewards: { xp: 5000, coins: 1000, badge: 'legend', title: 'Lenda' },
            icon: '👑',
          },
          {
            id: '5',
            name: 'Colecionador de Badges',
            description: 'Colete 25 badges diferentes',
            category: 'special',
            rarity: 'epic',
            progress: 18,
            maxProgress: 25,
            completed: false,
            rewards: { xp: 2000, coins: 500, badge: 'collector' },
            icon: '🏅',
          },
        ]);

        if (showChallenges) {
          setChallenges([
            {
              id: '1',
              name: 'Atividade Diária',
              description: 'Envie 10 mensagens hoje',
              type: 'daily',
              difficulty: 'easy',
              progress: 7,
              maxProgress: 10,
              completed: false,
              expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
              rewards: { xp: 100, coins: 25 },
            },
            {
              id: '2',
              name: 'Mestre dos Mini-Games',
              description: 'Vença 5 mini-games esta semana',
              type: 'weekly',
              difficulty: 'medium',
              progress: 2,
              maxProgress: 5,
              completed: false,
              expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
              rewards: { xp: 500, coins: 150 },
            },
            {
              id: '3',
              name: 'Participação Ativa',
              description: 'Use 20 comandos do bot hoje',
              type: 'daily',
              difficulty: 'hard',
              progress: 20,
              maxProgress: 20,
              completed: true,
              expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
              rewards: { xp: 200, coins: 50 },
            },
          ]);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId, guildId, showChallenges]);

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'common':
        return 'border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800/50';
      case 'rare':
        return 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20';
      case 'epic':
        return 'border-purple-300 bg-purple-50 dark:border-purple-600 dark:bg-purple-900/20';
      case 'legendary':
        return 'border-yellow-300 bg-yellow-50 dark:border-yellow-600 dark:bg-yellow-900/20';
      default:
        return 'border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800/50';
    }
  };

  const getRarityTextColor = (rarity: string) => {
    switch (rarity) {
      case 'common':
        return 'text-gray-600 dark:text-gray-400';
      case 'rare':
        return 'text-blue-600 dark:text-blue-400';
      case 'epic':
        return 'text-purple-600 dark:text-purple-400';
      case 'legendary':
        return 'text-yellow-600 dark:text-yellow-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'combat':
        return <Target className='h-4 w-4' />;
      case 'social':
        return <Award className='h-4 w-4' />;
      case 'progression':
        return <Star className='h-4 w-4' />;
      case 'special':
        return <Crown className='h-4 w-4' />;
      case 'seasonal':
        return <Zap className='h-4 w-4' />;
      default:
        return <Trophy className='h-4 w-4' />;
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'text-green-600 bg-green-100 dark:bg-green-900/20';
      case 'medium':
        return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20';
      case 'hard':
        return 'text-red-600 bg-red-100 dark:bg-red-900/20';
      default:
        return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'daily':
        return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20';
      case 'weekly':
        return 'text-purple-600 bg-purple-100 dark:bg-purple-900/20';
      case 'monthly':
        return 'text-orange-600 bg-orange-100 dark:bg-orange-900/20';
      case 'special':
        return 'text-pink-600 bg-pink-100 dark:bg-pink-900/20';
      default:
        return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
    }
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();

    if (diff <= 0) return 'Expirado';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const filteredAchievements = achievements.filter(achievement => {
    if (filter === 'completed') return achievement.completed;
    if (filter === 'in-progress') return !achievement.completed;
    return true;
  });

  const filteredChallenges = challenges.filter(challenge => {
    if (filter === 'completed') return challenge.completed;
    if (filter === 'in-progress') return !challenge.completed;
    return true;
  });

  if (loading) {
    return (
      <div className='bg-card border border-border rounded-lg p-6 shadow-sm'>
        <h3 className='text-lg font-semibold text-card-foreground mb-4'>Conquistas</h3>
        <div className='animate-pulse space-y-4'>
          {[...Array(3)].map((_, i) => (
            <div key={i} className='bg-gray-200 dark:bg-gray-700 rounded-lg h-20'></div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !achievements.length && !challenges.length) {
    return (
      <div className='bg-card border border-border rounded-lg p-6 shadow-sm'>
        <h3 className='text-lg font-semibold text-card-foreground mb-4'>Conquistas</h3>
        <div className='text-center py-8'>
          <p className='text-muted-foreground'>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className='bg-card border border-border rounded-lg p-6 shadow-sm'>
      <div className='flex items-center justify-between mb-4'>
        <h3 className='text-lg font-semibold text-card-foreground'>Conquistas</h3>
        <div className='flex items-center space-x-1'>
          <Trophy className='h-4 w-4 text-muted-foreground' />
          <span className='text-sm text-muted-foreground'>
            {achievements.filter(a => a.completed).length}/{achievements.length}
          </span>
        </div>
      </div>

      {/* Tabs */}
      {showChallenges && (
        <div className='flex space-x-1 mb-4 bg-muted rounded-lg p-1'>
          <button
            onClick={() => setActiveTab('achievements')}
            className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'achievements'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Award className='h-4 w-4' />
            <span>Conquistas</span>
          </button>
          <button
            onClick={() => setActiveTab('challenges')}
            className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'challenges'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Target className='h-4 w-4' />
            <span>Desafios</span>
          </button>
        </div>
      )}

      {/* Filter */}
      <div className='flex space-x-2 mb-4'>
        {(['all', 'in-progress', 'completed'] as const).map(filterType => (
          <button
            key={filterType}
            onClick={() => setFilter(filterType)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === filterType
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {filterType === 'all' && 'Todas'}
            {filterType === 'in-progress' && 'Em Progresso'}
            {filterType === 'completed' && 'Concluídas'}
          </button>
        ))}
      </div>

      {/* Achievements */}
      {activeTab === 'achievements' && (
        <div className='space-y-3'>
          {filteredAchievements.length === 0 ? (
            <div className='text-center py-8'>
              <Award className='h-12 w-12 text-muted-foreground mx-auto mb-2' />
              <p className='text-muted-foreground'>Nenhuma conquista encontrada</p>
            </div>
          ) : (
            filteredAchievements.map(achievement => (
              <div
                key={achievement.id}
                className={`border rounded-lg p-4 transition-all ${
                  achievement.completed
                    ? getRarityColor(achievement.rarity) + ' opacity-90'
                    : 'border-border bg-card hover:bg-accent/50'
                }`}
              >
                <div className='flex items-start space-x-3'>
                  <div className='text-2xl'>{achievement.icon}</div>
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center space-x-2 mb-1'>
                      <h4
                        className={`font-medium ${
                          achievement.completed ? 'text-card-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {achievement.name}
                      </h4>
                      {achievement.completed && <CheckCircle className='h-4 w-4 text-green-600' />}
                      {!achievement.completed && achievement.progress === 0 && (
                        <Lock className='h-4 w-4 text-muted-foreground' />
                      )}
                    </div>

                    <p className='text-sm text-muted-foreground mb-2'>{achievement.description}</p>

                    <div className='flex items-center justify-between mb-2'>
                      <div className='flex items-center space-x-2'>
                        {getCategoryIcon(achievement.category)}
                        <span
                          className={`text-xs font-medium ${getRarityTextColor(achievement.rarity)}`}
                        >
                          {achievement.rarity.toUpperCase()}
                        </span>
                      </div>
                      <div className='text-xs text-muted-foreground'>
                        {achievement.progress}/{achievement.maxProgress}
                      </div>
                    </div>

                    {!achievement.completed && (
                      <div className='bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2'>
                        <div
                          className='bg-primary rounded-full h-2 transition-all duration-300'
                          style={{
                            width: `${(achievement.progress / achievement.maxProgress) * 100}%`,
                          }}
                        ></div>
                      </div>
                    )}

                    <div className='flex items-center justify-between text-xs'>
                      <div className='flex items-center space-x-2'>
                        <span className='text-green-600'>+{achievement.rewards.xp} XP</span>
                        <span className='text-yellow-600'>+{achievement.rewards.coins} moedas</span>
                        {achievement.rewards.badge && (
                          <span className='text-purple-600'>Badge</span>
                        )}
                        {achievement.rewards.title && <span className='text-blue-600'>Título</span>}
                      </div>
                      {achievement.completedAt && (
                        <span className='text-muted-foreground'>
                          {new Date(achievement.completedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Challenges */}
      {activeTab === 'challenges' && showChallenges && (
        <div className='space-y-3'>
          {filteredChallenges.length === 0 ? (
            <div className='text-center py-8'>
              <Target className='h-12 w-12 text-muted-foreground mx-auto mb-2' />
              <p className='text-muted-foreground'>Nenhum desafio encontrado</p>
            </div>
          ) : (
            filteredChallenges.map(challenge => (
              <div
                key={challenge.id}
                className={`border border-border rounded-lg p-4 transition-colors ${
                  challenge.completed
                    ? 'bg-green-50 dark:bg-green-900/20'
                    : 'bg-card hover:bg-accent/50'
                }`}
              >
                <div className='flex items-start justify-between mb-2'>
                  <div className='flex-1'>
                    <div className='flex items-center space-x-2 mb-1'>
                      <h4 className='font-medium text-card-foreground'>{challenge.name}</h4>
                      {challenge.completed && <CheckCircle className='h-4 w-4 text-green-600' />}
                    </div>
                    <p className='text-sm text-muted-foreground'>{challenge.description}</p>
                  </div>
                  <div className='flex flex-col items-end space-y-1'>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(challenge.type)}`}
                    >
                      {challenge.type}
                    </span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(challenge.difficulty)}`}
                    >
                      {challenge.difficulty}
                    </span>
                  </div>
                </div>

                <div className='flex items-center justify-between mb-2'>
                  <div className='text-sm text-muted-foreground'>
                    Progresso: {challenge.progress}/{challenge.maxProgress}
                  </div>
                  <div className='flex items-center space-x-1 text-xs text-muted-foreground'>
                    <Clock className='h-3 w-3' />
                    <span>{getTimeRemaining(challenge.expiresAt)}</span>
                  </div>
                </div>

                {!challenge.completed && (
                  <div className='bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2'>
                    <div
                      className='bg-primary rounded-full h-2 transition-all duration-300'
                      style={{ width: `${(challenge.progress / challenge.maxProgress) * 100}%` }}
                    ></div>
                  </div>
                )}

                <div className='flex items-center justify-between text-xs'>
                  <div className='flex items-center space-x-2'>
                    <span className='text-green-600'>+{challenge.rewards.xp} XP</span>
                    <span className='text-yellow-600'>+{challenge.rewards.coins} moedas</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
