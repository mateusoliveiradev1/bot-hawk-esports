# 💾 Script de Backup Automatizado - Bot Hawk Esports (Windows)
# Backup completo do sistema

param(
    [string]$BackupDir = "C:\backups",
    [int]$RetentionDays = 30
)

# Configurações
$Date = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupName = "hawk-bot-backup_$Date"
$LogFile = "$BackupDir\backup.log"

# Função de log
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogEntry = "[$Timestamp] [$Level] $Message"
    
    switch ($Level) {
        "ERROR" { Write-Host $LogEntry -ForegroundColor Red }
        "SUCCESS" { Write-Host $LogEntry -ForegroundColor Green }
        "WARNING" { Write-Host $LogEntry -ForegroundColor Yellow }
        "INFO" { Write-Host $LogEntry -ForegroundColor Cyan }
        default { Write-Host $LogEntry }
    }
    
    Add-Content -Path $LogFile -Value $LogEntry
}

# Função para verificar espaço em disco
function Test-DiskSpace {
    $RequiredSpaceGB = 1
    $Drive = (Get-Item $BackupDir).PSDrive
    $FreeSpaceGB = [math]::Round($Drive.Free / 1GB, 2)
    
    if ($FreeSpaceGB -lt $RequiredSpaceGB) {
        Write-Log "Espaço insuficiente em disco. Necessário: ${RequiredSpaceGB}GB, Disponível: ${FreeSpaceGB}GB" "ERROR"
        exit 1
    }
    
    Write-Log "Espaço em disco verificado: ${FreeSpaceGB}GB disponível" "INFO"
}

# Função para criar diretório de backup
function New-BackupDirectory {
    $BackupPath = "$BackupDir\$BackupName"
    New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null
    Write-Log "Diretório de backup criado: $BackupPath" "INFO"
    return $BackupPath
}

# Função para backup dos dados da aplicação
function Backup-AppData {
    param([string]$BackupPath)
    
    Write-Log "Iniciando backup dos dados da aplicação..." "INFO"
    
    # Backup dos logs
    $LogsPath = "logs"
    if (Test-Path $LogsPath) {
        Compress-Archive -Path $LogsPath -DestinationPath "$BackupPath\logs.zip" -Force
        Write-Log "Backup dos logs concluído" "SUCCESS"
    } else {
        Write-Log "Diretório de logs não encontrado" "WARNING"
    }
    
    # Backup dos dados
    $DataPath = "data"
    if (Test-Path $DataPath) {
        Compress-Archive -Path $DataPath -DestinationPath "$BackupPath\data.zip" -Force
        Write-Log "Backup dos dados concluído" "SUCCESS"
    } else {
        Write-Log "Diretório de dados não encontrado" "WARNING"
    }
    
    # Backup das configurações
    if (Test-Path ".env") {
        Copy-Item ".env" "$BackupPath\.env.backup"
        Write-Log "Backup das configurações concluído" "SUCCESS"
    } else {
        Write-Log "Arquivo .env não encontrado" "WARNING"
    }
}

# Função para backup do Redis
function Backup-Redis {
    param([string]$BackupPath)
    
    Write-Log "Iniciando backup do Redis..." "INFO"
    
    try {
        # Verificar se Redis está rodando
        $RedisContainer = docker ps --filter "name=hawk-redis" --format "{{.Names}}" 2>$null
        
        if ($RedisContainer) {
            # Criar snapshot do Redis
            docker exec hawk-redis redis-cli BGSAVE | Out-Null
            
            # Aguardar conclusão do BGSAVE
            do {
                Start-Sleep -Seconds 1
                $LastSave1 = docker exec hawk-redis redis-cli LASTSAVE
                Start-Sleep -Seconds 1
                $LastSave2 = docker exec hawk-redis redis-cli LASTSAVE
            } while ($LastSave1 -eq $LastSave2)
            
            # Copiar dump.rdb
            docker cp "hawk-redis:/data/dump.rdb" "$BackupPath\redis-dump.rdb"
            Write-Log "Backup do Redis concluído" "SUCCESS"
        } else {
            Write-Log "Container Redis não está rodando" "WARNING"
        }
    } catch {
        Write-Log "Erro no backup do Redis: $($_.Exception.Message)" "ERROR"
    }
}

# Função para backup das métricas do Prometheus
function Backup-Prometheus {
    param([string]$BackupPath)
    
    Write-Log "Iniciando backup das métricas do Prometheus..." "INFO"
    
    try {
        $PrometheusContainer = docker ps --filter "name=hawk-prometheus" --format "{{.Names}}" 2>$null
        
        if ($PrometheusContainer) {
            # Copiar dados do Prometheus
            docker cp "hawk-prometheus:/prometheus" "$BackupPath\prometheus-data"
            Write-Log "Backup do Prometheus concluído" "SUCCESS"
        } else {
            Write-Log "Container Prometheus não está rodando" "WARNING"
        }
    } catch {
        Write-Log "Erro no backup do Prometheus: $($_.Exception.Message)" "ERROR"
    }
}

# Função para backup das configurações do Grafana
function Backup-Grafana {
    param([string]$BackupPath)
    
    Write-Log "Iniciando backup das configurações do Grafana..." "INFO"
    
    try {
        $GrafanaContainer = docker ps --filter "name=hawk-grafana" --format "{{.Names}}" 2>$null
        
        if ($GrafanaContainer) {
            # Backup do banco de dados do Grafana
            docker cp "hawk-grafana:/var/lib/grafana" "$BackupPath\grafana-data"
            Write-Log "Backup do Grafana concluído" "SUCCESS"
        } else {
            Write-Log "Container Grafana não está rodando" "WARNING"
        }
    } catch {
        Write-Log "Erro no backup do Grafana: $($_.Exception.Message)" "ERROR"
    }
}

# Função para criar arquivo de metadados
function New-MetadataFile {
    param([string]$BackupPath)
    
    Write-Log "Criando arquivo de metadados..." "INFO"
    
    try {
        $BotVersion = "unknown"
        try {
            $BotVersion = docker exec hawk-bot node -e "console.log(require('./package.json').version)" 2>$null
        } catch {}
        
        $Containers = docker ps --format "{{.Names}}: {{.Image}}" 2>$null
        $BackupSize = (Get-ChildItem -Path $BackupPath -Recurse | Measure-Object -Property Length -Sum).Sum
        $BackupSizeMB = [math]::Round($BackupSize / 1MB, 2)
        
        $Metadata = @{
            backup_date = (Get-Date -Format "o")
            backup_name = $BackupName
            hostname = $env:COMPUTERNAME
            bot_version = $BotVersion
            containers = $Containers
            backup_size_mb = $BackupSizeMB
        }
        
        $Metadata | ConvertTo-Json -Depth 3 | Out-File "$BackupPath\metadata.json" -Encoding UTF8
        Write-Log "Arquivo de metadados criado" "SUCCESS"
    } catch {
        Write-Log "Erro ao criar metadados: $($_.Exception.Message)" "ERROR"
    }
}

# Função para compactar backup
function Compress-Backup {
    param([string]$BackupPath)
    
    Write-Log "Compactando backup..." "INFO"
    
    try {
        $ArchivePath = "$BackupDir\$BackupName.zip"
        Compress-Archive -Path $BackupPath -DestinationPath $ArchivePath -Force
        Remove-Item -Path $BackupPath -Recurse -Force
        
        $BackupSize = [math]::Round((Get-Item $ArchivePath).Length / 1MB, 2)
        Write-Log "Backup compactado: $BackupName.zip (${BackupSize}MB)" "SUCCESS"
    } catch {
        Write-Log "Erro ao compactar backup: $($_.Exception.Message)" "ERROR"
    }
}

# Função para limpar backups antigos
function Remove-OldBackups {
    Write-Log "Limpando backups antigos (>$RetentionDays dias)..." "INFO"
    
    try {
        $CutoffDate = (Get-Date).AddDays(-$RetentionDays)
        $OldBackups = Get-ChildItem -Path $BackupDir -Filter "hawk-bot-backup_*.zip" | Where-Object { $_.LastWriteTime -lt $CutoffDate }
        
        foreach ($Backup in $OldBackups) {
            Remove-Item $Backup.FullName -Force
            Write-Log "Backup antigo removido: $($Backup.Name)" "INFO"
        }
        
        $RemainingBackups = (Get-ChildItem -Path $BackupDir -Filter "hawk-bot-backup_*.zip").Count
        Write-Log "Limpeza concluída. Backups restantes: $RemainingBackups" "SUCCESS"
    } catch {
        Write-Log "Erro na limpeza de backups: $($_.Exception.Message)" "ERROR"
    }
}

# Função para enviar notificação
function Send-Notification {
    param([string]$Status, [string]$Message)
    
    $WebhookUrl = $env:DISCORD_WEBHOOK_URL
    if (-not $WebhookUrl) { return }
    
    try {
        $Color = if ($Status -eq "error") { 15158332 } else { 3066993 }
        
        $Payload = @{
            embeds = @(
                @{
                    title = "🦅 Hawk Bot - Backup Status"
                    description = $Message
                    color = $Color
                    timestamp = (Get-Date -Format "o")
                    footer = @{
                        text = "Backup System"
                    }
                }
            )
        } | ConvertTo-Json -Depth 3
        
        Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $Payload -ContentType "application/json" | Out-Null
    } catch {
        Write-Log "Erro ao enviar notificação: $($_.Exception.Message)" "WARNING"
    }
}

# Função principal
function Start-Backup {
    Write-Log "=== Iniciando backup do Bot Hawk Esports ===" "INFO"
    
    try {
        # Criar diretório de backup se não existir
        if (-not (Test-Path $BackupDir)) {
            New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
        }
        
        # Verificações iniciais
        Test-DiskSpace
        $BackupPath = New-BackupDirectory
        
        # Executar backups
        Backup-AppData -BackupPath $BackupPath
        Backup-Redis -BackupPath $BackupPath
        Backup-Prometheus -BackupPath $BackupPath
        Backup-Grafana -BackupPath $BackupPath
        
        # Finalizar
        New-MetadataFile -BackupPath $BackupPath
        Compress-Backup -BackupPath $BackupPath
        Remove-OldBackups
        
        Write-Log "=== Backup concluído com sucesso ===" "SUCCESS"
        Send-Notification -Status "success" -Message "Backup realizado com sucesso: $BackupName.zip"
        
    } catch {
        $ErrorMessage = "Backup falhou: $($_.Exception.Message)"
        Write-Log $ErrorMessage "ERROR"
        Send-Notification -Status "error" -Message "Backup falhou. Verifique os logs."
        exit 1
    }
}

# Executar backup
Start-Backup