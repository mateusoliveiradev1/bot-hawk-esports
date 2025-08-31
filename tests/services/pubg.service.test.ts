import { jest } from '@jest/globals';
import { PUBGService } from '../../src/services/pubg.service';
import { DatabaseService } from '../../src/database/database.service';
import { ExtendedClient } from '../../src/types/client';
import { PUBGPlatform } from '../../src/types/pubg';

// Mock do fetch global
global.fetch = jest.fn();

// Mock das dependências
const mockUserMethods = {
  findUnique: jest.fn() as jest.MockedFunction<any>,
  update: jest.fn() as jest.MockedFunction<any>
};

const mockPubgStatsMethods = {
  findUnique: jest.fn() as jest.MockedFunction<any>,
  create: jest.fn() as jest.MockedFunction<any>,
  update: jest.fn() as jest.MockedFunction<any>,
  upsert: jest.fn() as jest.MockedFunction<any>
};

const mockDatabaseService = {
  client: {
    user: mockUserMethods,
    pubgStats: mockPubgStatsMethods
  }
} as unknown as DatabaseService;

const mockClient = {
  user: { id: '123456789' }
} as unknown as ExtendedClient;

// Mock das variáveis de ambiente
process.env.PUBG_API_KEY = 'test-api-key';

describe('PUBGService', () => {
  let pubgService: PUBGService;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserMethods.findUnique.mockReset();
    mockUserMethods.update.mockReset();
    mockPubgStatsMethods.findUnique.mockReset();
    mockPubgStatsMethods.create.mockReset();
    mockPubgStatsMethods.update.mockReset();
    mockPubgStatsMethods.upsert.mockReset();
    pubgService = new PUBGService(mockClient, mockDatabaseService);
  });

  describe('getPlayerByName', () => {
    it('deve buscar jogador por nome com sucesso', async () => {
      const mockPlayerResponse = {
        data: [{
          type: 'player',
          id: 'account.player123',
          attributes: {
            name: 'TestPlayer',
            shardId: 'steam',
            createdAt: '2023-01-01T00:00:00Z',
            updatedAt: '2023-12-01T00:00:00Z',
            patchVersion: '',
            titleId: 'bluehole-pubg',
            stats: null
          },
          relationships: {
            matches: {
              data: []
            }
          },
          links: {
            self: 'https://api.pubg.com/shards/steam/players/account.player123',
            schema: ''
          }
        }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPlayerResponse
      } as Response);

      const result = await pubgService.getPlayerByName('TestPlayer', PUBGPlatform.STEAM);

      expect(result).toEqual(mockPlayerResponse.data[0]);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.pubg.com/shards/steam/players?filter[playerNames]=TestPlayer',
        {
          headers: {
            'Authorization': 'Bearer test-api-key',
            'Accept': 'application/vnd.api+json'
          }
        }
      );
    });

    it('deve lançar erro quando jogador não for encontrado', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] })
      } as Response);

      await expect(pubgService.getPlayerByName('NonExistentPlayer', PUBGPlatform.STEAM))
        .rejects.toThrow('Jogador não encontrado');
    });

    it('deve lançar erro quando API retornar erro', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as Response);

      await expect(pubgService.getPlayerByName('TestPlayer', PUBGPlatform.STEAM))
        .rejects.toThrow('Erro na API do PUBG: 404 Not Found');
    });
  });

  describe('getPlayerStats', () => {
    it('deve buscar estatísticas do jogador com sucesso', async () => {
      const mockStatsResponse = {
        data: {
          type: 'playerSeason',
          attributes: {
            gameModeStats: {
              squad: {
                assists: 10,
                boosts: 5,
                damageDealt: 15000.5,
                deathType: 'byPlayer',
                headshotKills: 8,
                heals: 12,
                killPlace: 15,
                kills: 25,
                longestKill: 350.75,
                longestTimeSurvived: 1800.5,
                losses: 8,
                maxKillStreaks: 4,
                mostSurvivalTime: 2100.25,
                rankPoints: 1850,
                rankPointsTitle: 'Silver',
                revives: 3,
                rideDistance: 5000.0,
                roadKills: 1,
                roundMostKills: 6,
                roundsPlayed: 50,
                suicides: 0,
                swimDistance: 100.5,
                teamKills: 0,
                timeSurvived: 45000.0,
                top10s: 20,
                vehicleDestroys: 2,
                walkDistance: 25000.0,
                weaponsAcquired: 150,
                winPlace: 1,
                wins: 12
              }
            }
          }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatsResponse
      } as Response);

      const result = await pubgService.getPlayerStats('account.player123', PUBGPlatform.STEAM, '2023-12');

      expect(result).toEqual(mockStatsResponse.data);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.pubg.com/shards/steam/players/account.player123/seasons/2023-12',
        {
          headers: {
            'Authorization': 'Bearer test-api-key',
            'Accept': 'application/vnd.api+json'
          }
        }
      );
    });
  });

  describe('getPlayerMatches', () => {
    it('deve buscar partidas do jogador com sucesso', async () => {
      const mockMatchesResponse = {
        data: {
          relationships: {
            matches: {
              data: [
                {
                  type: 'match',
                  id: 'match123'
                },
                {
                  type: 'match',
                  id: 'match456'
                }
              ]
            }
          }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMatchesResponse
      } as Response);

      const result = await pubgService.getPlayerMatches('account.player123', PUBGPlatform.STEAM);

      expect(result).toEqual(mockMatchesResponse.data.relationships.matches.data);
    });
  });

  // Métodos updateUserPubgStats e linkPubgAccount foram removidos do PUBGService
  // Estes testes foram removidos para manter compatibilidade com a implementação atual

  describe('calculateKDA', () => {
    it('deve calcular K/D/A corretamente', () => {
      expect(pubgService.calculateKDA(25, 10, 5)).toBe(3);
      expect(pubgService.calculateKDA(0, 10, 0)).toBe(0);
      expect(pubgService.calculateKDA(25, 0, 5)).toBe(30);
    });
  });

  describe('calculateWinRate', () => {
    it('deve calcular taxa de vitória corretamente', () => {
      expect(pubgService.calculateWinRate(12, 50)).toBe(24);
      expect(pubgService.calculateWinRate(0, 50)).toBe(0);
      expect(pubgService.calculateWinRate(12, 0)).toBe(0);
    });
  });

  describe('calculateAverageDamage', () => {
    it('deve calcular dano médio corretamente', () => {
      expect(pubgService.calculateAverageDamage(15000, 50)).toBe(300);
      expect(pubgService.calculateAverageDamage(0, 50)).toBe(0);
      expect(pubgService.calculateAverageDamage(15000, 0)).toBe(0);
    });
  });

  describe('isAPIAvailable', () => {
    it('deve verificar se o serviço está disponível', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { type: 'status', id: 'pubg-api' } })
      } as Response);

      const result = await pubgService.isAPIAvailable();

      expect(result).toBe(true);
    });

    it('deve retornar false quando serviço não estiver disponível', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await pubgService.isAPIAvailable();

      expect(result).toBe(false);
    });
  });

  describe('getCurrentSeason', () => {
    it('deve retornar temporada atual', async () => {
      const mockSeasonsResponse = {
        data: [
          {
            type: 'season',
            id: '2023-12',
            attributes: {
              isCurrentSeason: true,
              isOffseason: false
            }
          },
          {
            type: 'season',
            id: '2023-11',
            attributes: {
              isCurrentSeason: false,
              isOffseason: false
            }
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSeasonsResponse
      } as Response);

      const result = await pubgService.getCurrentSeason(PUBGPlatform.STEAM);

      expect(result).toBe('2023-12');
    });
  });
});