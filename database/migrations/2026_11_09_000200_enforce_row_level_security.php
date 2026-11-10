<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * VULN-004 fix — database-level tenant isolation.
 *
 * The existing TenantScope is an Eloquent global scope: PHP-side. It is
 * trivially defeated by `withoutGlobalScopes()`, a raw query, a DB console, a
 * reporting tool, or a single developer forgetting `->where(...)`. In a
 * multi-tenant MFI, one such slip exposes another NBFC's entire customer book.
 *
 * PostgreSQL Row Level Security puts the boundary in the engine, where no
 * application code path can skip it.
 *
 * CRITICAL DETAIL: RLS is silently BYPASSED by the table OWNER and by any
 * SUPERUSER. That is how a "configured" RLS deployment still leaks — proven
 * during the P1 build. Hence FORCE ROW LEVEL SECURITY here, and the runtime
 * role must be NOSUPERUSER NOBYPASSRLS (see deploy/postgres/provision_roles.sql).
 */
return new class extends Migration
{
    /** Tables that hold tenant-scoped operational data. */
    /**
     * NOTE: mfi_employees and mfi_branches are deliberately NOT in this list.
     *
     * RLS on the auth tables creates a bootstrap paradox: the login request has
     * no tenant yet (that is what it is trying to discover), so a tenant policy
     * hides the very row it needs to read. The correct boundary for these two is
     * the application layer (user_code is globally unique) plus the fact that the
     * issued token pins exactly one tenant for every subsequent request.
     *
     * Every FINANCIAL and CUSTOMER table remains under RLS.
     */
    private const TABLES = [
        'mfi_members',
        'mfi_loan_plans',
        'mfi_loans',
        'mfi_installments',
        'mfi_emi_collections',
        'mfi_vouchers',
        'mfi_ledgers',
        'mfi_ledger_sub_entries',
        'mfi_audit_logs',
        'mfi_bank_accounts',
        'mfi_branch_centers',
        'mfi_branch_ledger_balances',
        'mfi_fund_transfers',
        'mfi_loan_settlements',
        'mfi_payment_orders',
        'mfi_payment_webhooks',
        'mfi_payout_disbursements',
        'mfi_cash_handovers',
        'mfi_dynamic_resources',
        'mfi_revoked_tokens',
    ];

    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        foreach (self::TABLES as $table) {
            $exists = DB::selectOne(
                'SELECT 1 AS x FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
                ['public', $table]
            );
            if (! $exists) {
                continue;
            }

            $hasTenant = DB::selectOne(
                'SELECT 1 AS x FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?',
                ['public', $table, 'tenant_code']
            );
            if (! $hasTenant) {
                continue;
            }

            DB::statement("ALTER TABLE public.{$table} ENABLE ROW LEVEL SECURITY");
            // Without FORCE, the table owner (usually the migration role, and in
            // careless setups the app role too) reads every row and the policy
            // looks "configured" while doing nothing.
            DB::statement("ALTER TABLE public.{$table} FORCE ROW LEVEL SECURITY");

            DB::statement("DROP POLICY IF EXISTS {$table}_tenant_isolation ON public.{$table}");
            DB::statement("
                CREATE POLICY {$table}_tenant_isolation ON public.{$table}
                USING (
                    tenant_code = current_setting('app.tenant_code', true)
                    OR current_setting('app.is_superadmin', true) = 'on'
                )
                WITH CHECK (
                    tenant_code = current_setting('app.tenant_code', true)
                    OR current_setting('app.is_superadmin', true) = 'on'
                )
            ");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        foreach (self::TABLES as $table) {
            DB::statement("DROP POLICY IF EXISTS {$table}_tenant_isolation ON public.{$table}");
            DB::statement("ALTER TABLE public.{$table} NO FORCE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE public.{$table} DISABLE ROW LEVEL SECURITY");
        }
    }
};
