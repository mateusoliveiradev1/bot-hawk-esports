# Hawk Esports Bot - Monitoring Management Script
# PowerShell script to manage Prometheus, Grafana, and Alertmanager services

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("start", "stop", "restart", "status", "logs", "setup", "cleanup")]
    [string]$Action,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("prometheus", "grafana", "alertmanager", "node-exporter", "postgres-exporter", "redis-exporter", "all")]
    [string]$Service = "all"
)

# Colors for output
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"
$Blue = "Blue"
$Cyan = "Cyan"

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Show-Header {
    Write-ColorOutput "" 
    Write-ColorOutput "=================================================" $Cyan
    Write-ColorOutput "    Hawk Esports Bot - Monitoring Manager" $Cyan
    Write-ColorOutput "=================================================" $Cyan
    Write-ColorOutput ""
}

function Test-DockerCompose {
    try {
        $null = docker-compose --version
        return $true
    } catch {
        Write-ColorOutput "❌ Docker Compose not found. Please install Docker Desktop." $Red
        return $false
    }
}

function Test-MonitoringFiles {
    $requiredFiles = @(
        "monitoring/prometheus.yml",
        "monitoring/alert_rules.yml",
        "monitoring/recording_rules.yml",
        "monitoring/alertmanager.yml",
        "monitoring/grafana/provisioning/datasources/prometheus.yml",
        "monitoring/grafana/provisioning/dashboards/dashboards.yml"
    )
    
    $missing = @()
    foreach ($file in $requiredFiles) {
        if (-not (Test-Path $file)) {
            $missing += $file
        }
    }
    
    if ($missing.Count -gt 0) {
        Write-ColorOutput "❌ Missing monitoring configuration files:" $Red
        foreach ($file in $missing) {
            Write-ColorOutput "   - $file" $Red
        }
        return $false
    }
    
    return $true
}

function Start-MonitoringServices {
    param([string]$ServiceName = "all")
    
    Write-ColorOutput "🚀 Starting monitoring services..." $Green
    
    if ($ServiceName -eq "all") {
        docker-compose --profile monitoring up -d
    } else {
        docker-compose --profile monitoring up -d $ServiceName
    }
    
    if ($LASTEXITCODE -eq 0) {
        Write-ColorOutput "✅ Monitoring services started successfully!" $Green
        Show-ServiceUrls
    } else {
        Write-ColorOutput "❌ Failed to start monitoring services." $Red
    }
}

function Stop-MonitoringServices {
    param([string]$ServiceName = "all")
    
    Write-ColorOutput "🛑 Stopping monitoring services..." $Yellow
    
    if ($ServiceName -eq "all") {
        docker-compose --profile monitoring down
    } else {
        docker-compose stop $ServiceName
    }
    
    if ($LASTEXITCODE -eq 0) {
        Write-ColorOutput "✅ Monitoring services stopped successfully!" $Green
    } else {
        Write-ColorOutput "❌ Failed to stop monitoring services." $Red
    }
}

function Restart-MonitoringServices {
    param([string]$ServiceName = "all")
    
    Write-ColorOutput "🔄 Restarting monitoring services..." $Yellow
    Stop-MonitoringServices $ServiceName
    Start-Sleep -Seconds 3
    Start-MonitoringServices $ServiceName
}

function Show-ServiceStatus {
    Write-ColorOutput "📊 Monitoring Services Status:" $Blue
    Write-ColorOutput ""
    
    $services = @("prometheus", "grafana", "alertmanager", "node-exporter", "postgres-exporter", "redis-exporter")
    
    foreach ($service in $services) {
        $containerName = "hawk-$service"
        $status = docker ps --filter "name=$containerName" --format "table {{.Names}}\t{{.Status}}" | Select-Object -Skip 1
        
        if ($status) {
            Write-ColorOutput "✅ $service`: $status" $Green
        } else {
            Write-ColorOutput "❌ $service`: Not running" $Red
        }
    }
    
    Write-ColorOutput ""
    Show-ServiceUrls
}

function Show-ServiceUrls {
    Write-ColorOutput "🌐 Service URLs:" $Blue
    Write-ColorOutput "   📊 Grafana:      http://localhost:3000 (admin/admin123)" $Cyan
    Write-ColorOutput "   📈 Prometheus:   http://localhost:9090" $Cyan
    Write-ColorOutput "   🚨 Alertmanager: http://localhost:9093" $Cyan
    Write-ColorOutput "   💻 Node Exporter: http://localhost:9100" $Cyan
    Write-ColorOutput "   🗄️  Postgres Exporter: http://localhost:9187" $Cyan
    Write-ColorOutput "   🔴 Redis Exporter: http://localhost:9121" $Cyan
    Write-ColorOutput ""
}

function Show-ServiceLogs {
    param([string]$ServiceName = "all")
    
    Write-ColorOutput "📋 Showing logs for: $ServiceName" $Blue
    
    if ($ServiceName -eq "all") {
        docker-compose --profile monitoring logs -f
    } else {
        docker-compose logs -f "hawk-$ServiceName"
    }
}

function Setup-Monitoring {
    Write-ColorOutput "🔧 Setting up monitoring environment..." $Blue
    
    # Create monitoring directories
    $directories = @(
        "monitoring",
        "monitoring/grafana",
        "monitoring/grafana/provisioning",
        "monitoring/grafana/provisioning/datasources",
        "monitoring/grafana/provisioning/dashboards",
        "monitoring/grafana/provisioning/dashboards/json",
        "monitoring/grafana/provisioning/dashboards/system",
        "monitoring/grafana/provisioning/dashboards/infrastructure"
    )
    
    foreach ($dir in $directories) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-ColorOutput "✅ Created directory: $dir" $Green
        }
    }
    
    # Set permissions for Grafana
    if (Test-Path "monitoring/grafana") {
        Write-ColorOutput "🔐 Setting Grafana permissions..." $Yellow
        # Note: On Windows, Docker handles permissions automatically
    }
    
    Write-ColorOutput "✅ Monitoring setup completed!" $Green
    Write-ColorOutput "💡 Run 'monitoring.ps1 start' to start all services." $Cyan
}

function Cleanup-Monitoring {
    Write-ColorOutput "🧹 Cleaning up monitoring resources..." $Yellow
    
    # Stop and remove containers
    docker-compose --profile monitoring down -v
    
    # Remove unused volumes (optional)
    $response = Read-Host "Do you want to remove monitoring data volumes? (y/N)"
    if ($response -eq "y" -or $response -eq "Y") {
        docker volume rm hawk-esports-bot_prometheus_data 2>$null
        docker volume rm hawk-esports-bot_grafana_data 2>$null
        docker volume rm hawk-esports-bot_alertmanager_data 2>$null
        Write-ColorOutput "✅ Monitoring volumes removed." $Green
    }
    
    Write-ColorOutput "✅ Cleanup completed!" $Green
}

function Show-Help {
    Write-ColorOutput "Usage: monitoring.ps1 -Action <action> [-Service <service>]" $Blue
    Write-ColorOutput ""
    Write-ColorOutput "Actions:" $Yellow
    Write-ColorOutput "  start     - Start monitoring services" $White
    Write-ColorOutput "  stop      - Stop monitoring services" $White
    Write-ColorOutput "  restart   - Restart monitoring services" $White
    Write-ColorOutput "  status    - Show service status and URLs" $White
    Write-ColorOutput "  logs      - Show service logs" $White
    Write-ColorOutput "  setup     - Setup monitoring environment" $White
    Write-ColorOutput "  cleanup   - Clean up monitoring resources" $White
    Write-ColorOutput ""
    Write-ColorOutput "Services:" $Yellow
    Write-ColorOutput "  all               - All monitoring services (default)" $White
    Write-ColorOutput "  prometheus        - Prometheus metrics server" $White
    Write-ColorOutput "  grafana           - Grafana visualization" $White
    Write-ColorOutput "  alertmanager      - Alertmanager" $White
    Write-ColorOutput "  node-exporter     - Node exporter" $White
    Write-ColorOutput "  postgres-exporter - PostgreSQL exporter" $White
    Write-ColorOutput "  redis-exporter    - Redis exporter" $White
    Write-ColorOutput ""
    Write-ColorOutput "Examples:" $Yellow
    Write-ColorOutput "  .\scripts\monitoring.ps1 -Action start" $Cyan
    Write-ColorOutput "  .\scripts\monitoring.ps1 -Action status" $Cyan
    Write-ColorOutput "  .\scripts\monitoring.ps1 -Action logs -Service grafana" $Cyan
    Write-ColorOutput "  .\scripts\monitoring.ps1 -Action restart -Service prometheus" $Cyan
}

# Main execution
Show-Header

# Check prerequisites
if (-not (Test-DockerCompose)) {
    exit 1
}

# Execute action
switch ($Action.ToLower()) {
    "start" {
        if (-not (Test-MonitoringFiles)) {
            Write-ColorOutput "💡 Run 'monitoring.ps1 setup' first to create required directories." $Cyan
            exit 1
        }
        Start-MonitoringServices $Service
    }
    "stop" {
        Stop-MonitoringServices $Service
    }
    "restart" {
        Restart-MonitoringServices $Service
    }
    "status" {
        Show-ServiceStatus
    }
    "logs" {
        Show-ServiceLogs $Service
    }
    "setup" {
        Setup-Monitoring
    }
    "cleanup" {
        Cleanup-Monitoring
    }
    default {
        Show-Help
    }
}

Write-ColorOutput ""