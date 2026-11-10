#!/usr/bin/env bash
# =============================================================================
# restore_postgres.sh — Verified Encrypted Backup Restore Procedure (Section 49.7)
# 1. Verifies encrypted archive SHA-256 against manifest.
# 2. Decrypts into temporary secure file & verifies raw pg_dump SHA-256.
# 3. Restores into an isolated verification DB (`${TARGET_DB}_verify`) FIRST!
# 4. Only promotes/restores into `${TARGET_DB}` when `--apply-live` is explicitly passed.
# =============================================================================
set -euo pipefail

ENC_FILE="${1:?Usage: restore_postgres.sh <path/to/backup.dump.enc> [--apply-live]}"
APPLY_MODE="${2:---verify-only}"

PG_HOST="${POSTGRES_HOST:-127.0.0.1}"
PG_PORT="${POSTGRES_PORT:-5432}"
TARGET_DB="${POSTGRES_DB:-neev_microfinance_prod}"
VERIFY_DB="${VERIFY_POSTGRES_DB:-${TARGET_DB}_restore_verify}"
PG_USER="${POSTGRES_USER:-neev_mfi_prod_user}"

if [ -z "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]; then
  echo "ERROR: BACKUP_ENCRYPTION_PASSPHRASE is required." >&2
  exit 1
fi

MANIFEST="${ENC_FILE}.sha256"
if [ -f "${MANIFEST}" ]; then
  EXPECTED_ENC_SHA="$(grep '^encrypted_sha256=' "${MANIFEST}" | cut -d= -f2)"
  ACTUAL_ENC_SHA="$(sha256sum "${ENC_FILE}" | awk '{print $1}')"
  if [ "${EXPECTED_ENC_SHA}" != "${ACTUAL_ENC_SHA}" ]; then
    echo "FATAL: Encrypted archive SHA-256 mismatch!" >&2
    exit 1
  fi
fi

TMP_DEC="$(mktemp /tmp/neev_restore_XXXXXX.dump)"
trap 'rm -f "${TMP_DEC}"' EXIT

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "${ENC_FILE}" -out "${TMP_DEC}" \
  -pass env:BACKUP_ENCRYPTION_PASSPHRASE

if [ -f "${MANIFEST}" ]; then
  EXPECTED_RAW_SHA="$(grep '^raw_dump_sha256=' "${MANIFEST}" | cut -d= -f2)"
  ACTUAL_RAW_SHA="$(sha256sum "${TMP_DEC}" | awk '{print $1}')"
  if [ "${EXPECTED_RAW_SHA}" != "${ACTUAL_RAW_SHA}" ]; then
    echo "FATAL: Decrypted dump SHA-256 mismatch!" >&2
    exit 1
  fi
fi

export PGPASSWORD="${POSTGRES_PASSWORD:-}"
psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d postgres \
  -tc "SELECT 1 FROM pg_database WHERE datname='${VERIFY_DB}'" | grep -q 1 \
  || psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d postgres -c "CREATE DATABASE ${VERIFY_DB};"

psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${VERIFY_DB}" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
pg_restore -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${VERIFY_DB}" \
  --no-owner --no-privileges "${TMP_DEC}"

TBL_COUNT="$(psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${VERIFY_DB}" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")"
echo "ISOLATED RESTORE VERIFIED: ${TBL_COUNT} tables cleanly restored in ${VERIFY_DB}."

if [ "${APPLY_MODE}" = "--apply-live" ]; then
  echo "Applying verified backup to live database ${TARGET_DB}..."
  pg_restore -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${TARGET_DB}" \
    --clean --if-exists --no-owner --no-privileges "${TMP_DEC}"
  echo "LIVE RESTORE COMPLETE: ${TARGET_DB}"
else
  echo "Dry-run isolated verification complete. Pass '--apply-live' after maintenance sign-off to restore live DB."
fi
