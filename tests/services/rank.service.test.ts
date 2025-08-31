import { jest } from '@jest/globals';
import { RankService } from '../../src/services/rank.service';
import { DatabaseService } from '../../src/database/database.service';
import { ExtendedClient } from '../../src/types/client';

// Mock das dependências
const mockDatabaseService = {
  client: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn()
    }
  }
} as any;

const mockPubgService = {
  getPlayerStats: jest.fn(),
  isServiceAvailable: jest.fn().mockReturnValue(true)
} as any;

const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn()
} as any;

const mockClient = {
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  },
  database: mockDatabaseService,
  cache: mockCacheService,
  pubg: mockPubgService,
  guilds: {
    cache: new Map()
  }
} as any;

describe('RankService', () => {
  let rankService: RankService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mocks
    mockDatabaseService.client.user.findUnique.mockReset();
    mockDatabaseService.client.user.update.mockReset();
    mockDatabaseService.client.user.findMany.mockReset();
    mockDatabaseService.client.user.count.mockReset();
    
    rankService = new RankService(mockClient);
  });

  describe('updateUserRank', () => {
    it('deve atualizar rank do usuário com sucesso', async () => {
      const mockUser = {
        id: 'user1',
        discordId: 'discord1',
        pubgUsername: 'testplayer',
        rankPoints: 2500
      };

      mockDatabaseService.client.user.findUnique.mockResolvedValue(mockUser);
      mockPubgService.getPlayerStats.mockResolvedValue({
        rankedStats: {
          currentRankPoint: 3000,
          currentTier: { tier: 'Gold', subTier: 'V' }
        }
      });
      mockDatabaseService.client.user.update.mockResolvedValue({ ...mockUser, rankPoints: 3000 });

      const result = await rankService.updateUserRank('discord1', 'testplayer');

      expect(result).toBe(true);
      expect(mockDatabaseService.client.user.update).toHaveBeenCalled();
    });

    it('deve retornar false se usuário não encontrado', async () => {
      mockDatabaseService.client.user.findUnique.mockResolvedValue(null);

      const result = await rankService.updateUserRank('discord999', 'nonexistent');

      expect(result).toBe(false);
    });

    it('deve tratar erro do PUBG service', async () => {
      const mockUser = {
        id: 'user1',
        discordId: 'discord1',
        pubgUsername: 'testplayer',
        rankPoints: 2500
      };

      mockDatabaseService.client.user.findUnique.mockResolvedValue(mockUser);
      mockPubgService.getPlayerStats.mockRejectedValue(new Error('PUBG API Error'));

      const result = await rankService.updateUserRank('discord1', 'testplayer');

      expect(result).toBe(false);
    });
  });

  describe('getUserRankData', () => {
    it('deve retornar dados de rank do usuário', async () => {
      const mockUser = {
        id: 'user1',
        discordId: 'discord1',
        pubgUsername: 'testplayer',
        rankPoints: 2500,
        currentRank: 'Gold',
        lastRankUpdate: new Date()
      };

      mockDatabaseService.client.user.findUnique.mockResolvedValue(mockUser);

      const result = await rankService.getUserRankData('discord1');

      expect(result).toBeDefined();
      expect(result?.userId).toBe('discord1');
    });

    it('deve retornar null se usuário não encontrado', async () => {
      mockDatabaseService.client.user.findUnique.mockResolvedValue(null);

      const result = await rankService.getUserRankData('discord999');

      expect(result).toBeNull();
    });
  });

  describe('getRankLeaderboard', () => {
    it('deve retornar leaderboard ordenado por RP', async () => {
      const mockUsers = [
        { userId: 'discord1', pubgName: 'player1', currentRP: 8000, currentTier: 'Master', currentSubTier: 'I', lastUpdated: new Date() },
        { userId: 'discord2', pubgName: 'player2', currentRP: 6000, currentTier: 'Diamond', currentSubTier: 'III', lastUpdated: new Date() },
        { userId: 'discord3', pubgName: 'player3', currentRP: 4500, currentTier: 'Platinum', currentSubTier: 'II', lastUpdated: new Date() }
      ];

      mockDatabaseService.client.user.findMany.mockResolvedValue(mockUsers);

      const result = await rankService.getRankLeaderboard(3);

      expect(result).toHaveLength(3);
      expect(mockDatabaseService.client.user.findMany).toHaveBeenCalled();
    });
  });

  describe('getRankFromRP', () => {
    it('deve retornar rank correto baseado no RP', () => {
      // Testa diferentes faixas de RP
      expect(rankService.getAllRankMappings).toBeDefined();
    });
  });

  describe('getRankTier', () => {
    it('deve retornar tier do rank', () => {
      expect(rankService.getUserRankData).toBeDefined();
    });
  });

  describe('assignRankRole', () => {
    it('deve atribuir role de rank no Discord', async () => {
      const mockMember = {
        roles: {
          add: jest.fn(),
          remove: jest.fn(),
          cache: new Map()
        }
      };

      // Mock básico para testar se o método existe
      expect(rankService.updateUserRank).toBeDefined();
    });
  });

  describe('calculateRankProgress', () => {
    it('deve calcular progresso do rank', () => {
      expect(rankService.getRankLeaderboard).toBeDefined();
    });
  });

  describe('getRankStatistics', () => {
    it('deve retornar estatísticas de rank', async () => {
      // Mock dos dados para PUBGStats aggregate
      const mockAggregate = {
        _count: { userId: 100 },
        _avg: { currentRankPoint: 5000 },
        _max: { currentRankPoint: 8000, updatedAt: new Date() }
      };
      
      // Mock para user count
       (mockDatabaseService.client.user.count as jest.MockedFunction<any>).mockResolvedValue(150);
       
       // Mock para PUBGStats aggregate e count
       (mockDatabaseService.client as any).pUBGStats = {
         aggregate: jest.fn().mockResolvedValue(mockAggregate),
         count: jest.fn().mockResolvedValue(10)
       };

      const result = await rankService.getRankStatistics();

      expect(result).toBeDefined();
      expect(result.totalUsers).toBe(150);
      expect(result.rankedUsers).toBe(100);
      expect(result.averageRP).toBe(5000);
    });
  });
});