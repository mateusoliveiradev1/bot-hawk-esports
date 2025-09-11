#!/usr/bin/env node

const crypto = require('crypto');

/**
 * Script para gerar valores seguros para variáveis de ambiente
 * Usado para configurar secrets no Render.com
 */

function generateSecureSecret(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

function generateJWTSecret() {
  // JWT secrets devem ter pelo menos 32 caracteres
  return crypto.randomBytes(64).toString('base64url');
}

function generateSecrets() {
  const secrets = {
    JWT_SECRET: generateJWTSecret(),
    WEBHOOK_SECRET: generateSecureSecret(32),
    SESSION_SECRET: generateSecureSecret(32),
    CSRF_SECRET: generateSecureSecret(32),
    ENCRYPTION_KEY: generateSecureSecret(32)
  };

  console.log('🔐 Valores seguros gerados para as variáveis de ambiente:');
  console.log('=' .repeat(60));
  
  Object.entries(secrets).forEach(([key, value]) => {
    console.log(`${key}=${value}`);
  });
  
  console.log('=' .repeat(60));
  console.log('\n📋 Instruções:');
  console.log('1. Acesse o painel do Render.com');
  console.log('2. Vá para seu serviço bot-hawk-esports');
  console.log('3. Clique em "Environment"');
  console.log('4. Adicione cada variável acima');
  console.log('5. Clique em "Save Changes"');
  console.log('\n⚠️  IMPORTANTE: Guarde estes valores em local seguro!');
  console.log('⚠️  Não compartilhe estes secrets publicamente!');
  
  return secrets;
}

if (require.main === module) {
  generateSecrets();
}

module.exports = { generateSecrets, generateSecureSecret, generateJWTSecret };