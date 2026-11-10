# NEEV 4D — Production Deployment Guide

## Prerequisites

- Ubuntu 22.04+ / Debian 12+ VPS with 4+ vCPU, 8+ GB RAM, 160+ GB disk
- Docker 24+ and Docker Compose v2
- Domain name pointing to VPS IP
- SSH key access

## Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# Log out and back in for docker group to take effect

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Docker Compose plugin
sudo apt install -y docker-compose-plugin
```

## Step 2: Clone & Configure

```bash
# Clone the repository
git clone <your-repo-url> /var/www/neev
cd /var/www/neev

# Copy environment template
cp .env.production.example .env.production

# Edit .env.production — fill in:
#   APP_KEY    — run: php artisan key:generate --no-interaction
#   APP_URL    — your domain (e.g., https://erp.yourdomain.com)
#   DB_PASSWORD — generate: openssl rand -base64 32
#   NEEV_JWT_SECRET — openssl rand -hex 32
#   NEEV_KYC_ENC_KEY — openssl rand -hex 32

# Generate keys (run locally first, then copy)
php artisan key:generate --no-interaction
echo "NEEV_JWT_SECRET=$(openssl rand -hex 32)" >> .env.production
echo "NEEV_KYC_ENC_KEY=$(openssl rand -hex 32)" >> .env.production
```

## Step 3: SSL Certificate (Let's Encrypt)

```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate (replace with your domain)
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Auto-renew
sudo certbot renew --dry-run
```

## Step 4: Firewall

```bash
# Run the firewall script
sudo ADMIN_SSH_CIDR="your-office-ip/32" ./deploy/firewall/ufw_production_rules.sh
```

## Step 5: Deploy

```bash
# First deployment (no migrations needed yet)
./deploy/scripts/deploy_laravel.sh initial

# Or for subsequent deployments with a tag
git tag v1.0.0 && git push origin v1.0.0
./deploy/scripts/deploy_laravel.sh v1.0.0
```

## Step 6: Verify

```bash
# Check health
curl https://your-domain.com/api/health

# Check Horizon (queue monitoring)
# Horizon dashboard is at /horizon (add route if needed, or access via artisan)
docker compose -f docker-compose.prod.yml exec horizon php artisan horizon:metrics
```

## Daily Operations

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f app

# Restart services
docker compose -f docker-compose.prod.yml restart app

# Run queue workers (Horizon manages this automatically)
docker compose -f docker-compose.prod.yml restart horizon

# Backup database
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U $DB_USERNAME $DB_DATABASE > backup_$(date +%Y%m%d).sql

# Run migrations manually
docker compose -f docker-compose.prod.yml exec -T app php artisan migrate --force

# Clear caches
docker compose -f docker-compose.prod.yml exec -T app php artisan optimize:clear
```

## Scaling for 1 Crore Users

When traffic grows, scale horizontally:

1. **App servers**: Add more `app` service replicas behind nginx load balancer
2. **Database**: Move to managed PostgreSQL (RDS/Aurora) with read replicas
3. **Redis**: Use Redis Cluster for horizontal scaling
4. **CDN**: Add Cloudflare for static assets and DDoS protection
5. **Horizon**: Increase `maxProcesses` in `config/horizon.php`

## Security Checklist

- [ ] APP_DEBUG=false in .env.production
- [ ] APP_KEY is a real key (not empty)
- [ ] DB_PASSWORD is strong (32+ chars)
- [ ] NEEV_JWT_SECRET and NEEV_KYC_ENC_KEY are set
- [ ] ufw is enabled and only 22/80/443 are open
- [ ] SSL certificate is valid
- [ ] HSTS header is set
- [ ] PostgreSQL is on internal network (not exposed)
- [ ] Redis is on internal network (not exposed)
- [ ] 2FA is enrolled for all admin accounts
- [ ] Default passwords are changed
- [ ] Backups are scheduled
