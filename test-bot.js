#!/usr/bin/env node

/**
 * Script de teste simples para verificar conexão do Discord Bot
 * Testa apenas a funcionalidade básica de login
 */

require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

class SimpleBotTest {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ]
    });
  }

  async testConnection() {
    console.log('🤖 Testando conexão básica do Discord Bot...');
    console.log('=' .repeat(50));

    // Verificar token
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      console.log('❌ DISCORD_TOKEN não encontrado no .env');
      return false;
    }

    if (token.includes('Ej8Ej8Ej8') || token === 'your_discord_token_here') {
      console.log('❌ DISCORD_TOKEN parece ser um placeholder inválido');
      console.log('   Token atual:', token.substring(0, 20) + '...');
      console.log('   ⚠️  Você precisa configurar um token válido do Discord');
      return false;
    }

    console.log('✅ Token encontrado:', token.substring(0, 20) + '...');

    // Configurar eventos
    this.client.once('ready', () => {
      console.log('✅ Bot conectado com sucesso!');
      console.log(`   👤 Logado como: ${this.client.user.tag}`);
      console.log(`   🆔 ID: ${this.client.user.id}`);
      console.log(`   🏠 Servidores: ${this.client.guilds.cache.size}`);
      
      // Listar servidores
      if (this.client.guilds.cache.size > 0) {
        console.log('\n📋 Servidores conectados:');
        this.client.guilds.cache.forEach(guild => {
          console.log(`   - ${guild.name} (${guild.id})`);
        });
      }

      console.log('\n🎉 Teste de conexão concluído com sucesso!');
      process.exit(0);
    });

    this.client.on('error', (error) => {
      console.log('❌ Erro do Discord:', error.message);
      process.exit(1);
    });

    // Tentar login
    try {
      console.log('🔐 Tentando fazer login...');
      await this.client.login(token);
    } catch (error) {
      console.log('❌ Falha no login:', error.message);
      
      if (error.message.includes('TOKEN_INVALID')) {
        console.log('\n💡 Soluções possíveis:');
        console.log('   1. Verifique se o token está correto');
        console.log('   2. Regenere o token no Discord Developer Portal');
        console.log('   3. Certifique-se de que o bot está ativo');
      }
      
      return false;
    }

    // Timeout de segurança
    setTimeout(() => {
      console.log('⏰ Timeout - encerrando teste');
      process.exit(1);
    }, 10000);

    return true;
  }
}

// Executar teste se chamado diretamente
if (require.main === module) {
  const tester = new SimpleBotTest();
  tester.testConnection()
    .catch(error => {
      console.error('❌ Erro no teste:', error.message);
      process.exit(1);
    });
}

module.exports = SimpleBotTest;