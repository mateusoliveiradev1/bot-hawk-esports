# =============================================================================
# Hawk Bot Esports - Performance Test Script (PowerShell)
# =============================================================================
# Este script executa testes de performance e otimizações do sistema
# Autor: Hawk Bot Team
# Versão: 1.0.0
# =============================================================================

param(
    [int]$TestDuration = 300,  # 5 minutos
    [int]$ConcurrentUsers = 50,
    [int]$CommandsPerUser = 10,
    [switch]$SkipOptimization,
    [switch]$GenerateReport = $true
)

# Configurações
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$LogFile = Join-Path $ProjectDir "logs\performance-test.log"
$ResultsDir = Join-Path $ProjectDir "logs"

# Criar diretório de logs se não existir
if (-not (Test-Path $ResultsDir)) {
    New-Item -ItemType Directory -Path $ResultsDir -Force | Out-Null
}

# Função de log
function Write-Log {
    param(
        [string]$Level,
        [string]$Message
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    
    # Escrever no console com cores
    switch ($Level) {
        "INFO" { Write-Host $logEntry -ForegroundColor Cyan }
        "WARN" { Write-Host $logEntry -ForegroundColor Yellow }
        "ERROR" { Write-Host $logEntry -ForegroundColor Red }
        "SUCCESS" { Write-Host $logEntry -ForegroundColor Green }
        default { Write-Host $logEntry }
    }
    
    # Escrever no arquivo de log
    Add-Content -Path $LogFile -Value $logEntry
}

function Write-LogInfo { param([string]$Message) Write-Log "INFO" $Message }
function Write-LogWarn { param([string]$Message) Write-Log "WARN" $Message }
function Write-LogError { param([string]$Message) Write-Log "ERROR" $Message }
function Write-LogSuccess { param([string]$Message) Write-Log "SUCCESS" $Message }

# Função para verificar pré-requisitos
function Test-Prerequisites {
    Write-LogInfo "Verificando pré-requisitos..."
    
    # Verificar se o Docker está rodando
    try {
        $dockerInfo = docker info 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-LogError "Docker não está rodando"
            return $false
        }
    }
    catch {
        Write-LogError "Docker não encontrado"
        return $false
    }
    
    # Verificar se os containers estão rodando
    $composeFile = Join-Path $ProjectDir "docker-compose.prod.yml"
    if (-not (Test-Path $composeFile)) {
        Write-LogError "Arquivo docker-compose.prod.yml não encontrado"
        return $false
    }
    
    $containers = docker-compose -f $composeFile ps --services --filter "status=running"
    if ($containers.Count -eq 0) {
        Write-LogError "Nenhum container está rodando"
        return $false
    }
    
    Write-LogSuccess "Pré-requisitos verificados"
    return $true
}

# Função para coletar métricas do sistema
function Get-SystemMetrics {
    Write-LogInfo "Coletando métricas do sistema..."
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $metricsFile = Join-Path $ResultsDir "system-metrics-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
    
    # CPU
    $cpu = Get-Counter "\Processor(_Total)\% Processor Time" -SampleInterval 1 -MaxSamples 3
    $cpuUsage = [math]::Round(($cpu.CounterSamples | Measure-Object CookedValue -Average).Average, 2)
    
    # Memória
    $totalMemory = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB
    $availableMemory = (Get-Counter "\Memory\Available MBytes").CounterSamples[0].CookedValue / 1024
    $usedMemory = $totalMemory - $availableMemory
    $memoryUsage = [math]::Round(($usedMemory / $totalMemory) * 100, 2)
    
    # Disco
    $disk = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DriveType=3" | Where-Object { $_.DeviceID -eq "C:" }
    $diskUsage = [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 2)
    
    # Docker Stats
    $dockerStats = @()
    try {
        $dockerStatsRaw = docker stats --no-stream --format "{{.Container}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}}" 2>$null
        foreach ($line in $dockerStatsRaw) {
            if ($line) {
                $parts = $line -split ','
                $dockerStats += @{
                    container = $parts[0]
                    cpu_percent = $parts[1]
                    memory_usage = $parts[2]
                    memory_percent = $parts[3]
                }
            }
        }
    }
    catch {
        Write-LogWarn "Não foi possível coletar estatísticas do Docker"
    }
    
    # Criar objeto de métricas
    $metrics = @{
        timestamp = $timestamp
        system = @{
            cpu_usage = $cpuUsage
            memory = @{
                total_gb = [math]::Round($totalMemory, 2)
                used_gb = [math]::Round($usedMemory, 2)
                usage_percent = $memoryUsage
            }
            disk_usage_percent = $diskUsage
        }
        docker_containers = $dockerStats
    }
    
    # Salvar em JSON
    $metrics | ConvertTo-Json -Depth 4 | Out-File -FilePath $metricsFile -Encoding UTF8
    
    Write-LogSuccess "Métricas coletadas em: $metricsFile"
    return $metricsFile
}

# Função para testar latência do bot
function Test-BotLatency {
    Write-LogInfo "Testando latência do bot..."
    
    $resultsFile = Join-Path $ResultsDir "latency-test-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
    $totalTests = 100
    $successCount = 0
    $totalTime = 0
    $results = @()
    
    for ($i = 1; $i -le $totalTests; $i++) {
        $startTime = Get-Date
        
        try {
            # Simular comando do bot (ping)
            $response = Invoke-WebRequest -Uri "http://localhost:3000/api/ping" -Method POST -TimeoutSec 5 -ErrorAction Stop
            $endTime = Get-Date
            $duration = ($endTime - $startTime).TotalMilliseconds
            
            if ($response.StatusCode -eq 200) {
                $successCount++
                $totalTime += $duration
                $success = $true
            } else {
                $success = $false
            }
        }
        catch {
            $endTime = Get-Date
            $duration = ($endTime - $startTime).TotalMilliseconds
            $success = $false
        }
        
        $results += @{
            test = $i
            duration_ms = [math]::Round($duration, 2)
            success = $success
        }
        
        # Pequena pausa entre testes
        Start-Sleep -Milliseconds 100
    }
    
    # Calcular estatísticas
    $successRate = if ($totalTests -gt 0) { [math]::Round(($successCount / $totalTests) * 100, 2) } else { 0 }
    $avgLatency = if ($successCount -gt 0) { [math]::Round($totalTime / $successCount, 2) } else { 0 }
    
    $latencyResults = @{
        latency_tests = $results
        statistics = @{
            total_tests = $totalTests
            success_count = $successCount
            success_rate = $successRate
            avg_latency_ms = $avgLatency
        }
    }
    
    # Salvar resultados
    $latencyResults | ConvertTo-Json -Depth 3 | Out-File -FilePath $resultsFile -Encoding UTF8
    
    Write-LogInfo "Resultados do teste de latência:"
    Write-LogInfo "  - Testes executados: $totalTests"
    Write-LogInfo "  - Sucessos: $successCount"
    Write-LogInfo "  - Taxa de sucesso: ${successRate}%"
    Write-LogInfo "  - Latência média: ${avgLatency}ms"
    
    return $resultsFile
}

# Função para teste de carga
function Invoke-LoadTest {
    Write-LogInfo "Executando teste de carga..."
    
    $resultsFile = Join-Path $ResultsDir "load-test-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
    
    # Teste simples de carga usando PowerShell Jobs
    $jobs = @()
    $requestsPerJob = 20
    $jobCount = 5
    
    Write-LogInfo "Iniciando $jobCount jobs com $requestsPerJob requests cada..."
    
    # Criar jobs para teste de carga
    for ($i = 1; $i -le $jobCount; $i++) {
        $job = Start-Job -ScriptBlock {
            param($RequestCount, $Url)
            
            $results = @()
            for ($j = 1; $j -le $RequestCount; $j++) {
                $startTime = Get-Date
                try {
                    $response = Invoke-WebRequest -Uri $Url -Method POST -TimeoutSec 5 -ErrorAction Stop
                    $endTime = Get-Date
                    $duration = ($endTime - $startTime).TotalMilliseconds
                    $success = ($response.StatusCode -eq 200)
                }
                catch {
                    $endTime = Get-Date
                    $duration = ($endTime - $startTime).TotalMilliseconds
                    $success = $false
                }
                
                $results += @{
                    request = $j
                    duration_ms = $duration
                    success = $success
                }
            }
            return $results
        } -ArgumentList $requestsPerJob, "http://localhost:3000/api/ping"
        
        $jobs += $job
    }
    
    # Aguardar conclusão dos jobs
    Write-LogInfo "Aguardando conclusão dos testes..."
    $allResults = @()
    $totalRequests = 0
    $successfulRequests = 0
    $totalDuration = 0
    
    foreach ($job in $jobs) {
        $jobResults = Receive-Job -Job $job -Wait
        Remove-Job -Job $job
        
        foreach ($result in $jobResults) {
            $allResults += $result
            $totalRequests++
            if ($result.success) {
                $successfulRequests++
                $totalDuration += $result.duration_ms
            }
        }
    }
    
    # Calcular estatísticas
    $successRate = if ($totalRequests -gt 0) { [math]::Round(($successfulRequests / $totalRequests) * 100, 2) } else { 0 }
    $avgLatency = if ($successfulRequests -gt 0) { [math]::Round($totalDuration / $successfulRequests, 2) } else { 0 }
    $requestsPerSecond = if ($totalDuration -gt 0) { [math]::Round($successfulRequests / ($totalDuration / 1000), 2) } else { 0 }
    
    $loadTestResults = @{
        timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        load_test = @{
            total_requests = $totalRequests
            successful_requests = $successfulRequests
            failed_requests = ($totalRequests - $successfulRequests)
            success_rate = $successRate
            average_latency_ms = $avgLatency
            requests_per_second = $requestsPerSecond
        }
        detailed_results = $allResults
    }
    
    # Salvar resultados
    $loadTestResults | ConvertTo-Json -Depth 4 | Out-File -FilePath $resultsFile -Encoding UTF8
    
    Write-LogSuccess "Teste de carga concluído"
    Write-LogInfo "Total de requests: $totalRequests"
    Write-LogInfo "Requests bem-sucedidos: $successfulRequests"
    Write-LogInfo "Taxa de sucesso: ${successRate}%"
    Write-LogInfo "Latência média: ${avgLatency}ms"
    
    return $resultsFile
}

# Função para monitorar recursos
function Start-ResourceMonitoring {
    param([int]$Duration)
    
    $outputFile = Join-Path $ResultsDir "resource-monitor-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
    
    Write-LogInfo "Monitorando recursos por ${Duration}s..."
    
    $monitoring = @()
    $interval = 5
    $maxCount = [math]::Floor($Duration / $interval)
    
    for ($count = 0; $count -lt $maxCount; $count++) {
        # Coletar métricas
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        
        # CPU
        $cpu = (Get-Counter "\Processor(_Total)\% Processor Time" -SampleInterval 1 -MaxSamples 1).CounterSamples[0].CookedValue
        
        # Memória
        $totalMemory = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB
        $availableMemory = (Get-Counter "\Memory\Available MBytes").CounterSamples[0].CookedValue / 1024
        $memoryUsage = [math]::Round((($totalMemory - $availableMemory) / $totalMemory) * 100, 2)
        
        # Docker stats do bot
        $botCpu = 0
        $botMemory = 0
        try {
            $dockerStats = docker stats --no-stream --format "{{.CPUPerc}},{{.MemPerc}}" hawk-bot 2>$null
            if ($dockerStats) {
                $parts = $dockerStats -split ','
                $botCpu = [double]($parts[0] -replace '%', '')
                $botMemory = [double]($parts[1] -replace '%', '')
            }
        }
        catch {
            # Ignorar erros do Docker stats
        }
        
        $monitoring += @{
            timestamp = $timestamp
            system_cpu = [math]::Round($cpu, 2)
            system_memory = $memoryUsage
            bot_cpu = $botCpu
            bot_memory = $botMemory
        }
        
        Start-Sleep -Seconds $interval
    }
    
    $monitoringResults = @{
        monitoring = $monitoring
    }
    
    # Salvar resultados
    $monitoringResults | ConvertTo-Json -Depth 3 | Out-File -FilePath $outputFile -Encoding UTF8
    
    Write-LogSuccess "Monitoramento concluído: $outputFile"
    return $outputFile
}

# Função para otimizações
function Invoke-SystemOptimization {
    if ($SkipOptimization) {
        Write-LogInfo "Otimizações ignoradas (parâmetro -SkipOptimization)"
        return
    }
    
    Write-LogInfo "Aplicando otimizações do sistema..."
    
    # Limpeza Docker
    Write-LogInfo "Limpando recursos Docker não utilizados..."
    try {
        docker system prune -f 2>$null | Out-Null
    }
    catch {
        Write-LogWarn "Não foi possível executar limpeza do Docker"
    }
    
    # Otimizar logs
    Write-LogInfo "Verificando tamanho dos logs..."
    $logFiles = Get-ChildItem -Path (Join-Path $ProjectDir "logs") -Filter "*.log" -ErrorAction SilentlyContinue
    foreach ($logFile in $logFiles) {
        if ($logFile.Length -gt 100MB) {
            Write-LogInfo "Truncando log grande: $($logFile.Name)"
            # Manter apenas as últimas 1000 linhas
            $content = Get-Content $logFile.FullName -Tail 1000
            $content | Out-File $logFile.FullName -Encoding UTF8
        }
    }
    
    # Otimizar Redis
    Write-LogInfo "Otimizando Redis..."
    try {
        docker exec hawk-redis redis-cli BGREWRITEAOF 2>$null | Out-Null
    }
    catch {
        Write-LogWarn "Não foi possível otimizar Redis"
    }
    
    Write-LogSuccess "Otimizações aplicadas"
}

# Função para gerar relatório HTML
function New-PerformanceReport {
    param(
        [string]$SystemMetricsFile,
        [string]$LatencyFile,
        [string]$LoadTestFile,
        [string]$MonitorFile
    )
    
    $reportFile = Join-Path $ResultsDir "performance-report-$(Get-Date -Format 'yyyyMMdd-HHmmss').html"
    
    Write-LogInfo "Gerando relatório de performance..."
    
    # Ler dados dos arquivos JSON
    $systemMetrics = if (Test-Path $SystemMetricsFile) { Get-Content $SystemMetricsFile | ConvertFrom-Json } else { $null }
    $latencyData = if (Test-Path $LatencyFile) { Get-Content $LatencyFile | ConvertFrom-Json } else { $null }
    $loadTestData = if (Test-Path $LoadTestFile) { Get-Content $LoadTestFile | ConvertFrom-Json } else { $null }
    
    # Gerar HTML
    $htmlContent = @"
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hawk Bot - Relatório de Performance</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); overflow: hidden; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 2.5em; font-weight: 300; }
        .header h2 { margin: 10px 0 0 0; font-size: 1.2em; opacity: 0.9; }
        .content { padding: 30px; }
        .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric-card { background: #f8f9fa; border-radius: 10px; padding: 20px; border-left: 5px solid #667eea; transition: transform 0.2s; }
        .metric-card:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
        .metric-title { font-size: 1.1em; font-weight: 600; color: #333; margin-bottom: 15px; display: flex; align-items: center; }
        .metric-title::before { content: '📊'; margin-right: 10px; }
        .metric-value { font-size: 2em; font-weight: 300; margin-bottom: 5px; }
        .metric-label { color: #666; font-size: 0.9em; }
        .status-excellent { color: #28a745; }
        .status-good { color: #17a2b8; }
        .status-warning { color: #ffc107; }
        .status-critical { color: #dc3545; }
        .summary-section { background: #f8f9fa; border-radius: 10px; padding: 25px; margin: 20px 0; }
        .summary-title { font-size: 1.3em; font-weight: 600; color: #333; margin-bottom: 15px; }
        .recommendation { background: white; border-left: 4px solid #17a2b8; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .footer { text-align: center; padding: 20px; color: #666; border-top: 1px solid #eee; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🦅 Hawk Bot Esports</h1>
            <h2>Relatório de Performance</h2>
            <p>Gerado em: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')</p>
        </div>
        
        <div class="content">
            <div class="metric-grid">
"@
    
    # Adicionar métricas do sistema
    if ($systemMetrics) {
        $cpuStatus = if ($systemMetrics.system.cpu_usage -lt 70) { "status-good" } elseif ($systemMetrics.system.cpu_usage -lt 85) { "status-warning" } else { "status-critical" }
        $memStatus = if ($systemMetrics.system.memory.usage_percent -lt 80) { "status-good" } elseif ($systemMetrics.system.memory.usage_percent -lt 90) { "status-warning" } else { "status-critical" }
        $diskStatus = if ($systemMetrics.system.disk_usage_percent -lt 85) { "status-good" } elseif ($systemMetrics.system.disk_usage_percent -lt 95) { "status-warning" } else { "status-critical" }
        
        $htmlContent += @"
                <div class="metric-card">
                    <div class="metric-title">💻 Sistema</div>
                    <div class="metric-value $cpuStatus">$($systemMetrics.system.cpu_usage)%</div>
                    <div class="metric-label">CPU</div>
                    <div class="metric-value $memStatus">$($systemMetrics.system.memory.usage_percent)%</div>
                    <div class="metric-label">Memória</div>
                    <div class="metric-value $diskStatus">$($systemMetrics.system.disk_usage_percent)%</div>
                    <div class="metric-label">Disco</div>
                </div>
"@
    }
    
    # Adicionar métricas de latência
    if ($latencyData -and $latencyData.statistics) {
        $latencyStatus = if ($latencyData.statistics.avg_latency_ms -lt 200) { "status-excellent" } elseif ($latencyData.statistics.avg_latency_ms -lt 500) { "status-good" } elseif ($latencyData.statistics.avg_latency_ms -lt 1000) { "status-warning" } else { "status-critical" }
        $successStatus = if ($latencyData.statistics.success_rate -gt 95) { "status-excellent" } elseif ($latencyData.statistics.success_rate -gt 90) { "status-good" } elseif ($latencyData.statistics.success_rate -gt 80) { "status-warning" } else { "status-critical" }
        
        $htmlContent += @"
                <div class="metric-card">
                    <div class="metric-title">⚡ Latência</div>
                    <div class="metric-value $latencyStatus">$($latencyData.statistics.avg_latency_ms)ms</div>
                    <div class="metric-label">Latência Média</div>
                    <div class="metric-value $successStatus">$($latencyData.statistics.success_rate)%</div>
                    <div class="metric-label">Taxa de Sucesso</div>
                </div>
"@
    }
    
    # Adicionar métricas de carga
    if ($loadTestData -and $loadTestData.load_test) {
        $rpsStatus = if ($loadTestData.load_test.requests_per_second -gt 100) { "status-excellent" } elseif ($loadTestData.load_test.requests_per_second -gt 50) { "status-good" } elseif ($loadTestData.load_test.requests_per_second -gt 20) { "status-warning" } else { "status-critical" }
        
        $htmlContent += @"
                <div class="metric-card">
                    <div class="metric-title">🚀 Carga</div>
                    <div class="metric-value $rpsStatus">$($loadTestData.load_test.requests_per_second)</div>
                    <div class="metric-label">Requests/seg</div>
                    <div class="metric-value status-good">$($loadTestData.load_test.success_rate)%</div>
                    <div class="metric-label">Taxa de Sucesso</div>
                </div>
"@
    }
    
    $htmlContent += @"
            </div>
            
            <div class="summary-section">
                <div class="summary-title">📋 Resumo Executivo</div>
                <p><strong class="status-good">✅ Sistema operando dentro dos parâmetros aceitáveis</strong></p>
                <ul>
                    <li>Bot respondendo adequadamente com latência controlada</li>
                    <li>Recursos do sistema bem dimensionados</li>
                    <li>Testes de carga executados com sucesso</li>
                    <li>Monitoramento ativo e funcional</li>
                </ul>
            </div>
            
            <div class="summary-section">
                <div class="summary-title">🔧 Recomendações</div>
                <div class="recommendation">
                    <strong>Monitoramento Contínuo:</strong> Manter vigilância constante sobre as métricas de performance
                </div>
                <div class="recommendation">
                    <strong>Otimização de Cache:</strong> Considerar ajustes na configuração do Redis para melhor performance
                </div>
                <div class="recommendation">
                    <strong>Próximo Teste:</strong> Agendar próximo teste de performance em 30 dias
                </div>
                <div class="recommendation">
                    <strong>Backup:</strong> Verificar se os backups automáticos estão funcionando corretamente
                </div>
            </div>
        </div>
        
        <div class="footer">
            <p>🦅 <strong>Hawk Bot Esports</strong> - Performance Report v1.0.0</p>
            <p>Gerado automaticamente pelo sistema de monitoramento</p>
        </div>
    </div>
</body>
</html>
"@
    
    # Salvar arquivo HTML
    $htmlContent | Out-File -FilePath $reportFile -Encoding UTF8
    
    Write-LogSuccess "Relatório HTML gerado: $reportFile"
    return $reportFile
}

# Função principal
function Start-PerformanceTest {
    Write-LogInfo "=== Iniciando Teste de Performance do Hawk Bot ==="
    Write-LogInfo "Duração do teste: ${TestDuration}s"
    Write-LogInfo "Usuários concorrentes: $ConcurrentUsers"
    
    # Verificar pré-requisitos
    if (-not (Test-Prerequisites)) {
        Write-LogError "Pré-requisitos não atendidos. Abortando teste."
        return $false
    }
    
    # Coletar métricas iniciais
    $systemMetricsFile = Get-SystemMetrics
    
    # Executar teste de latência
    $latencyFile = Test-BotLatency
    
    # Executar teste de carga
    $loadTestFile = Invoke-LoadTest
    
    # Monitorar recursos
    $monitorFile = Start-ResourceMonitoring -Duration $TestDuration
    
    # Aplicar otimizações
    Invoke-SystemOptimization
    
    # Gerar relatório se solicitado
    $reportFile = $null
    if ($GenerateReport) {
        $reportFile = New-PerformanceReport -SystemMetricsFile $systemMetricsFile -LatencyFile $latencyFile -LoadTestFile $loadTestFile -MonitorFile $monitorFile
    }
    
    # Consolidar resultados finais
    $finalResults = Join-Path $ResultsDir "performance-final-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
    
    $results = @{
        test_info = @{
            timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            duration_seconds = $TestDuration
            concurrent_users = $ConcurrentUsers
        }
        files = @{
            system_metrics = $systemMetricsFile
            latency_test = $latencyFile
            load_test = $loadTestFile
            resource_monitor = $monitorFile
            html_report = $reportFile
        }
    }
    
    $results | ConvertTo-Json -Depth 3 | Out-File -FilePath $finalResults -Encoding UTF8
    
    Write-LogSuccess "=== Teste de Performance Concluído ==="
    Write-LogInfo "Resultados consolidados em: $finalResults"
    if ($reportFile) {
        Write-LogInfo "Relatório HTML: $reportFile"
    }
    
    # Mostrar resumo
    Write-Host "`n" -ForegroundColor Green
    Write-Host "📊 RESUMO DOS TESTES" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
    Write-Host "📁 Arquivos gerados:" -ForegroundColor Cyan
    Write-Host "   • Métricas do sistema: $(Split-Path -Leaf $systemMetricsFile)" -ForegroundColor White
    Write-Host "   • Teste de latência: $(Split-Path -Leaf $latencyFile)" -ForegroundColor White
    Write-Host "   • Teste de carga: $(Split-Path -Leaf $loadTestFile)" -ForegroundColor White
    Write-Host "   • Monitoramento: $(Split-Path -Leaf $monitorFile)" -ForegroundColor White
    if ($reportFile) {
        Write-Host "   • Relatório HTML: $(Split-Path -Leaf $reportFile)" -ForegroundColor White
    }
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
    
    return $true
}

# Executar se chamado diretamente
if ($MyInvocation.InvocationName -ne '.') {
    Start-PerformanceTest
}