export default async (): Promise<void> => {
  // Teardown global após todos os testes
  console.log('🧹 Iniciando teardown global dos testes...');
  
  // Limpar variáveis de ambiente de teste
  delete process.env.TZ;
  
  // Aguardar um pouco para garantir que todos os recursos sejam liberados
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log('✅ Teardown global concluído');
};