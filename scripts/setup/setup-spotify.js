#!/usr/bin/env node

/**
 * Script automatizado para configurar a integração com Spotify
 * Executa: node setup-spotify.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(question) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer.trim());
    });
  });
}

function updateEnvFile(clientId, clientSecret) {
  const envPath = path.join(__dirname, '.env');

  try {
    let envContent = '';

    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');

      // Atualizar variáveis existentes
      envContent = envContent.replace(/SPOTIFY_CLIENT_ID=.*/, `SPOTIFY_CLIENT_ID=${clientId}`);
      envContent = envContent.replace(
        /SPOTIFY_CLIENT_SECRET=.*/,
        `SPOTIFY_CLIENT_SECRET=${clientSecret}`
      );
    } else {
      // Criar novo arquivo .env
      envContent = `# Spotify API Configuration\nSPOTIFY_CLIENT_ID=${clientId}\nSPOTIFY_CLIENT_SECRET=${clientSecret}\n`;
    }

    fs.writeFileSync(envPath, envContent);
    console.log('✅ Arquivo .env atualizado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao atualizar arquivo .env:', error.message);
  }
}

function validateCredentials(clientId, clientSecret) {
  const errors = [];

  if (!clientId || clientId.length < 10) {
    errors.push('Client ID deve ter pelo menos 10 caracteres');
  }

  if (!clientSecret || clientSecret.length < 10) {
    errors.push('Client Secret deve ter pelo menos 10 caracteres');
  }

  if (clientId === 'your_spotify_client_id_here') {
    errors.push('Client ID não pode ser o valor padrão');
  }

  if (clientSecret === 'your_spotify_client_secret_here') {
    errors.push('Client Secret não pode ser o valor padrão');
  }

  return errors;
}

async function testSpotifyConnection(clientId, clientSecret) {
  console.log('\n🔄 Testando conexão com Spotify...');

  try {
    const https = require('https');
    const querystring = require('querystring');

    const postData = querystring.stringify({
      grant_type: 'client_credentials',
    });

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const options = {
      hostname: 'accounts.spotify.com',
      port: 443,
      path: '/api/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, res => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);

            if (res.statusCode === 200 && response.access_token) {
              console.log('✅ Conexão com Spotify bem-sucedida!');
              console.log(`🔑 Token obtido: ${response.access_token.substring(0, 20)}...`);
              console.log(`⏰ Expira em: ${response.expires_in} segundos`);
              resolve(true);
            } else {
              console.log('❌ Erro na autenticação:', response);
              resolve(false);
            }
          } catch (error) {
            console.log('❌ Erro ao processar resposta:', error.message);
            resolve(false);
          }
        });
      });

      req.on('error', error => {
        console.log('❌ Erro de conexão:', error.message);
        resolve(false);
      });

      req.write(postData);
      req.end();
    });
  } catch (error) {
    console.log('❌ Erro no teste:', error.message);
    return false;
  }
}

async function main() {
  console.log('🎵 Configurador Automático da API do Spotify');
  console.log('==========================================\n');

  console.log('📋 Antes de continuar, você precisa:');
  console.log('1. Acessar: https://developer.spotify.com/dashboard');
  console.log('2. Fazer login com sua conta Spotify');
  console.log('3. Criar um novo app');
  console.log('4. Copiar o Client ID e Client Secret\n');

  const proceed = await askQuestion('Você já tem as credenciais? (s/n): ');

  if (proceed.toLowerCase() !== 's' && proceed.toLowerCase() !== 'sim') {
    console.log('\n📖 Consulte o arquivo SPOTIFY_SETUP_GUIDE.md para instruções detalhadas.');
    rl.close();
    return;
  }

  console.log('\n🔑 Digite suas credenciais do Spotify:');

  const clientId = await askQuestion('Client ID: ');
  const clientSecret = await askQuestion('Client Secret: ');

  // Validar credenciais
  const errors = validateCredentials(clientId, clientSecret);

  if (errors.length > 0) {
    console.log('\n❌ Erros encontrados:');
    errors.forEach(error => console.log(`   • ${error}`));
    rl.close();
    return;
  }

  // Testar conexão
  const connectionSuccess = await testSpotifyConnection(clientId, clientSecret);

  if (!connectionSuccess) {
    console.log('\n❌ Falha no teste de conexão. Verifique suas credenciais.');
    rl.close();
    return;
  }

  // Atualizar arquivo .env
  updateEnvFile(clientId, clientSecret);

  console.log('\n🎉 Configuração concluída com sucesso!');
  console.log('\n📝 Próximos passos:');
  console.log('1. Reinicie o bot Discord');
  console.log('2. Teste com: /play nome_da_musica');
  console.log('3. Ou use URLs do Spotify diretamente\n');

  rl.close();
}

// Executar script
main().catch(error => {
  console.error('❌ Erro no script:', error.message);
  rl.close();
});
