import React, { useState, useEffect } from 'react';
import { Gamepad2, Users, Clock, Trophy, Target, Brain, Zap, Star, Play, Eye } from 'lucide-react';
import { apiService } from '../../services/api';

interface MiniGame {
  id: string;
  name: string;
  description: string;
  type: 'individual' | 'multiplayer' | 'tournament';
  difficulty: 'easy' | 'medium' | 'hard';
  duration: number;
  participants: number;
  maxParticipants: number;
  status: 'waiting' | 'active' | 'completed';
  rewards: {
    xp: number;
    coins: number;
  };
  createdAt: string;
}

interface MiniGameStats {
  totalGames: number;
  gamesWon: number;
  favoriteGame: string;
  totalXPEarned: number;
  averageScore: number;
  winRate: number;
}

interface MiniGamesWidgetProps {
  guildId: string;
  userId?: string;
  showStats?: boolean;
  showActiveGames?: boolean;
}

export default function MiniGamesWidget({ 
  guildId, 
  userId, 
  showStats = true, 
  showActiveGames = true 
}: MiniGamesWidgetProps) {
  const [activeGames, setActiveGames] = useState<MiniGame[]>([]);
  const [stats, setStats] = useState<MiniGameStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'games' | 'stats'>('games');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        if (showActiveGames) {
          const gamesData = await apiService.getActiveMiniGames(guildId);
          setActiveGames(gamesData);
        }
        
        if (showStats && userId) {
          const statsData = await apiService.getMiniGameStats(userId, guildId);
          setStats(statsData);
        }
        
        setError(null);
      } catch (err) {
        console.error('Failed to fetch mini-games data:', err);
        setError('Erro ao carregar dados dos mini-games');
        
        // Mock data for development
        if (showActiveGames) {
          setActiveGames([
            {
              id: '1',
              name: 'Adivinhe a Arma',
              description: 'Identifique armas do PUBG pelas imagens',
              type: 'individual',
              difficulty: 'medium',
              duration: 300,
              participants: 1,
              maxParticipants: 1,
              status: 'waiting',
              rewards: { xp: 150, coins: 50 },
              createdAt: new Date().toISOString()
            },
            {
              id: '2',
              name: 'Batalha de Trivia PUBG',
              description: 'Competição de conhecimento sobre PUBG',
              type: 'multiplayer',
              difficulty: 'hard',
              duration: 600,
              participants: 3,
              maxParticipants: 8,
              status: 'active',
              rewards: { xp: 300, coins: 100 },
              createdAt: new Date().toISOString()
            },
            {
              id: '3',
              name: 'Torneio de Reflexos',
              description: 'Teste seus reflexos em desafios rápidos',
              type: 'tournament',
              difficulty: 'easy',
              duration: 180,
              participants: 12,
              maxParticipants: 16,
              status: 'active',
              rewards: { xp: 500, coins: 200 },
              createdAt: new Date().toISOString()
            }
          ]);
        }
        
        if (showStats && userId) {
          setStats({
            totalGames: 47,
            gamesWon: 23,
            favoriteGame: 'Batalha de Trivia PUBG',
            totalXPEarned: 8750,
            averageScore: 78.5,
            winRate: 48.9
          });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [guildId, userId, showActiveGames, showStats]);

  const getGameIcon = (type: string) => {
    switch (type) {
      case 'individual':
        return <Target className="h-4 w-4" />;
      case 'multiplayer':
        return <Users className="h-4 w-4" />;
      case 'tournament':
        return <Trophy className="h-4 w-4" />;
      default:
        return <Gamepad2 className="h-4 w-4" />;
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'waiting':
        return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20';
      case 'active':
        return 'text-green-600 bg-green-100 dark:bg-green-900/20';
      case 'completed':
        return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
      default:
        return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}min`;
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'waiting':
        return 'Aguardando';
      case 'active':
        return 'Em andamento';
      case 'completed':
        return 'Finalizado';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-card-foreground mb-4">Mini-Games</h3>
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-200 dark:bg-gray-700 rounded-lg h-20"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error && (!activeGames.length && !stats)) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-card-foreground mb-4">Mini-Games</h3>
        <div className="text-center py-8">
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-card-foreground">Mini-Games</h3>
        <div className="flex items-center space-x-1">
          <Gamepad2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {activeGames.filter(g => g.status === 'active').length} ativos
          </span>
        </div>
      </div>

      {/* Tabs */}
      {showActiveGames && showStats && stats && (
        <div className="flex space-x-1 mb-4 bg-muted rounded-lg p-1">
          <button
            onClick={() => setActiveTab('games')}
            className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'games'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Play className="h-4 w-4" />
            <span>Jogos Ativos</span>
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'stats'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Eye className="h-4 w-4" />
            <span>Estatísticas</span>
          </button>
        </div>
      )}

      {/* Active Games */}
      {(activeTab === 'games' || !stats) && showActiveGames && (
        <div className="space-y-3">
          {activeGames.length === 0 ? (
            <div className="text-center py-8">
              <Gamepad2 className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">Nenhum mini-game ativo no momento</p>
              <button className="mt-2 text-sm text-primary hover:text-primary/80 font-medium">
                Criar novo jogo
              </button>
            </div>
          ) : (
            activeGames.map((game) => (
              <div
                key={game.id}
                className="border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      {getGameIcon(game.type)}
                    </div>
                    <div>
                      <h4 className="font-medium text-card-foreground">{game.name}</h4>
                      <p className="text-sm text-muted-foreground">{game.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end space-y-1">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(game.status)}`}>
                      {getStatusText(game.status)}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(game.difficulty)}`}>
                      {game.difficulty}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-1">
                      <Users className="h-3 w-3" />
                      <span>{game.participants}/{game.maxParticipants}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatDuration(game.duration)}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-green-600">+{game.rewards.xp} XP</span>
                    <span className="text-yellow-600">+{game.rewards.coins} moedas</span>
                  </div>
                </div>
                
                {game.status === 'waiting' && (
                  <button className="mt-3 w-full bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
                    Entrar no Jogo
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Statistics */}
      {activeTab === 'stats' && stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-primary/5 rounded-lg p-3">
              <div className="flex items-center space-x-2 mb-1">
                <Gamepad2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-card-foreground">Jogos Totais</span>
              </div>
              <div className="text-2xl font-bold text-primary">{stats.totalGames}</div>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
              <div className="flex items-center space-x-2 mb-1">
                <Trophy className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-card-foreground">Vitórias</span>
              </div>
              <div className="text-2xl font-bold text-green-600">{stats.gamesWon}</div>
            </div>
            
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
              <div className="flex items-center space-x-2 mb-1">
                <Star className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-card-foreground">Taxa de Vitória</span>
              </div>
              <div className="text-2xl font-bold text-blue-600">{stats.winRate}%</div>
            </div>
            
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
              <div className="flex items-center space-x-2 mb-1">
                <Zap className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium text-card-foreground">XP Ganho</span>
              </div>
              <div className="text-2xl font-bold text-purple-600">{stats.totalXPEarned.toLocaleString()}</div>
            </div>
          </div>
          
          <div className="bg-accent/50 rounded-lg p-4">
            <h4 className="font-medium text-card-foreground mb-2">Jogo Favorito</h4>
            <div className="flex items-center space-x-2">
              <Brain className="h-5 w-5 text-primary" />
              <span className="text-primary font-medium">{stats.favoriteGame}</span>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              Pontuação média: <span className="font-medium">{stats.averageScore}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}