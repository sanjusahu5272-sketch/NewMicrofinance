<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Port of PostgreSQL numeric constraints, append-only financial & audit immutability triggers,
 * and least-privilege runtime role grants from:
 * - backend/migrations_sql/0001_initial_postgresql_schema.sql
 * - backend/migrations_sql/0002_least_privilege_roles_and_audit_immutability.sql
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        // 1. Strict Double-Entry Voucher Balance & Non-Negative Monetary Constraints
        DB::unprepared(<<<'SQL'
            ALTER TABLE public.mfi_vouchers
                DROP CONSTRAINT IF EXISTS chk_mfi_vouchers_double_entry_balanced,
                ADD CONSTRAINT chk_mfi_vouchers_double_entry_balanced
                CHECK (amount_dr > 0 AND amount_cr > 0 AND amount_dr = amount_cr);

            ALTER TABLE public.mfi_loans
                DROP CONSTRAINT IF EXISTS chk_mfi_loans_non_negative_balances,
                ADD CONSTRAINT chk_mfi_loans_non_negative_balances
                CHECK (
                    plan_amount > 0
                    AND disbursement_amount >= 0
                    AND principal_outstanding >= 0
                    AND interest_outstanding >= 0
                    AND penalty_due >= 0
                    AND total_outstanding >= 0
                );

            ALTER TABLE public.mfi_emi_collections
                DROP CONSTRAINT IF EXISTS chk_mfi_emi_collections_positive_amount,
                ADD CONSTRAINT chk_mfi_emi_collections_positive_amount
                CHECK (
                    amount > 0
                    AND principal_allocated >= 0
                    AND interest_allocated >= 0
                    AND penalty_allocated >= 0
                );
        SQL);

        // 2. Append-Only Immutability Trigger on mfi_audit_logs (from 0002_least_privilege_roles_and_audit_immutability.sql)
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION public.neev_prevent_audit_log_mutation()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION 'Security Policy Violation: % is append-only; % is prohibited.', TG_TABLE_NAME, TG_OP;
            END;
            $$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS trg_mfi_audit_logs_immutable ON public.mfi_audit_logs;
            CREATE TRIGGER trg_mfi_audit_logs_immutable
            BEFORE UPDATE OR DELETE ON public.mfi_audit_logs
            FOR EACH ROW EXECUTE FUNCTION public.neev_prevent_audit_log_mutation();
        SQL);

        // 3. Append-Only Immutability Triggers on mfi_vouchers and mfi_emi_collections
        //    Only permits controlled reversal/bounce metadata tagging while blocking any mutation
        //    of financial amounts, ledgers, dates, or row deletion.
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION public.neev_prevent_voucher_mutation()
            RETURNS TRIGGER AS $$
            BEGIN
                IF TG_OP = 'DELETE' THEN
                    RAISE EXCEPTION 'Financial Immutability Violation: DELETE on mfi_vouchers is strictly prohibited. Post a contra/reversal voucher instead.';
                END IF;
                IF NEW.voucher_no IS DISTINCT FROM OLD.voucher_no
                   OR NEW.voucher_date IS DISTINCT FROM OLD.voucher_date
                   OR NEW.debit_ledger IS DISTINCT FROM OLD.debit_ledger
                   OR NEW.credit_ledger IS DISTINCT FROM OLD.credit_ledger
                   OR NEW.amount_dr IS DISTINCT FROM OLD.amount_dr
                   OR NEW.amount_cr IS DISTINCT FROM OLD.amount_cr
                   OR NEW.tenant_code IS DISTINCT FROM OLD.tenant_code
                THEN
                    RAISE EXCEPTION 'Financial Immutability Violation: Ledger postings and amounts in mfi_vouchers are immutable.';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS trg_mfi_vouchers_immutable ON public.mfi_vouchers;
            CREATE TRIGGER trg_mfi_vouchers_immutable
            BEFORE UPDATE OR DELETE ON public.mfi_vouchers
            FOR EACH ROW EXECUTE FUNCTION public.neev_prevent_voucher_mutation();

            CREATE OR REPLACE FUNCTION public.neev_prevent_collection_mutation()
            RETURNS TRIGGER AS $$
            BEGIN
                IF TG_OP = 'DELETE' THEN
                    RAISE EXCEPTION 'Financial Immutability Violation: DELETE on mfi_emi_collections is strictly prohibited.';
                END IF;
                IF NEW.receipt_no IS DISTINCT FROM OLD.receipt_no
                   OR NEW.loan_id IS DISTINCT FROM OLD.loan_id
                   OR NEW.amount IS DISTINCT FROM OLD.amount
                   OR NEW.principal_allocated IS DISTINCT FROM OLD.principal_allocated
                   OR NEW.interest_allocated IS DISTINCT FROM OLD.interest_allocated
                   OR NEW.penalty_allocated IS DISTINCT FROM OLD.penalty_allocated
                   OR NEW.tenant_code IS DISTINCT FROM OLD.tenant_code
                THEN
                    RAISE EXCEPTION 'Financial Immutability Violation: Allocated amounts in mfi_emi_collections are immutable.';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS trg_mfi_emi_collections_immutable ON public.mfi_emi_collections;
            CREATE TRIGGER trg_mfi_emi_collections_immutable
            BEFORE UPDATE OR DELETE ON public.mfi_emi_collections
            FOR EACH ROW EXECUTE FUNCTION public.neev_prevent_collection_mutation();

            CREATE OR REPLACE FUNCTION public.neev_prevent_ledger_deletion()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION 'Financial Immutability Violation: DELETE on mfi_ledgers is strictly prohibited.';
            END;
            $$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS trg_mfi_ledgers_no_delete ON public.mfi_ledgers;
            CREATE TRIGGER trg_mfi_ledgers_no_delete
            BEFORE DELETE ON public.mfi_ledgers
            FOR EACH ROW EXECUTE FUNCTION public.neev_prevent_ledger_deletion();
        SQL);

        // 4. Least-Privilege Runtime Role (neev_app_runtime).
        //
        // PHASE-1 CHANGE (2026-11-09): this block used to run `CREATE ROLE`
        // unconditionally from inside a migration. That is architecturally wrong
        // and it breaks every deployment where migrations run as a role without
        // CREATEROLE (i.e. every sane production setup, and CI):
        //
        //     SQLSTATE[42501]: permission denied to create role
        //
        // Role provisioning is a DBA/infra concern, not an application schema
        // concern — the same reason Laravel never creates its own DB user.
        // It now lives in deploy/postgres/provision_roles.sql and is applied
        // once by the deployment pipeline.
        //
        // If the role HAPPENS to already exist we still tighten its grants here,
        // failing soft if we lack the privilege.
        $roleExists = (bool) DB::selectOne("SELECT 1 AS x FROM pg_roles WHERE rolname = 'neev_app_runtime'");

        if ($roleExists) {
            try {
                DB::unprepared(<<<'SQL'
                    GRANT USAGE ON SCHEMA public TO neev_app_runtime;
                    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO neev_app_runtime;
                    REVOKE UPDATE, DELETE, TRUNCATE ON public.mfi_audit_logs FROM neev_app_runtime;
                    REVOKE DELETE, TRUNCATE ON public.mfi_vouchers, public.mfi_emi_collections, public.mfi_ledgers FROM neev_app_runtime;
                    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO neev_app_runtime;
                    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO neev_app_runtime;
                    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO neev_app_runtime;
                SQL);
            } catch (\Throwable $e) {
                // Grants can only be applied by the role owner or a superuser.
                // Not fatal for schema correctness; the deploy script enforces it.
                logger()->warning('neev_app_runtime grants could not be applied from migration: '.$e->getMessage());
            }
        } else {
            logger()->warning(
                'Role neev_app_runtime not found. Run deploy/postgres/provision_roles.sql as a DBA before go-live. '.
                'The application will still function, but the least-privilege boundary is NOT enforced.'
            );
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::unprepared(<<<'SQL'
            DROP TRIGGER IF EXISTS trg_mfi_ledgers_no_delete ON public.mfi_ledgers;
            DROP FUNCTION IF EXISTS public.neev_prevent_ledger_deletion();

            DROP TRIGGER IF EXISTS trg_mfi_emi_collections_immutable ON public.mfi_emi_collections;
            DROP FUNCTION IF EXISTS public.neev_prevent_collection_mutation();

            DROP TRIGGER IF EXISTS trg_mfi_vouchers_immutable ON public.mfi_vouchers;
            DROP FUNCTION IF EXISTS public.neev_prevent_voucher_mutation();

            DROP TRIGGER IF EXISTS trg_mfi_audit_logs_immutable ON public.mfi_audit_logs;
            DROP FUNCTION IF EXISTS public.neev_prevent_audit_log_mutation();
        SQL);
    }
};
