#!/bin/bash

# Docker healthcheck script for production
# This script is used by Docker to determine if the container is healthy

set -e

# Configuration
HEALTH_URL="http://localhost:${API_PORT:-3001}/health"
TIMEOUT=10
MAX_RETRIES=3
RETRY_DELAY=2

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to log with timestamp
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Function to perform health check
perform_health_check() {
    local attempt=$1
    
    log "Health check attempt $attempt/$MAX_RETRIES"
    
    # Use curl with timeout and specific options
    response=$(curl -s -w "HTTPSTATUS:%{http_code}" \
        --max-time $TIMEOUT \
        --connect-timeout 5 \
        --retry 0 \
        "$HEALTH_URL" 2>/dev/null || echo "HTTPSTATUS:000")
    
    # Extract HTTP status and body
    http_status=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    log "HTTP Status: $http_status"
    
    if [ "$http_status" = "200" ]; then
        # Parse JSON response to check system status
        if command -v jq >/dev/null 2>&1; then
            # Use jq if available
            system_status=$(echo "$body" | jq -r '.data.status // "unknown"' 2>/dev/null || echo "unknown")
            success=$(echo "$body" | jq -r '.success // false' 2>/dev/null || echo "false")
        else
            # Fallback to grep/sed if jq is not available
            system_status=$(echo "$body" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
            success=$(echo "$body" | grep -o '"success":[^,}]*' | cut -d':' -f2 | tr -d ' ' || echo "false")
        fi
        
        log "System Status: $system_status"
        log "API Success: $success"
        
        if [ "$success" = "true" ] && ([ "$system_status" = "healthy" ] || [ "$system_status" = "degraded" ]); then
            echo -e "${GREEN}✅ Health check passed${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠️ System is unhealthy: $system_status${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ Health check failed with HTTP $http_status${NC}"
        return 1
    fi
}

# Main health check logic with retries
main() {
    log "Starting Docker health check for $HEALTH_URL"
    
    for attempt in $(seq 1 $MAX_RETRIES); do
        if perform_health_check $attempt; then
            log "Health check successful"
            exit 0
        fi
        
        if [ $attempt -lt $MAX_RETRIES ]; then
            log "Retrying in ${RETRY_DELAY}s..."
            sleep $RETRY_DELAY
        fi
    done
    
    log "Health check failed after $MAX_RETRIES attempts"
    exit 1
}

# Check if curl is available
if ! command -v curl >/dev/null 2>&1; then
    log "ERROR: curl is not installed. Cannot perform health check."
    exit 1
fi

# Run main function
main