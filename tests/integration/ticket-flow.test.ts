import { jest } from '@jest/globals';
import { TicketService } from '../../src/services/ticket.service';
import { XPService } from '../../src/services/xp.service';
import { DatabaseService } from '../../src/database/database.service';
import { ExtendedClient } from '../../src/types/client';

// Mock das dependências
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

const mockXpTransactionMethods = {
  create: jest.fn() as jest.MockedFunction<any>
};

const mockDatabaseService = {
    client: {
      ticket: mockTicketMethods,
      user: mockUserMethods,
      xpTransaction: mockXpTransactionMethods
    }
  } as unknown as DatabaseService;

const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  clearPattern: jest.fn()
} as any;

const mockClient = {
  user: { id: '123456789' },
  guilds: {
    cache: new Map(),
    fetch: jest.fn()
  },
  channels: {
    cache: new Map(),
    fetch: jest.fn(),
    create: jest.fn()
  },
  database: mockDatabaseService,
  cache: mockCacheService
} as unknown as ExtendedClient;

describe('Ticket Flow Integration', () => {
  let ticketService: TicketService;
  let xpService: XPService;

  beforeEach(() => {
    jest.clearAllMocks();
    ticketService = new TicketService(mockClient);
    xpService = new XPService(mockClient);
  });

  describe('Fluxo completo de ticket', () => {
    it('deve criar ticket, processar interações e fechar com recompensa XP', async () => {
      // Dados do teste
      const userId = 'user123';
      const channelId = 'channel123';
      const staffId = 'staff456';
      const ticketCategory = 'support';

      // Mock do usuário
      const mockUser = {
        id: 'user123',
        discordId: userId,
        xp: 100,
        level: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock do ticket criado
      const mockTicket = {
        id: 'ticket123',
        userId,
        channelId,
        category: ticketCategory,
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: []
      };

      // Mock do ticket fechado
      const mockClosedTicket = {
        ...mockTicket,
        status: 'closed',
        closedBy: staffId,
        closedAt: new Date(),
        resolution: 'Problema resolvido com sucesso'
      };

      // Mock do usuário com XP atualizado
      const mockUpdatedUser = {
        ...mockUser,
        xp: 150, // +50 XP por ticket resolvido
        level: 1
      };

      // Configurar mocks
      mockUserMethods.findUnique.mockResolvedValue(mockUser);
      mockTicketMethods.create.mockResolvedValue(mockTicket);
      mockTicketMethods.findUnique.mockResolvedValue(mockTicket);
      mockTicketMethods.update.mockResolvedValue(mockClosedTicket);
      mockUserMethods.update.mockResolvedValue(mockUpdatedUser);
      mockXpTransactionMethods.create.mockResolvedValue({
        id: 'xp123',
        userId: 'user123',
        amount: 50,
        reason: 'ticket_resolved',
        createdAt: new Date()
      });

      // Passo 1: Criar ticket
      const createdTicket = await ticketService.createTicket(
        guildId,
        userId,
        'Support Ticket',
        'Need help',
        'medium'
      );

      expect(createdTicket.success).toBe(true);
      expect(createdTicket.ticket).toBeDefined();
      expect(mockTicketMethods.create).toHaveBeenCalled();

      // Passo 2: Verificar se ticket existe
      const foundTicket = await ticketService.getTicketById(guildId, mockTicket.id);
      expect(foundTicket).toEqual(mockTicket);

      // Passo 3: Simular atribuição do ticket ao staff
      mockTicketMethods.update.mockResolvedValue({
        ...mockTicket,
        assignedTo: staffId
      });

      const assignResult = await ticketService.assignTicket('guild123', mockTicket.id, staffId);
      expect(assignResult.success).toBe(true);
      expect(assignResult.message).toContain('atribuído');

      // Passo 4: Fechar ticket
      const closedTicket = await ticketService.closeTicket(mockTicket.id, staffId, 'Problema resolvido com sucesso');
      expect(closedTicket).toEqual(mockClosedTicket);
      expect(mockTicketMethods.update).toHaveBeenCalledWith({
        where: { id: mockTicket.id },
        data: {
          status: 'closed',
          closedBy: staffId,
          closedAt: expect.any(Date),
          resolution: 'Problema resolvido com sucesso'
        }
      });

      // Passo 5: Recompensar usuário com XP
      const xpResult = await xpService.addXP(userId, 'TICKET_RESOLVED');
      expect(xpResult.totalXP).toBe(150);
      expect(xpResult.leveledUp).toBe(false);
      expect(mockXpTransactionMethods.create).toHaveBeenCalledWith({
        data: {
          userId: 'user123',
          amount: 50,
          reason: 'ticket_resolved',
          metadata: expect.any(Object)
        }
      });
    });

    it('deve lidar com erro durante criação de ticket', async () => {
      const userId = 'user123';
      const channelId = 'channel123';

      // Simular erro no banco de dados
      mockTicketMethods.create.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(ticketService.createTicket('guild123', userId, 'Support Ticket', 'Need help', 'medium'))
        .rejects.toThrow('Database connection failed');
    });

    it('deve prevenir fechamento de ticket já fechado', async () => {
      const ticketId = 'ticket123';
      const staffId = 'staff456';

      // Mock de ticket já fechado
      const closedTicket = {
        id: ticketId,
        userId: 'user123',
        status: 'closed',
        closedAt: new Date(),
        closedBy: 'staff123'
      };

      mockTicketMethods.findUnique.mockResolvedValue(closedTicket);

      await expect(ticketService.closeTicket('guild123', ticketId, staffId))
        .rejects.toThrow('Ticket já está fechado');
    });

    it('deve calcular estatísticas de tickets corretamente', async () => {
      const mockTickets = [
        {
          id: '1',
          status: 'open',
          category: 'support',
          createdAt: new Date('2023-12-01'),
          closedAt: null,
          responseTime: null
        },
        {
          id: '2',
          status: 'closed',
          category: 'bug',
          createdAt: new Date('2023-12-01'),
          closedAt: new Date('2023-12-02'),
          responseTime: 3600 // 1 hora
        },
        {
          id: '3',
          status: 'closed',
          category: 'support',
          createdAt: new Date('2023-12-01'),
          closedAt: new Date('2023-12-01'),
          responseTime: 1800 // 30 minutos
        }
      ];

      mockTicketMethods.findMany.mockResolvedValue(mockTickets);

      const stats = await ticketService.getTicketStats('guild123');

      expect(stats).toEqual({
        total: 3,
        open: 1,
        closed: 2,
        byCategory: {
          support: 2,
          bug: 1
        },
        averageResponseTime: 2700, // (3600 + 1800) / 2
        resolutionRate: 66.67 // 2/3 * 100
      });
    });

    it('deve listar tickets do usuário ordenados por data', async () => {
      const userId = 'user123';
      const mockUserTickets = [
        {
          id: '3',
          userId,
          status: 'open',
          category: 'support',
          createdAt: new Date('2023-12-03')
        },
        {
          id: '1',
          userId,
          status: 'closed',
          category: 'bug',
          createdAt: new Date('2023-12-01')
        },
        {
          id: '2',
          userId,
          status: 'closed',
          category: 'support',
          createdAt: new Date('2023-12-02')
        }
      ];

      mockTicketMethods.findMany.mockResolvedValue(mockUserTickets);

      const userTickets = await ticketService.getUserTickets('guild123', userId);

      expect(userTickets).toEqual(mockUserTickets);
      expect(mockTicketMethods.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
          messages: true,
          assignedStaff: true
        }
      });
    });

    it('deve validar permissões antes de fechar ticket', async () => {
      const ticketId = 'ticket123';
      const unauthorizedUserId = 'user456';

      const mockTicket = {
        id: ticketId,
        userId: 'user123', // Ticket pertence a outro usuário
        status: 'open'
      };

      mockTicketMethods.findUnique.mockResolvedValue(mockTicket);

      // Usuário não autorizado tentando fechar ticket de outro usuário
      await expect(ticketService.closeTicket('guild123', ticketId, unauthorizedUserId))
        .rejects.toThrow('Não autorizado a fechar este ticket');
    });
  });

  describe('Integração com sistema de notificações', () => {
    it('deve enviar notificações durante o ciclo de vida do ticket', async () => {
      const mockNotificationService = {
        sendTicketCreated: jest.fn(),
        sendTicketAssigned: jest.fn(),
        sendTicketClosed: jest.fn()
      };

      // Simular integração com serviço de notificações
      const ticketWithNotifications = new TicketService(mockClient);
      (ticketWithNotifications as any).notificationService = mockNotificationService;

      const ticketData = {
        userId: 'user123',
        channelId: 'channel123',
        category: 'support'
      };

      const mockTicket = {
        id: 'ticket123',
        ...ticketData,
        status: 'open',
        createdAt: new Date()
      };

      mockTicketMethods.create.mockResolvedValue(mockTicket);

      await ticketWithNotifications.createTicket('guild123', 'user123', 'Test Ticket', 'Test Description', 'medium');

      // Verificar se notificação foi enviada
      expect(mockNotificationService.sendTicketCreated).toHaveBeenCalledWith(mockTicket);
    });
  });
});