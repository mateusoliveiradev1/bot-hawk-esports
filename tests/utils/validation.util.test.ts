import { jest } from '@jest/globals';
import { ValidationUtils } from '../../src/utils/validation.util';
import { CommandInteraction, GuildMember } from 'discord.js';
import { DatabaseService } from '../../src/database/database.service';

// Mock Discord.js
jest.mock('discord.js', () => ({
  CommandInteraction: jest.fn(),
  GuildMember: jest.fn(),
  PermissionFlagsBits: {
    Administrator: 8n,
    ManageGuild: 32n,
    ModerateMembers: 1099511627776n
  }
}));

// Mock DatabaseService
jest.mock('../../src/database/database.service');

// Mock EmbedUtils
jest.mock('../../src/utils/embed-builder.util', () => ({
  EmbedUtils: {
    userNotRegistered: jest.fn().mockReturnValue({ title: 'Not Registered' }),
    internalError: jest.fn().mockReturnValue({ title: 'Error' }),
    noPermission: jest.fn().mockReturnValue({ title: 'No Permission' }),
    createErrorEmbed: jest.fn().mockReturnValue({ title: 'Error' }),
    insufficientPermissions: jest.fn().mockReturnValue({ title: 'Insufficient Permissions' })
  }
}));

describe('ValidationUtils', () => {
  let mockInteraction: jest.Mocked<CommandInteraction>;
  let mockDatabase: jest.Mocked<DatabaseService>;
  let mockMember: jest.Mocked<GuildMember>;

  beforeEach(() => {
    mockInteraction = {
      user: { id: 'user123' },
      guildId: 'guild123',
      guild: { id: 'guild123' },
      editReply: jest.fn(),
      member: null
    } as any;

    mockDatabase = {
      client: {
        user: {
          findUnique: jest.fn()
        }
      }
    } as any;

    mockMember = {
      permissions: {
        has: jest.fn()
      },
      guild: {
        id: 'guild123'
      }
    } as any;
  });

  describe('validateUserRegistration', () => {
    it('deve retornar válido para usuário registrado', async () => {
      const mockUser = {
         id: 'user123',
         guilds: [{ guildId: 'guild123' }]
       } as any;
       
       (mockDatabase.client.user.findUnique as jest.MockedFunction<any>).mockResolvedValue(mockUser);

      const result = await ValidationUtils.validateUserRegistration(mockInteraction, mockDatabase);

      expect(result.isValid).toBe(true);
      expect(result.user).toEqual(mockUser);
    });

    it('deve retornar inválido para usuário não registrado', async () => {
       (mockDatabase.client.user.findUnique as jest.MockedFunction<any>).mockResolvedValue(null);

       const result = await ValidationUtils.validateUserRegistration(mockInteraction, mockDatabase);

       expect(result.isValid).toBe(false);
       expect(result.user).toBeUndefined();
       expect(mockInteraction.editReply).toHaveBeenCalled();
     });

     it('deve lidar com erros de banco de dados', async () => {
       (mockDatabase.client.user.findUnique as jest.MockedFunction<any>).mockRejectedValue(new Error('Database error'));

       const result = await ValidationUtils.validateUserRegistration(mockInteraction, mockDatabase);

       expect(result.isValid).toBe(false);
       expect(mockInteraction.editReply).toHaveBeenCalled();
     });
  });

  describe('validatePermissions', () => {
    it('deve retornar true para usuário com permissões', async () => {
      mockInteraction.member = mockMember;
      mockMember.permissions.has.mockReturnValue(true);

      const result = await ValidationUtils.validatePermissions(mockInteraction, [8n]);

      expect(result).toBe(true);
    });

    it('deve retornar false para usuário sem permissões', async () => {
      mockInteraction.member = mockMember;
      mockMember.permissions.has.mockReturnValue(false);

      const result = await ValidationUtils.validatePermissions(mockInteraction, [8n]);

      expect(result).toBe(false);
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });
  });

  describe('validateStringParameter', () => {
    it('deve retornar true para string válida', () => {
      const result = ValidationUtils.validateStringParameter('valid string', 'test', mockInteraction);
      expect(result).toBe(true);
    });

    it('deve retornar false para string vazia', () => {
      const result = ValidationUtils.validateStringParameter('', 'test', mockInteraction);
      expect(result).toBe(false);
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('deve retornar false para null', () => {
      const result = ValidationUtils.validateStringParameter(null, 'test', mockInteraction);
      expect(result).toBe(false);
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });
  });

  describe('validateNumberParameter', () => {
    it('deve retornar true para número válido', () => {
      const result = ValidationUtils.validateNumberParameter(5, 1, 10, 'test', mockInteraction);
      expect(result).toBe(true);
    });

    it('deve retornar false para número fora do range', () => {
      const result = ValidationUtils.validateNumberParameter(15, 1, 10, 'test', mockInteraction);
      expect(result).toBe(false);
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });
  });
});