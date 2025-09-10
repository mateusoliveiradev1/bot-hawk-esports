#!/usr/bin/env node

// Script de recuperação automática
const fs = require('fs');
const path = require('path');

class RecoverySystem {
  constructor() {
    this.backupDir = path.join(__dirname, 'backups', 'daily');
  }

  listAvailableBackups() {
    if (!fs.existsSync(this.backupDir)) {
      console.log('❌ Nenhum backup encontrado');
      return [];
    }

    const backups = fs.readdirSync(this.backupDir)
      .filter(item => {
        const itemPath = path.join(this.backupDir, item);
        return fs.statSync(itemPath).isDirectory();
      })
      .sort()
      .reverse(); // Mais recente primeiro

    return backups;
  }

  recoverFromBackup(backupName) {
    const backupPath = path.join(this.backupDir, backupName);
    
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup não encontrado: ${backupName}`);
    }

    console.log(`🔄 Recuperando do backup: ${backupName}`);

    // Recuperar configurações
    const configPath = path.join(backupPath, 'config');
    if (fs.existsSync(configPath)) {
      const configFiles = fs.readdirSync(configPath);
      configFiles.forEach(file => {
        const sourcePath = path.join(configPath, file);
        const destPath = path.join(__dirname, file);
        fs.copyFileSync(sourcePath, destPath);
        console.log(`   ✅ Recuperado: ${file}`);
      });
    }

    // Recuperar dados
    const dataPath = path.join(backupPath, 'data');
    if (fs.existsSync(dataPath)) {
      const dataDestPath = path.join(__dirname, 'data');
      if (fs.existsSync(dataDestPath)) {
        fs.rmSync(dataDestPath, { recursive: true, force: true });
      }
      this.copyDirectoryRecursive(dataPath, dataDestPath);
      console.log('   ✅ Dados recuperados');
    }

    console.log('✅ Recuperação concluída');
  }

  copyDirectoryRecursive(source, destination) {
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    const files = fs.readdirSync(source);
    
    files.forEach(file => {
      const sourcePath = path.join(source, file);
      const destPath = path.join(destination, file);
      
      if (fs.statSync(sourcePath).isDirectory()) {
        this.copyDirectoryRecursive(sourcePath, destPath);
      } else {
        fs.copyFileSync(sourcePath, destPath);
      }
    });
  }
}

// Uso do script
if (require.main === module) {
  const recovery = new RecoverySystem();
  const backups = recovery.listAvailableBackups();
  
  if (backups.length === 0) {
    console.log('❌ Nenhum backup disponível para recuperação');
    process.exit(1);
  }
  
  console.log('📋 Backups disponíveis:');
  backups.forEach((backup, index) => {
    console.log(`   ${index + 1}. ${backup}`);
  });
  
  // Recuperar do backup mais recente por padrão
  const latestBackup = backups[0];
  console.log(`
🔄 Recuperando do backup mais recente: ${latestBackup}`);
  
  try {
    recovery.recoverFromBackup(latestBackup);
  } catch (error) {
    console.error('❌ Erro na recuperação:', error.message);
    process.exit(1);
  }
}

module.exports = RecoverySystem;
