const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const archiver = require('archiver');
const mongoose = require('mongoose');
const redis = require('../src/utils/redis');

class BackupManager {
  constructor() {
    this.drive = null;
    this.folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    this.credentials = process.env.GOOGLE_DRIVE_CREDENTIALS;
  }

  async initialize() {
    try {
      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(this.credentials),
        scopes: ['https://www.googleapis.com/auth/drive.file']
      });

      this.drive = google.drive({ version: 'v3', auth });
      console.log('✅ Google Drive API initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Google Drive API:', error.message);
      throw error;
    }
  }

  async createProjectBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `bot-hawk-backup-${timestamp}.zip`;
    const backupPath = path.join(__dirname, '..', 'backups', backupName);

    // Ensure backups directory exists
    const backupsDir = path.dirname(backupPath);
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(backupPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        console.log(`✅ Project backup created: ${backupName} (${archive.pointer()} bytes)`);
        resolve(backupPath);
      });

      archive.on('error', reject);
      archive.pipe(output);

      // Add project files (excluding sensitive and large files)
      const projectRoot = path.join(__dirname, '..');
      
      archive.directory(path.join(projectRoot, 'src'), 'src');
      archive.directory(path.join(projectRoot, 'dashboard'), 'dashboard');
      archive.directory(path.join(projectRoot, 'scripts'), 'scripts');
      archive.directory(path.join(projectRoot, 'docs'), 'docs');
      
      // Add configuration files
      const configFiles = [
        'package.json',
        'package-lock.json',
        'railway.json',
        'vercel.json',
        'docker-compose.yml',
        'Dockerfile',
        '.env.example',
        'README.md',
        'ANALISE_COMPLETA_E_DEPLOY.md',
        'AUDITORIA-COMPLETA.md'
      ];

      configFiles.forEach(file => {
        const filePath = path.join(projectRoot, file);
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: file });
        }
      });

      archive.finalize();
    });
  }

  async createDatabaseBackup() {
    try {
      const timestamp = new Date().toISOString();
      const collections = await mongoose.connection.db.listCollections().toArray();
      const backup = {
        timestamp,
        database: mongoose.connection.name,
        collections: {}
      };

      for (const collection of collections) {
        const collectionName = collection.name;
        const data = await mongoose.connection.db.collection(collectionName).find({}).toArray();
        backup.collections[collectionName] = data;
        console.log(`📦 Backed up collection: ${collectionName} (${data.length} documents)`);
      }

      const backupPath = path.join(__dirname, '..', 'backups', `database-backup-${timestamp.replace(/[:.]/g, '-')}.json`);
      fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
      
      console.log('✅ Database backup created');
      return backupPath;
    } catch (error) {
      console.error('❌ Database backup failed:', error.message);
      throw error;
    }
  }

  async createRedisBackup() {
    try {
      const timestamp = new Date().toISOString();
      const keys = await redis.keys('*');
      const backup = {
        timestamp,
        keys: {}
      };

      for (const key of keys) {
        const type = await redis.type(key);
        let value;

        switch (type) {
          case 'string':
            value = await redis.get(key);
            break;
          case 'hash':
            value = await redis.hgetall(key);
            break;
          case 'list':
            value = await redis.lrange(key, 0, -1);
            break;
          case 'set':
            value = await redis.smembers(key);
            break;
          case 'zset':
            value = await redis.zrange(key, 0, -1, 'WITHSCORES');
            break;
          default:
            value = null;
        }

        backup.keys[key] = { type, value };
      }

      const backupPath = path.join(__dirname, '..', 'backups', `redis-backup-${timestamp.replace(/[:.]/g, '-')}.json`);
      fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
      
      console.log(`✅ Redis backup created (${keys.length} keys)`);
      return backupPath;
    } catch (error) {
      console.error('❌ Redis backup failed:', error.message);
      throw error;
    }
  }

  async uploadToGoogleDrive(filePath) {
    try {
      const fileName = path.basename(filePath);
      const fileMetadata = {
        name: fileName,
        parents: [this.folderId]
      };

      const media = {
        mimeType: 'application/octet-stream',
        body: fs.createReadStream(filePath)
      };

      const response = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id,name,size'
      });

      console.log(`☁️ Uploaded to Google Drive: ${response.data.name} (ID: ${response.data.id})`);
      return response.data;
    } catch (error) {
      console.error('❌ Google Drive upload failed:', error.message);
      throw error;
    }
  }

  async cleanupOldBackups() {
    try {
      const backupsDir = path.join(__dirname, '..', 'backups');
      if (!fs.existsSync(backupsDir)) return;

      const files = fs.readdirSync(backupsDir);
      const now = Date.now();
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

      for (const file of files) {
        const filePath = path.join(backupsDir, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Deleted old backup: ${file}`);
        }
      }
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
    }
  }

  async performFullBackup() {
    try {
      console.log('🚀 Starting full backup process...');
      
      await this.initialize();
      
      // Create backups
      const projectBackup = await this.createProjectBackup();
      const databaseBackup = await this.createDatabaseBackup();
      const redisBackup = await this.createRedisBackup();
      
      // Upload to Google Drive
      const uploads = await Promise.all([
        this.uploadToGoogleDrive(projectBackup),
        this.uploadToGoogleDrive(databaseBackup),
        this.uploadToGoogleDrive(redisBackup)
      ]);
      
      // Cleanup old local backups
      await this.cleanupOldBackups();
      
      console.log('✅ Full backup completed successfully!');
      return uploads;
    } catch (error) {
      console.error('❌ Backup process failed:', error.message);
      throw error;
    }
  }
}

// CLI usage
if (require.main === module) {
  const backup = new BackupManager();
  
  backup.performFullBackup()
    .then(() => {
      console.log('🎉 Backup process completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Backup process failed:', error);
      process.exit(1);
    });
}

module.exports = BackupManager;