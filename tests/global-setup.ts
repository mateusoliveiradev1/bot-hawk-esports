export default async (): Promise<void> => {
  // Setup global para todos os testes
  console.log('🧪 Iniciando setup global dos testes...');

  // Configurar timezone para testes consistentes
  process.env.TZ = 'UTC';

  // Configurar variáveis de ambiente para testes
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // Reduzir logs durante testes

  console.log('✅ Setup global concluído');
};
