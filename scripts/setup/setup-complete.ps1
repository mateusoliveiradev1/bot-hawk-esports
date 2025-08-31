# Script de Configuração Completa do Hawk Esports Bot
# Este script instala e configura tudo automaticamente

Write-Host "🚀 Iniciando configuração completa do Hawk Esports Bot..." -ForegroundColor Green
Write-Host ""

# Função para verificar se um comando existe
function Test-Command($cmdname) {
    return [bool](Get-Command -Name $cmdname -ErrorAction SilentlyContinue)
}

# Função para instalar Chocolatey
function Install-Chocolatey {
    Write-Host "📦 Instalando Chocolatey..." -ForegroundColor Yellow
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    refreshenv
}

# Função para instalar Docker Desktop
function Install-Docker {
    Write-Host "🐳 Instalando Docker Desktop..." -ForegroundColor Yellow
    choco install docker-desktop -y
    Write-Host "⚠️  IMPORTANTE: Após a instalação do Docker, você precisará:" -ForegroundColor Red
    Write-Host "   1. Reiniciar o computador" -ForegroundColor Red
    Write-Host "   2. Abrir o Docker Desktop" -ForegroundColor Red
    Write-Host "   3. Executar este script novamente" -ForegroundColor Red
}

# Função para instalar Node.js
function Install-NodeJS {
    Write-Host "📦 Instalando Node.js..." -ForegroundColor Yellow
    choco install nodejs -y
    refreshenv
}

# Verificar e instalar Chocolatey
if (-not (Test-Command "choco")) {
    Install-Chocolatey
}

# Verificar e instalar Node.js
if (-not (Test-Command "node")) {
    Install-NodeJS
}

# Verificar e instalar Docker
if (-not (Test-Command "docker")) {
    Install-Docker
    Write-Host "\n🔄 Execute este script novamente após reiniciar e abrir o Docker Desktop." -ForegroundColor Cyan
    Read-Host "Pressione Enter para sair"
    exit
}

# Verificar se Docker está rodando
Write-Host "🔍 Verificando se Docker está rodando..." -ForegroundColor Yellow
try {
    docker version | Out-Null
    Write-Host "✅ Docker está rodando!" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker não está rodando. Abra o Docker Desktop e tente novamente." -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit
}

# Instalar dependências do projeto
Write-Host "\n📦 Instalando dependências do projeto..." -ForegroundColor Yellow
npm install

# Configurar Spotify (se ainda não configurado)
Write-Host "\n🎵 Configurando Spotify..." -ForegroundColor Yellow
if (-not $env:SPOTIFY_CLIENT_ID -or -not $env:SPOTIFY_CLIENT_SECRET) {
    Write-Host "🔧 Executando configuração do Spotify..." -ForegroundColor Cyan
    node setup-spotify.js
} else {
    Write-Host "✅ Spotify já configurado!" -ForegroundColor Green
}

# Iniciar serviços Docker (PostgreSQL e Redis)
Write-Host "\n🗄️  Iniciando banco de dados e cache..." -ForegroundColor Yellow
docker compose up -d postgres redis

# Aguardar serviços ficarem prontos
Write-Host "⏳ Aguardando serviços ficarem prontos..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Configurar banco de dados
Write-Host "\n🗃️  Configurando banco de dados..." -ForegroundColor Yellow
npx prisma generate
npx prisma db push

# Compilar o projeto
Write-Host "\n🔨 Compilando o projeto..." -ForegroundColor Yellow
npm run build

# Verificar se tudo está funcionando
Write-Host "\n✅ Configuração completa!" -ForegroundColor Green
Write-Host ""
Write-Host "🎉 Seu bot está pronto para uso!" -ForegroundColor Green
Write-Host ""
Write-Host "Para iniciar o bot:" -ForegroundColor Cyan
Write-Host "  • Desenvolvimento: npm run dev" -ForegroundColor White
Write-Host "  • Produção: npm start" -ForegroundColor White
Write-Host ""
Write-Host "Para parar os serviços: docker compose down" -ForegroundColor Yellow
Write-Host ""

# Perguntar se quer iniciar o bot
$startBot = Read-Host "Deseja iniciar o bot agora? (s/n)"
if ($startBot -eq "s" -or $startBot -eq "S" -or $startBot -eq "sim") {
    Write-Host "\n🚀 Iniciando o bot..." -ForegroundColor Green
    npm run dev
}

Write-Host "\n✨ Configuração finalizada com sucesso!" -ForegroundColor Green