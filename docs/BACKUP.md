# Sistema de Backup Automático

O Bot Hawk Esports inclui um sistema completo de backup automático do banco de dados SQLite, com recursos avançados de compressão, verificação de integridade e notificações.

## 🚀 Funcionalidades

### ✨ Recursos Principais
- **Backup Automático**: Agendamento via cron jobs
- **Compressão**: Redução do tamanho dos arquivos com gzip
- **Verificação de Integridade**: Checksums SHA-256 para validação
- **Rotação Automática**: Limpeza de backups antigos baseada em políticas
- **Notificações**: Alertas de sucesso/falha via Discord, email ou webhook
- **Comando Discord**: Interface administrativa para gerenciar backups
- **Metadados**: Informações detalhadas sobre cada backup

### 📊 Políticas de Retenção
- **Diários**: 7 backups (padrão)
- **Semanais**: 4 backups (padrão)
- **Mensais**: 12 backups (padrão)

## ⚙️ Configuração

### Variáveis de Ambiente

```env
# Backup Configuration
BACKUP_ENABLED=true
BACKUP_SCHEDULE="0 2 * * *"  # Daily at 2 AM
BACKUP_DIR=./backups
BACKUP_MAX_FILES=7

# Compression
BACKUP_COMPRESSION=true
BACKUP_COMPRESSION_LEVEL=6

# Verification
BACKUP_VERIFICATION=true
BACKUP_CHECKSUM_ALGORITHM=sha256

# Notifications
BACKUP_NOTIFICATIONS=true
BACKUP_NOTIFY_SUCCESS=true
BACKUP_NOTIFY_FAILURE=true

# Retention Policy
BACKUP_RETENTION_DAILY=7
BACKUP_RETENTION_WEEKLY=4
BACKUP_RETENTION_MONTHLY=12
```

### Configuração do Cron

O agendamento usa a sintaxe padrão do cron:

```
┌───────────── minuto (0 - 59)
│ ┌─────────── hora (0 - 23)
│ │ ┌───────── dia do mês (1 - 31)
│ │ │ ┌─────── mês (1 - 12)
│ │ │ │ ┌───── dia da semana (0 - 6) (Domingo = 0)
│ │ │ │ │
* * * * *
```

**Exemplos:**
- `0 2 * * *` - Diariamente às 2:00
- `0 2 * * 0` - Semanalmente aos domingos às 2:00
- `0 2 1 * *` - Mensalmente no dia 1 às 2:00
- `0 */6 * * *` - A cada 6 horas

## 🎮 Comandos Discord

### `/backup create`
Cria um backup manual do banco de dados.

**Exemplo de resposta:**
```
✅ Backup Criado com Sucesso
📁 Arquivo: backup_2024-01-15_14-30-25.db.gz
📊 Tamanho: 2.5 MB
⏱️ Duração: 1.23s
🗜️ Comprimido: Sim
🔐 Checksum: a1b2c3d4e5f6...
📅 Data: 15/01/2024 às 14:30
```

### `/backup status`
Exibe o status do sistema de backup.

**Exemplo de resposta:**
```
📊 Status do Sistema de Backup
🔄 Status: ✅ Ativo
📅 Agendamento: 0 2 * * *
⏰ Próximo Backup: em 8 horas
📁 Total de Backups: 15
💾 Espaço Usado: 45.2 MB
📊 Backup Mais Recente: há 2 horas
```

### `/backup list [limit]`
Lista os backups disponíveis.

**Parâmetros:**
- `limit` (opcional): Número máximo de backups para mostrar (1-20)

### `/backup info <filename>`
Exibe informações detalhadas de um backup específico.

**Parâmetros:**
- `filename`: Nome do arquivo de backup

### `/backup cleanup`
Executa a limpeza de backups antigos baseada na política de retenção.

## 🛠️ Scripts NPM

### Testar Sistema de Backup
```bash
npm run backup:test
```

Executa testes básicos do sistema de backup, verificando:
- Criação do serviço
- Existência do diretório
- Criação de backup
- Verificação de integridade
- Listagem e estatísticas

### Criar Backup Manual
```bash
npm run backup:create
```

Cria um backup manual via linha de comando.

## 📁 Estrutura de Arquivos

### Diretório de Backup
```
backups/
├── backup_2024-01-15_02-00-00.db.gz      # Backup comprimido
├── backup_2024-01-15_02-00-00.db.gz.meta  # Metadados
├── backup_2024-01-14_02-00-00.db.gz
├── backup_2024-01-14_02-00-00.db.gz.meta
└── ...
```

### Formato dos Metadados (.meta)
```json
{
  "timestamp": "2024-01-15T02:00:00.000Z",
  "originalSize": 10485760,
  "compressedSize": 2621440,
  "checksum": "a1b2c3d4e5f6789...",
  "algorithm": "sha256",
  "compressed": true,
  "version": "1.0.0"
}
```

## 🔧 API Programática

### BackupService

```typescript
import { BackupService } from './services/backup.service';
import { getMonitoringConfig } from './config/monitoring.config';

const config = getMonitoringConfig();
const backupService = new BackupService(config.backup, logger);

// Criar backup
const result = await backupService.createBackup();

// Verificar integridade
const isValid = await backupService.verifyBackup(result.backupPath);

// Listar backups
const backups = await backupService.listBackups();

// Obter estatísticas
const stats = await backupService.getBackupStats();

// Limpeza automática
const cleanup = await backupService.cleanupOldBackups();
```

### BackupScheduler

```typescript
import { createBackupScheduler } from './utils/backup-scheduler';

const scheduler = createBackupScheduler(backupService, logger, alertService);

// Iniciar agendamento
scheduler.start();

// Backup manual
await scheduler.executeManualBackup();

// Status
const status = scheduler.getStatus();

// Parar agendamento
scheduler.stop();
```

## 📊 Monitoramento e Logs

### Logs Estruturados

O sistema gera logs estruturados em JSON para facilitar análise:

```json
{
  "timestamp": "2024-01-15T02:00:00.000Z",
  "level": "info",
  "message": "Backup completed successfully",
  "metadata": {
    "component": "backup-service",
    "duration": 1234,
    "size": 2621440,
    "backupPath": "./backups/backup_2024-01-15_02-00-00.db.gz",
    "checksum": "a1b2c3d4e5f6789..."
  }
}
```

### Métricas

- **backup_duration_seconds**: Tempo de execução do backup
- **backup_size_bytes**: Tamanho do arquivo de backup
- **backup_compression_ratio**: Taxa de compressão
- **backup_success_total**: Total de backups bem-sucedidos
- **backup_failure_total**: Total de falhas de backup

## 🚨 Alertas e Notificações

### Tipos de Alerta

1. **Sucesso**: Backup criado com sucesso
2. **Falha**: Erro durante criação do backup
3. **Verificação**: Falha na verificação de integridade
4. **Limpeza**: Resultado da limpeza automática
5. **Espaço**: Aviso de espaço em disco baixo

### Canais de Notificação

- **Discord**: Via webhook
- **Email**: Via SMTP
- **Webhook**: HTTP POST personalizado

## 🔒 Segurança

### Boas Práticas

1. **Armazenamento**: Mantenha backups em local seguro
2. **Permissões**: Configure permissões adequadas no diretório
3. **Criptografia**: Considere criptografar backups sensíveis
4. **Teste**: Teste regularmente a restauração
5. **Monitoramento**: Configure alertas para falhas

### Verificação de Integridade

Todos os backups incluem checksums SHA-256 para verificar:
- Integridade dos dados
- Detecção de corrupção
- Validação após transferência

## 🔄 Restauração

### Processo Manual

1. **Parar o bot**:
   ```bash
   pm2 stop hawk-bot
   ```

2. **Fazer backup do banco atual**:
   ```bash
   cp prisma/dev.db prisma/dev.db.backup
   ```

3. **Descomprimir backup** (se necessário):
   ```bash
   gunzip backups/backup_2024-01-15_02-00-00.db.gz
   ```

4. **Restaurar banco**:
   ```bash
   cp backups/backup_2024-01-15_02-00-00.db prisma/dev.db
   ```

5. **Reiniciar o bot**:
   ```bash
   pm2 start hawk-bot
   ```

### Verificação Pós-Restauração

```bash
# Verificar integridade do banco
sqlite3 prisma/dev.db "PRAGMA integrity_check;"

# Testar conexão
npm run db:generate
```

## 📈 Otimização

### Performance

- **Compressão**: Reduz tamanho em ~75%
- **Agendamento**: Execute em horários de baixo uso
- **Paralelização**: Evite backups simultâneos
- **Limpeza**: Configure retenção adequada

### Espaço em Disco

- **Monitoramento**: Configure alertas de espaço
- **Rotação**: Ajuste políticas de retenção
- **Compressão**: Mantenha sempre habilitada
- **Limpeza**: Execute regularmente

## 🐛 Troubleshooting

### Problemas Comuns

#### Backup Falha
```
Erro: ENOENT: no such file or directory
```
**Solução**: Verificar se o banco de dados existe e tem permissões adequadas.

#### Espaço Insuficiente
```
Erro: ENOSPC: no space left on device
```
**Solução**: Liberar espaço ou configurar limpeza automática.

#### Permissões
```
Erro: EACCES: permission denied
```
**Solução**: Ajustar permissões do diretório de backup.

### Logs de Debug

Para debug detalhado, configure:
```env
LOG_LEVEL=debug
```

## 📞 Suporte

Para problemas relacionados ao sistema de backup:

1. Verifique os logs em `./logs/`
2. Execute `npm run backup:test`
3. Consulte a documentação de monitoramento
4. Abra uma issue no repositório

---

**Última atualização**: Janeiro 2024  
**Versão**: 1.0.0