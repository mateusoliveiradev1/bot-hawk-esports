const http = require('http');

const options = {
  host: 'localhost',
  port: process.env.API_PORT || 3001,
  path: '/health',
  timeout: 5000, // Increased timeout for comprehensive health check
};

const request = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`Health check status: ${res.statusCode}`);
    
    try {
      const response = JSON.parse(data);
      
      if (res.statusCode === 200 && response.success) {
        const healthData = response.data;
        console.log(`System status: ${healthData.status}`);
        console.log(`Uptime: ${Math.round(healthData.uptime)}s`);
        
        if (healthData.services) {
          console.log('Services:');
          healthData.services.forEach(service => {
            const statusIcon = service.status === 'healthy' ? '✅' : 
                              service.status === 'degraded' ? '⚠️' : '❌';
            console.log(`  ${statusIcon} ${service.name}: ${service.status} (${service.responseTime}ms)`);
          });
        }
        
        if (healthData.system) {
          console.log(`Memory: ${healthData.system.memory.used}MB/${healthData.system.memory.total}MB (${healthData.system.memory.percentage}%)`);
          console.log(`Discord: ${healthData.system.discord.connected ? 'Connected' : 'Disconnected'} - ${healthData.system.discord.guilds} guilds, ${healthData.system.discord.users} users`);
        }
        
        // Exit with success if system is healthy or degraded
        if (healthData.status === 'healthy' || healthData.status === 'degraded') {
          process.exit(0);
        } else {
          console.error('System is unhealthy');
          process.exit(1);
        }
      } else {
        console.error('Health check failed:', response.error || 'Unknown error');
        process.exit(1);
      }
    } catch (parseError) {
      console.error('Failed to parse health check response:', parseError.message);
      console.log('Raw response:', data);
      process.exit(1);
    }
  });
});

request.on('error', (err) => {
  console.error('Health check request failed:', err.message);
  
  // Provide more specific error messages
  if (err.code === 'ECONNREFUSED') {
    console.error(`Cannot connect to API server on port ${options.port}. Is the server running?`);
  } else if (err.code === 'ETIMEDOUT') {
    console.error('Health check timed out. Server may be overloaded.');
  }
  
  process.exit(1);
});

request.on('timeout', () => {
  console.error('Health check timed out');
  request.destroy();
  process.exit(1);
});

request.end();

// Add process timeout as fallback
setTimeout(() => {
  console.error('Health check process timed out');
  process.exit(1);
}, 10000); // 10 second total timeout