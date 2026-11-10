#!/usr/bin/env bash
# =============================================================================
# deploy_release.sh — Zero-Data-Loss Controlled Production Deployment (49.7 & 49.8)
# NEVER overwrites live database records and NEVER seeds demo data!
# =============================================================================
set -euo pipefail

RELEASE_TAG="${1:?Usage: deploy_release.sh <release_tag>}"
COMPOSE_FILE="docker-compose.prod.yml"
STATE_DIR="/var/lib/neev_releases"
mkdir -p "${STATE_DIR}"

echo "[1/6] Recording pre-deployment release tag..."
if [ -f "${STATE_DIR}/current_release" ]; then
  cp "${STATE_DIR}/current_release" "${STATE_DIR}/previous_release"
fi

echo "[2/6] Taking mandatory pre-deployment encrypted PostgreSQL backup..."
docker compose -f "${COMPOSE_FILE}" exec -T backup-worker /bin/sh /usr/local/bin/backup_postgres.sh

echo "[3/6] Building tagged release images (${RELEASE_TAG})..."
export NEEV_IMAGE_TAG="${RELEASE_TAG}"
docker compose -f "${COMPOSE_FILE}" build backend nginx

echo "[4/6] Applying additive non-destructive PostgreSQL migrations & zero-balance essentials..."
docker compose -f "${COMPOSE_FILE}" run --rm backend sh -c "python manage.py migrate --noinput && python manage.py init_production_db"

echo "[5/6] Rolling update of backend & nginx containers (PostgreSQL volume untouched)..."
docker compose -f "${COMPOSE_FILE}" up -d --no-deps backend nginx

echo "[6/6] Verifying /api/health/ready/ probe..."
for i in 1 2 3 4 5 6; do
  if docker compose -f "${COMPOSE_FILE}" exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health/ready/', timeout=5)"; then
    echo "${RELEASE_TAG}" > "${STATE_DIR}/current_release"
    echo "DEPLOYMENT PASSED: Release ${RELEASE_TAG} is healthy."
    exit 0
  fi
  sleep 5
done

echo "ERROR: Post-deploy health check failed! Triggering automatic application rollback..." >&2
"$(dirname "$0")/rollback_release.sh"
exit 1
