import { jest } from '@jest/globals';
import { TicketService } from '../../src/services/ticket.service';
import { DatabaseService } from '../../src/database/database.service';
import { ExtendedClient } from '../../src/types/client';

// Mock específicos para ticket e user
const mockTicketMethods = {
  findUnique: jest.fn() as jest.MockedFunction<any>,
  findMany: jest.fn() as jest.MockedFunction<any>,
  create: jest.fn() as jest.MockedFunction<any>,
  update: jest.fn() as jest.MockedFunction<any>,
  delete: jest.fn() as jest.MockedFunction<any>
};

const mockUserMethods = {
  findUnique: jest.fn() as jest.MockedFunction<any>,
  create: jest.fn() as jest.MockedFunction<any>,
  update: jest.fn() as jest.MockedFunction<any>
};

const mockDatabaseService = {
  client: {
    ticket: mockTicketMethods,
    user: mockUserMethods
  }
} as unknown as DatabaseService;

const mockClient = {
  user: { id: '123456789' },
  guilds: {
    cache: new Map(),
    fetch: jest.fn()
  },
  channels: {
    cache: new Map(),
    fetch: jest.fn()
  }
} as unknown as ExtendedClient;

describe('TicketService', () => {
  let ticketService: TicketService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTicketMethods.findUnique.mockReset();
    mockTicketMethods.findMany.mockReset();
    mockTicketMethods.create.mockReset();
    mockTicketMethods.update.mockReset();
    mockTicketMethods.delete.mockReset();
    mockUserMethods.findUnique.mockReset();
    mockUserMethods.create.mockReset();
    mockUserMethods.update.mockReset();
    ticketService = new TicketService(mockClient);
  });

  describe('createTicket', () => {
    it('deve criar um ticket com sucesso', async () => {
      const mockTicketData = {
        id: 'ticket123',
        title: 'Test Ticket',
        description: 'Test Description',
        priority: 'medium',
        userId: 'user123',
        guildId: 'guild123',
        channelId: null,
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: '{}'
      };

      // Mock guild and user fetch
       const mockGuild = {
         id: 'guild123',
         members: {
           fetch: jest.fn().mockResolvedValue(new Map([[
          'user123',
          { user: { id: 'user123', username: 'testuser' } }
        ]])) as any
         }
       };
       
       (mockClient.guilds.cache as any).set('guild123', mockGuild);
      mockTicketMethods.create.mockResolvedValue(mockTicketData);
      mockTicketMethods.update.mockResolvedValue({ ...mockTicketData, channelId: 'channel123' });

      const result = await ticketService.createTicket('guild123', 'user123', 'Test Ticket', 'Test Description', 'medium');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Ticket criado com sucesso!');
      expect(mockTicketMethods.create).toHaveBeenCalled();
    });

    it('deve lançar erro quando dados inválidos são fornecidos', async () => {
      const result = await ticketService.createTicket('guild123', '', 'Título', 'Descrição', 'medium');
      expect(result.success).toBe(false);
      expect(result.message).toBe('ID do usuário inválido.');
    });
  });

  describe('getTicket', () => {
    it('deve retornar um ticket existente', async () => {
      const mockTicket = {
        id: '1',
        userId: 'user123',
        channelId: 'channel123',
        category: 'support',
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockTicketMethods.findUnique.mockResolvedValue(mockTicket);

      const result = await ticketService.getTicketById('guild123', '1');

      expect(result).toEqual(mockTicket);
      expect(mockTicketMethods.findUnique).toHaveBeenCalledWith({
        where: { id: '1' }
      });
    });

    it('deve retornar null para ticket inexistente', async () => {
      mockTicketMethods.findUnique.mockResolvedValue(null);

      const result = await ticketService.getTicketById('guild123', '999');

      expect(result).toBeNull();
    });
  });

  describe('closeTicket', () => {
    it('deve fechar um ticket com sucesso', async () => {
      const mockTicket = {
        id: '1',
        userId: 'user123',
        channelId: 'channel123',
        category: 'support',
        status: 'closed',
        createdAt: new Date(),
        updatedAt: new Date(),
        closedAt: new Date()
      };

      mockTicketMethods.update.mockResolvedValue(mockTicket);

      const result = await ticketService.closeTicket('guild123', '1', 'user456');

      expect(result).toEqual(mockTicket);
      expect(mockTicketMethods.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: {
          status: 'closed',
          closedBy: 'user456',
          closedAt: expect.any(Date)
        }
      });
    });
  });

  describe('getUserTickets', () => {
    it('deve retornar tickets do usuário', async () => {
      const mockTickets = [
        {
          id: '1',
          userId: 'user123',
          channelId: 'channel123',
          category: 'support',
          status: 'open',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: '2',
          userId: 'user123',
          channelId: 'channel456',
          category: 'bug',
          status: 'closed',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockTicketMethods.findMany.mockResolvedValue(mockTickets);

      const result = await ticketService.getUserTickets('guild123', 'user123');

      expect(result).toEqual(mockTickets);
      expect(mockTicketMethods.findMany).toHaveBeenCalledWith({
        where: { userId: 'user123' },
        orderBy: { createdAt: 'desc' }
      });
    });
  });

  describe('getActiveTickets', () => {
    it('deve retornar apenas tickets ativos', async () => {
      const mockActiveTickets = [
        {
          id: '1',
          userId: 'user123',
          channelId: 'channel123',
          category: 'support',
          status: 'open',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockTicketMethods.findMany.mockResolvedValue(mockActiveTickets);

      const result = await ticketService.getGuildTickets('guild123', 'open');

      expect(result).toEqual(mockActiveTickets);
      expect(mockTicketMethods.findMany).toHaveBeenCalledWith({
        where: {
          status: {
            in: ['open', 'in_progress']
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    });
  });
});