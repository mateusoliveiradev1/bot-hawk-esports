#!/bin/bash

# SSL/TLS Deployment Script for Hawk Esports Bot
# Automates the complete SSL/TLS setup and deployment process

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSL_ENV_FILE="$PROJECT_DIR/.env.ssl"
SSL_EXAMPLE_FILE="$PROJECT_DIR/.env.ssl.example"
DOCKER_COMPOSE_PROD="$PROJECT_DIR/docker-compose.production.yml"
DOCKER_COMPOSE_SSL="$PROJECT_DIR/docker-compose.ssl.yml"
SSL_SETUP_SCRIPT="$PROJECT_DIR/scripts/setup-ssl.sh"

# Functions
print_banner() {
    echo -e "${PURPLE}"
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo "                    🔒 SSL/TLS Deployment for Hawk Esports Bot"
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo -e "${NC}"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites..."
    
    # Check if running as root (not recommended)
    if [ "$EUID" -eq 0 ]; then
        log_warning "Running as root is not recommended for security reasons"
        read -p "Do you want to continue? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Deployment cancelled"
            exit 0
        fi
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check if project files exist
    if [ ! -f "$DOCKER_COMPOSE_PROD" ]; then
        log_error "Production Docker Compose file not found: $DOCKER_COMPOSE_PROD"
        exit 1
    fi
    
    if [ ! -f "$DOCKER_COMPOSE_SSL" ]; then
        log_error "SSL Docker Compose file not found: $DOCKER_COMPOSE_SSL"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Setup SSL environment
setup_ssl_environment() {
    log_step "Setting up SSL environment..."
    
    # Create SSL environment file if it doesn't exist
    if [ ! -f "$SSL_ENV_FILE" ]; then
        if [ -f "$SSL_EXAMPLE_FILE" ]; then
            log_info "Creating SSL environment file from example..."
            cp "$SSL_EXAMPLE_FILE" "$SSL_ENV_FILE"
            log_warning "Please edit $SSL_ENV_FILE to configure your SSL settings"
        else
            log_error "SSL example file not found: $SSL_EXAMPLE_FILE"
            exit 1
        fi
    fi
    
    # Source SSL environment
    if [ -f "$SSL_ENV_FILE" ]; then
        log_info "Loading SSL environment variables..."
        set -a
        source "$SSL_ENV_FILE"
        set +a
    fi
    
    # Validate required variables
    if [ -z "${DOMAIN:-}" ]; then
        log_error "DOMAIN is not set in SSL environment file"
        exit 1
    fi
    
    if [ -z "${SSL_EMAIL:-}" ]; then
        log_error "SSL_EMAIL is not set in SSL environment file"
        exit 1
    fi
    
    log_success "SSL environment configured"
    log_info "Domain: ${DOMAIN}"
    log_info "Email: ${SSL_EMAIL}"
    log_info "Staging: ${SSL_STAGING:-false}"
}

# Create necessary directories
create_directories() {
    log_step "Creating SSL directories..."
    
    local directories=(
        "$PROJECT_DIR/config/ssl"
        "$PROJECT_DIR/config/certbot/conf"
        "$PROJECT_DIR/config/certbot/www"
        "$PROJECT_DIR/config/certbot/logs"
        "$PROJECT_DIR/logs"
        "$PROJECT_DIR/backups/ssl"
    )
    
    for dir in "${directories[@]}"; do
        if [ ! -d "$dir" ]; then
            log_info "Creating directory: $dir"
            mkdir -p "$dir"
        fi
    done
    
    # Set proper permissions
    chmod 700 "$PROJECT_DIR/config/ssl"
    chmod 755 "$PROJECT_DIR/config/certbot"
    
    log_success "SSL directories created"
}

# Make scripts executable
setup_scripts() {
    log_step "Setting up SSL scripts..."
    
    local scripts=(
        "$PROJECT_DIR/scripts/setup-ssl.sh"
        "$PROJECT_DIR/scripts/certbot-entrypoint.sh"
        "$PROJECT_DIR/scripts/ssl-renewal.sh"
        "$PROJECT_DIR/scripts/ssl-monitor.sh"
    )
    
    for script in "${scripts[@]}"; do
        if [ -f "$script" ]; then
            log_info "Making script executable: $(basename "$script")"
            chmod +x "$script"
        else
            log_warning "Script not found: $script"
        fi
    done
    
    log_success "SSL scripts configured"
}

# Stop existing services
stop_services() {
    log_step "Stopping existing services..."
    
    # Stop production services
    if docker-compose -f "$DOCKER_COMPOSE_PROD" ps -q | grep -q .; then
        log_info "Stopping production services..."
        docker-compose -f "$DOCKER_COMPOSE_PROD" down
    fi
    
    # Stop SSL services
    if docker-compose -f "$DOCKER_COMPOSE_SSL" ps -q | grep -q .; then
        log_info "Stopping SSL services..."
        docker-compose -f "$DOCKER_COMPOSE_SSL" --profile ssl down
    fi
    
    log_success "Services stopped"
}

# Setup SSL certificates
setup_certificates() {
    log_step "Setting up SSL certificates..."
    
    # Run SSL setup script
    if [ -f "$SSL_SETUP_SCRIPT" ]; then
        log_info "Running SSL setup script..."
        bash "$SSL_SETUP_SCRIPT"
    else
        log_error "SSL setup script not found: $SSL_SETUP_SCRIPT"
        exit 1
    fi
    
    log_success "SSL certificates configured"
}

# Start services with SSL
start_services() {
    log_step "Starting services with SSL..."
    
    # Start production services
    log_info "Starting production services..."
    docker-compose -f "$DOCKER_COMPOSE_PROD" up -d
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 10
    
    # Start SSL services
    log_info "Starting SSL services..."
    docker-compose -f "$DOCKER_COMPOSE_SSL" --profile ssl up -d
    
    log_success "Services started with SSL"
}

# Verify SSL setup
verify_ssl_setup() {
    log_step "Verifying SSL setup..."
    
    # Check if certificate files exist
    if [ -f "$PROJECT_DIR/config/ssl/cert.pem" ] && [ -f "$PROJECT_DIR/config/ssl/key.pem" ]; then
        log_success "SSL certificate files found"
    else
        log_error "SSL certificate files not found"
        return 1
    fi
    
    # Test HTTPS endpoint
    log_info "Testing HTTPS endpoint..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -k -f "https://localhost/health" > /dev/null 2>&1; then
            log_success "HTTPS endpoint is responding"
            break
        else
            if [ $attempt -eq $max_attempts ]; then
                log_warning "HTTPS endpoint is not responding after $max_attempts attempts"
                log_warning "This may be normal if the services are still starting up"
            else
                log_info "Attempt $attempt/$max_attempts: HTTPS endpoint not ready, retrying..."
                sleep 2
            fi
        fi
        ((attempt++))
    done
    
    # Check certificate validity
    if command -v openssl &> /dev/null; then
        log_info "Checking certificate validity..."
        
        if openssl x509 -in "$PROJECT_DIR/config/ssl/cert.pem" -noout -checkend 86400; then
            log_success "Certificate is valid and not expiring within 24 hours"
        else
            log_warning "Certificate may be expiring soon or invalid"
        fi
        
        # Show certificate information
        local cert_subject=$(openssl x509 -in "$PROJECT_DIR/config/ssl/cert.pem" -noout -subject | sed 's/subject=//')
        local cert_issuer=$(openssl x509 -in "$PROJECT_DIR/config/ssl/cert.pem" -noout -issuer | sed 's/issuer=//')
        local cert_expiry=$(openssl x509 -in "$PROJECT_DIR/config/ssl/cert.pem" -noout -enddate | cut -d= -f2)
        
        log_info "Certificate Subject: $cert_subject"
        log_info "Certificate Issuer: $cert_issuer"
        log_info "Certificate Expiry: $cert_expiry"
    fi
    
    log_success "SSL setup verification completed"
}

# Show deployment summary
show_summary() {
    echo
    log_success "🎉 SSL/TLS deployment completed successfully!"
    echo
    echo -e "${CYAN}Deployment Summary:${NC}"
    echo "  📋 Project Directory: $PROJECT_DIR"
    echo "  🌐 Domain: ${DOMAIN}"
    echo "  📧 SSL Email: ${SSL_EMAIL}"
    echo "  🔒 Certificate Type: $([ "$DOMAIN" = "localhost" ] && echo "Self-signed" || echo "Let's Encrypt")"
    echo "  📁 Certificate Location: $PROJECT_DIR/config/ssl/"
    echo "  📊 Monitoring: $([ "${SSL_MONITORING_ENABLED:-true}" = "true" ] && echo "Enabled" || echo "Disabled")"
    echo
    echo -e "${CYAN}Available Services:${NC}"
    echo "  🌐 HTTPS Dashboard: https://${DOMAIN}/"
    echo "  🔍 Health Check: https://${DOMAIN}/health"
    echo "  📊 API Endpoints: https://${DOMAIN}/api/"
    echo "  📈 Monitoring: http://${DOMAIN}:8080/ (if enabled)"
    echo
    echo -e "${CYAN}Management Commands:${NC}"
    echo "  📋 Check SSL Status: docker-compose -f docker-compose.ssl.yml exec ssl-monitor /monitor.sh check"
    echo "  🔄 Renew Certificates: docker-compose -f docker-compose.ssl.yml exec ssl-renewer /renewal.sh renew"
    echo "  📊 SSL Health Report: docker-compose -f docker-compose.ssl.yml exec ssl-monitor /monitor.sh report"
    echo "  📜 View SSL Logs: docker-compose -f docker-compose.ssl.yml logs ssl-renewer"
    echo
    echo -e "${CYAN}Important Files:${NC}"
    echo "  ⚙️  SSL Configuration: $SSL_ENV_FILE"
    echo "  📋 SSL Logs: $PROJECT_DIR/logs/ssl-*.log"
    echo "  💾 Certificate Backups: $PROJECT_DIR/backups/ssl/"
    echo
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "  1. 🔍 Verify HTTPS is working: https://${DOMAIN}/health"
    echo "  2. 🌐 Update your DNS records to point to this server (if using real domain)"
    echo "  3. 🔄 Test certificate renewal: ./scripts/ssl-renewal.sh renew"
    echo "  4. 📊 Monitor SSL logs in ./logs/ssl-*.log"
    echo "  5. 🔔 Configure webhook alerts in $SSL_ENV_FILE (optional)"
    echo
    
    if [ "$DOMAIN" != "localhost" ]; then
        echo -e "${GREEN}🔄 Automatic Certificate Renewal:${NC}"
        echo "  Certificates will be automatically renewed every 12 hours"
        echo "  Renewal attempts are logged in ./logs/ssl-renewal.log"
        echo "  Alerts will be sent if renewal fails (if webhook configured)"
        echo
    fi
}

# Handle command line arguments
handle_arguments() {
    case "${1:-}" in
        "--help" | "-h")
            echo "SSL/TLS Deployment Script for Hawk Esports Bot"
            echo
            echo "Usage: $0 [OPTIONS]"
            echo
            echo "Options:"
            echo "  --help, -h          Show this help message"
            echo "  --force, -f         Force regeneration of certificates"
            echo "  --staging, -s       Use Let's Encrypt staging environment"
            echo "  --localhost, -l     Force localhost setup (self-signed certificates)"
            echo "  --verify-only, -v   Only verify existing SSL setup"
            echo
            echo "Environment Variables:"
            echo "  DOMAIN              Domain name for SSL certificate"
            echo "  SSL_EMAIL           Email for Let's Encrypt registration"
            echo "  SSL_STAGING         Use staging environment (true/false)"
            echo
            echo "Examples:"
            echo "  $0                  # Normal deployment"
            echo "  $0 --staging        # Deploy with staging certificates"
            echo "  $0 --localhost      # Deploy with self-signed certificates"
            echo "  $0 --verify-only    # Only verify existing setup"
            echo
            exit 0
            ;;
        "--force" | "-f")
            export SSL_FORCE_REGENERATE=true
            ;;
        "--staging" | "-s")
            export SSL_STAGING=true
            ;;
        "--localhost" | "-l")
            export DOMAIN=localhost
            ;;
        "--verify-only" | "-v")
            VERIFY_ONLY=true
            ;;
    esac
}

# Main deployment function
main() {
    print_banner
    
    # Handle command line arguments
    handle_arguments "$@"
    
    # Change to project directory
    cd "$PROJECT_DIR"
    
    # Run deployment steps
    check_prerequisites
    setup_ssl_environment
    create_directories
    setup_scripts
    
    if [ "${VERIFY_ONLY:-false}" = "true" ]; then
        log_info "Running verification only..."
        verify_ssl_setup
        exit 0
    fi
    
    stop_services
    setup_certificates
    start_services
    
    # Wait a bit for services to fully start
    sleep 5
    
    verify_ssl_setup
    show_summary
    
    log_success "SSL/TLS deployment completed! 🎉"
}

# Handle signals
trap 'log_error "Deployment interrupted!"; exit 1' INT TERM

# Run main function with all arguments
main "$@"