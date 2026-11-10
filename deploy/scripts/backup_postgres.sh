#!/usr/bin/env bash
# =============================================================================
# backup_postgres.sh — Encrypted Automated PostgreSQL Backup (Section 49.7)
# Creates custom-format pg_dump, computes SHA-256 manifest, encrypts with
# AES-256-CBC (PBKDF2-SHA256 200,000 iterations), and prunes expired archives.
# =============================================================================
set -euo pipefail

PG_HOST="${POSTGRES_HOST:-127.0.0.1}"
PG_PORT="${POSTGRES_PORT:-5432}"
PG_DB="${POSTGRES_DB:-neev_microfinance_prod}"
PG_USER="${POSTGRES_USER:-neev_mfi_prod_user}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

if [ -z "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]; then
  echo "ERROR: BACKUP_ENCRYPTION_PASSPHRASE is required for encrypted production backups." >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
chmod 0700 "${BACKUP_DIR}"

TS="$(date -u +%Y%m%d_%H%M%SZ)"
RAW_DUMP="${BACKUP_DIR}/neev_${PG_DB}_${TS}.dump"
ENC_DUMP="${RAW_DUMP}.enc"
MANIFEST="${ENC_DUMP}.sha256"

export PGPASSWORD="${POSTGRES_PASSWORD:-}"
pg_dump -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DB}" \
  --format=custom --no-owner --no-privileges --file="${RAW_DUMP}"

RAW_SHA256="$(sha256sum "${RAW_DUMP}" | awk '{print $1}')"

openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
  -in "${RAW_DUMP}" -out "${ENC_DUMP}" \
  -pass env:BACKUP_ENCRYPTION_PASSPHRASE

rm -f "${RAW_DUMP}"
chmod 0600 "${ENC_DUMP}"

ENC_SHA256="$(sha256sum "${ENC_DUMP}" | awk '{print $1}')"
cat > "${MANIFEST}" <<EOF
encrypted_file=$(basename "${ENC_DUMP}")
encrypted_sha256=${ENC_SHA256}
raw_dump_sha256=${RAW_SHA256}
created_utc=${TS}
cipher=AES-256-CBC-PBKDF2-SHA256-200K
database=${PG_DB}
EOF
chmod 0600 "${MANIFEST}"

find "${BACKUP_DIR}" -name "neev_*.dump.enc*" -type f -mtime +"${RETENTION_DAYS}" -delete
echo "SUCCESS: Encrypted PostgreSQL backup written to ${ENC_DUMP} (SHA256=${ENC_SHA256})"
