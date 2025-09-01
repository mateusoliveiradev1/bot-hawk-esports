#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Script para gerenciar workflows do GitHub Actions do Hawk Esports Bot

.DESCRIPTION
    Este script fornece comandos para gerenciar e monitorar os workflows do GitHub Actions,
    incluindo CI/CD, releases e deployments.

.PARAMETER Action
    Ação a ser executada: status, trigger, logs, list, deploy, release

.PARAMETER Workflow
    Nome do workflow (ci, deploy, release)

.PARAMETER Environment
    Ambiente para deploy (staging, production)

.PARAMETER Version
    Versão para release (ex: v1.0.0)

.EXAMPLE
    .\github-actions.ps1 -Action status
    .\github-actions.ps1 -Action trigger -Workflow ci
    .\github-actions.ps1 -Action deploy -Environment staging
    .\github-actions.ps1 -Action release -Version v1.0.0
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("status", "trigger", "logs", "list", "deploy", "release", "help")]
    [string]$Action,
    
    [Parameter(Mandatory = $false)]
    [ValidateSet("ci", "deploy", "release")]
    [string]$Workflow,
    
    [Parameter(Mandatory = $false)]
    [ValidateSet("staging", "production")]
    [string]$Environment,
    
    [Parameter(Mandatory = $false)]
    [string]$Version,
    
    [Parameter(Mandatory = $false)]
    [switch]$Force,
    
    [Parameter(Mandatory = $false)]
    [switch]$Prerelease,
    
    [Parameter(Mandatory = $false)]
    [switch]$Draft
)

# Configurações
$REPO_OWNER = "seu-usuario"  # Substitua pelo seu usuário do GitHub
$REPO_NAME = "bot-hawk-esports"
$GITHUB_API = "https://api.github.com"
$WORKFLOWS_DIR = ".github/workflows"

# Cores para output
$Colors = @{
    Success = "Green"
    Warning = "Yellow"
    Error = "Red"
    Info = "Cyan"
    Header = "Magenta"
}

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Write-Header {
    param([string]$Title)
    Write-Host ""
    Write-ColorOutput "=== $Title ===" $Colors.Header
    Write-Host ""
}

function Test-GitHubCLI {
    try {
        $null = Get-Command gh -ErrorAction Stop
        return $true
    }
    catch {
        Write-ColorOutput "❌ GitHub CLI (gh) não encontrado. Instale em: https://cli.github.com/" $Colors.Error
        return $false
    }
}

function Test-GitRepository {
    if (-not (Test-Path ".git")) {
        Write-ColorOutput "❌ Este não é um repositório Git" $Colors.Error
        return $false
    }
    return $true
}

function Get-WorkflowStatus {
    Write-Header "Status dos Workflows"
    
    try {
        $runs = gh run list --limit 10 --json status,conclusion,workflowName,createdAt,headBranch,event | ConvertFrom-Json
        
        if ($runs.Count -eq 0) {
            Write-ColorOutput "📭 Nenhum workflow executado recentemente" $Colors.Info
            return
        }
        
        Write-ColorOutput "📊 Últimas 10 execuções:" $Colors.Info
        Write-Host ""
        
        $runs | ForEach-Object {
            $status = $_.status
            $conclusion = $_.conclusion
            $workflow = $_.workflowName
            $branch = $_.headBranch
            $event = $_.event
            $created = ([DateTime]$_.createdAt).ToString("yyyy-MM-dd HH:mm")
            
            $statusIcon = switch ($status) {
                "completed" { 
                    switch ($conclusion) {
                        "success" { "✅" }
                        "failure" { "❌" }
                        "cancelled" { "⏹️" }
                        default { "❓" }
                    }
                }
                "in_progress" { "🔄" }
                "queued" { "⏳" }
                default { "❓" }
            }
            
            $color = switch ($conclusion) {
                "success" { $Colors.Success }
                "failure" { $Colors.Error }
                "cancelled" { $Colors.Warning }
                default { $Colors.Info }
            }
            
            Write-ColorOutput "$statusIcon $workflow ($branch) - $event - $created" $color
        }
    }
    catch {
        Write-ColorOutput "❌ Erro ao obter status dos workflows: $($_.Exception.Message)" $Colors.Error
    }
}

function Invoke-WorkflowTrigger {
    param(
        [string]$WorkflowName
    )
    
    Write-Header "Disparar Workflow: $WorkflowName"
    
    try {
        switch ($WorkflowName) {
            "ci" {
                Write-ColorOutput "🚀 Disparando workflow de CI..." $Colors.Info
                gh workflow run ci.yml
            }
            "deploy" {
                if (-not $Environment) {
                    $Environment = Read-Host "Ambiente (staging/production)"
                }
                
                Write-ColorOutput "🚀 Disparando deploy para $Environment..." $Colors.Info
                gh workflow run deploy.yml -f environment=$Environment -f force_deploy=$($Force.IsPresent)
            }
            "release" {
                if (-not $Version) {
                    $Version = Read-Host "Versão (ex: v1.0.0)"
                }
                
                Write-ColorOutput "🚀 Disparando release $Version..." $Colors.Info
                $params = @(
                    "-f", "version=$Version",
                    "-f", "prerelease=$($Prerelease.IsPresent)",
                    "-f", "draft=$($Draft.IsPresent)"
                )
                gh workflow run release.yml @params
            }
            default {
                Write-ColorOutput "❌ Workflow desconhecido: $WorkflowName" $Colors.Error
                return
            }
        }
        
        Write-ColorOutput "✅ Workflow disparado com sucesso!" $Colors.Success
        Write-ColorOutput "📊 Use 'github-actions.ps1 -Action status' para acompanhar o progresso" $Colors.Info
    }
    catch {
        Write-ColorOutput "❌ Erro ao disparar workflow: $($_.Exception.Message)" $Colors.Error
    }
}

function Get-WorkflowLogs {
    Write-Header "Logs dos Workflows"
    
    try {
        $runs = gh run list --limit 5 --json id,workflowName,status,conclusion | ConvertFrom-Json
        
        if ($runs.Count -eq 0) {
            Write-ColorOutput "📭 Nenhum workflow encontrado" $Colors.Info
            return
        }
        
        Write-ColorOutput "📋 Selecione um workflow para ver os logs:" $Colors.Info
        
        for ($i = 0; $i -lt $runs.Count; $i++) {
            $run = $runs[$i]
            $status = if ($run.status -eq "completed") { $run.conclusion } else { $run.status }
            Write-Host "$($i + 1). $($run.workflowName) - $status"
        }
        
        $selection = Read-Host "Digite o número (1-$($runs.Count))"
        $selectedRun = $runs[$selection - 1]
        
        if ($selectedRun) {
            Write-ColorOutput "📄 Obtendo logs para: $($selectedRun.workflowName)" $Colors.Info
            gh run view $selectedRun.id --log
        }
        else {
            Write-ColorOutput "❌ Seleção inválida" $Colors.Error
        }
    }
    catch {
        Write-ColorOutput "❌ Erro ao obter logs: $($_.Exception.Message)" $Colors.Error
    }
}

function Get-WorkflowList {
    Write-Header "Lista de Workflows"
    
    try {
        if (Test-Path $WORKFLOWS_DIR) {
            $workflows = Get-ChildItem -Path $WORKFLOWS_DIR -Filter "*.yml" -File
            
            Write-ColorOutput "📋 Workflows disponíveis:" $Colors.Info
            Write-Host ""
            
            foreach ($workflow in $workflows) {
                $name = $workflow.BaseName
                $path = $workflow.FullName
                
                # Ler o nome do workflow do arquivo
                $content = Get-Content $path -Raw
                if ($content -match "name:\s*(.+)") {
                    $displayName = $matches[1].Trim('"').Trim("'")
                }
                else {
                    $displayName = $name
                }
                
                Write-ColorOutput "🔧 $displayName ($name.yml)" $Colors.Success
                
                # Mostrar triggers
                if ($content -match "on:\s*([\s\S]*?)(?=\n\w|\nenv:|\njobs:|$)") {
                    $triggers = $matches[1] -split "\n" | Where-Object { $_ -match "\s*-?\s*(push|pull_request|workflow_dispatch|schedule)" } | ForEach-Object { $_.Trim() }
                    if ($triggers) {
                        Write-ColorOutput "   Triggers: $($triggers -join ', ')" $Colors.Info
                    }
                }
                
                Write-Host ""
            }
        }
        else {
            Write-ColorOutput "❌ Diretório de workflows não encontrado: $WORKFLOWS_DIR" $Colors.Error
        }
    }
    catch {
        Write-ColorOutput "❌ Erro ao listar workflows: $($_.Exception.Message)" $Colors.Error
    }
}

function Invoke-QuickDeploy {
    param(
        [string]$TargetEnvironment
    )
    
    Write-Header "Deploy Rápido para $TargetEnvironment"
    
    # Verificar se há mudanças não commitadas
    $status = git status --porcelain
    if ($status) {
        Write-ColorOutput "⚠️ Há mudanças não commitadas:" $Colors.Warning
        Write-Host $status
        
        $continue = Read-Host "Continuar mesmo assim? (y/N)"
        if ($continue -ne "y" -and $continue -ne "Y") {
            Write-ColorOutput "❌ Deploy cancelado" $Colors.Error
            return
        }
    }
    
    # Verificar branch atual
    $currentBranch = git branch --show-current
    Write-ColorOutput "📍 Branch atual: $currentBranch" $Colors.Info
    
    if ($TargetEnvironment -eq "production" -and $currentBranch -ne "main") {
        Write-ColorOutput "⚠️ Deploy para produção deve ser feito a partir da branch 'main'" $Colors.Warning
        $continue = Read-Host "Continuar mesmo assim? (y/N)"
        if ($continue -ne "y" -and $continue -ne "Y") {
            Write-ColorOutput "❌ Deploy cancelado" $Colors.Error
            return
        }
    }
    
    # Disparar deploy
    try {
        Write-ColorOutput "🚀 Iniciando deploy para $TargetEnvironment..." $Colors.Info
        gh workflow run deploy.yml -f environment=$TargetEnvironment -f force_deploy=$($Force.IsPresent)
        
        Write-ColorOutput "✅ Deploy disparado com sucesso!" $Colors.Success
        Write-ColorOutput "📊 Acompanhe o progresso em: https://github.com/$REPO_OWNER/$REPO_NAME/actions" $Colors.Info
        
        # Opção de acompanhar logs
        $watch = Read-Host "Deseja acompanhar os logs? (y/N)"
        if ($watch -eq "y" -or $watch -eq "Y") {
            Start-Sleep -Seconds 5
            Get-WorkflowLogs
        }
    }
    catch {
        Write-ColorOutput "❌ Erro ao disparar deploy: $($_.Exception.Message)" $Colors.Error
    }
}

function Invoke-QuickRelease {
    param(
        [string]$ReleaseVersion
    )
    
    Write-Header "Release Rápido: $ReleaseVersion"
    
    # Validar formato da versão
    if ($ReleaseVersion -notmatch "^v?\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$") {
        Write-ColorOutput "❌ Formato de versão inválido. Use: v1.0.0 ou 1.0.0" $Colors.Error
        return
    }
    
    # Garantir que começa com 'v'
    if (-not $ReleaseVersion.StartsWith("v")) {
        $ReleaseVersion = "v$ReleaseVersion"
    }
    
    # Verificar se a tag já existe
    $existingTag = git tag -l $ReleaseVersion
    if ($existingTag) {
        Write-ColorOutput "❌ Tag $ReleaseVersion já existe" $Colors.Error
        return
    }
    
    # Verificar branch atual
    $currentBranch = git branch --show-current
    if ($currentBranch -ne "main") {
        Write-ColorOutput "⚠️ Release deve ser feito a partir da branch 'main'" $Colors.Warning
        $continue = Read-Host "Continuar mesmo assim? (y/N)"
        if ($continue -ne "y" -and $continue -ne "Y") {
            Write-ColorOutput "❌ Release cancelado" $Colors.Error
            return
        }
    }
    
    try {
        # Criar e push da tag
        Write-ColorOutput "🏷️ Criando tag $ReleaseVersion..." $Colors.Info
        git tag $ReleaseVersion
        git push origin $ReleaseVersion
        
        Write-ColorOutput "✅ Tag criada e enviada com sucesso!" $Colors.Success
        Write-ColorOutput "🚀 Workflow de release será disparado automaticamente" $Colors.Info
        Write-ColorOutput "📊 Acompanhe o progresso em: https://github.com/$REPO_OWNER/$REPO_NAME/actions" $Colors.Info
        
        # Aguardar um pouco e mostrar status
        Start-Sleep -Seconds 3
        Get-WorkflowStatus
    }
    catch {
        Write-ColorOutput "❌ Erro ao criar release: $($_.Exception.Message)" $Colors.Error
    }
}

function Show-Help {
    Write-Header "GitHub Actions Manager - Hawk Esports Bot"
    
    Write-ColorOutput "📋 Comandos disponíveis:" $Colors.Info
    Write-Host ""
    
    Write-ColorOutput "🔍 Status e Monitoramento:" $Colors.Success
    Write-Host "  github-actions.ps1 -Action status          # Ver status dos workflows"
    Write-Host "  github-actions.ps1 -Action logs            # Ver logs dos workflows"
    Write-Host "  github-actions.ps1 -Action list            # Listar workflows disponíveis"
    Write-Host ""
    
    Write-ColorOutput "🚀 Disparar Workflows:" $Colors.Success
    Write-Host "  github-actions.ps1 -Action trigger -Workflow ci                    # Disparar CI"
    Write-Host "  github-actions.ps1 -Action trigger -Workflow deploy               # Disparar deploy"
    Write-Host "  github-actions.ps1 -Action trigger -Workflow release              # Disparar release"
    Write-Host ""
    
    Write-ColorOutput "🚀 Deploy Rápido:" $Colors.Success
    Write-Host "  github-actions.ps1 -Action deploy -Environment staging            # Deploy para staging"
    Write-Host "  github-actions.ps1 -Action deploy -Environment production         # Deploy para produção"
    Write-Host "  github-actions.ps1 -Action deploy -Environment staging -Force     # Deploy forçado"
    Write-Host ""
    
    Write-ColorOutput "📦 Release Rápido:" $Colors.Success
    Write-Host "  github-actions.ps1 -Action release -Version v1.0.0                # Criar release"
    Write-Host "  github-actions.ps1 -Action release -Version v1.0.0 -Prerelease   # Criar pre-release"
    Write-Host "  github-actions.ps1 -Action release -Version v1.0.0 -Draft        # Criar draft release"
    Write-Host ""
    
    Write-ColorOutput "📚 Exemplos:" $Colors.Info
    Write-Host "  .\scripts\github-actions.ps1 -Action status"
    Write-Host "  .\scripts\github-actions.ps1 -Action deploy -Environment staging"
    Write-Host "  .\scripts\github-actions.ps1 -Action release -Version v1.2.0"
    Write-Host ""
    
    Write-ColorOutput "⚙️ Pré-requisitos:" $Colors.Warning
    Write-Host "  - GitHub CLI (gh) instalado e autenticado"
    Write-Host "  - Repositório Git configurado"
    Write-Host "  - Permissões para executar workflows"
}

# Função principal
function Main {
    Write-Header "GitHub Actions Manager - Hawk Esports Bot"
    
    # Verificar pré-requisitos
    if (-not (Test-GitRepository)) {
        exit 1
    }
    
    if (-not (Test-GitHubCLI)) {
        Write-ColorOutput "💡 Instale o GitHub CLI para usar este script" $Colors.Info
        exit 1
    }
    
    # Executar ação
    switch ($Action) {
        "status" {
            Get-WorkflowStatus
        }
        "trigger" {
            if (-not $Workflow) {
                Write-ColorOutput "❌ Especifique o workflow com -Workflow" $Colors.Error
                Show-Help
                exit 1
            }
            Invoke-WorkflowTrigger -WorkflowName $Workflow
        }
        "logs" {
            Get-WorkflowLogs
        }
        "list" {
            Get-WorkflowList
        }
        "deploy" {
            if (-not $Environment) {
                Write-ColorOutput "❌ Especifique o ambiente com -Environment" $Colors.Error
                Show-Help
                exit 1
            }
            Invoke-QuickDeploy -TargetEnvironment $Environment
        }
        "release" {
            if (-not $Version) {
                Write-ColorOutput "❌ Especifique a versão com -Version" $Colors.Error
                Show-Help
                exit 1
            }
            Invoke-QuickRelease -ReleaseVersion $Version
        }
        "help" {
            Show-Help
        }
        default {
            Write-ColorOutput "❌ Ação desconhecida: $Action" $Colors.Error
            Show-Help
            exit 1
        }
    }
}

# Executar script
if ($MyInvocation.InvocationName -ne '.') {
    Main
}