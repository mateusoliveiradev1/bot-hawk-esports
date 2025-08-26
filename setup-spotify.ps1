# Script PowerShell para configurar a integração com Spotify
# Executa: .\setup-spotify.ps1

Write-Host "🎵 Configurador Automático da API do Spotify" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "📋 Antes de continuar, você precisa:" -ForegroundColor Yellow
Write-Host "1. Acessar: https://developer.spotify.com/dashboard" -ForegroundColor White
Write-Host "2. Fazer login com sua conta Spotify" -ForegroundColor White
Write-Host "3. Criar um novo app" -ForegroundColor White
Write-Host "4. Copiar o Client ID e Client Secret" -ForegroundColor White
Write-Host ""

# Abrir automaticamente o dashboard do Spotify
$openDashboard = Read-Host "Deseja abrir o Dashboard do Spotify automaticamente? (s/n)"
if ($openDashboard -eq "s" -or $openDashboard -eq "sim") {
    Start-Process "https://developer.spotify.com/dashboard"
    Write-Host "🌐 Dashboard do Spotify aberto no navegador!" -ForegroundColor Green
    Write-Host ""
}

$proceed = Read-Host "Você já tem as credenciais? (s/n)"

if ($proceed -ne "s" -and $proceed -ne "sim") {
    Write-Host ""
    Write-Host "📖 Consulte o arquivo SPOTIFY_SETUP_GUIDE.md para instruções detalhadas." -ForegroundColor Yellow
    Write-Host "📁 Ou execute: notepad SPOTIFY_SETUP_GUIDE.md" -ForegroundColor Yellow
    return
}

Write-Host ""
Write-Host "🔑 Digite suas credenciais do Spotify:" -ForegroundColor Cyan

$clientId = Read-Host "Client ID"
$clientSecret = Read-Host "Client Secret" -AsSecureString
$clientSecretPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($clientSecret))

# Validar credenciais
$errors = @()

if (-not $clientId -or $clientId.Length -lt 10) {
    $errors += "Client ID deve ter pelo menos 10 caracteres"
}

if (-not $clientSecretPlain -or $clientSecretPlain.Length -lt 10) {
    $errors += "Client Secret deve ter pelo menos 10 caracteres"
}

if ($clientId -eq "your_spotify_client_id_here") {
    $errors += "Client ID não pode ser o valor padrão"
}

if ($clientSecretPlain -eq "your_spotify_client_secret_here") {
    $errors += "Client Secret não pode ser o valor padrão"
}

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "❌ Erros encontrados:" -ForegroundColor Red
    foreach ($error in $errors) {
        Write-Host "   • $error" -ForegroundColor Red
    }
    return
}

# Testar conexão com Spotify
Write-Host ""
Write-Host "🔄 Testando conexão com Spotify..." -ForegroundColor Yellow

try {
    $auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${clientId}:${clientSecretPlain}"))
    
    $headers = @{
        "Authorization" = "Basic $auth"
        "Content-Type" = "application/x-www-form-urlencoded"
    }
    
    $body = "grant_type=client_credentials"
    
    $response = Invoke-RestMethod -Uri "https://accounts.spotify.com/api/token" -Method Post -Headers $headers -Body $body
    
    if ($response.access_token) {
        Write-Host "✅ Conexão com Spotify bem-sucedida!" -ForegroundColor Green
        Write-Host "🔑 Token obtido: $($response.access_token.Substring(0, 20))..." -ForegroundColor Green
        Write-Host "⏰ Expira em: $($response.expires_in) segundos" -ForegroundColor Green
    } else {
        Write-Host "❌ Erro na autenticação" -ForegroundColor Red
        return
    }
} catch {
    Write-Host "❌ Erro no teste de conexão: $($_.Exception.Message)" -ForegroundColor Red
    return
}

# Atualizar arquivo .env
Write-Host ""
Write-Host "📝 Atualizando arquivo .env..." -ForegroundColor Yellow

$envPath = ".env"

try {
    if (Test-Path $envPath) {
        $envContent = Get-Content $envPath -Raw
        
        # Atualizar variáveis existentes
        $envContent = $envContent -replace "SPOTIFY_CLIENT_ID=.*", "SPOTIFY_CLIENT_ID=$clientId"
        $envContent = $envContent -replace "SPOTIFY_CLIENT_SECRET=.*", "SPOTIFY_CLIENT_SECRET=$clientSecretPlain"
        
        Set-Content $envPath $envContent -NoNewline
    } else {
        # Criar novo arquivo .env
        $envContent = @"
# Spotify API Configuration
SPOTIFY_CLIENT_ID=$clientId
SPOTIFY_CLIENT_SECRET=$clientSecretPlain
"@
        Set-Content $envPath $envContent
    }
    
    Write-Host "✅ Arquivo .env atualizado com sucesso!" -ForegroundColor Green
    
} catch {
    Write-Host "❌ Erro ao atualizar arquivo .env: $($_.Exception.Message)" -ForegroundColor Red
    return
}

Write-Host ""
Write-Host "🎉 Configuração concluída com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Próximos passos:" -ForegroundColor Cyan
Write-Host "1. Reinicie o bot Discord" -ForegroundColor White
Write-Host "2. Teste com: /play nome_da_musica" -ForegroundColor White
Write-Host "3. Ou use URLs do Spotify diretamente" -ForegroundColor White
Write-Host ""

# Perguntar se deseja iniciar o bot
$startBot = Read-Host "Deseja iniciar o bot agora? (s/n)"
if ($startBot -eq "s" -or $startBot -eq "sim") {
    Write-Host "🚀 Iniciando o bot..." -ForegroundColor Green
    npm run dev
}