#!/bin/bash
# 🚀 Script de Deploy Automatizado - Bot Hawk Esports
# Deploy completo em produção

set -euo pipefail

# Configurações
PROJECT_NAME="hawk-bot"
DOCKER_COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_BEFORE_DEPLOY=true
HEALTH_CHECK_TIMEOUT=300
ROLLBACK_ON_FAILURE=true

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Função de log
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

# Função para verificar pré-requisitos
check_prerequisites() {
    log_step "Verificando pré-requisitos..."
    
    # Verificar Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker não está instalado"
        exit 1
    fi
    
    # Verificar Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose não está instalado"
        exit 1
    fi
    
    # Verificar arquivo de configuração
    if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
        log_error "Arquivo $DOCKER_COMPOSE_FILE não encontrado"
        exit 1
    fi
    
    # Verificar arquivo .env
    if [ ! -f ".env" ]; then
        log_error "Arquivo .env não encontrado"
        exit 1
    fi
    
    log_success "Pré-requisitos verificados"
}

# Função para fazer backup antes do deploy
backup_before_deploy() {
    if [ "$BACKUP_BEFORE_DEPLOY" = true ]; then
        log_step "Criando backup antes do deploy..."
        
        if [ -f "scripts/backup.sh" ]; then
            bash scripts/backup.sh
            log_success "Backup criado com sucesso"
        else
            log_warning "Script de backup não encontrado, pulando backup"
        fi
    fi
}

# Função para construir imagens
build_images() {
    log_step "Construindo imagens Docker..."
    
    docker-compose -f "$DOCKER_COMPOSE_FILE" build --no-cache
    
    log_success "Imagens construídas com sucesso"
}

# Função para parar serviços antigos
stop_old_services() {
    log_step "Parando serviços antigos..."
    
    # Parar containers existentes
    docker-compose -f "$DOCKER_COMPOSE_FILE" down --remove-orphans
    
    # Limpar containers parados
    docker container prune -f
    
    log_success "Serviços antigos parados"
}

# Função para iniciar novos serviços
start_new_services() {
    log_step "Iniciando novos serviços..."
    
    # Iniciar serviços em background
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
    
    log_success "Serviços iniciados"
}

# Função para verificar saúde dos serviços
check_services_health() {
    log_step "Verificando saúde dos serviços..."
    
    local timeout=$HEALTH_CHECK_TIMEOUT
    local elapsed=0
    local interval=10
    
    while [ $elapsed -lt $timeout ]; do
        local healthy_services=0
        local total_services=0
        
        # Verificar status dos containers
        while IFS= read -r line; do
            if [[ $line == *"$PROJECT_NAME"* ]]; then
                total_services=$((total_services + 1))
                if [[ $line == *"healthy"* ]] || [[ $line == *"Up"* ]]; then
                    healthy_services=$((healthy_services + 1))
                fi
            fi
        done < <(docker ps --format "table {{.Names}}\t{{.Status}}")
        
        if [ $healthy_services -eq $total_services ] && [ $total_services -gt 0 ]; then
            log_success "Todos os serviços estão saudáveis ($healthy_services/$total_services)"
            return 0
        fi
        
        log_info "Aguardando serviços ficarem saudáveis ($healthy_services/$total_services)..."
        sleep $interval
        elapsed=$((elapsed + interval))
    done
    
    log_error "Timeout: Serviços não ficaram saudáveis em ${timeout}s"
    return 1
}

# Função para verificar conectividade do bot
check_bot_connectivity() {
    log_step "Verificando conectividade do bot..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        # Verificar logs do bot para conexão bem-sucedida
        if docker logs "${PROJECT_NAME}-bot" 2>&1 | grep -q "Bot conectado com sucesso\|Ready\|Logged in"; then
            log_success "Bot conectado com sucesso ao Discord"
            return 0
        fi
        
        log_info "Tentativa $attempt/$max_attempts - Aguardando conexão do bot..."
        sleep 10
        attempt=$((attempt + 1))
    done
    
    log_error "Bot não conseguiu conectar ao Discord"
    return 1
}

# Função para verificar métricas
check_monitoring() {
    log_step "Verificando sistema de monitoramento..."
    
    # Verificar Prometheus
    if curl -s "http://localhost:9090/-/healthy" > /dev/null; then
        log_success "Prometheus está funcionando"
    else
        log_warning "Prometheus não está respondendo"
    fi
    
    # Verificar Grafana
    if curl -s "http://localhost:3000/api/health" > /dev/null; then
        log_success "Grafana está funcionando"
    else
        log_warning "Grafana não está respondendo"
    fi
}

# Função para rollback em caso de falha
rollback_deployment() {
    if [ "$ROLLBACK_ON_FAILURE" = true ]; then
        log_step "Iniciando rollback..."
        
        # Parar serviços atuais
        docker-compose -f "$DOCKER_COMPOSE_FILE" down
        
        # Tentar restaurar backup mais recente
        local latest_backup=$(find /backups -name "hawk-bot-backup_*.tar.gz" -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)
        
        if [ -n "$latest_backup" ]; then
            log_info "Restaurando backup: $latest_backup"
            # Aqui você implementaria a lógica de restauração
            log_warning "Rollback manual necessário - restaure o backup: $latest_backup"
        else
            log_warning "Nenhum backup encontrado para rollback"
        fi
        
        log_error "Deploy falhou - rollback iniciado"
        exit 1
    fi
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
        elif [ "$status" = "warning" ]; then
            color="16776960"  # Amarelo
        fi
        
        curl -H "Content-Type: application/json" \
             -X POST \
             -d "{
                 \"embeds\": [{
                     \"title\": \"🚀 Hawk Bot - Deploy Status\",
                     \"description\": \"$message\",
                     \"color\": $color,
                     \"timestamp\": \"$(date -Iseconds)\",
                     \"footer\": {
                         \"text\": \"Deploy System\"
                     }
                 }]
             }" \
             "$DISCORD_WEBHOOK_URL" > /dev/null 2>&1
    fi
}

# Função para mostrar status final
show_deployment_status() {
    log_step "Status do Deploy"
    
    echo "=========================================="
    echo "🦅 HAWK BOT - STATUS DO DEPLOY"
    echo "=========================================="
    
    # Mostrar containers rodando
    echo "📦 Containers:"
    docker ps --filter "name=$PROJECT_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    
    echo ""
    echo "🔗 URLs de Acesso:"
    echo "   Grafana: http://localhost:3000 (admin/admin)"
    echo "   Prometheus: http://localhost:9090"
    
    echo ""
    echo "📊 Recursos:"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" $(docker ps --filter "name=$PROJECT_NAME" -q)
    
    echo "=========================================="
}

# Função principal
main() {
    log_info "🚀 Iniciando deploy do Bot Hawk Esports"
    
    # Verificar pré-requisitos
    check_prerequisites
    
    # Fazer backup
    backup_before_deploy
    
    # Deploy
    build_images
    stop_old_services
    start_new_services
    
    # Verificações de saúde
    if ! check_services_health; then
        rollback_deployment
    fi
    
    if ! check_bot_connectivity; then
        rollback_deployment
    fi
    
    # Verificar monitoramento
    check_monitoring
    
    # Mostrar status
    show_deployment_status
    
    log_success "🎉 Deploy concluído com sucesso!"
    send_notification "success" "Deploy realizado com sucesso! Bot está online e funcionando."
}

# Tratamento de erros
trap 'log_error "Deploy falhou na linha $LINENO"; send_notification "error" "Deploy falhou. Verifique os logs."; rollback_deployment' ERR

# Executar deploy
main "$@"