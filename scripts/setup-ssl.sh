#!/bin/bash
# 🔒 Script de Configuração SSL/TLS - Bot Hawk Esports
# Configuração automática de certificados SSL com Let's Encrypt

set -euo pipefail

# Configurações
DOMAIN=""
EMAIL=""
WEBROOT_PATH="/var/www/certbot"
CERTBOT_PATH="/etc/letsencrypt"
NGINX_CONF_PATH="./nginx/nginx.conf"
DOCKER_COMPOSE_FILE="docker-compose.prod.yml"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Função de log
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

# Função para mostrar ajuda
show_help() {
    echo "🔒 Configuração SSL/TLS para Bot Hawk Esports"
    echo ""
    echo "Uso: $0 -d DOMAIN -e EMAIL [opções]"
    echo ""
    echo "Opções obrigatórias:"
    echo "  -d, --domain DOMAIN    Domínio para o certificado SSL"
    echo "  -e, --email EMAIL      Email para registro no Let's Encrypt"
    echo ""
    echo "Opções:"
    echo "  -s, --staging          Usar ambiente de teste do Let's Encrypt"
    echo "  -f, --force            Forçar renovação do certificado"
    echo "  -h, --help             Mostrar esta ajuda"
    echo ""
    echo "Exemplos:"
    echo "  $0 -d bot.exemplo.com -e admin@exemplo.com"
    echo "  $0 -d bot.exemplo.com -e admin@exemplo.com --staging"
}

# Função para validar parâmetros
validate_params() {
    if [ -z "$DOMAIN" ]; then
        log_error "Domínio é obrigatório. Use -d ou --domain"
        show_help
        exit 1
    fi
    
    if [ -z "$EMAIL" ]; then
        log_error "Email é obrigatório. Use -e ou --email"
        show_help
        exit 1
    fi
    
    # Validar formato do email
    if ! [[ "$EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
        log_error "Formato de email inválido: $EMAIL"
        exit 1
    fi
    
    # Validar formato do domínio
    if ! [[ "$DOMAIN" =~ ^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$ ]]; then
        log_error "Formato de domínio inválido: $DOMAIN"
        exit 1
    fi
}

# Função para verificar pré-requisitos
check_prerequisites() {
    log_step "Verificando pré-requisitos..."
    
    # Verificar se está rodando como root
    if [ "$EUID" -ne 0 ]; then
        log_error "Este script deve ser executado como root"
        exit 1
    fi
    
    # Verificar Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker não está instalado"
        exit 1
    fi
    
    # Verificar Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose não está instalado"
        exit 1
    fi
    
    # Verificar conectividade com Let's Encrypt
    if ! curl -s --connect-timeout 10 https://acme-v02.api.letsencrypt.org/directory > /dev/null; then
        log_error "Não foi possível conectar ao Let's Encrypt"
        exit 1
    fi
    
    log_success "Pré-requisitos verificados"
}

# Função para criar diretórios necessários
create_directories() {
    log_step "Criando diretórios necessários..."
    
    mkdir -p "$WEBROOT_PATH"
    mkdir -p "$CERTBOT_PATH/live/$DOMAIN"
    mkdir -p "$CERTBOT_PATH/archive/$DOMAIN"
    mkdir -p "./nginx/ssl"
    
    log_success "Diretórios criados"
}

# Função para gerar certificado temporário
generate_temp_certificate() {
    log_step "Gerando certificado temporário..."
    
    openssl req -x509 -nodes -newkey rsa:4096 \
        -days 1 \
        -keyout "./nginx/ssl/privkey.pem" \
        -out "./nginx/ssl/fullchain.pem" \
        -subj "/CN=$DOMAIN" 2>/dev/null
    
    log_success "Certificado temporário gerado"
}

# Função para iniciar Nginx temporário
start_temp_nginx() {
    log_step "Iniciando Nginx temporário..."
    
    # Criar configuração temporária do Nginx
    cat > ./nginx/temp-nginx.conf << EOF
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name $DOMAIN;
        
        location /.well-known/acme-challenge/ {
            root $WEBROOT_PATH;
        }
        
        location / {
            return 301 https://\$server_name\$request_uri;
        }
    }
    
    server {
        listen 443 ssl;
        server_name $DOMAIN;
        
        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        
        location / {
            return 200 'SSL Setup in Progress';
            add_header Content-Type text/plain;
        }
    }
}
EOF
    
    # Iniciar container Nginx temporário
    docker run -d --name temp-nginx \
        -p 80:80 -p 443:443 \
        -v "$(pwd)/nginx/temp-nginx.conf:/etc/nginx/nginx.conf:ro" \
        -v "$(pwd)/nginx/ssl:/etc/nginx/ssl:ro" \
        -v "$WEBROOT_PATH:$WEBROOT_PATH" \
        nginx:alpine
    
    # Aguardar Nginx iniciar
    sleep 5
    
    log_success "Nginx temporário iniciado"
}

# Função para obter certificado SSL
obtain_ssl_certificate() {
    log_step "Obtendo certificado SSL do Let's Encrypt..."
    
    local staging_flag=""
    if [ "${STAGING:-false}" = "true" ]; then
        staging_flag="--staging"
        log_info "Usando ambiente de teste do Let's Encrypt"
    fi
    
    local force_flag=""
    if [ "${FORCE:-false}" = "true" ]; then
        force_flag="--force-renewal"
        log_info "Forçando renovação do certificado"
    fi
    
    # Executar certbot
    docker run --rm \
        -v "$CERTBOT_PATH:/etc/letsencrypt" \
        -v "$WEBROOT_PATH:$WEBROOT_PATH" \
        certbot/certbot certonly \
        --webroot \
        --webroot-path="$WEBROOT_PATH" \
        --email "$EMAIL" \
        --agree-tos \
        --no-eff-email \
        --domains "$DOMAIN" \
        $staging_flag \
        $force_flag
    
    if [ $? -eq 0 ]; then
        log_success "Certificado SSL obtido com sucesso"
    else
        log_error "Falha ao obter certificado SSL"
        return 1
    fi
}

# Função para copiar certificados
copy_certificates() {
    log_step "Copiando certificados..."
    
    # Copiar certificados para o diretório do Nginx
    cp "$CERTBOT_PATH/live/$DOMAIN/fullchain.pem" "./nginx/ssl/"
    cp "$CERTBOT_PATH/live/$DOMAIN/privkey.pem" "./nginx/ssl/"
    
    # Definir permissões corretas
    chmod 644 "./nginx/ssl/fullchain.pem"
    chmod 600 "./nginx/ssl/privkey.pem"
    
    log_success "Certificados copiados"
}

# Função para atualizar configuração do Nginx
update_nginx_config() {
    log_step "Atualizando configuração do Nginx..."
    
    # Backup da configuração atual
    cp "$NGINX_CONF_PATH" "${NGINX_CONF_PATH}.backup.$(date +%Y%m%d_%H%M%S)"
    
    # Atualizar configuração para usar SSL real
    sed -i "s|ssl_certificate /etc/nginx/ssl/.*|ssl_certificate /etc/nginx/ssl/fullchain.pem;|g" "$NGINX_CONF_PATH"
    sed -i "s|ssl_certificate_key /etc/nginx/ssl/.*|ssl_certificate_key /etc/nginx/ssl/privkey.pem;|g" "$NGINX_CONF_PATH"
    
    # Adicionar configurações SSL seguras se não existirem
    if ! grep -q "ssl_protocols" "$NGINX_CONF_PATH"; then
        sed -i '/ssl_certificate_key/a\    ssl_protocols TLSv1.2 TLSv1.3;\n    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;\n    ssl_prefer_server_ciphers off;\n    ssl_session_cache shared:SSL:10m;\n    ssl_session_timeout 10m;' "$NGINX_CONF_PATH"
    fi
    
    log_success "Configuração do Nginx atualizada"
}

# Função para parar Nginx temporário
stop_temp_nginx() {
    log_step "Parando Nginx temporário..."
    
    docker stop temp-nginx > /dev/null 2>&1 || true
    docker rm temp-nginx > /dev/null 2>&1 || true
    rm -f ./nginx/temp-nginx.conf
    
    log_success "Nginx temporário removido"
}

# Função para reiniciar serviços
restart_services() {
    log_step "Reiniciando serviços..."
    
    # Reiniciar apenas o Nginx
    docker-compose -f "$DOCKER_COMPOSE_FILE" restart nginx
    
    # Aguardar Nginx iniciar
    sleep 10
    
    log_success "Serviços reiniciados"
}

# Função para verificar certificado
verify_certificate() {
    log_step "Verificando certificado SSL..."
    
    # Verificar se o certificado é válido
    if openssl x509 -in "./nginx/ssl/fullchain.pem" -text -noout | grep -q "$DOMAIN"; then
        log_success "Certificado SSL válido para $DOMAIN"
    else
        log_error "Certificado SSL inválido"
        return 1
    fi
    
    # Verificar conectividade HTTPS
    if curl -s --connect-timeout 10 "https://$DOMAIN" > /dev/null; then
        log_success "Conexão HTTPS funcionando"
    else
        log_warning "Conexão HTTPS pode não estar funcionando corretamente"
    fi
    
    # Mostrar informações do certificado
    local expiry_date=$(openssl x509 -in "./nginx/ssl/fullchain.pem" -noout -enddate | cut -d= -f2)
    log_info "Certificado expira em: $expiry_date"
}

# Função para configurar renovação automática
setup_auto_renewal() {
    log_step "Configurando renovação automática..."
    
    # Criar script de renovação
    cat > ./scripts/renew-ssl.sh << 'EOF'
#!/bin/bash
# Script de renovação automática SSL

set -euo pipefail

DOMAIN="DOMAIN_PLACEHOLDER"
CERTBOT_PATH="/etc/letsencrypt"
DOCKER_COMPOSE_FILE="docker-compose.prod.yml"

# Renovar certificado
docker run --rm \
    -v "$CERTBOT_PATH:/etc/letsencrypt" \
    -v "/var/www/certbot:/var/www/certbot" \
    certbot/certbot renew --quiet

# Verificar se houve renovação
if [ $? -eq 0 ]; then
    # Copiar novos certificados
    cp "$CERTBOT_PATH/live/$DOMAIN/fullchain.pem" "./nginx/ssl/"
    cp "$CERTBOT_PATH/live/$DOMAIN/privkey.pem" "./nginx/ssl/"
    
    # Reiniciar Nginx
    docker-compose -f "$DOCKER_COMPOSE_FILE" restart nginx
    
    echo "[$(date)] Certificado SSL renovado com sucesso"
else
    echo "[$(date)] Erro na renovação do certificado SSL"
fi
EOF
    
    # Substituir placeholder pelo domínio real
    sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" ./scripts/renew-ssl.sh
    chmod +x ./scripts/renew-ssl.sh
    
    # Adicionar ao crontab (executar diariamente às 2:00)
    (crontab -l 2>/dev/null; echo "0 2 * * * $(pwd)/scripts/renew-ssl.sh >> $(pwd)/logs/ssl-renewal.log 2>&1") | crontab -
    
    log_success "Renovação automática configurada (diariamente às 2:00)"
}

# Função principal
main() {
    log_info "🔒 Iniciando configuração SSL/TLS para $DOMAIN"
    
    # Verificar pré-requisitos
    check_prerequisites
    
    # Criar diretórios
    create_directories
    
    # Gerar certificado temporário
    generate_temp_certificate
    
    # Iniciar Nginx temporário
    start_temp_nginx
    
    # Obter certificado real
    if obtain_ssl_certificate; then
        copy_certificates
        update_nginx_config
    else
        log_error "Falha ao obter certificado SSL"
        stop_temp_nginx
        exit 1
    fi
    
    # Parar Nginx temporário
    stop_temp_nginx
    
    # Reiniciar serviços
    restart_services
    
    # Verificar certificado
    verify_certificate
    
    # Configurar renovação automática
    setup_auto_renewal
    
    log_success "🎉 Configuração SSL/TLS concluída com sucesso!"
    log_info "Seu bot agora está acessível via HTTPS em: https://$DOMAIN"
}

# Processar argumentos da linha de comando
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--domain)
            DOMAIN="$2"
            shift 2
            ;;
        -e|--email)
            EMAIL="$2"
            shift 2
            ;;
        -s|--staging)
            STAGING="true"
            shift
            ;;
        -f|--force)
            FORCE="true"
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            log_error "Opção desconhecida: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validar parâmetros
validate_params

# Tratamento de erros
trap 'log_error "Configuração SSL falhou na linha $LINENO"; stop_temp_nginx; exit 1' ERR

# Executar configuração
main "$@"