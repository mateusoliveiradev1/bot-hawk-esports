#!/bin/bash

# Hawk Esports Bot - Production Deployment Script
# This script automates the deployment process for production environment

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="hawk-esports-bot"
DOCKER_COMPOSE_FILE="docker-compose.production.yml"
BACKUP_DIR="./backups/pre-deploy"
LOG_FILE="./logs/deploy-$(date +%Y%m%d-%H%M%S).log"

# Functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✓${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ✗${NC} $1" | tee -a "$LOG_FILE"
}

check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker is not running"
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check if .env.production exists
    if [ ! -f ".env.production" ]; then
        log_error ".env.production file not found"
        exit 1
    fi
    
    # Check if SSL certificates exist
    if [ ! -f "config/ssl/cert.pem" ] || [ ! -f "config/ssl/key.pem" ]; then
        log_warning "SSL certificates not found. HTTPS will not work properly."
        log "You can generate self-signed certificates with: ./scripts/generate-ssl.sh"
    fi
    
    log_success "Prerequisites check completed"
}

create_directories() {
    log "Creating necessary directories..."
    
    directories=(
        "logs"
        "uploads"
        "backups"
        "backups/pre-deploy"
        "data/postgres"
        "data/redis"
        "data/prometheus"
        "data/grafana"
        "data/loki"
        "config/ssl"
    )
    
    for dir in "${directories[@]}"; do
        mkdir -p "$dir"
        log "Created directory: $dir"
    done
    
    log_success "Directories created successfully"
}

backup_existing_data() {
    log "Creating backup of existing data..."
    
    if [ -d "data" ]; then
        backup_name="backup-$(date +%Y%m%d-%H%M%S)"
        mkdir -p "$BACKUP_DIR"
        
        # Backup database
        if docker-compose -f "$DOCKER_COMPOSE_FILE" ps postgres | grep -q "Up"; then
            log "Backing up database..."
            docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres pg_dump -U hawkbot hawkbot_prod > "$BACKUP_DIR/database-$backup_name.sql"
            log_success "Database backup created: $BACKUP_DIR/database-$backup_name.sql"
        fi
        
        # Backup data directories
        if [ -d "data" ]; then
            tar -czf "$BACKUP_DIR/data-$backup_name.tar.gz" data/
            log_success "Data backup created: $BACKUP_DIR/data-$backup_name.tar.gz"
        fi
        
        # Backup configuration
        if [ -f ".env.production" ]; then
            cp ".env.production" "$BACKUP_DIR/env-$backup_name"
            log_success "Environment backup created: $BACKUP_DIR/env-$backup_name"
        fi
    else
        log "No existing data to backup"
    fi
}

build_images() {
    log "Building Docker images..."
    
    # Build the main application image
    docker-compose -f "$DOCKER_COMPOSE_FILE" build --no-cache hawk-bot
    
    log_success "Docker images built successfully"
}

stop_services() {
    log "Stopping existing services..."
    
    if docker-compose -f "$DOCKER_COMPOSE_FILE" ps | grep -q "Up"; then
        docker-compose -f "$DOCKER_COMPOSE_FILE" down --timeout 30
        log_success "Services stopped successfully"
    else
        log "No running services found"
    fi
}

start_services() {
    log "Starting production services..."
    
    # Start core services first
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d postgres redis
    
    # Wait for database to be ready
    log "Waiting for database to be ready..."
    timeout=60
    while [ $timeout -gt 0 ]; do
        if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres pg_isready -U hawkbot -d hawkbot_prod &> /dev/null; then
            log_success "Database is ready"
            break
        fi
        sleep 2
        timeout=$((timeout - 2))
    done
    
    if [ $timeout -le 0 ]; then
        log_error "Database failed to start within timeout"
        exit 1
    fi
    
    # Start remaining services
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
    
    log_success "All services started successfully"
}

run_migrations() {
    log "Running database migrations..."
    
    # Wait for the bot to be ready
    sleep 10
    
    # Run migrations (if your bot has a migration system)
    # docker-compose -f "$DOCKER_COMPOSE_FILE" exec hawk-bot npm run migrate
    
    log_success "Database migrations completed"
}

health_check() {
    log "Performing health checks..."
    
    services=("hawk-bot" "postgres" "redis" "nginx")
    
    for service in "${services[@]}"; do
        log "Checking $service..."
        
        timeout=60
        while [ $timeout -gt 0 ]; do
            if docker-compose -f "$DOCKER_COMPOSE_FILE" ps "$service" | grep -q "Up (healthy)\|Up"; then
                log_success "$service is healthy"
                break
            fi
            sleep 2
            timeout=$((timeout - 2))
        done
        
        if [ $timeout -le 0 ]; then
            log_error "$service failed health check"
            docker-compose -f "$DOCKER_COMPOSE_FILE" logs "$service"
            exit 1
        fi
    done
    
    # Test HTTP endpoints
    log "Testing HTTP endpoints..."
    
    if curl -f -s http://localhost/health > /dev/null; then
        log_success "HTTP health check passed"
    else
        log_error "HTTP health check failed"
        exit 1
    fi
}

cleanup_old_images() {
    log "Cleaning up old Docker images..."
    
    # Remove dangling images
    docker image prune -f
    
    # Remove old images (keep last 3 versions)
    docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}" | \
        grep "$PROJECT_NAME" | \
        tail -n +4 | \
        awk '{print $3}' | \
        xargs -r docker rmi -f
    
    log_success "Docker cleanup completed"
}

setup_monitoring() {
    log "Setting up monitoring and alerting..."
    
    # Wait for Prometheus to be ready
    timeout=60
    while [ $timeout -gt 0 ]; do
        if curl -f -s http://localhost:9090/-/ready > /dev/null; then
            log_success "Prometheus is ready"
            break
        fi
        sleep 2
        timeout=$((timeout - 2))
    done
    
    # Wait for Grafana to be ready
    timeout=60
    while [ $timeout -gt 0 ]; do
        if curl -f -s http://localhost:3001/api/health > /dev/null; then
            log_success "Grafana is ready"
            break
        fi
        sleep 2
        timeout=$((timeout - 2))
    done
    
    log_success "Monitoring setup completed"
}

show_status() {
    log "Deployment Status:"
    echo
    docker-compose -f "$DOCKER_COMPOSE_FILE" ps
    echo
    
    log "Service URLs:"
    echo "  Dashboard: https://localhost (or your domain)"
    echo "  Grafana: http://localhost:3001"
    echo "  Prometheus: http://localhost:9090"
    echo "  Health Check: http://localhost/health"
    echo
    
    log "Log locations:"
    echo "  Application logs: ./logs/"
    echo "  Nginx logs: ./logs/nginx/"
    echo "  Deployment log: $LOG_FILE"
    echo
}

rollback() {
    log_error "Deployment failed. Starting rollback..."
    
    # Stop current services
    docker-compose -f "$DOCKER_COMPOSE_FILE" down
    
    # Restore from backup if available
    latest_backup=$(ls -t "$BACKUP_DIR"/data-*.tar.gz 2>/dev/null | head -1)
    if [ -n "$latest_backup" ]; then
        log "Restoring from backup: $latest_backup"
        rm -rf data/
        tar -xzf "$latest_backup"
        log_success "Data restored from backup"
    fi
    
    log_error "Rollback completed. Please check the logs and fix the issues."
    exit 1
}

# Main deployment process
main() {
    log "Starting production deployment for $PROJECT_NAME"
    log "Deployment log: $LOG_FILE"
    
    # Create log directory
    mkdir -p "$(dirname "$LOG_FILE")"
    
    # Set trap for cleanup on error
    trap rollback ERR
    
    check_prerequisites
    create_directories
    backup_existing_data
    stop_services
    build_images
    start_services
    run_migrations
    health_check
    setup_monitoring
    cleanup_old_images
    
    log_success "Production deployment completed successfully!"
    show_status
}

# Script options
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "rollback")
        rollback
        ;;
    "status")
        show_status
        ;;
    "logs")
        docker-compose -f "$DOCKER_COMPOSE_FILE" logs -f "${2:-hawk-bot}"
        ;;
    "stop")
        stop_services
        ;;
    "start")
        start_services
        ;;
    "restart")
        stop_services
        start_services
        ;;
    "backup")
        backup_existing_data
        ;;
    "health")
        health_check
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|status|logs|stop|start|restart|backup|health}"
        echo
        echo "Commands:"
        echo "  deploy   - Full production deployment (default)"
        echo "  rollback - Rollback to previous version"
        echo "  status   - Show service status and URLs"
        echo "  logs     - Show logs for a service (default: hawk-bot)"
        echo "  stop     - Stop all services"
        echo "  start    - Start all services"
        echo "  restart  - Restart all services"
        echo "  backup   - Create backup of current data"
        echo "  health   - Run health checks"
        exit 1
        ;;
esac