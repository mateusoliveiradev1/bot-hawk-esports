import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { BaseCommand } from '../../utils/base-command.util';
import { CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { PUBGService } from '../../services/pubg.service';
import { PUBGMonitorService } from '../../services/pubg-monitor.service';
import { PUBGPlatform } from '../../types/pubg';

class PubgAdminCommand extends BaseCommand {
  constructor() {
    super({
      category: CommandCategory.ADMIN,
      cooldown: 5,
    });
  }

  data = new SlashCommandBuilder()
    .setName('pubg-admin')
    .setDescription('Comandos administrativos para gerenciar a API PUBG')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand.setName('status').setDescription('Verificar status detalhado da API PUBG')
    )
    .addSubcommand(subcommand =>
      subcommand.setName('health').setDescription('Executar verificação de saúde da API PUBG')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('test')
        .setDescription('Testar conectividade com a API PUBG')
        .addStringOption(option =>
          option
            .setName('platform')
            .setDescription('Plataforma para testar')
            .setRequired(false)
            .addChoices(
              { name: 'Steam', value: 'steam' },
              { name: 'Xbox', value: 'xbox' },
              { name: 'PlayStation', value: 'psn' },
              { name: 'Stadia', value: 'stadia' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('cache')
        .setDescription('Gerenciar cache da API PUBG')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Ação a ser executada')
            .setRequired(true)
            .addChoices(
              { name: 'Limpar Cache', value: 'clear' },
              { name: 'Estatísticas', value: 'stats' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('monitor')
        .setDescription('Controlar monitoramento da API PUBG')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Ação de monitoramento')
            .setRequired(true)
            .addChoices(
              { name: 'Iniciar', value: 'start' },
              { name: 'Parar', value: 'stop' },
              { name: 'Status', value: 'status' },
              { name: 'Forçar Recuperação', value: 'recover' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('sync')
        .setDescription('Sincronizar estatísticas de usuários')
        .addIntegerOption(option =>
          option
            .setName('max-users')
            .setDescription('Máximo de usuários para sincronizar')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(100)
        )
    );

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    const subcommand = interaction.options.getSubcommand();
    const pubgService = client.services.pubg as PUBGService;
    const pubgMonitor = client.services.pubgMonitor as PUBGMonitorService;

    if (!pubgService) {
      return interaction.reply({
        content: '❌ Serviço PUBG não está disponível.',
        ephemeral: true,
      });
    }

    try {
      switch (subcommand) {
        case 'status':
          await handleStatusCommand(interaction, pubgService, pubgMonitor);
          break;
        case 'health':
          await handleHealthCommand(interaction, pubgService);
          break;
        case 'test':
          await handleTestCommand(interaction, pubgService);
          break;
        case 'cache':
          await handleCacheCommand(interaction, pubgService);
          break;
        case 'monitor':
          await handleMonitorCommand(interaction, pubgMonitor);
          break;
        case 'sync':
          await handleSyncCommand(interaction, pubgService);
          break;
        default:
          await interaction.reply({
            content: '❌ Subcomando não reconhecido.',
            ephemeral: true,
          });
      }
    } catch (error: any) {
      console.error('Erro no comando pubg-admin:', error);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `❌ Erro ao executar comando: ${error.message}`,
          ephemeral: true,
        });
      } else {
        await interaction.followUp({
          content: `❌ Erro ao executar comando: ${error.message}`,
          ephemeral: true,
        });
      }
    }
  }
}

async function handleStatusCommand(
  interaction: ChatInputCommandInteraction,
  pubgService: PUBGService,
  pubgMonitor?: PUBGMonitorService
) {
  await interaction.deferReply({ ephemeral: true });

  const health = await pubgService.healthCheck();
  const cacheStats = await pubgService.getCacheStats();

  let monitorStatus = null;
  let monitorStats = null;

  if (pubgMonitor) {
    monitorStatus = pubgMonitor.getStatus();
    monitorStats = pubgMonitor.getStatistics();
  }

  const embed = new EmbedBuilder()
    .setTitle('🎮 Status da API PUBG')
    .setColor(
      health.status === 'healthy' ? 0x00ff00 : health.status === 'degraded' ? 0xffaa00 : 0xff0000
    )
    .addFields(
      {
        name: '📊 Status Geral',
        value: `**Status:** ${getStatusEmoji(health.status)} ${health.status.toUpperCase()}\n**API:** ${health.api ? '✅ Online' : '❌ Offline'}\n**Cache:** ${health.cache ? '✅ Online' : '❌ Offline'}`,
        inline: true,
      },
      {
        name: '🔧 Circuit Breaker',
        value: `**Estado:** ${getCircuitBreakerEmoji(health.circuitBreaker)} ${health.circuitBreaker.toUpperCase()}\n**Falhas:** ${health.metrics.failures}\n**Timeout:** ${health.metrics.timeoutRemaining > 0 ? `${Math.round(health.metrics.timeoutRemaining / 1000)}s` : 'N/A'}`,
        inline: true,
      },
      {
        name: '💾 Cache',
        value: `**Total de Chaves:** ${cacheStats.totalKeys}\n**Padrões:** ${Object.keys(cacheStats.patterns).length}`,
        inline: true,
      }
    )
    .setTimestamp();

  if (monitorStatus && monitorStats) {
    embed.addFields(
      {
        name: '🔍 Monitoramento',
        value: `**Status:** ${monitorStatus.isHealthy ? '✅ Saudável' : '❌ Com Problemas'}\n**Uptime:** ${formatUptime(monitorStats.uptime)}\n**Taxa de Sucesso:** ${monitorStats.successRate.toFixed(1)}%`,
        inline: true,
      },
      {
        name: '📈 Estatísticas',
        value: `**Total de Verificações:** ${monitorStats.totalChecks}\n**Falhas Consecutivas:** ${monitorStatus.consecutiveFailures}\n**Tempo de Resposta:** ${monitorStats.averageResponseTime}ms`,
        inline: true,
      }
    );
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleHealthCommand(
  interaction: ChatInputCommandInteraction,
  pubgService: PUBGService
) {
  await interaction.deferReply({ ephemeral: true });

  const startTime = Date.now();
  const health = await pubgService.healthCheck();
  const duration = Date.now() - startTime;

  const embed = new EmbedBuilder()
    .setTitle('🏥 Verificação de Saúde da API PUBG')
    .setColor(
      health.status === 'healthy' ? 0x00ff00 : health.status === 'degraded' ? 0xffaa00 : 0xff0000
    )
    .addFields(
      {
        name: '📊 Resultado',
        value: `**Status:** ${getStatusEmoji(health.status)} ${health.status.toUpperCase()}\n**Tempo de Resposta:** ${duration}ms\n**Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`,
        inline: false,
      },
      {
        name: '🔍 Detalhes',
        value: `**API Disponível:** ${health.api ? '✅ Sim' : '❌ Não'}\n**Cache Funcionando:** ${health.cache ? '✅ Sim' : '❌ Não'}\n**Circuit Breaker:** ${getCircuitBreakerEmoji(health.circuitBreaker)} ${health.circuitBreaker}`,
        inline: false,
      }
    )
    .setTimestamp();

  if (health.metrics.failures > 0) {
    embed.addFields({
      name: '⚠️ Métricas de Falha',
      value: `**Total de Falhas:** ${health.metrics.failures}\n**Última Falha:** ${health.metrics.lastFailure ? `<t:${Math.floor(new Date(health.metrics.lastFailure).getTime() / 1000)}:R>` : 'N/A'}`,
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleTestCommand(
  interaction: ChatInputCommandInteraction,
  pubgService: PUBGService
) {
  await interaction.deferReply({ ephemeral: true });

  const platform =
    (interaction.options.getString('platform') as PUBGPlatform) || PUBGPlatform.STEAM;

  const embed = new EmbedBuilder()
    .setTitle('🧪 Teste de Conectividade PUBG API')
    .setColor(0x0099ff)
    .setTimestamp();

  try {
    // Test API availability
    const startTime = Date.now();
    const isAvailable = await pubgService.isAPIAvailable();
    const apiTestDuration = Date.now() - startTime;

    // Test getting current season
    const seasonStartTime = Date.now();
    const currentSeason = await pubgService.getCurrentSeason(platform);
    const seasonTestDuration = Date.now() - seasonStartTime;

    embed.addFields(
      {
        name: '🌐 Teste de Disponibilidade',
        value: `**Resultado:** ${isAvailable ? '✅ Sucesso' : '❌ Falha'}\n**Tempo:** ${apiTestDuration}ms\n**Plataforma:** ${platform.toUpperCase()}`,
        inline: true,
      },
      {
        name: '📅 Teste de Season',
        value: `**Season Atual:** ${currentSeason || 'N/A'}\n**Tempo:** ${seasonTestDuration}ms\n**Status:** ${currentSeason ? '✅ Sucesso' : '❌ Falha'}`,
        inline: true,
      }
    );

    if (isAvailable && currentSeason) {
      embed.setColor(0x00ff00);
      embed.setDescription(
        '✅ Todos os testes passaram! A API PUBG está funcionando corretamente.'
      );
    } else {
      embed.setColor(0xff0000);
      embed.setDescription('❌ Alguns testes falharam. Verifique a configuração da API.');
    }
  } catch (error: any) {
    embed.setColor(0xff0000);
    embed.setDescription(`❌ Erro durante os testes: ${error.message}`);
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleCacheCommand(
  interaction: ChatInputCommandInteraction,
  pubgService: PUBGService
) {
  await interaction.deferReply({ ephemeral: true });

  const action = interaction.options.getString('action', true);

  if (action === 'clear') {
    await pubgService.clearCache();

    const embed = new EmbedBuilder()
      .setTitle('🗑️ Cache Limpo')
      .setDescription('✅ O cache da API PUBG foi limpo com sucesso.')
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } else if (action === 'stats') {
    const stats = await pubgService.getCacheStats();

    const embed = new EmbedBuilder()
      .setTitle('📊 Estatísticas do Cache PUBG')
      .setColor(0x0099ff)
      .addFields({
        name: '📈 Resumo',
        value: `**Total de Chaves:** ${stats.totalKeys}\n**Padrões Diferentes:** ${Object.keys(stats.patterns).length}`,
        inline: false,
      })
      .setTimestamp();

    if (Object.keys(stats.patterns).length > 0) {
      const patternsList = Object.entries(stats.patterns)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([pattern, count]) => `**${pattern}:** ${count}`)
        .join('\n');

      embed.addFields({
        name: '🏷️ Top 10 Padrões',
        value: patternsList,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }
}

async function handleMonitorCommand(
  interaction: ChatInputCommandInteraction,
  pubgMonitor?: PUBGMonitorService
) {
  if (!pubgMonitor) {
    return interaction.reply({
      content: '❌ Serviço de monitoramento PUBG não está disponível.',
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const action = interaction.options.getString('action', true);

  switch (action) {
    case 'start':
      await pubgMonitor.start();
      await interaction.editReply({
        content: '✅ Monitoramento da API PUBG iniciado com sucesso.',
      });
      break;

    case 'stop':
      await pubgMonitor.stop();
      await interaction.editReply({
        content: '⏹️ Monitoramento da API PUBG parado com sucesso.',
      });
      break;

    case 'status':
      const status = pubgMonitor.getStatus();
      const stats = pubgMonitor.getStatistics();

      const embed = new EmbedBuilder()
        .setTitle('🔍 Status do Monitoramento PUBG')
        .setColor(status.isHealthy ? 0x00ff00 : 0xff0000)
        .addFields(
          {
            name: '📊 Status Atual',
            value: `**Saudável:** ${status.isHealthy ? '✅ Sim' : '❌ Não'}\n**Uptime:** ${formatUptime(stats.uptime)}\n**Taxa de Sucesso:** ${stats.successRate.toFixed(1)}%`,
            inline: true,
          },
          {
            name: '📈 Estatísticas',
            value: `**Total de Verificações:** ${stats.totalChecks}\n**Falhas Consecutivas:** ${status.consecutiveFailures}\n**Tempo de Resposta:** ${stats.averageResponseTime}ms`,
            inline: true,
          }
        )
        .setTimestamp();

      if (status.lastError) {
        embed.addFields({
          name: '❌ Último Erro',
          value: status.lastError,
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
      break;

    case 'recover':
      const recovered = await pubgMonitor.forceRecovery();
      await interaction.editReply({
        content: recovered
          ? '✅ Recuperação forçada executada com sucesso.'
          : '❌ Falha na tentativa de recuperação forçada.',
      });
      break;
  }
}

async function handleSyncCommand(
  interaction: ChatInputCommandInteraction,
  pubgService: PUBGService
) {
  await interaction.deferReply({ ephemeral: true });

  const maxUsers = interaction.options.getInteger('max-users') || 50;

  const syncedUsers = await pubgService.syncAllUserStats(maxUsers);

  const embed = new EmbedBuilder()
    .setTitle('🔄 Sincronização de Estatísticas')
    .setDescription(`Sincronização concluída para ${syncedUsers} usuários.`)
    .setColor(syncedUsers > 0 ? 0x00ff00 : 0xffaa00)
    .addFields({
      name: '📊 Resultado',
      value: `**Usuários Processados:** ${syncedUsers}\n**Máximo Solicitado:** ${maxUsers}\n**Status:** ${syncedUsers > 0 ? '✅ Sucesso' : '⚠️ Nenhum usuário sincronizado'}`,
      inline: false,
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'healthy':
      return '✅';
    case 'degraded':
      return '⚠️';
    case 'unhealthy':
      return '❌';
    default:
      return '❓';
  }
}

function getCircuitBreakerEmoji(state: string): string {
  switch (state) {
    case 'closed':
      return '🟢';
    case 'half-open':
      return '🟡';
    case 'open':
      return '🔴';
    default:
      return '❓';
  }
}

function formatUptime(uptime: number): string {
  const seconds = Math.floor(uptime / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export default new PubgAdminCommand();
