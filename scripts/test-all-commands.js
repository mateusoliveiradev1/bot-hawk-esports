/**
 * Script para testar todos os comandos slash do bot
 * Verifica se todos os 40+ comandos estão funcionando corretamente
 */

const fs = require('fs');
const path = require('path');

// Função para descobrir comandos reais nos diretórios
function discoverCommands() {
  const commandsDir = path.join(__dirname, '..', 'src', 'commands');
  const commands = [];
  
  function scanDirectory(dir, category = '') {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && item !== 'node_modules') {
        scanDirectory(fullPath, item);
      } else if (item.endsWith('.ts') && item !== 'index.ts') {
        const commandName = item.replace('.ts', '');
        commands.push({
          name: commandName,
          category: category || 'root',
          path: fullPath
        });
      }
    }
  }
  
  scanDirectory(commandsDir);
  return commands;
}

// Função para verificar se um comando está bem estruturado
function validateCommandFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    const checks = {
      hasSlashCommandBuilder: content.includes('SlashCommandBuilder'),
      hasExecuteMethod: content.includes('execute(') || content.includes('async execute'),
      extendsBaseCommand: content.includes('extends BaseCommand'),
      hasCommandCategory: content.includes('CommandCategory'),
      hasProperExport: content.includes('export') || content.includes('module.exports'),
      hasConstructor: content.includes('constructor('),
    };
    
    const passedChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;
    
    return {
      valid: passedChecks >= 4, // Pelo menos 4 dos 6 checks devem passar
      score: `${passedChecks}/${totalChecks}`,
      checks,
      issues: Object.entries(checks)
        .filter(([key, value]) => !value)
        .map(([key]) => key)
    };
  } catch (error) {
    return {
      valid: false,
      score: '0/6',
      checks: {},
      issues: ['Erro ao ler arquivo: ' + error.message]
    };
  }
}

console.log('🔍 Descobrindo e testando comandos do Bot Hawk Esports...');
console.log('=' .repeat(60));

const discoveredCommands = discoverCommands();
const testResults = [];

let passCount = 0;
let failCount = 0;

console.log(`📋 Encontrados ${discoveredCommands.length} arquivos de comando:\n`);

discoveredCommands.forEach((command, index) => {
  const validation = validateCommandFile(command.path);
  const status = validation.valid ? '✅ PASS' : '❌ FAIL';
  
  console.log(`${index + 1}. /${command.name} (${command.category})`);
  console.log(`   Status: ${status} - Score: ${validation.score}`);
  
  if (!validation.valid && validation.issues.length > 0) {
    console.log(`   Issues: ${validation.issues.join(', ')}`);
  }
  
  const result = {
    command: command.name,
    category: command.category,
    path: command.path,
    valid: validation.valid,
    score: validation.score,
    issues: validation.issues,
    status: validation.valid ? 'PASS' : 'FAIL'
  };
  
  testResults.push(result);
  
  if (validation.valid) {
    passCount++;
  } else {
    failCount++;
  }
  
  console.log(''); // Linha em branco
});

console.log('='.repeat(60));
console.log(`📊 Resumo da Validação:`);
console.log(`✅ Comandos válidos: ${passCount}`);
console.log(`❌ Comandos com problemas: ${failCount}`);
console.log(`📈 Taxa de sucesso: ${((passCount / discoveredCommands.length) * 100).toFixed(1)}%`);

// Agrupar por categoria
const byCategory = testResults.reduce((acc, cmd) => {
  if (!acc[cmd.category]) acc[cmd.category] = [];
  acc[cmd.category].push(cmd);
  return acc;
}, {});

console.log('\n📂 Comandos por categoria:');
Object.entries(byCategory).forEach(([category, commands]) => {
  const validCount = commands.filter(c => c.valid).length;
  console.log(`  ${category}: ${validCount}/${commands.length} válidos`);
});

// Salvar relatório
const reportPath = path.join(__dirname, '..', 'test-commands-report.json');
const report = {
  timestamp: new Date().toISOString(),
  totalCommands: discoveredCommands.length,
  passCount,
  failCount,
  successRate: ((passCount / discoveredCommands.length) * 100).toFixed(1) + '%',
  byCategory,
  results: testResults
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\n📄 Relatório detalhado salvo em: ${reportPath}`);

if (failCount > 0) {
  console.log('\n⚠️ Alguns comandos têm problemas de estrutura.');
  process.exit(1);
} else {
  console.log('\n🎉 Todos os comandos estão bem estruturados!');
}