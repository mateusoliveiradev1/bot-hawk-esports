#!/bin/sh

# SSL Certificate Monitor Script
# Monitors SSL certificate health and sends alerts for Hawk Esports Bot

set -e

# Configuration from environment variables
DOMAIN="${DOMAIN:-localhost}"
CHECK_INTERVAL="${CHECK_INTERVAL:-3600}" # 1 hour in seconds
ALERT_DAYS="${ALERT_DAYS:-30}" # Alert when certificate expires within this many days
SSL_DIR="/ssl"
LOG_DIR="/logs"
LOG_FILE="$LOG_DIR/ssl-monitor.log"
ALERT_FILE="$LOG_DIR/ssl-alerts.log"

# Logging functions
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SSL-MONITOR] $1" | tee -a "$LOG_FILE"
}

alert() {
    local message="$1"
    local level="${2:-warning}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ALERT-$level] $message" | tee -a "$ALERT_FILE"
    log "ALERT [$level]: $message"
}

# Install required packages
install_dependencies() {
    if ! command -v openssl >/dev/null 2>&1; then
        log "Installing OpenSSL..."
        apk add --no-cache openssl curl
    fi
    
    if ! command -v curl >/dev/null 2>&1; then
        log "Installing curl..."
        apk add --no-cache curl
    fi
}

# Check if certificate files exist
check_certificate_files() {
    if [ ! -f "$SSL_DIR/cert.pem" ]; then
        alert "Certificate file not found: $SSL_DIR/cert.pem" "error"
        return 1
    fi
    
    if [ ! -f "$SSL_DIR/key.pem" ]; then
        alert "Private key file not found: $SSL_DIR/key.pem" "error"
        return 1
    fi
    
    log "Certificate files found"
    return 0
}

# Get certificate information
get_certificate_info() {
    local cert_file="$SSL_DIR/cert.pem"
    
    if [ ! -f "$cert_file" ]; then
        return 1
    fi
    
    # Extract certificate information
    CERT_SUBJECT=$(openssl x509 -in "$cert_file" -noout -subject | sed 's/subject=//')
    CERT_ISSUER=$(openssl x509 -in "$cert_file" -noout -issuer | sed 's/issuer=//')
    CERT_START_DATE=$(openssl x509 -in "$cert_file" -noout -startdate | cut -d= -f2)
    CERT_END_DATE=$(openssl x509 -in "$cert_file" -noout -enddate | cut -d= -f2)
    CERT_SERIAL=$(openssl x509 -in "$cert_file" -noout -serial | cut -d= -f2)
    
    # Calculate days until expiry
    EXPIRY_TIMESTAMP=$(date -d "$CERT_END_DATE" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y %Z" "$CERT_END_DATE" +%s 2>/dev/null || echo "0")
    CURRENT_TIMESTAMP=$(date +%s)
    DAYS_UNTIL_EXPIRY=$(( (EXPIRY_TIMESTAMP - CURRENT_TIMESTAMP) / 86400 ))
    
    log "Certificate Information:"
    log "  Subject: $CERT_SUBJECT"
    log "  Issuer: $CERT_ISSUER"
    log "  Serial: $CERT_SERIAL"
    log "  Valid From: $CERT_START_DATE"
    log "  Valid Until: $CERT_END_DATE"
    log "  Days Until Expiry: $DAYS_UNTIL_EXPIRY"
}

# Check certificate validity
check_certificate_validity() {
    local cert_file="$SSL_DIR/cert.pem"
    local key_file="$SSL_DIR/key.pem"
    
    # Check if certificate is valid (not expired)
    if ! openssl x509 -in "$cert_file" -noout -checkend 0 2>/dev/null; then
        alert "Certificate has expired!" "critical"
        return 1
    fi
    
    # Check if certificate expires soon
    if ! openssl x509 -in "$cert_file" -noout -checkend $((ALERT_DAYS * 86400)) 2>/dev/null; then
        alert "Certificate expires within $ALERT_DAYS days!" "warning"
    fi
    
    # Check if certificate and key match
    CERT_HASH=$(openssl x509 -noout -modulus -in "$cert_file" | openssl md5)
    KEY_HASH=$(openssl rsa -noout -modulus -in "$key_file" 2>/dev/null | openssl md5)
    
    if [ "$CERT_HASH" != "$KEY_HASH" ]; then
        alert "Certificate and private key do not match!" "critical"
        return 1
    fi
    
    log "Certificate validation passed"
    return 0
}

# Test SSL connection
test_ssl_connection() {
    local domain="$1"
    local port="${2:-443}"
    
    if [ "$domain" = "localhost" ] || [ "$domain" = "127.0.0.1" ]; then
        log "Skipping SSL connection test for localhost"
        return 0
    fi
    
    log "Testing SSL connection to $domain:$port..."
    
    # Test SSL connection
    if echo | openssl s_client -connect "$domain:$port" -servername "$domain" 2>/dev/null | openssl x509 -noout -dates 2>/dev/null; then
        log "SSL connection test successful"
        return 0
    else
        alert "SSL connection test failed for $domain:$port" "error"
        return 1
    fi
}

# Check certificate chain
check_certificate_chain() {
    local cert_file="$SSL_DIR/cert.pem"
    
    log "Checking certificate chain..."
    
    # Verify certificate chain
    if openssl verify "$cert_file" >/dev/null 2>&1; then
        log "Certificate chain verification successful"
        return 0
    else
        # Try with system CA bundle
        if openssl verify -CApath /etc/ssl/certs "$cert_file" >/dev/null 2>&1; then
            log "Certificate chain verification successful (with system CA)"
            return 0
        else
            alert "Certificate chain verification failed" "warning"
            return 1
        fi
    fi
}

# Generate health report
generate_health_report() {
    local report_file="$LOG_DIR/ssl-health-report.json"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    cat > "$report_file" << EOF
{
  "timestamp": "$timestamp",
  "domain": "$DOMAIN",
  "certificate": {
    "subject": "$CERT_SUBJECT",
    "issuer": "$CERT_ISSUER",
    "serial": "$CERT_SERIAL",
    "valid_from": "$CERT_START_DATE",
    "valid_until": "$CERT_END_DATE",
    "days_until_expiry": $DAYS_UNTIL_EXPIRY
  },
  "checks": {
    "files_exist": $(check_certificate_files >/dev/null 2>&1 && echo "true" || echo "false"),
    "certificate_valid": $(openssl x509 -in "$SSL_DIR/cert.pem" -noout -checkend 0 >/dev/null 2>&1 && echo "true" || echo "false"),
    "key_matches": $([ "$(openssl x509 -noout -modulus -in "$SSL_DIR/cert.pem" | openssl md5)" = "$(openssl rsa -noout -modulus -in "$SSL_DIR/key.pem" 2>/dev/null | openssl md5)" ] && echo "true" || echo "false"),
    "expires_soon": $([ "$DAYS_UNTIL_EXPIRY" -lt "$ALERT_DAYS" ] && echo "true" || echo "false")
  },
  "status": "$([ "$DAYS_UNTIL_EXPIRY" -gt "$ALERT_DAYS" ] && echo "healthy" || echo "warning")"
}
EOF
    
    log "Health report generated: $report_file"
}

# Send webhook notification (if configured)
send_webhook_notification() {
    local message="$1"
    local level="${2:-info}"
    local webhook_url="${WEBHOOK_URL:-}"
    
    if [ -z "$webhook_url" ]; then
        return 0
    fi
    
    local payload=$(cat << EOF
{
  "text": "SSL Monitor Alert",
  "attachments": [
    {
      "color": "$([ "$level" = "critical" ] && echo "danger" || [ "$level" = "warning" ] && echo "warning" || echo "good")",
      "fields": [
        {
          "title": "Domain",
          "value": "$DOMAIN",
          "short": true
        },
        {
          "title": "Level",
          "value": "$level",
          "short": true
        },
        {
          "title": "Message",
          "value": "$message",
          "short": false
        },
        {
          "title": "Timestamp",
          "value": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
          "short": true
        }
      ]
    }
  ]
}
EOF
)
    
    if curl -X POST -H "Content-Type: application/json" -d "$payload" "$webhook_url" >/dev/null 2>&1; then
        log "Webhook notification sent successfully"
    else
        log "Failed to send webhook notification"
    fi
}

# Main monitoring function
perform_ssl_check() {
    log "Starting SSL certificate check for $DOMAIN"
    
    local overall_status="healthy"
    
    # Check certificate files
    if ! check_certificate_files; then
        overall_status="critical"
    fi
    
    # Get certificate information
    if ! get_certificate_info; then
        overall_status="critical"
    fi
    
    # Check certificate validity
    if ! check_certificate_validity; then
        overall_status="critical"
    fi
    
    # Check certificate chain
    if ! check_certificate_chain; then
        if [ "$overall_status" != "critical" ]; then
            overall_status="warning"
        fi
    fi
    
    # Test SSL connection (if not localhost)
    if ! test_ssl_connection "$DOMAIN"; then
        if [ "$overall_status" != "critical" ]; then
            overall_status="warning"
        fi
    fi
    
    # Generate health report
    generate_health_report
    
    log "SSL check completed with status: $overall_status"
    
    # Send notification if there are issues
    if [ "$overall_status" != "healthy" ]; then
        send_webhook_notification "SSL certificate check failed for $DOMAIN" "$overall_status"
    fi
    
    return 0
}

# Main monitoring loop
monitoring_loop() {
    log "Starting SSL certificate monitoring service"
    log "Domain: $DOMAIN"
    log "Check interval: $CHECK_INTERVAL seconds"
    log "Alert threshold: $ALERT_DAYS days"
    
    while true; do
        perform_ssl_check
        
        log "Next check in $CHECK_INTERVAL seconds"
        sleep "$CHECK_INTERVAL"
    done
}

# Handle command line arguments
case "${1:-}" in
    "check")
        perform_ssl_check
        exit 0
        ;;
    "report")
        get_certificate_info
        generate_health_report
        cat "$LOG_DIR/ssl-health-report.json"
        exit 0
        ;;
    "health")
        if check_certificate_files && check_certificate_validity; then
            echo "SSL certificates are healthy"
            exit 0
        else
            echo "SSL certificates have issues"
            exit 1
        fi
        ;;
    *)
        # Default: start monitoring loop
        ;;
esac

# Handle signals
trap 'log "Received termination signal, exiting..."; exit 0' TERM INT

# Create log directory
mkdir -p "$LOG_DIR"

# Install dependencies
install_dependencies

# Start main monitoring loop
monitoring_loop