#!/bin/sh

# Certbot Entrypoint Script
# Handles SSL certificate acquisition for Hawk Esports Bot

set -e

# Configuration from environment variables
DOMAIN="${DOMAIN:-localhost}"
EMAIL="${EMAIL:-admin@example.com}"
STAGING="${STAGING:-false}"
SSL_DIR="/etc/nginx/ssl"
CERTBOT_DIR="/etc/letsencrypt"
WEBROOT_DIR="/var/www/certbot"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [CERTBOT] $1"
}

# Wait for nginx to be ready
wait_for_nginx() {
    log "Waiting for nginx to be ready..."
    
    for i in $(seq 1 30); do
        if nc -z nginx 80 2>/dev/null; then
            log "Nginx is ready"
            return 0
        fi
        log "Waiting for nginx... ($i/30)"
        sleep 2
    done
    
    log "Warning: Nginx may not be ready, proceeding anyway"
}

# Create necessary directories
create_directories() {
    log "Creating necessary directories..."
    
    mkdir -p "$SSL_DIR"
    mkdir -p "$WEBROOT_DIR"
    mkdir -p "/var/log/letsencrypt"
    
    # Set proper permissions
    chmod 755 "$SSL_DIR"
    chmod 755 "$WEBROOT_DIR"
}

# Generate self-signed certificate for localhost
generate_self_signed() {
    log "Generating self-signed certificate for $DOMAIN..."
    
    # Install OpenSSL if not available
    if ! command -v openssl >/dev/null 2>&1; then
        apk add --no-cache openssl
    fi
    
    # Generate private key
    openssl genrsa -out "$SSL_DIR/key.pem" 2048
    
    # Generate certificate
    openssl req -new -x509 \
        -key "$SSL_DIR/key.pem" \
        -out "$SSL_DIR/cert.pem" \
        -days 365 \
        -subj "/C=BR/ST=SP/L=SaoPaulo/O=HawkEsports/OU=IT/CN=$DOMAIN"
    
    # Set proper permissions
    chmod 600 "$SSL_DIR/key.pem"
    chmod 644 "$SSL_DIR/cert.pem"
    
    log "Self-signed certificate generated successfully"
}

# Obtain Let's Encrypt certificate
obtain_letsencrypt_cert() {
    log "Obtaining Let's Encrypt certificate for $DOMAIN..."
    
    # Prepare staging flag
    STAGING_FLAG=""
    if [ "$STAGING" = "true" ]; then
        STAGING_FLAG="--staging"
        log "Using Let's Encrypt staging environment"
    fi
    
    # Check if certificate already exists
    if [ -f "$CERTBOT_DIR/live/$DOMAIN/fullchain.pem" ]; then
        log "Certificate already exists for $DOMAIN"
        copy_certificates
        return 0
    fi
    
    # Wait for nginx
    wait_for_nginx
    
    # Obtain certificate
    certbot certonly \
        --webroot \
        --webroot-path="$WEBROOT_DIR" \
        --email "$EMAIL" \
        --agree-tos \
        --no-eff-email \
        --keep-until-expiring \
        --non-interactive \
        $STAGING_FLAG \
        -d "$DOMAIN" || {
        log "Failed to obtain certificate for $DOMAIN"
        log "Falling back to self-signed certificate"
        generate_self_signed
        return 0
    }
    
    # Copy certificates to nginx directory
    copy_certificates
    
    log "Let's Encrypt certificate obtained successfully"
}

# Copy certificates from certbot to nginx directory
copy_certificates() {
    if [ -f "$CERTBOT_DIR/live/$DOMAIN/fullchain.pem" ] && [ -f "$CERTBOT_DIR/live/$DOMAIN/privkey.pem" ]; then
        log "Copying certificates to nginx directory..."
        
        cp "$CERTBOT_DIR/live/$DOMAIN/fullchain.pem" "$SSL_DIR/cert.pem"
        cp "$CERTBOT_DIR/live/$DOMAIN/privkey.pem" "$SSL_DIR/key.pem"
        
        # Set proper permissions
        chmod 600 "$SSL_DIR/key.pem"
        chmod 644 "$SSL_DIR/cert.pem"
        
        log "Certificates copied successfully"
    else
        log "Warning: Certificate files not found, using self-signed"
        generate_self_signed
    fi
}

# Validate certificate
validate_certificate() {
    log "Validating SSL certificate..."
    
    if [ ! -f "$SSL_DIR/cert.pem" ] || [ ! -f "$SSL_DIR/key.pem" ]; then
        log "Error: Certificate files not found"
        return 1
    fi
    
    # Install OpenSSL if not available
    if ! command -v openssl >/dev/null 2>&1; then
        apk add --no-cache openssl
    fi
    
    # Check certificate validity
    if openssl x509 -in "$SSL_DIR/cert.pem" -noout -checkend 86400; then
        log "Certificate is valid and not expiring within 24 hours"
    else
        log "Warning: Certificate is expiring soon or invalid"
    fi
    
    # Check if certificate matches private key
    CERT_HASH=$(openssl x509 -noout -modulus -in "$SSL_DIR/cert.pem" | openssl md5)
    KEY_HASH=$(openssl rsa -noout -modulus -in "$SSL_DIR/key.pem" | openssl md5)
    
    if [ "$CERT_HASH" = "$KEY_HASH" ]; then
        log "Certificate and private key match"
    else
        log "Error: Certificate and private key do not match"
        return 1
    fi
}

# Signal nginx to reload
reload_nginx() {
    log "Signaling nginx to reload configuration..."
    
    # Try to reload nginx gracefully
    if docker exec nginx nginx -s reload 2>/dev/null; then
        log "Nginx reloaded successfully"
    else
        log "Warning: Could not reload nginx (container may not be running)"
    fi
}

# Main execution
main() {
    log "Starting SSL certificate setup for domain: $DOMAIN"
    log "Email: $EMAIL"
    log "Staging: $STAGING"
    
    create_directories
    
    if [ "$DOMAIN" = "localhost" ] || [ "$DOMAIN" = "127.0.0.1" ]; then
        generate_self_signed
    else
        obtain_letsencrypt_cert
    fi
    
    validate_certificate
    reload_nginx
    
    log "SSL certificate setup completed successfully"
}

# Handle signals
trap 'log "Received termination signal, exiting..."; exit 0' TERM INT

# Run main function
main

# Keep container running if needed
if [ "${KEEP_RUNNING:-false}" = "true" ]; then
    log "Keeping container running..."
    while true; do
        sleep 3600
    done
fi