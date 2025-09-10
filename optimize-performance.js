#!/usr/bin/env node

/**
 * Script de otimização de performance para o HawkEsports Bot
 * Configura otimizações avançadas e monitoramento em tempo real
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class PerformanceOptimizer {
  constructor() {
    this.configPath = path.join(__dirname, '.env');
    this.packagePath = path.join(__dirname, 'package.json');
  }

  async optimizePerformance() {
    console.log('⚡ Iniciando otimização de performance...');
    console.log('=' .repeat(50));

    // 1. Analisar sistema atual
    this.analyzeSystemResources();

    // 2. Otimizar configurações de cache
    this.optimizeCacheSettings();

    // 3. Configurar pool de conexões
    this.optimizeConnectionPools();

    // 4. Configurar rate limiting inteligente
    this.optimizeRateLimiting();

    // 5. Configurar monitoramento em tempo real
    this.setupRealTimeMonitoring();

    // 6. Otimizar configurações de memória
    this.optimizeMemorySettings();

    // 7. Configurar compressão e otimizações de rede
    this.optimizeNetworkSettings();

    console.log('\n✅ Otimização de performance concluída!');
    console.log('\n📊 Resumo das otimizações aplicadas:');
    console.log('   🚀 Cache otimizado para alta performance');
    console.log('   🔗 Pools de conexão configurados');
    console.log('   🛡️  Rate limiting inteligente ativado');
    console.log('   📈 Monitoramento em tempo real configurado');
    console.log('   💾 Configurações de memória otimizadas');
    console.log('   🌐 Compressão e otimizações de rede ativas');
  }

  analyzeSystemResources() {
    console.log('🔍 Analisando recursos do sistema...');
    
    const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024);
    const freeMem = Math.round(os.freemem() / 1024 / 1024 / 1024);
    const cpuCount = os.cpus().length;
    const platform = os.platform();
    const arch = os.arch();

    console.log(`   💻 Sistema: ${platform} ${arch}`);
    console.log(`   🧠 CPUs: ${cpuCount} cores`);
    console.log(`   💾 Memória: ${totalMem}GB total, ${freeMem}GB livre`);

    // Recomendar configurações baseadas no sistema
    const recommendedWorkers = Math.min(cpuCount, 4);
    const recommendedMemoryLimit = Math.floor(totalMem * 0.3); // 30% da RAM
    
    console.log(`   📋 Recomendações:`);
    console.log(`      - Workers: ${recommendedWorkers}`);
    console.log(`      - Limite de memória: ${recommendedMemoryLimit}GB`);

    return { cpuCount, totalMem, freeMem, recommendedWorkers, recommendedMemoryLimit };
  }

  optimizeCacheSettings() {
    console.log('🚀 Otimizando configurações de cache...');
    
    const optimizedCacheConfig = `
# Optimized Cache Configuration
CACHE_TTL=3600                    # 1 hora (aumentado para melhor performance)
CACHE_MAX_KEYS=5000               # Mais chaves para cache eficiente
CACHE_CHECK_PERIOD=300            # Verificação a cada 5 minutos
CACHE_USE_CLONE=false             # Desabilitar clone para performance
CACHE_COMPRESSION=true            # Ativar compressão
CACHE_MEMORY_LIMIT=256            # Limite de 256MB para cache

# Advanced Cache Settings
CACHE_PRELOAD_ENABLED=true        # Pré-carregar dados frequentes
CACHE_SMART_EVICTION=true         # Remoção inteligente de cache
CACHE_BATCH_SIZE=100              # Processar em lotes
CACHE_ASYNC_WRITE=true            # Escrita assíncrona
`;

    this.updateEnvConfig(optimizedCacheConfig);
    console.log('   ✅ Configurações de cache otimizadas');
  }

  optimizeConnectionPools() {
    console.log('🔗 Otimizando pools de conexão...');
    
    const poolConfig = `
# Optimized Connection Pools
DATABASE_POOL_MIN=2               # Mínimo de conexões
DATABASE_POOL_MAX=10              # Máximo de conexões
DATABASE_POOL_IDLE_TIMEOUT=300000 # 5 minutos idle
DATABASE_POOL_ACQUIRE_TIMEOUT=60000 # 1 minuto para adquirir
DATABASE_POOL_CREATE_TIMEOUT=30000  # 30s para criar conexão

# Redis Pool (se disponível)
REDIS_POOL_MIN=1
REDIS_POOL_MAX=5
REDIS_POOL_IDLE_TIMEOUT=180000    # 3 minutos
REDIS_CONNECTION_TIMEOUT=5000     # 5 segundos
REDIS_RETRY_ATTEMPTS=3
REDIS_RETRY_DELAY=1000
`;

    this.updateEnvConfig(poolConfig);
    console.log('   ✅ Pools de conexão otimizados');
  }

  optimizeRateLimiting() {
    console.log('🛡️  Configurando rate limiting inteligente...');
    
    const rateLimitConfig = `
# Intelligent Rate Limiting
RATE_LIMIT_WINDOW=60000           # 1 minuto
RATE_LIMIT_MAX_REQUESTS=200       # 200 requests por minuto
RATE_LIMIT_SKIP_SUCCESSFUL=true   # Pular requests bem-sucedidos
RATE_LIMIT_SKIP_FAILED=false      # Contar requests falhados
RATE_LIMIT_STORE=memory           # Usar memória (Redis se disponível)

# Advanced Rate Limiting
RATE_LIMIT_WHITELIST=127.0.0.1,::1 # IPs na whitelist
RATE_LIMIT_HEADERS=true           # Incluir headers de rate limit
RATE_LIMIT_DRAFT_POLLI=true       # Usar draft polli headers
`;

    this.updateEnvConfig(rateLimitConfig);
    console.log('   ✅ Rate limiting inteligente configurado');
  }

  setupRealTimeMonitoring() {
    console.log('📈 Configurando monitoramento em tempo real...');
    
    const monitoringConfig = `
# Real-time Monitoring Configuration
MONITORING_ENABLED=true
MONITORING_INTERVAL=15000         # Verificar a cada 15 segundos
MONITORING_METRICS_ENABLED=true
MONITORING_ALERTS_ENABLED=true

# Performance Thresholds
PERF_CPU_THRESHOLD=80             # Alerta se CPU > 80%
PERF_MEMORY_THRESHOLD=85          # Alerta se memória > 85%
PERF_RESPONSE_TIME_THRESHOLD=2000 # Alerta se resposta > 2s
PERF_ERROR_RATE_THRESHOLD=5       # Alerta se erro > 5%

# Metrics Collection
METRICS_COLLECT_SYSTEM=true       # Coletar métricas do sistema
METRICS_COLLECT_DISCORD=true      # Coletar métricas do Discord
METRICS_COLLECT_DATABASE=true     # Coletar métricas do banco
METRICS_COLLECT_CACHE=true        # Coletar métricas do cache

# Real-time Alerts
ALERT_WEBHOOK_URL=                # URL para webhooks de alerta
ALERT_DISCORD_CHANNEL=            # Canal para alertas no Discord
ALERT_EMAIL_ENABLED=false         # Alertas por email
`;

    this.updateEnvConfig(monitoringConfig);
    console.log('   ✅ Monitoramento em tempo real configurado');
  }

  optimizeMemorySettings() {
    console.log('💾 Otimizando configurações de memória...');
    
    const memoryConfig = `
# Memory Optimization
NODE_OPTIONS=--max-old-space-size=2048 --optimize-for-size
MEMORY_LIMIT=512                  # Limite de memória em MB
GC_INTERVAL=300000                # Garbage collection a cada 5 min
MEMORY_MONITORING=true            # Monitorar uso de memória

# Memory Management
MEMORY_LEAK_DETECTION=true        # Detectar vazamentos
MEMORY_HEAP_SNAPSHOT=false        # Snapshots do heap (dev only)
MEMORY_PROFILING=false            # Profiling de memória (dev only)
`;

    this.updateEnvConfig(memoryConfig);
    console.log('   ✅ Configurações de memória otimizadas');
  }

  optimizeNetworkSettings() {
    console.log('🌐 Otimizando configurações de rede...');
    
    const networkConfig = `
# Network Optimization
COMPRESSION_ENABLED=true          # Ativar compressão gzip
COMPRESSION_LEVEL=6               # Nível de compressão (1-9)
COMPRESSION_THRESHOLD=1024        # Comprimir arquivos > 1KB

# HTTP/2 and Keep-Alive
HTTP2_ENABLED=false               # HTTP/2 (se suportado)
KEEP_ALIVE_TIMEOUT=65000          # Keep-alive timeout
KEEP_ALIVE_MAX_REQUESTS=1000      # Max requests por conexão

# Request Optimization
REQUEST_TIMEOUT=30000             # Timeout de 30 segundos
REQUEST_RETRY_ATTEMPTS=3          # 3 tentativas
REQUEST_RETRY_DELAY=1000          # 1 segundo entre tentativas

# WebSocket Optimization
WS_HEARTBEAT_INTERVAL=30000       # Heartbeat a cada 30s
WS_MAX_CONNECTIONS=1000           # Máximo de conexões WS
WS_COMPRESSION=true               # Compressão WebSocket
`;

    this.updateEnvConfig(networkConfig);
    console.log('   ✅ Configurações de rede otimizadas');
  }

  updateEnvConfig(newConfig) {
    let envContent = '';
    if (fs.existsSync(this.configPath)) {
      envContent = fs.readFileSync(this.configPath, 'utf8');
    }

    // Adicionar nova configuração se não existir
    const configLines = newConfig.trim().split('\n');
    configLines.forEach(line => {
      if (line.trim() && !line.startsWith('#')) {
        const [key] = line.split('=');
        if (key && !envContent.includes(key + '=')) {
          envContent += '\n' + line;
        }
      } else if (line.startsWith('#')) {
        // Adicionar comentários se não existirem
        if (!envContent.includes(line.trim())) {
          envContent += '\n' + line;
        }
      }
    });

    fs.writeFileSync(this.configPath, envContent);
  }

  createPerformanceMonitorScript() {
    console.log('📊 Criando script de monitoramento de performance...');
    
    const monitorScript = `#!/usr/bin/env node

// Script de monitoramento de performance em tempo real
const os = require('os');
const process = require('process');

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      cpu: [],
      memory: [],
      responseTime: [],
      errorRate: []
    };
    this.startTime = Date.now();
  }

  collectMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptime = process.uptime();
    
    const metrics = {
      timestamp: new Date().toISOString(),
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024), // MB
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      system: {
        loadAvg: os.loadavg(),
        freeMem: Math.round(os.freemem() / 1024 / 1024),
        totalMem: Math.round(os.totalmem() / 1024 / 1024),
        uptime: Math.round(uptime)
      }
    };

    // Verificar thresholds
    this.checkThresholds(metrics);
    
    return metrics;
  }

  checkThresholds(metrics) {
    const memoryUsagePercent = (metrics.memory.rss / metrics.system.totalMem) * 100;
    
    if (memoryUsagePercent > 85) {
      console.log(\`🚨 ALERTA: Uso de memória alto: \${memoryUsagePercent.toFixed(1)}%\`);
    }
    
    if (metrics.system.loadAvg[0] > os.cpus().length) {
      console.log(\`🚨 ALERTA: Load average alto: \${metrics.system.loadAvg[0].toFixed(2)}\`);
    }
  }

  startMonitoring() {
    console.log('📊 Iniciando monitoramento de performance...');
    
    setInterval(() => {
      const metrics = this.collectMetrics();
      console.log(\`[\${metrics.timestamp}] RAM: \${metrics.memory.rss}MB | Load: \${metrics.system.loadAvg[0].toFixed(2)}\`);
    }, 15000); // A cada 15 segundos
    
    console.log('✅ Monitoramento ativo (15s intervals)');
  }
}

const monitor = new PerformanceMonitor();
monitor.startMonitoring();
`;

    fs.writeFileSync(path.join(__dirname, 'performance-monitor.js'), monitorScript);
    console.log('   ✅ Script de monitoramento criado');
  }
}

// Executar otimização se chamado diretamente
if (require.main === module) {
  const optimizer = new PerformanceOptimizer();
  optimizer.optimizePerformance()
    .then(() => {
      optimizer.createPerformanceMonitorScript();
      console.log('\n🎯 Para iniciar o monitoramento de performance:');
      console.log('   node performance-monitor.js');
      console.log('\n💡 Dicas adicionais:');
      console.log('   - Reinicie o bot para aplicar as otimizações');
      console.log('   - Configure um token válido do Discord');
      console.log('   - Monitore os logs de performance regularmente');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Erro na otimização:', error);
      process.exit(1);
    });
}

module.exports = PerformanceOptimizer;