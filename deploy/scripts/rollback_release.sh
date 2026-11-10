#!/usr/bin/env bash
# =============================================================================
# rollback_release.sh — Safe Non-Destructive Application Rollback (Section 49.7 & 49.9)
# Rolls back application containers/code to previous verified release tag WITHOUT
# destroying or overwriting live PostgreSQL transactions committed in the interim.
# =============================================================================
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
STATE_DIR="${STATE_DIR:-/var/lib/neev_releases}"
TARGET_TAG="${1:-}"

if [ -z "${TARGET_TAG}" ] && [ -f "${STATE_DIR}/previous_release" ]; then
  TARGET_TAG="$(cat "${STATE_DIR}/previous_release")"
fi

if [ -z "${TARGET_TAG}" ]; then
  echo "ERROR: No target rollback tag supplied and ${STATE_DIR}/previous_release not found." >&2
  exit 1
fi

echo "[1/3] Rolling back application services to verified release '${TARGET_TAG}' (preserving live PostgreSQL data)..."
export NEEV_IMAGE_TAG="${TARGET_TAG}"
docker compose -f "${COMPOSE_FILE}" up -d --no-deps backend nginx

echo "[2/3] Verifying post-rollback readiness probe..."
docker compose -f "${COMPOSE_FILE}" exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health/ready/', timeout=5)"

echo "[3/3] Updating active release marker -> ${TARGET_TAG}"
echo "${TARGET_TAG}" > "${STATE_DIR}/current_release"
echo "ROLLBACK COMPLETE: Active release restored to ${TARGET_TAG} with zero database record loss."
