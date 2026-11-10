#!/usr/bin/env bash
# =============================================================================
# deploy_laravel.sh — Laravel 13 Production Deployment Script
# =============================================================================
# Usage:
#   ./deploy/scripts/deploy_laravel.sh [release_tag]
#
# Steps:
#   1. Pull latest code (or checkout tag)
#   2. Install Composer dependencies
#   3. Copy .env.production if missing
#   4. Run migrations
#   5. Build Docker images
#   6. Start services
#   7. Health check
# =============================================================================
set -euo pipefail

# ── Configuration ──
COMPOSE_FILE="docker-compose.prod.yml"
RELEASE_TAG="${1:-$(date +%Y%m%d%H%M%S)}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "════════════════════════════════════════════════════════════"
echo "  NEEV 4D — Production Deployment"
echo "  Release: $RELEASE_TAG"
echo "════════════════════════════════════════════════════════════"

# ── 1. Git pull / checkout ──
echo "[1/7] Checking out release $RELEASE_TAG..."
if git rev-parse --verify "refs/tags/$RELEASE_TAG" >/dev/null 2>&1; then
    git checkout "$RELEASE_TAG"
elif git rev-parse --verify "$RELEASE_TAG" >/dev/null 2>&1; then
    git checkout "$RELEASE_TAG"
else
    echo "  Tag not found, using current HEAD"
    git pull --ff-only origin main
fi

# ── 2. Composer install ──
echo "[2/7] Installing Composer dependencies..."
composer install --no-dev --optimize-autoloader --no-interaction

# ── 3. Environment check ──
echo "[3/7] Checking environment..."
if [ ! -f ".env.production" ]; then
    echo "  ERROR: .env.production not found!"
    echo "  Copy .env.production.example to .env.production and fill in values."
    exit 1
fi

# ── 4. Generate APP_KEY if missing ──
APP_KEY=$(grep '^APP_KEY=' .env.production | cut -d'=' -f2- | tr -d '"' | tr -d ' ')
if [ -z "$APP_KEY" ] || [ "$APP_KEY" = "null" ]; then
    echo "  Generating APP_KEY..."
    APP_KEY=$(php artisan key:generate --show --no-interaction 2>/dev/null || \
              php -r "echo 'base64:'.base64_encode(random_bytes(32));")
    sed -i "s|^APP_KEY=.*|APP_KEY=$APP_KEY|" .env.production
    echo "  APP_KEY generated."
fi

# ── 5. Database migrations ──
echo "[4/7] Running database migrations..."
docker compose -f "$COMPOSE_FILE" exec -T app php artisan migrate --force --no-interaction

# ── 6. Build and start ──
echo "[5/7] Building Docker images..."
docker compose -f "$COMPOSE_FILE" build app scheduler horizon

echo "[6/7] Starting services..."
docker compose -f "$COMPOSE_FILE" up -d

# ── 7. Health check ──
echo "[7/7] Running health checks..."
MAX_WAIT=30
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if docker compose -f "$COMPOSE_FILE" exec -T app php artisan route:list --name=health >/dev/null 2>&1; then
        echo "  ✅ Health check passed after ${WAITED}s"
        echo "════════════════════════════════════════════════════════════"
        echo "  DEPLOYMENT SUCCESSFUL — Release $RELEASE_TAG"
        echo "  Health: https://your-domain.com/api/health"
        echo "════════════════════════════════════════════════════════════"
        exit 0
    fi
    sleep 2
    WAITED=$((WAITED + 2))
    echo "  Waiting... ${WAITED}s/${MAX_WAIT}s"
done

echo "  ❌ Health check FAILED after ${MAX_WAIT}s"
echo "  Check logs: docker compose -f $COMPOSE_FILE logs app"
exit 1
