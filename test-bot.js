// Teste simples para identificar a causa dos TimeoutOverflowWarnings
const { Client, GatewayIntentBits } = require('discord.js');

console.log('Iniciando teste do bot sem SchedulerService...');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log('✅ Bot conectado com sucesso!');
  console.log('Aguardando 10 segundos antes de desconectar...');
  
  setTimeout(() => {
    console.log('Desconectando bot...');
    client.destroy();
    process.exit(0);
  }, 10000);
});

client.on('error', (error) => {
  console.error('❌ Erro no bot:', error);
});

// Usar um token de teste ou deixar vazio para testar apenas a inicialização
const token = process.env.DISCORD_TOKEN;
if (token) {
  client.login(token).catch(console.error);
} else {
  console.log('⚠️ DISCORD_TOKEN não encontrado, testando apenas inicialização...');
  setTimeout(() => {
    console.log('Teste de inicialização concluído.');
    process.exit(0);
  }, 5000);
}