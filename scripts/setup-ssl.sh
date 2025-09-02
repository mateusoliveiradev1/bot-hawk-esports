#!/bin/bash

# SSL/TLS Setup Script for Hawk Esports Bot
# This script sets up SSL certificates using Let's Encrypt with Certbot

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SSL_DIR="./config/ssl"
CERTBOT_DIR="./config/certbot"
NGINX_CONF="./config/nginx.conf"
DOMAIN="${DOMAIN:-localhost}"
EMAIL="${SSL_EMAIL:-admin@example.com}"
STAGING="${SSL_STAGING:-false}"

# Functions
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

check_requirements() {
    log_info "Checking requirements..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check if domain is set
    if [ "$DOMAIN" = "localhost" ]; then
        log_warning "Using localhost as domain. SSL certificates will be self-signed."
        log_warning "For production, set DOMAIN environment variable to your actual domain."
    fi
    
    log_success "Requirements check passed"
}

create_directories() {
    log_info "Creating SSL directories..."
    
    mkdir -p "$SSL_DIR"
    mkdir -p "$CERTBOT_DIR/conf"
    mkdir -p "$CERTBOT_DIR/www"
    mkdir -p "$CERTBOT_DIR/logs"
    
    log_success "SSL directories created"
}

generate_self_signed_cert() {
    log_info "Generating self-signed certificate for $DOMAIN..."
    
    # Generate private key
    openssl genrsa -out "$SSL_DIR/key.pem" 2048
    
    # Generate certificate
    openssl req -new -x509 -key "$SSL_DIR/key.pem" -out "$SSL_DIR/cert.pem" -days 365 -subj "/C=BR/ST=SP/L=SaoPaulo/O=HawkEsports/OU=IT/CN=$DOMAIN"
    
    # Set proper permissions
    chmod 600 "$SSL_DIR/key.pem"
    chmod 644 "$SSL_DIR/cert.pem"
    
    log_success "Self-signed certificate generated"
}

setup_letsencrypt() {
    log_info "Setting up Let's Encrypt certificate for $DOMAIN..."
    
    # Staging flag for testing
    STAGING_FLAG=""
    if [ "$STAGING" = "true" ]; then
        STAGING_FLAG="--staging"
        log_warning "Using Let's Encrypt staging environment"
    fi
    
    # Stop nginx if running
    docker-compose -f docker-compose.production.yml stop nginx 2>/dev/null || true
    
    # Run certbot
    docker run --rm \
        -v "$(pwd)/$CERTBOT_DIR/conf:/etc/letsencrypt" \
        -v "$(pwd)/$CERTBOT_DIR/www:/var/www/certbot" \
        -v "$(pwd)/$CERTBOT_DIR/logs:/var/log/letsencrypt" \
        certbot/certbot certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email "$EMAIL" \
        --agree-tos \
        --no-eff-email \
        $STAGING_FLAG \
        -d "$DOMAIN"
    
    # Copy certificates to nginx directory
    cp "$CERTBOT_DIR/conf/live/$DOMAIN/fullchain.pem" "$SSL_DIR/cert.pem"
    cp "$CERTBOT_DIR/conf/live/$DOMAIN/privkey.pem" "$SSL_DIR/key.pem"
    
    # Set proper permissions
    chmod 600 "$SSL_DIR/key.pem"
    chmod 644 "$SSL_DIR/cert.pem"
    
    log_success "Let's Encrypt certificate obtained"
}

create_renewal_script() {
    log_info "Creating certificate renewal script..."
    
    cat > "./scripts/renew-ssl.sh" << 'EOF'
#!/bin/bash

# SSL Certificate Renewal Script
# Run this script periodically to renew SSL certificates

set -e

SSL_DIR="./config/ssl"
CERTBOT_DIR="./config/certbot"
DOMAIN="${DOMAIN:-localhost}"

log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $1"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $1"
}

if [ "$DOMAIN" = "localhost" ]; then
    log_info "Skipping renewal for localhost (self-signed certificate)"
    exit 0
fi

log_info "Attempting to renew SSL certificate for $DOMAIN..."

# Renew certificate
docker run --rm \
    -v "$(pwd)/$CERTBOT_DIR/conf:/etc/letsencrypt" \
    -v "$(pwd)/$CERTBOT_DIR/www:/var/www/certbot" \
    -v "$(pwd)/$CERTBOT_DIR/logs:/var/log/letsencrypt" \
    certbot/certbot renew --quiet

# Check if certificate was renewed
if [ -f "$CERTBOT_DIR/conf/live/$DOMAIN/fullchain.pem" ]; then
    # Copy new certificates
    cp "$CERTBOT_DIR/conf/live/$DOMAIN/fullchain.pem" "$SSL_DIR/cert.pem"
    cp "$CERTBOT_DIR/conf/live/$DOMAIN/privkey.pem" "$SSL_DIR/key.pem"
    
    # Set proper permissions
    chmod 600 "$SSL_DIR/key.pem"
    chmod 644 "$SSL_DIR/cert.pem"
    
    # Reload nginx
    docker-compose -f docker-compose.production.yml exec nginx nginx -s reload
    
    log_info "SSL certificate renewed successfully"
else
    log_error "Failed to renew SSL certificate"
    exit 1
fi
EOF
    
    chmod +x "./scripts/renew-ssl.sh"
    
    log_success "Renewal script created"
}

create_cron_job() {
    log_info "Setting up automatic certificate renewal..."
    
    # Create cron job for certificate renewal (runs twice daily)
    CRON_JOB="0 */12 * * * cd $(pwd) && ./scripts/renew-ssl.sh >> ./logs/ssl-renewal.log 2>&1"
    
    # Add to crontab if not already present
    (crontab -l 2>/dev/null | grep -v "renew-ssl.sh"; echo "$CRON_JOB") | crontab -
    
    log_success "Automatic renewal configured (runs every 12 hours)"
}

update_nginx_config() {
    log_info "Updating Nginx configuration for SSL..."
    
    # Backup original config
    cp "$NGINX_CONF" "$NGINX_CONF.backup.$(date +%Y%m%d_%H%M%S)"
    
    # The nginx.conf already has SSL configuration, just verify paths
    if grep -q "/etc/nginx/ssl/cert.pem" "$NGINX_CONF" && grep -q "/etc/nginx/ssl/key.pem" "$NGINX_CONF"; then
        log_success "Nginx SSL configuration is already correct"
    else
        log_warning "Nginx SSL configuration may need manual adjustment"
        log_warning "Please ensure SSL certificate paths point to:"
        log_warning "  - Certificate: /etc/nginx/ssl/cert.pem"
        log_warning "  - Private Key: /etc/nginx/ssl/key.pem"
    fi
}

test_ssl_config() {
    log_info "Testing SSL configuration..."
    
    # Test nginx configuration
    docker run --rm \
        -v "$(pwd)/config/nginx.conf:/etc/nginx/nginx.conf:ro" \
        -v "$(pwd)/$SSL_DIR:/etc/nginx/ssl:ro" \
        nginx:alpine nginx -t
    
    if [ $? -eq 0 ]; then
        log_success "Nginx SSL configuration is valid"
    else
        log_error "Nginx SSL configuration has errors"
        exit 1
    fi
}

start_services() {
    log_info "Starting services with SSL..."
    
    # Start services
    docker-compose -f docker-compose.production.yml up -d
    
    # Wait for services to start
    sleep 10
    
    # Test HTTPS endpoint
    if curl -k -f "https://localhost/health" > /dev/null 2>&1; then
        log_success "HTTPS endpoint is responding"
    else
        log_warning "HTTPS endpoint may not be ready yet. Please check manually."
    fi
}

show_summary() {
    echo
    log_success "SSL/TLS setup completed!"
    echo
    echo "Summary:"
    echo "  - Domain: $DOMAIN"
    echo "  - Certificate Type: $([ "$DOMAIN" = "localhost" ] && echo "Self-signed" || echo "Let's Encrypt")"
    echo "  - Certificate Location: $SSL_DIR/"
    echo "  - Renewal Script: ./scripts/renew-ssl.sh"
    echo "  - Automatic Renewal: $([ "$DOMAIN" != "localhost" ] && echo "Enabled (every 12 hours)" || echo "Not applicable")"
    echo
    echo "Next steps:"
    echo "  1. Verify HTTPS is working: https://$DOMAIN/health"
    echo "  2. Update your DNS records to point to this server"
    echo "  3. Test certificate renewal: ./scripts/renew-ssl.sh"
    echo "  4. Monitor logs in ./logs/ssl-renewal.log"
    echo
}

# Main execution
main() {
    echo "=== SSL/TLS Setup for Hawk Esports Bot ==="
    echo
    
    check_requirements
    create_directories
    
    if [ "$DOMAIN" = "localhost" ]; then
        generate_self_signed_cert
    else
        setup_letsencrypt
    fi
    
    create_renewal_script
    
    if [ "$DOMAIN" != "localhost" ]; then
        create_cron_job
    fi
    
    update_nginx_config
    test_ssl_config
    start_services
    show_summary
}

# Run main function
main "$@"