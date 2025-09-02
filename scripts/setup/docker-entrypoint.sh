#!/bin/bash
# Docker entrypoint script for Hawk Esports Bot
# Handles initialization, migrations, and graceful startup

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Cleanup function for graceful shutdown
cleanup() {
    log_info "Received shutdown signal, cleaning up..."
    
    # Kill any background processes
    jobs -p | xargs -r kill
    
    # Wait for processes to terminate
    sleep 2
    
    log_success "Cleanup completed"
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT SIGQUIT

# Function to wait for database
wait_for_database() {
    log_info "Waiting for database connection..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if npx prisma db push --accept-data-loss > /dev/null 2>&1; then
            log_success "Database connection established"
            return 0
        fi
        
        log_warn "Database connection attempt $attempt/$max_attempts failed, retrying in 2 seconds..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    log_error "Failed to connect to database after $max_attempts attempts"
    return 1
}

# Function to run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    if npx prisma migrate deploy; then
        log_success "Database migrations completed successfully"
    else
        log_warn "Migration failed, attempting to push schema..."
        if npx prisma db push --accept-data-loss; then
            log_success "Database schema pushed successfully"
        else
            log_error "Failed to apply database schema"
            return 1
        fi
    fi
}

# Function to validate environment
validate_environment() {
    log_info "Validating environment variables..."
    
    local required_vars=(
        "DATABASE_URL"
        "DISCORD_TOKEN"
        "DISCORD_CLIENT_ID"
    )
    
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            missing_vars+=("$var")
        fi
    done
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        log_error "Missing required environment variables: ${missing_vars[*]}"
        return 1
    fi
    
    log_success "Environment validation passed"
}

# Function to create necessary directories
setup_directories() {
    log_info "Setting up application directories..."
    
    local dirs=(
        "uploads/clips"
        "uploads/thumbnails"
        "logs"
        "data"
        "tmp"
    )
    
    for dir in "${dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            log_info "Created directory: $dir"
        fi
    done
    
    log_success "Directory setup completed"
}

# Function to check application health
check_app_health() {
    log_info "Performing application health check..."
    
    # Check if required files exist
    local required_files=(
        "package.json"
        "dist/index.js"
    )
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            log_error "Required file not found: $file"
            return 1
        fi
    done
    
    # Check Node.js version
    local node_version
    node_version=$(node --version)
    log_info "Node.js version: $node_version"
    
    # Check npm version
    local npm_version
    npm_version=$(npm --version)
    log_info "npm version: $npm_version"
    
    log_success "Application health check passed"
}

# Function to start the application
start_application() {
    log_info "Starting Hawk Esports Bot..."
    
    # Set process title for easier identification
    export PROCESS_TITLE="hawk-esports-bot"
    
    # Start the application with proper signal handling
    exec "$@"
}

# Main execution
main() {
    log_info "=== Hawk Esports Bot Startup ==="
    log_info "Container started at $(date)"
    log_info "Node.js version: $(node --version)"
    log_info "npm version: $(npm --version)"
    log_info "Working directory: $(pwd)"
    log_info "User: $(whoami)"
    
    # Validate environment
    if ! validate_environment; then
        log_error "Environment validation failed"
        exit 1
    fi
    
    # Setup directories
    setup_directories
    
    # Check application health
    if ! check_app_health; then
        log_error "Application health check failed"
        exit 1
    fi
    
    # Wait for database (if DATABASE_URL is set)
    if [ -n "${DATABASE_URL:-}" ]; then
        if ! wait_for_database; then
            log_error "Database connection failed"
            exit 1
        fi
        
        # Run migrations
        if ! run_migrations; then
            log_error "Database migration failed"
            exit 1
        fi
    else
        log_warn "DATABASE_URL not set, skipping database operations"
    fi
    
    log_success "Initialization completed successfully"
    log_info "=== Starting Application ==="
    
    # Start the application
    start_application "$@"
}

# Execute main function with all arguments
main "$@"