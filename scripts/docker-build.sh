#!/bin/bash
# Docker Build Script for Hawk Esports Bot
# Optimized build process with multi-stage builds and caching

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="hawk-esports-bot"
REGISTRY="${DOCKER_REGISTRY:-}"
TAG="${BUILD_TAG:-latest}"
BUILD_CONTEXT="."
DOCKERFILE="Dockerfile"
DEV_DOCKERFILE="Dockerfile.dev"
BUILD_ARGS=""
PUSH_IMAGE=false
BUILD_DEV=false
NO_CACHE=false
VERBOSE=false
PRUNE_AFTER=false
ANALYZE_SIZE=false
USE_BUILDKIT=true
PARALLEL_BUILDS=false

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

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_build() {
    echo -e "${CYAN}[BUILD]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Help function
show_help() {
    cat << EOF
Docker Build Script for Hawk Esports Bot

Usage: $0 [OPTIONS]

Options:
  -h, --help              Show this help message
  -t, --tag TAG           Set image tag (default: latest)
  -r, --registry URL      Set Docker registry URL
  -d, --dev               Build development image
  -p, --push              Push image to registry after build
  -n, --no-cache          Build without using cache
  -v, --verbose           Enable verbose output
  --prune                 Prune Docker system after build
  --analyze               Analyze image size and layers
  --parallel              Build production and dev images in parallel
  --build-arg KEY=VALUE   Add build argument
  --dockerfile FILE       Use custom Dockerfile (default: Dockerfile)
  --context PATH          Set build context path (default: .)

Examples:
  $0                                    # Build production image with latest tag
  $0 -t v1.0.0 -p                     # Build and push with version tag
  $0 -d                                # Build development image
  $0 --parallel -t v1.0.0             # Build both prod and dev in parallel
  $0 --analyze --no-cache              # Build with analysis and no cache
  $0 --build-arg NODE_ENV=production   # Build with custom build arg

Environment Variables:
  DOCKER_REGISTRY    Default registry URL
  BUILD_TAG          Default build tag
  DOCKER_BUILDKIT    Enable BuildKit (default: 1)

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -t|--tag)
                TAG="$2"
                shift 2
                ;;
            -r|--registry)
                REGISTRY="$2"
                shift 2
                ;;
            -d|--dev)
                BUILD_DEV=true
                shift
                ;;
            -p|--push)
                PUSH_IMAGE=true
                shift
                ;;
            -n|--no-cache)
                NO_CACHE=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            --prune)
                PRUNE_AFTER=true
                shift
                ;;
            --analyze)
                ANALYZE_SIZE=true
                shift
                ;;
            --parallel)
                PARALLEL_BUILDS=true
                shift
                ;;
            --build-arg)
                BUILD_ARGS="$BUILD_ARGS --build-arg $2"
                shift 2
                ;;
            --dockerfile)
                DOCKERFILE="$2"
                shift 2
                ;;
            --context)
                BUILD_CONTEXT="$2"
                shift 2
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Validate environment
validate_environment() {
    log_step "Validating build environment..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    # Check Docker daemon
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    # Check build context
    if [ ! -d "$BUILD_CONTEXT" ]; then
        log_error "Build context directory does not exist: $BUILD_CONTEXT"
        exit 1
    fi
    
    # Check Dockerfile
    if [ ! -f "$BUILD_CONTEXT/$DOCKERFILE" ]; then
        log_error "Dockerfile not found: $BUILD_CONTEXT/$DOCKERFILE"
        exit 1
    fi
    
    # Enable BuildKit if requested
    if [ "$USE_BUILDKIT" = true ]; then
        export DOCKER_BUILDKIT=1
        log_info "Docker BuildKit enabled"
    fi
    
    log_success "Environment validation completed"
}

# Get image size
get_image_size() {
    local image="$1"
    docker images --format "table {{.Size}}" "$image" | tail -n 1
}

# Analyze image layers
analyze_image() {
    local image="$1"
    
    log_step "Analyzing image: $image"
    
    # Get image size
    local size
    size=$(get_image_size "$image")
    log_info "Image size: $size"
    
    # Show layer information
    log_info "Image layers:"
    docker history "$image" --format "table {{.CreatedBy}}\t{{.Size}}" | head -20
    
    # If dive is available, use it for detailed analysis
    if command -v dive &> /dev/null; then
        log_info "Running dive analysis (non-interactive)..."
        dive "$image" --ci
    else
        log_warn "Install 'dive' for detailed layer analysis: https://github.com/wagoodman/dive"
    fi
}

# Build image
build_image() {
    local dockerfile="$1"
    local image_tag="$2"
    local build_type="$3"
    
    log_step "Building $build_type image: $image_tag"
    
    # Prepare build command
    local build_cmd="docker build"
    
    # Add build arguments
    if [ -n "$BUILD_ARGS" ]; then
        build_cmd="$build_cmd $BUILD_ARGS"
    fi
    
    # Add no-cache flag
    if [ "$NO_CACHE" = true ]; then
        build_cmd="$build_cmd --no-cache"
    fi
    
    # Add verbose flag
    if [ "$VERBOSE" = true ]; then
        build_cmd="$build_cmd --progress=plain"
    fi
    
    # Add target for multi-stage builds
    if [ "$build_type" = "production" ]; then
        build_cmd="$build_cmd --target=production"
    fi
    
    # Complete build command
    build_cmd="$build_cmd -f $dockerfile -t $image_tag $BUILD_CONTEXT"
    
    log_build "Executing: $build_cmd"
    
    # Record build start time
    local start_time
    start_time=$(date +%s)
    
    # Execute build
    if eval "$build_cmd"; then
        local end_time
        end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        log_success "$build_type image built successfully in ${duration}s: $image_tag"
        
        # Analyze image if requested
        if [ "$ANALYZE_SIZE" = true ]; then
            analyze_image "$image_tag"
        fi
        
        return 0
    else
        log_error "Failed to build $build_type image"
        return 1
    fi
}

# Push image to registry
push_image() {
    local image_tag="$1"
    
    if [ -z "$REGISTRY" ]; then
        log_warn "No registry specified, skipping push"
        return 0
    fi
    
    local full_image="$REGISTRY/$image_tag"
    
    log_step "Tagging image for registry: $full_image"
    if docker tag "$image_tag" "$full_image"; then
        log_success "Image tagged successfully"
    else
        log_error "Failed to tag image"
        return 1
    fi
    
    log_step "Pushing image to registry: $full_image"
    if docker push "$full_image"; then
        log_success "Image pushed successfully: $full_image"
    else
        log_error "Failed to push image"
        return 1
    fi
}

# Prune Docker system
prune_docker() {
    log_step "Pruning Docker system..."
    
    # Remove dangling images
    docker image prune -f
    
    # Remove unused build cache
    docker builder prune -f
    
    log_success "Docker system pruned"
}

# Build production image
build_production() {
    local prod_tag="$IMAGE_NAME:$TAG"
    build_image "$DOCKERFILE" "$prod_tag" "production"
    
    if [ "$PUSH_IMAGE" = true ]; then
        push_image "$prod_tag"
    fi
}

# Build development image
build_development() {
    local dev_tag="$IMAGE_NAME:$TAG-dev"
    build_image "$DEV_DOCKERFILE" "$dev_tag" "development"
    
    if [ "$PUSH_IMAGE" = true ]; then
        push_image "$dev_tag"
    fi
}

# Main execution
main() {
    log_info "=== Hawk Esports Bot Docker Build ==="
    log_info "Build started at $(date)"
    
    # Parse arguments
    parse_args "$@"
    
    # Validate environment
    validate_environment
    
    # Show build configuration
    log_info "Build Configuration:"
    log_info "  Image Name: $IMAGE_NAME"
    log_info "  Tag: $TAG"
    log_info "  Registry: ${REGISTRY:-'(none)'}"
    log_info "  Build Context: $BUILD_CONTEXT"
    log_info "  Dockerfile: $DOCKERFILE"
    log_info "  Build Dev: $BUILD_DEV"
    log_info "  Push Image: $PUSH_IMAGE"
    log_info "  No Cache: $NO_CACHE"
    log_info "  Parallel Builds: $PARALLEL_BUILDS"
    
    # Record total start time
    local total_start_time
    total_start_time=$(date +%s)
    
    # Build images
    if [ "$PARALLEL_BUILDS" = true ]; then
        log_step "Starting parallel builds..."
        
        # Start production build in background
        (
            build_production
        ) &
        local prod_pid=$!
        
        # Start development build in background if requested
        if [ "$BUILD_DEV" = true ]; then
            (
                build_development
            ) &
            local dev_pid=$!
        fi
        
        # Wait for builds to complete
        wait $prod_pid
        local prod_result=$?
        
        if [ "$BUILD_DEV" = true ]; then
            wait $dev_pid
            local dev_result=$?
        else
            local dev_result=0
        fi
        
        # Check results
        if [ $prod_result -eq 0 ] && [ $dev_result -eq 0 ]; then
            log_success "All parallel builds completed successfully"
        else
            log_error "One or more parallel builds failed"
            exit 1
        fi
    else
        # Sequential builds
        build_production
        
        if [ "$BUILD_DEV" = true ]; then
            build_development
        fi
    fi
    
    # Prune if requested
    if [ "$PRUNE_AFTER" = true ]; then
        prune_docker
    fi
    
    # Calculate total time
    local total_end_time
    total_end_time=$(date +%s)
    local total_duration=$((total_end_time - total_start_time))
    
    log_success "=== Build Process Completed ==="
    log_success "Total build time: ${total_duration}s"
    log_success "Build completed at $(date)"
    
    # Show final image information
    log_info "Built images:"
    docker images | grep "$IMAGE_NAME" | grep "$TAG"
}

# Execute main function with all arguments
main "$@"