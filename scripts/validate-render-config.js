#!/usr/bin/env node
/**
 * Script de validação da configuração do Render.com
 * Verifica se todos os arquivos e configurações estão corretos
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Cores para output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

class RenderConfigValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.projectRoot = process.cwd();
  }

  // Verificar se arquivo existe
  checkFileExists(filePath, required = true) {
    const fullPath = path.join(this.projectRoot, filePath);
    const exists = fs.existsSync(fullPath);
    
    if (exists) {
      logSuccess(`Arquivo encontrado: ${filePath}`);
      return true;
    } else {
      if (required) {
        this.errors.push(`Arquivo obrigatório não encontrado: ${filePath}`);
        logError(`Arquivo obrigatório não encontrado: ${filePath}`);
      } else {
        this.warnings.push(`Arquivo opcional não encontrado: ${filePath}`);
        logWarning(`Arquivo opcional não encontrado: ${filePath}`);
      }
      return false;
    }
  }

  // Validar render.yaml
  validateRenderYaml() {
    logInfo('🔍 Validando render.yaml...');
    
    if (!this.checkFileExists('render.yaml')) {
      return false;
    }

    try {
      const renderYamlPath = path.join(this.projectRoot, 'render.yaml');
      const content = fs.readFileSync(renderYamlPath, 'utf8');
      const config = yaml.load(content);

      // Verificar estrutura básica
      if (!config.services || !Array.isArray(config.services)) {
        this.errors.push('render.yaml deve conter um array de services');
        logError('render.yaml deve conter um array de services');
        return false;
      }

      const botService = config.services.find(s => s.name === 'bot-hawk-esports');
      if (!botService) {
        this.errors.push('Serviço bot-hawk-esports não encontrado no render.yaml');
        logError('Serviço bot-hawk-esports não encontrado no render.yaml');
        return false;
      }

      // Verificar configurações essenciais
      const requiredFields = ['type', 'env', 'buildCommand', 'startCommand'];
      for (const field of requiredFields) {
        if (!botService[field]) {
          this.errors.push(`Campo obrigatório '${field}' não encontrado no serviço bot`);
          logError(`Campo obrigatório '${field}' não encontrado no serviço bot`);
        }
      }

      logSuccess('render.yaml validado com sucesso');
      return true;
    } catch (error) {
      this.errors.push(`Erro ao validar render.yaml: ${error.message}`);
      logError(`Erro ao validar render.yaml: ${error.message}`);
      return false;
    }
  }

  // Validar Dockerfile
  validateDockerfile() {
    logInfo('🔍 Validando Dockerfile...');
    
    if (!this.checkFileExists('Dockerfile')) {
      return false;
    }

    try {
      const dockerfilePath = path.join(this.projectRoot, 'Dockerfile');
      const content = fs.readFileSync(dockerfilePath, 'utf8');

      // Verificar se contém configurações do Render
      const requiredInstructions = [
        'FROM node:',
        'WORKDIR',
        'COPY package',
        'RUN npm',
        'EXPOSE',
        'CMD'
      ];

      for (const instruction of requiredInstructions) {
        if (!content.includes(instruction)) {
          this.warnings.push(`Instrução '${instruction}' não encontrada no Dockerfile`);
          logWarning(`Instrução '${instruction}' não encontrada no Dockerfile`);
        }
      }

      // Verificar se não há referências ao Railway
      if (content.includes('railway')) {
        this.warnings.push('Dockerfile ainda contém referências ao Railway');
        logWarning('Dockerfile ainda contém referências ao Railway');
      }

      logSuccess('Dockerfile validado');
      return true;
    } catch (error) {
      this.errors.push(`Erro ao validar Dockerfile: ${error.message}`);
      logError(`Erro ao validar Dockerfile: ${error.message}`);
      return false;
    }
  }

  // Validar variáveis de ambiente
  validateEnvFile() {
    logInfo('🔍 Validando arquivo de variáveis de ambiente...');
    
    if (!this.checkFileExists('.env.render')) {
      return false;
    }

    try {
      const envPath = path.join(this.projectRoot, '.env.render');
      const content = fs.readFileSync(envPath, 'utf8');

      // Verificar variáveis essenciais
      const requiredVars = [
        'NODE_ENV',
        'PORT',
        'DISCORD_TOKEN',
        'DISCORD_CLIENT_ID',
        'RENDER'
      ];

      for (const varName of requiredVars) {
        if (!content.includes(`${varName}=`)) {
          this.errors.push(`Variável obrigatória '${varName}' não encontrada em .env.render`);
          logError(`Variável obrigatória '${varName}' não encontrada em .env.render`);
        }
      }

      logSuccess('Arquivo .env.render validado');
      return true;
    } catch (error) {
      this.errors.push(`Erro ao validar .env.render: ${error.message}`);
      logError(`Erro ao validar .env.render: ${error.message}`);
      return false;
    }
  }

  // Validar GitHub Actions
  validateGithubActions() {
    logInfo('🔍 Validando GitHub Actions...');
    
    const workflowPath = '.github/workflows/render-deploy.yml';
    if (!this.checkFileExists(workflowPath)) {
      return false;
    }

    try {
      const fullPath = path.join(this.projectRoot, workflowPath);
      const content = fs.readFileSync(fullPath, 'utf8');
      const config = yaml.load(content);

      // Verificar estrutura básica
      if (!config.on || !config.jobs) {
        this.errors.push('GitHub Actions workflow deve conter "on" e "jobs"');
        logError('GitHub Actions workflow deve conter "on" e "jobs"');
        return false;
      }

      logSuccess('GitHub Actions workflow validado');
      return true;
    } catch (error) {
      this.errors.push(`Erro ao validar GitHub Actions: ${error.message}`);
      logError(`Erro ao validar GitHub Actions: ${error.message}`);
      return false;
    }
  }

  // Validar health checks
  validateHealthChecks() {
    logInfo('🔍 Validando health checks...');
    
    const healthPath = 'src/routes/health.js';
    if (!this.checkFileExists(healthPath)) {
      return false;
    }

    try {
      const fullPath = path.join(this.projectRoot, healthPath);
      const content = fs.readFileSync(fullPath, 'utf8');

      // Verificar endpoints essenciais
      const requiredEndpoints = ['/health', '/ready', '/metrics'];
      for (const endpoint of requiredEndpoints) {
        if (!content.includes(`'${endpoint}'`) && !content.includes(`"${endpoint}"`)) {
          this.errors.push(`Endpoint '${endpoint}' não encontrado em health.js`);
          logError(`Endpoint '${endpoint}' não encontrado em health.js`);
        }
      }

      // Verificar se contém configurações do Render
      if (!content.includes('RENDER')) {
        this.warnings.push('Health checks não contêm configurações específicas do Render');
        logWarning('Health checks não contêm configurações específicas do Render');
      }

      logSuccess('Health checks validados');
      return true;
    } catch (error) {
      this.errors.push(`Erro ao validar health checks: ${error.message}`);
      logError(`Erro ao validar health checks: ${error.message}`);
      return false;
    }
  }

  // Verificar se Railway foi removido
  checkRailwayRemoval() {
    logInfo('🔍 Verificando remoção do Railway...');
    
    // Verificar se railway.json foi removido
    if (fs.existsSync(path.join(this.projectRoot, 'railway.json'))) {
      this.warnings.push('Arquivo railway.json ainda existe');
      logWarning('Arquivo railway.json ainda existe');
    } else {
      logSuccess('Arquivo railway.json foi removido');
    }

    // Verificar package.json por scripts do Railway
    try {
      const packagePath = path.join(this.projectRoot, 'package.json');
      if (fs.existsSync(packagePath)) {
        const packageContent = fs.readFileSync(packagePath, 'utf8');
        if (packageContent.includes('railway')) {
          this.warnings.push('package.json ainda contém referências ao Railway');
          logWarning('package.json ainda contém referências ao Railway');
        } else {
          logSuccess('Nenhuma referência ao Railway encontrada no package.json');
        }
      }
    } catch (error) {
      logWarning(`Erro ao verificar package.json: ${error.message}`);
    }
  }

  // Executar todas as validações
  async validate() {
    log('\n🚀 Iniciando validação da configuração do Render.com...\n', 'bold');

    // Executar todas as validações
    this.validateRenderYaml();
    this.validateDockerfile();
    this.validateEnvFile();
    this.validateGithubActions();
    this.validateHealthChecks();
    this.checkRailwayRemoval();

    // Verificar arquivos adicionais
    this.checkFileExists('package.json');
    this.checkFileExists('README.md');
    this.checkFileExists('docs/RENDER_DEPLOY_GUIDE.md');

    // Relatório final
    log('\n📊 Relatório de Validação:', 'bold');
    
    if (this.errors.length === 0) {
      logSuccess(`✅ Configuração válida! ${this.warnings.length} avisos encontrados.`);
      
      if (this.warnings.length > 0) {
        log('\n⚠️  Avisos:', 'yellow');
        this.warnings.forEach(warning => log(`   • ${warning}`, 'yellow'));
      }
      
      log('\n🎉 Projeto pronto para deploy no Render.com!', 'green');
      return true;
    } else {
      logError(`❌ ${this.errors.length} erros encontrados:`);
      this.errors.forEach(error => log(`   • ${error}`, 'red'));
      
      if (this.warnings.length > 0) {
        log('\n⚠️  Avisos adicionais:', 'yellow');
        this.warnings.forEach(warning => log(`   • ${warning}`, 'yellow'));
      }
      
      log('\n🔧 Corrija os erros antes de fazer o deploy.', 'red');
      return false;
    }
  }
}

// Executar validação
if (require.main === module) {
  const validator = new RenderConfigValidator();
  validator.validate().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    logError(`Erro durante validação: ${error.message}`);
    process.exit(1);
  });
}

module.exports = RenderConfigValidator;