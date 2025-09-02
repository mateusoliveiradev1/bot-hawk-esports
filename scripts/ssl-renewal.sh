#!/bin/sh

# SSL Certificate Renewal Script
# Automatically renews SSL certificates for Hawk Esports Bot

set -e

# Configuration from environment variables
DOMAIN="${DOMAIN:-localhost}"
RENEWAL_INTERVAL="${RENEWAL_INTERVAL:-43200}" # 12 hours in seconds
SSL_DIR="/etc/nginx/ssl"
CERTBOT_DIR="/etc/letsencrypt"
WEBROOT_DIR="/var/www/certbot"
LOG_FILE="/var/log/letsencrypt/renewal.log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SSL-RENEWER] $1" | tee -a "$LOG_FILE"
}

# Check if certificate needs renewal
needs_renewal() {
    if [ ! -f "$SSL_DIR/cert.pem" ]; then
        log "Certificate file not found, renewal needed"
        return 0
    fi
    
    # Install OpenSSL if not available
    if ! command -v openssl >/dev/null 2>&1; then
        apk add --no-cache openssl
    fi
    
    # Check if certificate expires within 30 days
    if openssl x509 -in "$SSL_DIR/cert.pem" -noout -checkend 2592000; then
        log "Certificate is valid for more than 30 days"
        return 1
    else
        log "Certificate expires within 30 days, renewal needed"
        return 0
    fi
}

# Renew certificate using certbot
renew_certificate() {
    log "Attempting to renew certificate for $DOMAIN..."
    
    # Skip renewal for localhost
    if [ "$DOMAIN" = "localhost" ] || [ "$DOMAIN" = "127.0.0.1" ]; then
        log "Skipping renewal for localhost (self-signed certificate)"
        return 0
    fi
    
    # Attempt renewal
    if certbot renew --quiet --no-self-upgrade --webroot --webroot-path="$WEBROOT_DIR"; then
        log "Certificate renewal successful"
        
        # Copy renewed certificates
        if [ -f "$CERTBOT_DIR/live/$DOMAIN/fullchain.pem" ] && [ -f "$CERTBOT_DIR/live/$DOMAIN/privkey.pem" ]; then
            cp "$CERTBOT_DIR/live/$DOMAIN/fullchain.pem" "$SSL_DIR/cert.pem"
            cp "$CERTBOT_DIR/live/$DOMAIN/privkey.pem" "$SSL_DIR/key.pem"
            
            # Set proper permissions
            chmod 600 "$SSL_DIR/key.pem"
            chmod 644 "$SSL_DIR/cert.pem"
            
            log "Renewed certificates copied to nginx directory"
            
            # Reload nginx
            reload_nginx
            
            return 0
        else
            log "Error: Renewed certificate files not found"
            return 1
        fi
    else
        log "Certificate renewal failed"
        return 1
    fi
}

# Reload nginx configuration
reload_nginx() {
    log "Reloading nginx configuration..."
    
    # Try to reload nginx gracefully
    if docker exec nginx nginx -s reload 2>/dev/null; then
        log "Nginx reloaded successfully"
    else
        log "Warning: Could not reload nginx (container may not be running)"
    fi
}

# Check certificate health
check_certificate_health() {
    if [ ! -f "$SSL_DIR/cert.pem" ] || [ ! -f "$SSL_DIR/key.pem" ]; then
        log "Warning: Certificate files not found"
        return 1
    fi
    
    # Install OpenSSL if not available
    if ! command -v openssl >/dev/null 2>&1; then
        apk add --no-cache openssl
    fi
    
    # Get certificate expiration date
    EXPIRY_DATE=$(openssl x509 -in "$SSL_DIR/cert.pem" -noout -enddate | cut -d= -f2)
    EXPIRY_TIMESTAMP=$(date -d "$EXPIRY_DATE" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y %Z" "$EXPIRY_DATE" +%s 2>/dev/null || echo "0")
    CURRENT_TIMESTAMP=$(date +%s)
    DAYS_UNTIL_EXPIRY=$(( (EXPIRY_TIMESTAMP - CURRENT_TIMESTAMP) / 86400 ))
    
    log "Certificate expires in $DAYS_UNTIL_EXPIRY days ($EXPIRY_DATE)"
    
    # Alert if certificate expires soon
    if [ "$DAYS_UNTIL_EXPIRY" -lt 7 ]; then
        log "ALERT: Certificate expires in less than 7 days!"
    elif [ "$DAYS_UNTIL_EXPIRY" -lt 30 ]; then
        log "WARNING: Certificate expires in less than 30 days"
    fi
    
    return 0
}

# Send notification (placeholder for future webhook/email integration)
send_notification() {
    local message="$1"
    local level="${2:-info}"
    
    log "NOTIFICATION [$level]: $message"
    
    # Future: Add webhook or email notification here
    # Example:
    # curl -X POST "$WEBHOOK_URL" -H "Content-Type: application/json" -d "{\"text\":\"$message\"}"
}

# Main renewal loop
renewal_loop() {
    log "Starting SSL certificate renewal service"
    log "Domain: $DOMAIN"
    log "Renewal interval: $RENEWAL_INTERVAL seconds"
    
    while true; do
        log "Checking certificate status..."
        
        # Check certificate health
        check_certificate_health
        
        # Check if renewal is needed
        if needs_renewal; then
            log "Certificate renewal required"
            
            if renew_certificate; then
                send_notification "SSL certificate renewed successfully for $DOMAIN" "success"
            else
                send_notification "SSL certificate renewal failed for $DOMAIN" "error"
            fi
        else
            log "Certificate renewal not needed"
        fi
        
        log "Next check in $RENEWAL_INTERVAL seconds"
        sleep "$RENEWAL_INTERVAL"
    done
}

# Health check function
health_check() {
    log "Performing health check..."
    
    # Check if certificate files exist
    if [ ! -f "$SSL_DIR/cert.pem" ] || [ ! -f "$SSL_DIR/key.pem" ]; then
        log "Health check failed: Certificate files not found"
        exit 1
    fi
    
    # Check certificate validity
    if ! openssl x509 -in "$SSL_DIR/cert.pem" -noout -checkend 0 2>/dev/null; then
        log "Health check failed: Certificate is expired or invalid"
        exit 1
    fi
    
    log "Health check passed"
    exit 0
}

# Handle command line arguments
case "${1:-}" in
    "health")
        health_check
        ;;
    "renew")
        if renew_certificate; then
            log "Manual renewal completed successfully"
            exit 0
        else
            log "Manual renewal failed"
            exit 1
        fi
        ;;
    "check")
        check_certificate_health
        exit 0
        ;;
    *)
        # Default: start renewal loop
        ;;
esac

# Handle signals
trap 'log "Received termination signal, exiting..."; exit 0' TERM INT

# Create log directory
mkdir -p "$(dirname "$LOG_FILE")"

# Start main renewal loop
renewal_loop