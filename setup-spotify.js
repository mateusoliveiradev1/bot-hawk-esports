const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setupSpotify() {
  console.log('🎵 Configuração do Spotify API');
  console.log('===============================\n');
  
  console.log('Para obter as credenciais do Spotify:');
  console.log('1. Acesse: https://developer.spotify.com/dashboard');
  console.log('2. Faça login com sua conta Spotify');
  console.log('3. Clique em "Create App"');
  console.log('4. Preencha os dados do app');
  console.log('5. Copie o Client ID e Client Secret\n');
  
  const clientId = await question('Digite o Spotify Client ID: ');
  const clientSecret = await question('Digite o Spotify Client Secret: ');
  
  if (!clientId || !clientSecret) {
    console.log('❌ Client ID e Client Secret são obrigatórios!');
    process.exit(1);
  }
  
  // Validar formato básico
  if (clientId.length !== 32) {
    console.log('⚠️  Aviso: Client ID deve ter 32 caracteres');
  }
  
  if (clientSecret.length !== 32) {
    console.log('⚠️  Aviso: Client Secret deve ter 32 caracteres');
  }
  
  try {
    // Ler arquivo .env atual
    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    // Atualizar ou adicionar configurações do Spotify
    const lines = envContent.split('\n');
    let clientIdUpdated = false;
    let clientSecretUpdated = false;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('SPOTIFY_CLIENT_ID=')) {
        lines[i] = `SPOTIFY_CLIENT_ID=${clientId}`;
        clientIdUpdated = true;
      } else if (lines[i].startsWith('SPOTIFY_CLIENT_SECRET=')) {
        lines[i] = `SPOTIFY_CLIENT_SECRET=${clientSecret}`;
        clientSecretUpdated = true;
      }
    }
    
    // Adicionar se não existir
    if (!clientIdUpdated) {
      lines.push(`SPOTIFY_CLIENT_ID=${clientId}`);
    }
    
    if (!clientSecretUpdated) {
      lines.push(`SPOTIFY_CLIENT_SECRET=${clientSecret}`);
    }
    
    // Escrever arquivo .env atualizado
    fs.writeFileSync(envPath, lines.join('\n'));
    
    console.log('\n✅ Configurações do Spotify salvas com sucesso!');
    console.log('\n📝 Próximos passos:');
    console.log('1. Reinicie o bot para aplicar as mudanças');
    console.log('2. Teste os comandos de música');
    console.log('3. Verifique os logs para confirmar a conexão\n');
    
  } catch (error) {
    console.error('❌ Erro ao salvar configurações:', error.message);
    process.exit(1);
  }
  
  rl.close();
}

setupSpotify().catch(error => {
  console.error('❌ Erro durante a configuração:', error.message);
  process.exit(1);
});