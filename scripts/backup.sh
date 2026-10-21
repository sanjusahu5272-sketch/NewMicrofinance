#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p backups
# Run from project root.
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-nmfa}" -d "${POSTGRES_DB:-nmfa}" > "backups/nmfa_${STAMP}.sql"
docker run --rm -v nmfa_production_v2_media:/media -v "$PWD/backups:/backup" alpine tar czf "/backup/media_${STAMP}.tar.gz" -C /media . || true
echo "Backup created in ./backups"
