import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { BackupService } from '../../services/backup.service';
import { BackupScheduler } from '../../utils/backup-scheduler';
import { StructuredLogger } from '../../services/structured-logger.service';
import { getMonitoringConfig } from '../../config/monitoring.config';
import { HawkEmbedBuilder } from '../../utils/hawk-embed-builder';
import fs from 'fs/promises';
import path from 'path';

export const data = new SlashCommandBuilder()
  .setName('backup')
  .setDescription('Gerenciar backups do banco de dados')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(subcommand =>
    subcommand
      .setName('create')
      .setDescription('Criar um backup manual do banco de dados'),
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Ver status do sistema de backup'),
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('Listar backups disponíveis')
      .addIntegerOption(option =>
        option
          .setName('limit')
          .setDescription('Número máximo de backups para mostrar')
          .setMinValue(1)
          .setMaxValue(20),
      ),
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('info')
      .setDescription('Ver informações detalhadas de um backup')
      .addStringOption(option =>
        option
          .setName('filename')
          .setDescription('Nome do arquivo de backup')
          .setRequired(true),
      ),
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('cleanup')
      .setDescription('Limpar backups antigos baseado na política de retenção'),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  backupService: BackupService,
  backupScheduler: BackupScheduler,
  logger: StructuredLogger,
) {
  const subcommand = interaction.options.getSubcommand();
  const config = getMonitoringConfig();

  try {
    switch (subcommand) {
      case 'create':
        await handleCreateBackup(interaction, backupService, logger);
        break;
      case 'status':
        await handleBackupStatus(interaction, backupScheduler, config);
        break;
      case 'list':
        await handleListBackups(interaction, config);
        break;
      case 'info':
        await handleBackupInfo(interaction, config);
        break;
      case 'cleanup':
        await handleCleanupBackups(interaction, backupService, logger);
        break;
      default:
        await interaction.reply({
          content: '❌ Subcomando não reconhecido.',
          ephemeral: true,
        });
    }
  } catch (error) {
    logger.error('Error in backup command', {
      subcommand,
      userId: interaction.user.id,
      guildId: interaction.guildId,
      error: error instanceof Error ? error.message : String(error),
    });

    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: `❌ Erro ao executar comando: ${errorMessage}`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: `❌ Erro ao executar comando: ${errorMessage}`,
        ephemeral: true,
      });
    }
  }
}

async function handleCreateBackup(
  interaction: ChatInputCommandInteraction,
  backupService: BackupService,
  logger: StructuredLogger,
) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const startTime = Date.now();
    const result = await backupService.createBackup();
    const duration = Date.now() - startTime;

    const embed = HawkEmbedBuilder.createSuccessEmbed('Backup Criado com Sucesso')
      .setColor('#00ff00')
      .addFields(
        { name: '📁 Arquivo', value: `\`${path.basename(result.filePath)}\``, inline: true },
        { name: '📊 Tamanho', value: formatBytes(result.size), inline: true },
        { name: '⏱️ Duração', value: `${(duration / 1000).toFixed(2)}s`, inline: true },
        { name: '🗜️ Comprimido', value: result.compressed ? 'Sim' : 'Não', inline: true },
        { name: '🔐 Checksum', value: result.checksum ? `\`${result.checksum.slice(0, 16)}...\`` : 'N/A', inline: true },
        { name: '📅 Data', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    logger.info('Manual backup created via Discord command', {
      metadata: {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        backupPath: result.backupPath,
        size: result.size,
        duration,
      },
    });
  } catch (error) {
    throw new Error(`Falha ao criar backup: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function handleBackupStatus(
  interaction: ChatInputCommandInteraction,
  backupScheduler: BackupScheduler,
  config: any,
) {
  const status = backupScheduler.getStatus();
  const stats = await getBackupStats(config.backup.backupDir);

  const embed = HawkEmbedBuilder.createInfoEmbed('Status do Sistema de Backup')
    .setColor(status.isRunning ? '#00ff00' : '#ff9900')
    .addFields(
      { name: '🔄 Status', value: status.isRunning ? '✅ Ativo' : '⚠️ Inativo', inline: true },
      { name: '📅 Agendamento', value: `\`${status.schedule || 'N/A'}\``, inline: true },
      { name: '⏰ Próximo Backup', value: status.nextExecution ? `<t:${Math.floor(status.nextExecution.getTime() / 1000)}:R>` : 'N/A', inline: true },
      { name: '📁 Total de Backups', value: stats.totalBackups.toString(), inline: true },
      { name: '💾 Espaço Usado', value: formatBytes(stats.totalSize), inline: true },
      { name: '📊 Backup Mais Recente', value: stats.latestBackup ? `<t:${Math.floor(stats.latestBackup.getTime() / 1000)}:R>` : 'Nenhum', inline: true },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleListBackups(
  interaction: ChatInputCommandInteraction,
  config: any,
) {
  const limit = interaction.options.getInteger('limit') || 10;
  
  try {
    const backups = await getBackupList(config.backup.backupDir, limit);
    
    if (backups.length === 0) {
      await interaction.reply({
        content: '📂 Nenhum backup encontrado.',
        ephemeral: true,
      });
      return;
    }

    const embed = HawkEmbedBuilder.createInfoEmbed(`Lista de Backups (${backups.length})`)
      .setColor('#0099ff')
      .setDescription(
        backups.map((backup, index) => 
          `**${index + 1}.** \`${backup.name}\`\n` +
          `   📊 ${formatBytes(backup.size)} • 📅 <t:${Math.floor(backup.date.getTime() / 1000)}:R>`,
        ).join('\n\n'),
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    throw new Error(`Falha ao listar backups: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function handleBackupInfo(
  interaction: ChatInputCommandInteraction,
  config: any,
) {
  const filename = interaction.options.getString('filename', true);
  const backupPath = path.join(config.backup.backupDir, filename);
  
  try {
    const stats = await fs.stat(backupPath);
    const metadata = await getBackupMetadata(backupPath);
    
    const embed = HawkEmbedBuilder.createInfoEmbed('Informações do Backup')
      .setColor('#0099ff')
      .addFields(
        { name: '📁 Nome do Arquivo', value: `\`${filename}\``, inline: false },
        { name: '📊 Tamanho', value: formatBytes(stats.size), inline: true },
        { name: '📅 Data de Criação', value: `<t:${Math.floor(stats.mtime.getTime() / 1000)}:F>`, inline: true },
        { name: '🔐 Checksum', value: metadata?.checksum ? `\`${metadata.checksum.slice(0, 32)}...\`` : 'N/A', inline: false },
        { name: '🗜️ Comprimido', value: filename.endsWith('.gz') ? 'Sim' : 'Não', inline: true },
        { name: '📍 Caminho', value: `\`${backupPath}\``, inline: false },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      await interaction.reply({
        content: `❌ Backup \`${filename}\` não encontrado.`,
        ephemeral: true,
      });
    } else {
      throw new Error(`Falha ao obter informações do backup: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function handleCleanupBackups(
  interaction: ChatInputCommandInteraction,
  backupService: BackupService,
  logger: StructuredLogger,
) {
  await interaction.deferReply({ ephemeral: true });

  try {
    await backupService.cleanupOldBackups();
    
    const embed = HawkEmbedBuilder.createSuccessEmbed('Limpeza de Backups Concluída')
      .setDescription('A limpeza de backups antigos foi executada com sucesso baseada na política de retenção configurada.')
      .addFields(
        { name: '✅ Status', value: 'Concluído', inline: true },
        { name: '📅 Data', value: new Date().toLocaleString('pt-BR'), inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    logger.info('Backup cleanup executed via Discord command', {
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });
  } catch (error) {
    throw new Error(`Falha na limpeza de backups: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Helper functions
async function getBackupStats(backupDir: string): Promise<{
  totalBackups: number;
  totalSize: number;
  latestBackup?: Date;
}> {
  try {
    const files = await fs.readdir(backupDir);
    const backupFiles = files.filter(file => file.endsWith('.db') || file.endsWith('.db.gz'));
    
    let totalSize = 0;
    let latestBackup: Date | undefined;
    
    for (const file of backupFiles) {
      const filePath = path.join(backupDir, file);
      const stats = await fs.stat(filePath);
      totalSize += stats.size;
      
      if (!latestBackup || stats.mtime > latestBackup) {
        latestBackup = stats.mtime;
      }
    }
    
    return {
      totalBackups: backupFiles.length,
      totalSize,
      latestBackup,
    };
  } catch (error) {
    return {
      totalBackups: 0,
      totalSize: 0,
    };
  }
}

async function getBackupList(backupDir: string, limit: number): Promise<Array<{
  name: string;
  size: number;
  date: Date;
}>> {
  try {
    const files = await fs.readdir(backupDir);
    const backupFiles = files.filter(file => file.endsWith('.db') || file.endsWith('.db.gz'));
    
    const backups = [];
    
    for (const file of backupFiles) {
      const filePath = path.join(backupDir, file);
      const stats = await fs.stat(filePath);
      
      backups.push({
        name: file,
        size: stats.size,
        date: stats.mtime,
      });
    }
    
    return backups
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, limit);
  } catch (error) {
    return [];
  }
}

async function getBackupMetadata(backupPath: string): Promise<{ checksum?: string } | null> {
  try {
    const metadataPath = backupPath + '.meta';
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    return JSON.parse(metadataContent);
  } catch (error) {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) {return '0 Bytes';}
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}