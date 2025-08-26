#!/usr/bin/env node

// Script de Configuração Completa do Hawk Esports Bot
// Este script instala e configura tudo automaticamente

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Cores para console
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m'
};

function log(message, color = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Função para executar comandos
function runCommand(command, options = {}) {
  try {
    const result = execSync(command, { 
      stdio: options.silent ? 'pipe' : 'inherit',
      encoding: 'utf8',
      ...options 
    });
    return { success: true, output: result };
  } catch (error) {
    return { success: false, error: error.message, output: error.stdout };
  }
}

// Função para verificar se um comando existe
function commandExists(command) {
  try {
    execSync(`where ${command}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Função para aguardar
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Função principal
async function setupComplete() {
  log('🚀 Iniciando configuração completa do Hawk Esports Bot...', 'green');
  console.log('');

  // Verificar Node.js
  if (!commandExists('node')) {
    log('❌ Node.js não encontrado. Por favor, instale o Node.js primeiro.', 'red');
    log('   Download: https://nodejs.org/', 'cyan');
    process.exit(1);
  }
  log('✅ Node.js encontrado!', 'green');

  // Verificar npm
  if (!commandExists('npm')) {
    log('❌ npm não encontrado. Por favor, reinstale o Node.js.', 'red');
    process.exit(1);
  }
  log('✅ npm encontrado!', 'green');

  // Instalar dependências do projeto
  log('\n📦 Instalando dependências do projeto...', 'yellow');
  const npmInstall = runCommand('npm install');
  if (!npmInstall.success) {
    log('❌ Erro ao instalar dependências.', 'red');
    process.exit(1);
  }
  log('✅ Dependências instaladas!', 'green');

  // Verificar arquivo .env
  if (!fs.existsSync('.env')) {
    log('\n📝 Criando arquivo .env...', 'yellow');
    if (fs.existsSync('.env.example')) {
      fs.copyFileSync('.env.example', '.env');
      log('✅ Arquivo .env criado a partir do .env.example', 'green');
    } else {
      log('⚠️  Arquivo .env.example não encontrado. Você precisará configurar manualmente.', 'yellow');
    }
  }

  // Configurar Spotify
  log('\n🎵 Verificando configuração do Spotify...', 'yellow');
  const envContent = fs.readFileSync('.env', 'utf8');
  const hasSpotifyId = envContent.includes('SPOTIFY_CLIENT_ID=') && !envContent.includes('SPOTIFY_CLIENT_ID=your_spotify_client_id');
  const hasSpotifySecret = envContent.includes('SPOTIFY_CLIENT_SECRET=') && !envContent.includes('SPOTIFY_CLIENT_SECRET=your_spotify_client_secret');
  
  if (!hasSpotifyId || !hasSpotifySecret) {
    log('🔧 Executando configuração do Spotify...', 'cyan');
    const spotifySetup = runCommand('node setup-spotify.js');
    if (!spotifySetup.success) {
      log('⚠️  Configuração do Spotify falhou. Configure manualmente depois.', 'yellow');
    }
  } else {
    log('✅ Spotify já configurado!', 'green');
  }

  // Verificar Docker
  log('\n🐳 Verificando Docker...', 'yellow');
  if (!commandExists('docker')) {
    log('❌ Docker não encontrado.', 'red');
    log('   Para instalar o Docker:', 'cyan');
    log('   • Windows: https://docs.docker.com/desktop/windows/install/', 'white');
    log('   • macOS: https://docs.docker.com/desktop/mac/install/', 'white');
    log('   • Linux: https://docs.docker.com/engine/install/', 'white');
    log('\n⚠️  Continuando sem Docker. Você precisará configurar PostgreSQL e Redis manualmente.', 'yellow');
  } else {
    // Verificar se Docker está rodando
    const dockerCheck = runCommand('docker version', { silent: true });
    if (!dockerCheck.success) {
      log('❌ Docker não está rodando. Inicie o Docker Desktop e tente novamente.', 'red');
      log('\n⚠️  Continuando sem Docker. Você precisará configurar PostgreSQL e Redis manualmente.', 'yellow');
    } else {
      log('✅ Docker está rodando!', 'green');
      
      // Iniciar serviços Docker
      log('\n🗄️  Iniciando banco de dados e cache...', 'yellow');
      const dockerCompose = runCommand('docker compose up -d postgres redis');
      if (!dockerCompose.success) {
        log('⚠️  Erro ao iniciar serviços Docker. Verifique o docker-compose.yml', 'yellow');
      } else {
        log('✅ Serviços Docker iniciados!', 'green');
        
        // Aguardar serviços ficarem prontos
        log('⏳ Aguardando serviços ficarem prontos...', 'yellow');
        await sleep(10000);
        
        // Configurar banco de dados
        log('\n🗃️  Configurando banco de dados...', 'yellow');
        const prismaGenerate = runCommand('npx prisma generate');
        if (prismaGenerate.success) {
          const prismaPush = runCommand('npx prisma db push');
          if (prismaPush.success) {
            log('✅ Banco de dados configurado!', 'green');
          } else {
            log('⚠️  Erro ao configurar banco de dados. Verifique a conexão.', 'yellow');
          }
        }
      }
    }
  }

  // Compilar o projeto
  log('\n🔨 Compilando o projeto...', 'yellow');
  const build = runCommand('npm run build');
  if (build.success) {
    log('✅ Projeto compilado!', 'green');
  } else {
    log('⚠️  Erro na compilação. Verifique os erros acima.', 'yellow');
  }

  // Finalização
  log('\n✅ Configuração completa!', 'green');
  console.log('');
  log('🎉 Seu bot está pronto para uso!', 'green');
  console.log('');
  log('Para iniciar o bot:', 'cyan');
  log('  • Desenvolvimento: npm run dev', 'white');
  log('  • Produção: npm start', 'white');
  console.log('');
  log('Para parar os serviços: docker compose down', 'yellow');
  console.log('');

  // Perguntar se quer iniciar o bot
  rl.question('Deseja iniciar o bot agora? (s/n): ', (answer) => {
    if (answer.toLowerCase() === 's' || answer.toLowerCase() === 'sim') {
      log('\n🚀 Iniciando o bot...', 'green');
      rl.close();
      
      // Iniciar o bot
      const botProcess = spawn('npm', ['run', 'dev'], { 
        stdio: 'inherit',
        shell: true 
      });
      
      botProcess.on('close', (code) => {
        log(`\n✨ Bot finalizado com código ${code}`, 'green');
      });
    } else {
      log('\n✨ Configuração finalizada com sucesso!', 'green');
      rl.close();
    }
  });
}

// Executar configuração
setupComplete().catch(error => {
  log(`\n❌ Erro durante a configuração: ${error.message}`, 'red');
  process.exit(1);
});