-- ============================================================================
-- NEEV 4D — PostgreSQL role provisioning
-- Run ONCE as a superuser / DBA, NOT from migrations, NOT from the app.
--   psql -U postgres -d neev_mfi -f deploy/postgres/provision_roles.sql
--
-- Production rule (learned the hard way in the P1 build):
--   migration role  !=  application role  !=  superuser
-- A superuser or table OWNER silently bypasses Row Level Security, so the app
-- must never connect as either of them.
-- ============================================================================

-- 1. Migration / DDL role — runs `php artisan migrate`, owns the schema.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'neev_migrator') THEN
        CREATE ROLE neev_migrator LOGIN PASSWORD 'REPLACE_ME' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;
END $$;

-- 2. Runtime role — what PHP-FPM actually connects as. Least privilege.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'neev_app_runtime') THEN
        CREATE ROLE neev_app_runtime LOGIN PASSWORD 'REPLACE_ME_TOO' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
END $$;

GRANT CONNECT ON DATABASE neev_mfi TO neev_app_runtime;
GRANT USAGE ON SCHEMA public TO neev_app_runtime;

-- Read/write the operational tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO neev_app_runtime;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO neev_app_runtime;

-- ...but the money and the audit trail are append-only to the app.
REVOKE UPDATE, DELETE, TRUNCATE ON public.mfi_audit_logs FROM neev_app_runtime;
REVOKE DELETE, TRUNCATE ON public.mfi_vouchers FROM neev_app_runtime;
REVOKE DELETE, TRUNCATE ON public.mfi_emi_collections FROM neev_app_runtime;
REVOKE DELETE, TRUNCATE ON public.mfi_ledgers FROM neev_app_runtime;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO neev_app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO neev_app_runtime;

-- 3. Kill the public-schema default that lets anyone create objects.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
