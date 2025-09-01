const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log('✅ Bot conectado com sucesso ao Discord!');
  console.log(`Logado como: ${client.user.tag}`);
  console.log(`ID do bot: ${client.user.id}`);
  console.log(`Servidores conectados: ${client.guilds.cache.size}`);
  
  // Desconecta após 5 segundos
  setTimeout(() => {
    console.log('🔌 Desconectando...');
    client.destroy();
    process.exit(0);
  }, 5000);
});

client.on('error', (error) => {
  console.error('❌ Erro no cliente Discord:', error);
  process.exit(1);
});

console.log('🔄 Tentando conectar ao Discord...');
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error('❌ Falha na autenticação:', error.message);
  process.exit(1);
});