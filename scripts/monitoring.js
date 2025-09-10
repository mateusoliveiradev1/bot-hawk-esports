const axios = require('axios');
const { WebhookClient } = require('discord.js');

class MonitoringService {
  constructor() {
    this.uptimeRobotApiKey = process.env.UPTIMEROBOT_API_KEY;
    this.discordWebhook = process.env.DISCORD_WEBHOOK_URL;
    this.botUrl = process.env.BOT_URL || 'https://bot-hawk-esports.up.railway.app';
    this.dashboardUrl = process.env.DASHBOARD_URL || 'https://hawk-esports-dashboard.vercel.app';
    
    this.webhook = new WebhookClient({ url: this.discordWebhook });
  }

  async createUptimeRobotMonitors() {
    try {
      const monitors = [
        {
          friendly_name: 'Bot Hawk Esports - Health Check',
          url: `${this.botUrl}/health`,
          type: 1, // HTTP(s)
          interval: 300, // 5 minutes
          timeout: 30
        },
        {
          friendly_name: 'Bot Hawk Esports - API',
          url: `${this.botUrl}/api/status`,
          type: 1,
          interval: 300,
          timeout: 30
        },
        {
          friendly_name: 'Hawk Esports Dashboard',
          url: this.dashboardUrl,
          type: 1,
          interval: 300,
          timeout: 30
        }
      ];

      const results = [];
      
      for (const monitor of monitors) {
        const response = await axios.post('https://api.uptimerobot.com/v2/newMonitor', {
          api_key: this.uptimeRobotApiKey,
          format: 'json',
          ...monitor
        });
        
        results.push(response.data);
        console.log(`✅ Created monitor: ${monitor.friendly_name}`);
      }
      
      return results;
    } catch (error) {
      console.error('❌ Failed to create UptimeRobot monitors:', error.message);
      throw error;
    }
  }

  async getMonitorStatus() {
    try {
      const response = await axios.post('https://api.uptimerobot.com/v2/getMonitors', {
        api_key: this.uptimeRobotApiKey,
        format: 'json',
        logs: 1
      });
      
      return response.data.monitors;
    } catch (error) {
      console.error('❌ Failed to get monitor status:', error.message);
      throw error;
    }
  }

  async checkServiceHealth() {
    const services = [
      { name: 'Bot Health', url: `${this.botUrl}/health` },
      { name: 'Bot API', url: `${this.botUrl}/api/status` },
      { name: 'Bot Metrics', url: `${this.botUrl}/metrics` },
      { name: 'Dashboard', url: this.dashboardUrl }
    ];

    const results = [];

    for (const service of services) {
      try {
        const startTime = Date.now();
        const response = await axios.get(service.url, { timeout: 10000 });
        const responseTime = Date.now() - startTime;
        
        results.push({
          name: service.name,
          status: 'healthy',
          responseTime,
          statusCode: response.status,
          timestamp: new Date().toISOString()
        });
        
        console.log(`✅ ${service.name}: ${response.status} (${responseTime}ms)`);
      } catch (error) {
        results.push({
          name: service.name,
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString()
        });
        
        console.log(`❌ ${service.name}: ${error.message}`);
      }
    }

    return results;
  }

  async sendDiscordAlert(service, status, details = {}) {
    try {
      const color = status === 'healthy' ? 0x00ff00 : 0xff0000;
      const emoji = status === 'healthy' ? '✅' : '🚨';
      
      const embed = {
        title: `${emoji} Service Alert: ${service}`,
        color,
        fields: [
          {
            name: 'Status',
            value: status.toUpperCase(),
            inline: true
          },
          {
            name: 'Timestamp',
            value: new Date().toLocaleString(),
            inline: true
          }
        ],
        timestamp: new Date().toISOString()
      };

      if (details.responseTime) {
        embed.fields.push({
          name: 'Response Time',
          value: `${details.responseTime}ms`,
          inline: true
        });
      }

      if (details.error) {
        embed.fields.push({
          name: 'Error',
          value: details.error,
          inline: false
        });
      }

      if (details.statusCode) {
        embed.fields.push({
          name: 'Status Code',
          value: details.statusCode.toString(),
          inline: true
        });
      }

      await this.webhook.send({ embeds: [embed] });
      console.log(`📢 Discord alert sent for ${service}`);
    } catch (error) {
      console.error('❌ Failed to send Discord alert:', error.message);
    }
  }

  async generateHealthReport() {
    try {
      console.log('🔍 Generating health report...');
      
      const healthChecks = await this.checkServiceHealth();
      const monitors = await this.getMonitorStatus();
      
      const report = {
        timestamp: new Date().toISOString(),
        summary: {
          totalServices: healthChecks.length,
          healthyServices: healthChecks.filter(s => s.status === 'healthy').length,
          unhealthyServices: healthChecks.filter(s => s.status === 'unhealthy').length
        },
        services: healthChecks,
        uptimeRobotMonitors: monitors?.map(m => ({
          name: m.friendly_name,
          status: m.status,
          uptime: m.all_time_uptime_ratio,
          url: m.url
        })) || []
      };
      
      // Send alerts for unhealthy services
      const unhealthyServices = healthChecks.filter(s => s.status === 'unhealthy');
      for (const service of unhealthyServices) {
        await this.sendDiscordAlert(service.name, 'unhealthy', {
          error: service.error
        });
      }
      
      // Send daily summary if all services are healthy
      if (unhealthyServices.length === 0 && new Date().getHours() === 9) {
        await this.sendDiscordAlert('Daily Health Check', 'healthy', {
          responseTime: Math.round(healthChecks.reduce((acc, s) => acc + (s.responseTime || 0), 0) / healthChecks.length)
        });
      }
      
      console.log('📊 Health report generated successfully');
      return report;
    } catch (error) {
      console.error('❌ Failed to generate health report:', error.message);
      throw error;
    }
  }

  async startMonitoring(interval = 5 * 60 * 1000) { // 5 minutes
    console.log(`🚀 Starting monitoring service (interval: ${interval / 1000}s)`);
    
    // Initial health check
    await this.generateHealthReport();
    
    // Set up recurring health checks
    setInterval(async () => {
      try {
        await this.generateHealthReport();
      } catch (error) {
        console.error('❌ Monitoring cycle failed:', error.message);
      }
    }, interval);
  }
}

// CLI usage
if (require.main === module) {
  const monitoring = new MonitoringService();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'setup':
      monitoring.createUptimeRobotMonitors()
        .then(() => console.log('🎉 UptimeRobot monitors created!'))
        .catch(console.error);
      break;
      
    case 'check':
      monitoring.generateHealthReport()
        .then(report => console.log('📊 Health Report:', JSON.stringify(report, null, 2)))
        .catch(console.error);
      break;
      
    case 'start':
      monitoring.startMonitoring()
        .catch(console.error);
      break;
      
    default:
      console.log('Usage: node monitoring.js [setup|check|start]');
      console.log('  setup - Create UptimeRobot monitors');
      console.log('  check - Run single health check');
      console.log('  start - Start continuous monitoring');
  }
}

module.exports = MonitoringService;