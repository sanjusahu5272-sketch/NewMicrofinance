# Production deployment

## Recommended hosting
Use a VPS/cloud VM with Docker (Ubuntu 24.04/22.04, 2 vCPU, 4 GB RAM minimum for a small pilot). Shared cPanel hosting normally does not run Docker Compose; if the customer's hosting is cPanel-only, use a VPS or ask the host for Docker support.

## 1. Server
Install Docker Engine + Compose plugin, open TCP 80/443, upload this project, and create `backend/.env` from `.env.example`.

## 2. Production environment
Set:
- `DEBUG=0`
- a long random `DJANGO_SECRET_KEY`
- real `ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS=https://your-domain.com`
- strong PostgreSQL password
- `SEED_DEMO=0`
- strong `ADMIN_PASSWORD`

## 3. First start
```bash
docker compose up -d --build
```

Check:
```bash
docker compose ps
curl http://127.0.0.1:5173/api/health/
```

## 4. Domain / HTTPS
Put a reverse proxy in front of port 5173. Nginx Proxy Manager, Caddy, or the host's load balancer can terminate HTTPS and forward to the frontend container.

## 5. Admin password
After first deployment, login at `/` and change the admin password from Django Admin or create a dedicated user with:
```bash
docker compose exec backend python manage.py createsuperuser
```

## 6. Backups
Run `scripts/backup.sh` daily using cron. The script creates a PostgreSQL dump and copies the media volume into a timestamped archive. Store backups outside the VPS as well.

## Important before real-money use
Configure and test payment gateway webhooks, KYC document storage/access controls, branch/role permissions, SMS/WhatsApp provider credentials, accounting reconciliation, monitoring, incident recovery, and legal/regulatory controls for the actual entity. Never put gateway secrets in frontend code.
