#!/usr/bin/env node

// Script de backup manual
const BackupSystem = require('./backup-system.js');

const backup = new BackupSystem();
backup.performFullBackup()
  .then(backupPath => {
    console.log(`✅ Backup manual concluído: ${backupPath}`);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Erro no backup manual:', error);
    process.exit(1);
  });
