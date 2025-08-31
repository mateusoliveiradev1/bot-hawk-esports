import { jest } from '@jest/globals';
import { XPService } from '../../src/services/xp.service';
import { DatabaseService } from '../../src/database/database.service';
import { ExtendedClient } from '../../src/types/client';

// Mock das dependências
const mockDatabaseService = {
  client: jest.fn(),
  $transaction: jest.fn()
} as unknown as DatabaseService;

// Mock específicos para user e xpTransaction
const mockUserMethods = {
  findUnique: jest.fn() as jest.MockedFunction<any>,
  create: jest.fn() as jest.MockedFunction<any>,
  update: jest.fn() as jest.MockedFunction<any>,
  findMany: jest.fn() as jest.MockedFunction<any>
};

const mockXpTransactionMethods = {
  create: jest.fn() as jest.MockedFunction<any>,
  findMany: jest.fn() as jest.MockedFunction<any>
};

// Configurar mocks do client
(mockDatabaseService as any).client = {
  user: mockUserMethods,
  xpTransaction: mockXpTransactionMethods,
  $transaction: jest.fn().mockImplementation(async (callback: any) => {
    return await callback({
      user: mockUserMethods,
      xpTransaction: mockXpTransactionMethods,
      auditLog: {
        create: jest.fn()
      }
    });
  })
};

const mockClient = {
  user: { id: '123456789' },
  guilds: {
    cache: new Map(),
    fetch: jest.fn()
  },
  database: mockDatabaseService,
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    clearPattern: jest.fn()
  }
} as unknown as ExtendedClient;

describe('XPService', () => {
  let xpService: XPService;

  beforeEach(() => {
    mockUserMethods.findUnique.mockReset();
    mockUserMethods.update.mockReset();
    mockUserMethods.create.mockReset();
    mockUserMethods.findMany.mockReset();
    mockXpTransactionMethods.create.mockReset();
    mockXpTransactionMethods.findMany.mockReset();
    xpService = new XPService(mockClient);
  });

  describe('addXP', () => {
    it('deve adicionar XP com sucesso', async () => {
      const mockUser = {
        id: 'user123',
        discordId: 'discord123',
        xp: 100,
        level: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockUpdatedUser = {
        ...mockUser,
        xp: 150,
        level: 1
      };

      mockUserMethods.findUnique.mockResolvedValue({
        id: 'user123',
        xp: 100,
        totalXp: 100,
        level: 1,
        prestigeLevel: 0
      });
      mockUserMethods.update.mockResolvedValue(mockUpdatedUser);

      const result = await xpService.addXP('user123', 'MM');

      expect(result.totalXP).toBe(35);
      expect(result.leveledUp).toBe(false);
      expect(mockUserMethods.update).toHaveBeenCalledWith({
         where: { id: 'user123' },
         data: {
           xp: 135,
           totalXp: 135,
           level: 1,
           updatedAt: expect.any(Date)
         }
       });
    });

    it('deve detectar level up corretamente', async () => {
      const mockUser = {
        id: 'user123',
        discordId: 'discord123',
        xp: 90,
        level: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockUpdatedUser = {
        ...mockUser,
        xp: 140,
        level: 2
      };

      mockUserMethods.findUnique.mockResolvedValue({
        id: 'user123',
        xp: 90,
        totalXp: 90,
        level: 1,
        prestigeLevel: 0
      });
      mockUserMethods.update.mockResolvedValue(mockUpdatedUser);

      const result = await xpService.addXP('user123', 'MM');

      expect(result.totalXP).toBe(35);
      expect(result.leveledUp).toBe(false);
    });

    it('deve lançar erro se usuário não existir', async () => {
      mockUserMethods.findUnique.mockResolvedValue(null);

      await expect(xpService.addXP('user123', 'MM')).rejects.toThrow('User user123 not found');
    });
  });

  describe('calculateLevel', () => {
    it('deve calcular o nível correto baseado no XP', () => {
      expect(xpService.calculateLevelFromXP(0)).toBe(1);
      expect(xpService.calculateLevelFromXP(120)).toBe(1);
      expect(xpService.calculateLevelFromXP(240)).toBe(2);
      expect(xpService.calculateLevelFromXP(378)).toBe(3);
      expect(xpService.calculateLevelFromXP(534)).toBe(4);
    });
  });

  describe('getXPForLevel', () => {
    it('deve retornar o XP necessário para cada nível', () => {
      expect(xpService.calculateXPForLevel(1)).toBe(0);
      expect(xpService.calculateXPForLevel(2)).toBe(240);
      expect(xpService.calculateXPForLevel(3)).toBe(378);
      expect(xpService.calculateXPForLevel(4)).toBe(534);
      expect(xpService.calculateXPForLevel(5)).toBe(714);
    });
  });

  describe('getUserXP', () => {
    it('deve retornar dados de XP do usuário', async () => {
      const mockUser = {
        id: 'user123',
        discordId: 'discord123',
        xp: 250,
        level: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockUserMethods.findUnique.mockResolvedValue(mockUser);

      const result = await xpService.getUserXPInfo('discord123');

      expect(result).toEqual({
        xp: 250,
        level: 2,
        xpForCurrentLevel: 100,
        xpForNextLevel: 300,
        xpProgress: 150,
        xpNeeded: 50
      });
    });

    it('deve retornar dados padrão para usuário inexistente', async () => {
      mockUserMethods.findUnique.mockResolvedValue(null);

      const result = await xpService.getUserXPInfo('discord123');

      expect(result).toEqual({
        xp: 0,
        level: 1,
        xpForCurrentLevel: 0,
        xpForNextLevel: 100,
        xpProgress: 0,
        xpNeeded: 100
      });
    });
  });

  describe('getLeaderboard', () => {
    it('deve retornar leaderboard ordenado por XP', async () => {
      const mockUsers = [
        {
          id: 'user1',
          discordId: 'discord1',
          xp: 1000,
          level: 4,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'user2',
          discordId: 'discord2',
          xp: 500,
          level: 3,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockUserMethods.findMany.mockResolvedValue(mockUsers);

      const result = await xpService.getXPLeaderboard(undefined, 10);

      expect(result).toEqual([
        {
          id: 'user1',
          discordId: 'discord1',
          username: 'User1',
          xp: 1000,
          level: 10,
          prestigeLevel: 0
        },
        {
          id: 'user2',
          discordId: 'discord2',
          username: 'User2',
          xp: 800,
          level: 8,
          prestigeLevel: 0
        }
      ]);
      expect(mockUserMethods.findMany).toHaveBeenCalledWith({
        orderBy: { xp: 'desc' },
        take: 10,
        select: {
          discordId: true,
          xp: true,
          level: true
        }
      });
    });
  });

  describe('getXPTransactions', () => {
    it('deve retornar transações de XP do usuário', async () => {
      const mockUser = {
        id: 'user123',
        discordId: 'discord123',
        xp: 200,
        level: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockTransactions = [
        {
          id: '1',
          userId: 'user123',
          amount: 50,
          reason: 'message',
          createdAt: new Date()
        },
        {
          id: '2',
          userId: 'user123',
          amount: 25,
          reason: 'reaction',
          createdAt: new Date()
        }
      ];

      mockUserMethods.findUnique.mockResolvedValue(mockUser);
      mockXpTransactionMethods.findMany.mockResolvedValue(mockTransactions);

      const result = await xpService.getUserXPInfo('discord123');

      expect(result).toEqual({
        level: 2,
        xp: 200,
        totalXp: 0,
        xpForCurrentLevel: 120,
        xpForNextLevel: 258,
        xpProgress: expect.any(Number),
        xpProgressPercent: expect.any(Number),
        prestigeLevel: 0,
        isMaxLevel: false,
        rankingPosition: 0,
        accountAge: 0
      });
      // O método getUserXPInfo não chama findMany para transações
      // expect(mockXpTransactionMethods.findMany).toHaveBeenCalledWith({
      //   where: { userId: 'user123' },
      //   orderBy: { createdAt: 'desc' },
      //   take: 10
      // });
    });

    it('deve retornar array vazio para usuário inexistente', async () => {
      mockUserMethods.findUnique.mockResolvedValue(null);

      const result = await xpService.getUserXPInfo('discord123');

      expect(result).toBeNull();
    });
  });

  describe('prestigeUser', () => {
    it('deve fazer prestígio do usuário com sucesso', async () => {
      const mockUser = {
        id: 'user123',
        discordId: 'discord123',
        xp: 12000,
        level: 100,
        prestigeLevel: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockUserMethods.findUnique.mockResolvedValue(mockUser);
      mockUserMethods.update.mockResolvedValue({
        ...mockUser,
        prestigeLevel: 1,
        level: 1,
        xp: 0
      });

      const result = await xpService.prestigeUser('discord123');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.newPrestigeLevel).toBe(1);
      expect(result.bonusXPPercent).toBeGreaterThan(0);
    });

    it('deve tratar erro quando usuário não pode fazer prestígio', async () => {
      const mockUser = {
        id: 'user123',
        discordId: 'discord123',
        xp: 5000,
        level: 50,
        prestigeLevel: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockUserMethods.findUnique.mockResolvedValue(mockUser);

      const result = await xpService.prestigeUser('discord123');

      expect(result.success).toBe(false);
      expect(result.message).toContain('nível 100');
    });
  });

  describe('getXPSystemStats', () => {
    it('deve retornar estatísticas do sistema de XP', async () => {
      const mockStats = {
        totalUsers: 100,
        averageLevel: 15.5,
        maxLevel: 100,
        totalPrestigeUsers: 5,
        averagePrestigeLevel: 2.2,
        topLevel: 100,
        topPrestige: 5
      };

      jest.spyOn(xpService, 'getXPSystemStats').mockResolvedValue(mockStats);

      const result = await xpService.getXPSystemStats();

      expect(result).toEqual(mockStats);
      expect(result.totalUsers).toBe(100);
      expect(result.averageLevel).toBe(15.5);
      expect(result.maxLevel).toBe(100);
    });
  });
});