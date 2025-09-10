#!/bin/bash
# 💾 Script de Backup Automatizado - Bot Hawk Esports
# Backup completo do sistema

set -euo pipefail

# Configurações
BACKUP_DIR="/backups"
DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="hawk-bot-backup_${DATE}"
RETENTION_DAYS=30
LOG_FILE="${BACKUP_DIR}/backup.log"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função de log
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Função para verificar espaço em disco
check_disk_space() {
    local required_space=1048576  # 1GB em KB
    local available_space=$(df "$BACKUP_DIR" | awk 'NR==2 {print $4}')
    
    if [ "$available_space" -lt "$required_space" ]; then
        log_error "Espaço insuficiente em disco. Necessário: 1GB, Disponível: $(($available_space/1024))MB"
        exit 1
    fi
    
    log_info "Espaço em disco verificado: $(($available_space/1024))MB disponível"
}

# Função para criar diretório de backup
create_backup_dir() {
    mkdir -p "${BACKUP_DIR}/${BACKUP_NAME}"
    log_info "Diretório de backup criado: ${BACKUP_DIR}/${BACKUP_NAME}"
}

# Função para backup dos dados da aplicação
backup_app_data() {
    log_info "Iniciando backup dos dados da aplicação..."
    
    # Backup dos logs
    if [ -d "/app/logs" ]; then
        tar -czf "${BACKUP_DIR}/${BACKUP_NAME}/logs.tar.gz" -C /app logs/
        log_success "Backup dos logs concluído"
    else
        log_warning "Diretório de logs não encontrado"
    fi
    
    # Backup dos dados
    if [ -d "/app/data" ]; then
        tar -czf "${BACKUP_DIR}/${BACKUP_NAME}/data.tar.gz" -C /app data/
        log_success "Backup dos dados concluído"
    else
        log_warning "Diretório de dados não encontrado"
    fi
    
    # Backup das configurações
    if [ -f "/app/.env" ]; then
        cp "/app/.env" "${BACKUP_DIR}/${BACKUP_NAME}/.env.backup"
        log_success "Backup das configurações concluído"
    else
        log_warning "Arquivo .env não encontrado"
    fi
}

# Função para backup do Redis
backup_redis() {
    log_info "Iniciando backup do Redis..."
    
    # Verificar se Redis está rodando
    if docker ps | grep -q "hawk-redis"; then
        # Criar snapshot do Redis
        docker exec hawk-redis redis-cli BGSAVE
        
        # Aguardar conclusão do BGSAVE
        while [ "$(docker exec hawk-redis redis-cli LASTSAVE)" = "$(docker exec hawk-redis redis-cli LASTSAVE)" ]; do
            sleep 1
        done
        
        # Copiar dump.rdb
        docker cp hawk-redis:/data/dump.rdb "${BACKUP_DIR}/${BACKUP_NAME}/redis-dump.rdb"
        log_success "Backup do Redis concluído"
    else
        log_warning "Container Redis não está rodando"
    fi
}

# Função para backup das métricas do Prometheus
backup_prometheus() {
    log_info "Iniciando backup das métricas do Prometheus..."
    
    if docker ps | grep -q "hawk-prometheus"; then
        # Criar snapshot do Prometheus
        docker exec hawk-prometheus promtool tsdb create-blocks-from prometheus /prometheus
        
        # Copiar dados do Prometheus
        docker cp hawk-prometheus:/prometheus "${BACKUP_DIR}/${BACKUP_NAME}/prometheus-data"
        log_success "Backup do Prometheus concluído"
    else
        log_warning "Container Prometheus não está rodando"
    fi
}

# Função para backup das configurações do Grafana
backup_grafana() {
    log_info "Iniciando backup das configurações do Grafana..."
    
    if docker ps | grep -q "hawk-grafana"; then
        # Backup do banco de dados do Grafana
        docker cp hawk-grafana:/var/lib/grafana "${BACKUP_DIR}/${BACKUP_NAME}/grafana-data"
        log_success "Backup do Grafana concluído"
    else
        log_warning "Container Grafana não está rodando"
    fi
}

# Função para criar arquivo de metadados
create_metadata() {
    log_info "Criando arquivo de metadados..."
    
    cat > "${BACKUP_DIR}/${BACKUP_NAME}/metadata.json" << EOF
{
    "backup_date": "$(date -Iseconds)",
    "backup_name": "${BACKUP_NAME}",
    "hostname": "$(hostname)",
    "bot_version": "$(docker exec hawk-bot node -e 'console.log(require(\"./package.json\").version)' 2>/dev/null || echo 'unknown')",
    "containers": [
$(docker ps --format '        "{{.Names}}": "{{.Image}}",' | sed '$s/,$//')
    ],
    "backup_size": "$(du -sh ${BACKUP_DIR}/${BACKUP_NAME} | cut -f1)"
}
EOF
    
    log_success "Arquivo de metadados criado"
}

# Função para compactar backup
compress_backup() {
    log_info "Compactando backup..."
    
    cd "$BACKUP_DIR"
    tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"/
    rm -rf "$BACKUP_NAME"
    
    local backup_size=$(du -sh "${BACKUP_NAME}.tar.gz" | cut -f1)
    log_success "Backup compactado: ${BACKUP_NAME}.tar.gz (${backup_size})"
}

# Função para limpar backups antigos
cleanup_old_backups() {
    log_info "Limpando backups antigos (>${RETENTION_DAYS} dias)..."
    
    find "$BACKUP_DIR" -name "hawk-bot-backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete
    
    local remaining_backups=$(find "$BACKUP_DIR" -name "hawk-bot-backup_*.tar.gz" | wc -l)
    log_success "Limpeza concluída. Backups restantes: $remaining_backups"
}

# Função para enviar notificação
send_notification() {
    local status=$1
    local message=$2
    
    # Webhook do Discord (se configurado)
    if [ -n "${DISCORD_WEBHOOK_URL:-}" ]; then
        local color="3066993"  # Verde
        if [ "$status" = "error" ]; then
            color="15158332"  # Vermelho
        fi
        
        curl -H "Content-Type: application/json" \
             -X POST \
             -d "{
                 \"embeds\": [{
                     \"title\": \"🦅 Hawk Bot - Backup Status\",
                     \"description\": \"$message\",
                     \"color\": $color,
                     \"timestamp\": \"$(date -Iseconds)\",
                     \"footer\": {
                         \"text\": \"Backup System\"
                     }
                 }]
             }" \
             "$DISCORD_WEBHOOK_URL" > /dev/null 2>&1
    fi
}

# Função principal
main() {
    log_info "=== Iniciando backup do Bot Hawk Esports ==="
    
    # Verificações iniciais
    check_disk_space
    create_backup_dir
    
    # Executar backups
    backup_app_data
    backup_redis
    backup_prometheus
    backup_grafana
    
    # Finalizar
    create_metadata
    compress_backup
    cleanup_old_backups
    
    log_success "=== Backup concluído com sucesso ==="
    send_notification "success" "Backup realizado com sucesso: ${BACKUP_NAME}.tar.gz"
}

# Tratamento de erros
trap 'log_error "Backup falhou na linha $LINENO"; send_notification "error" "Backup falhou. Verifique os logs."; exit 1' ERR

# Executar backup
main "$@"