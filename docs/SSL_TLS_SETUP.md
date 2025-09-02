# SSL/TLS Configuration Guide

## Overview

This guide covers the complete SSL/TLS setup for the Hawk Esports Discord Bot, including certificate management, automatic renewal, and security best practices.

## 🔒 Features

- **Automatic Certificate Management**: Let's Encrypt integration with automatic renewal
- **Self-Signed Certificates**: For development and localhost environments
- **Certificate Monitoring**: Health checks and expiration alerts
- **Security Headers**: HSTS, CSP, and other security enhancements
- **Docker Integration**: Containerized SSL services
- **Backup & Recovery**: Automatic certificate backups

## 📋 Prerequisites

- Docker and Docker Compose installed
- Domain name pointing to your server (for production)
- Port 80 and 443 accessible from the internet (for Let's Encrypt)
- Valid email address for Let's Encrypt registration

## 🚀 Quick Start

### 1. Configure SSL Environment

```bash
# Copy the SSL environment template
cp .env.ssl.example .env.ssl

# Edit the configuration
nano .env.ssl
```

### 2. Set Required Variables

```bash
# For production with real domain
DOMAIN=bot.hawkesports.com
SSL_EMAIL=admin@hawkesports.com
SSL_STAGING=false

# For development/testing
DOMAIN=localhost
SSL_EMAIL=admin@example.com
SSL_STAGING=true
```

### 3. Deploy SSL/TLS

```bash
# Run the automated deployment script
./scripts/deploy-ssl.sh

# Or for staging environment
./scripts/deploy-ssl.sh --staging

# Or for localhost development
./scripts/deploy-ssl.sh --localhost
```

## 📁 File Structure

```
bot-hawk-esports/
├── config/
│   ├── ssl/                    # SSL certificates
│   │   ├── cert.pem           # SSL certificate
│   │   └── key.pem            # Private key
│   ├── certbot/               # Let's Encrypt data
│   │   ├── conf/              # Certbot configuration
│   │   ├── www/               # Webroot for challenges
│   │   └── logs/              # Certbot logs
│   └── nginx.conf             # Nginx configuration with SSL
├── scripts/
│   ├── deploy-ssl.sh          # Main deployment script
│   ├── setup-ssl.sh           # SSL setup script
│   ├── certbot-entrypoint.sh  # Certbot container entrypoint
│   ├── ssl-renewal.sh         # Certificate renewal script
│   └── ssl-monitor.sh         # SSL monitoring script
├── docker-compose.ssl.yml     # SSL services configuration
├── .env.ssl.example           # SSL environment template
└── docs/
    └── SSL_TLS_SETUP.md       # This documentation
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DOMAIN` | Domain name for SSL certificate | `localhost` | Yes |
| `SSL_EMAIL` | Email for Let's Encrypt registration | - | Yes |
| `SSL_STAGING` | Use Let's Encrypt staging environment | `false` | No |
| `SSL_RENEWAL_INTERVAL` | Renewal check interval (seconds) | `43200` | No |
| `SSL_CHECK_INTERVAL` | Health check interval (seconds) | `3600` | No |
| `SSL_ALERT_DAYS` | Alert threshold (days before expiry) | `30` | No |
| `WEBHOOK_URL` | Webhook for SSL alerts | - | No |

### SSL Security Settings

```bash
# Protocol versions
SSL_PROTOCOLS="TLSv1.2 TLSv1.3"

# Cipher suites (high security)
SSL_CIPHERS="ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:..."

# HSTS settings
SSL_HSTS_ENABLED=true
SSL_HSTS_MAX_AGE=31536000
SSL_HSTS_INCLUDE_SUBDOMAINS=true
```

## 🐳 Docker Services

### SSL Services

```yaml
# Start SSL services
docker-compose -f docker-compose.ssl.yml --profile ssl up -d

# Stop SSL services
docker-compose -f docker-compose.ssl.yml --profile ssl down
```

### Service Descriptions

- **certbot**: Obtains and manages Let's Encrypt certificates
- **ssl-renewer**: Automatically renews certificates
- **ssl-monitor**: Monitors certificate health and sends alerts

## 🔄 Certificate Management

### Automatic Renewal

Certificates are automatically renewed when they have 30 days or less remaining:

```bash
# Check renewal status
docker-compose -f docker-compose.ssl.yml logs ssl-renewer

# Manual renewal
docker-compose -f docker-compose.ssl.yml exec ssl-renewer /renewal.sh renew
```

### Manual Certificate Operations

```bash
# Check certificate status
docker-compose -f docker-compose.ssl.yml exec ssl-monitor /monitor.sh check

# Generate health report
docker-compose -f docker-compose.ssl.yml exec ssl-monitor /monitor.sh report

# Force certificate regeneration
SSL_FORCE_REGENERATE=true ./scripts/deploy-ssl.sh
```

## 📊 Monitoring

### SSL Health Checks

```bash
# Check SSL certificate health
curl -k https://localhost/health

# View SSL monitoring logs
tail -f logs/ssl-monitor.log

# View renewal logs
tail -f logs/ssl-renewal.log
```

### Health Report

```bash
# Generate JSON health report
docker-compose -f docker-compose.ssl.yml exec ssl-monitor /monitor.sh report

# View certificate information
openssl x509 -in config/ssl/cert.pem -text -noout
```

### Alerts and Notifications

Configure webhook alerts for SSL events:

```bash
# Set webhook URL in .env.ssl
WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Test webhook
curl -X POST "$WEBHOOK_URL" -H "Content-Type: application/json" \
  -d '{"text":"SSL monitoring test"}'
```

## 🔐 Security Best Practices

### 1. Certificate Security

- Store private keys securely with restricted permissions (600)
- Use strong cipher suites and disable weak protocols
- Enable HSTS to prevent downgrade attacks
- Implement certificate pinning for critical applications

### 2. Network Security

```nginx
# Security headers in Nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

### 3. Access Control

- Restrict access to SSL configuration files
- Use firewall rules to limit certificate management access
- Monitor SSL-related logs for suspicious activity

## 🚨 Troubleshooting

### Common Issues

#### 1. Certificate Not Found

```bash
# Check if certificate files exist
ls -la config/ssl/

# Regenerate certificates
SSL_FORCE_REGENERATE=true ./scripts/deploy-ssl.sh
```

#### 2. Let's Encrypt Rate Limits

```bash
# Use staging environment for testing
SSL_STAGING=true ./scripts/deploy-ssl.sh --staging

# Check rate limit status
curl -s "https://crt.sh/?q=yourdomain.com&output=json" | jq length
```

#### 3. Certificate Validation Errors

```bash
# Check certificate validity
openssl x509 -in config/ssl/cert.pem -noout -checkend 86400

# Verify certificate chain
openssl verify config/ssl/cert.pem

# Check certificate-key match
openssl x509 -noout -modulus -in config/ssl/cert.pem | openssl md5
openssl rsa -noout -modulus -in config/ssl/key.pem | openssl md5
```

#### 4. Nginx SSL Errors

```bash
# Test Nginx configuration
docker run --rm -v "$(pwd)/config/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$(pwd)/config/ssl:/etc/nginx/ssl:ro" nginx:alpine nginx -t

# Check Nginx logs
docker-compose -f docker-compose.production.yml logs nginx
```

### Debug Mode

```bash
# Enable verbose SSL logging
SSL_VERBOSE_LOGGING=true ./scripts/deploy-ssl.sh

# Keep certbot container running for debugging
SSL_KEEP_CERTBOT_RUNNING=true ./scripts/deploy-ssl.sh
```

## 📈 Performance Optimization

### SSL Session Optimization

```nginx
# Nginx SSL optimizations
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
ssl_buffer_size 16k;

# Enable SSL stapling
ssl_stapling on;
ssl_stapling_verify on;
```

### Certificate Caching

- Use SSL session resumption to reduce handshake overhead
- Implement OCSP stapling for faster certificate validation
- Configure appropriate SSL buffer sizes

## 🔄 Backup and Recovery

### Automatic Backups

```bash
# Enable automatic certificate backups
SSL_BACKUP_ENABLED=true
SSL_BACKUP_DIR=./backups/ssl
SSL_BACKUP_RETENTION=30
```

### Manual Backup

```bash
# Create certificate backup
tar -czf "ssl-backup-$(date +%Y%m%d).tar.gz" config/ssl/ config/certbot/

# Restore from backup
tar -xzf ssl-backup-20240101.tar.gz
```

### Disaster Recovery

1. **Certificate Loss**: Regenerate using Let's Encrypt or restore from backup
2. **Key Compromise**: Revoke certificate and generate new one immediately
3. **Domain Change**: Update configuration and obtain new certificate

## 🌐 Production Deployment

### Pre-deployment Checklist

- [ ] Domain DNS points to server IP
- [ ] Ports 80 and 443 are accessible
- [ ] Valid email configured for Let's Encrypt
- [ ] SSL environment variables set correctly
- [ ] Firewall rules configured
- [ ] Monitoring and alerting configured

### Deployment Steps

```bash
# 1. Configure production environment
cp .env.ssl.example .env.ssl
# Edit .env.ssl with production values

# 2. Deploy with production certificates
./scripts/deploy-ssl.sh

# 3. Verify deployment
./scripts/deploy-ssl.sh --verify-only

# 4. Test HTTPS endpoints
curl -f https://yourdomain.com/health
```

### Post-deployment

- Monitor certificate expiration dates
- Set up automated renewal monitoring
- Configure backup procedures
- Test disaster recovery procedures

## 📚 Additional Resources

- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Nginx SSL Configuration](https://nginx.org/en/docs/http/configuring_https_servers.html)
- [SSL Labs Server Test](https://www.ssllabs.com/ssltest/)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)

## 🆘 Support

For SSL/TLS related issues:

1. Check the troubleshooting section above
2. Review SSL logs in `logs/ssl-*.log`
3. Test certificate validity with online tools
4. Consult Let's Encrypt community forums

---

**Note**: Always test SSL configuration changes in a staging environment before applying to production.