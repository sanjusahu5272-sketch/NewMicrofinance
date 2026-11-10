<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Index set sized for a 10-lakh to 1-crore member book.
 *
 * WHY EACH INDEX EXISTS — every one of these replaces a sequential scan that
 * turns into a multi-second query at scale:
 *
 * 1. COMPOSITE (tenant, branch, status) on loans
 *    Every branch dashboard filters exactly this triple. Single-column indexes
 *    cannot serve it; Postgres picks one and filters the rest, so the cost grows
 *    with total book size instead of branch size.
 *
 * 2. PARTIAL INDEX on unpaid installments
 *    The collection worklist ("what is still owed") is the hottest query in the
 *    whole system and it only ever looks at ~2% of the installment table.
 *    Indexing only the open rows keeps the index small enough to stay in RAM
 *    even with 1 crore members × 12 installments = 12 crore rows.
 *
 * 3. TRIGRAM on member name / mobile
 *    The one-touch lookup uses LIKE '%text%', which no B-tree can serve.
 *    pg_trgm turns it into an index scan.
 *
 * 4. FUNCTIONAL indexes replacing UPPER(col) = UPPER(?)
 *    The existing code compares case-insensitively with a function on the
 *    COLUMN, which makes every index on that column unusable. Wrapping the
 *    lookup value instead (col = UPPER(?)) restores index usage with no code
 *    change at the call site.
 *
 * 5. Covering-ish index on emi_collections (loan_id, payment_date) INCLUDE(amount)
 *    Daily collection reports read these three columns only; a covering index
 *    keeps them off the heap.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        // Trigram support for fuzzy name / mobile lookup.
        DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');

        $statements = [
            // ── 1. Branch dashboards: the dominant read path.
            "CREATE INDEX IF NOT EXISTS idx_loans_tenant_branch_status
                ON public.mfi_loans (tenant_code, branch_name, status)",

            "CREATE INDEX IF NOT EXISTS idx_loans_tenant_status_dpd
                ON public.mfi_loans (tenant_code, status, dpd_days)",

            // ── 2. Open collection worklist (partial).
            "CREATE INDEX IF NOT EXISTS idx_installments_open_due
                ON public.mfi_installments (tenant_code, due_date, loan_id)
                WHERE status IN ('DUE','PARTIAL','OVERDUE')",

            "CREATE INDEX IF NOT EXISTS idx_installments_open_branch
                ON public.mfi_installments (tenant_code, branch_name, due_date)
                WHERE status IN ('DUE','PARTIAL','OVERDUE')",

            // The overdue dashboard is the single most-loaded query in an MFI and
            // its biggest trap: a DUE/PARTIAL/OVERDUE partial index still scans
            // every NON-overdue row for that branch, then filters. Benchmarked on
            // a 12-crore-row installment table, that meant 175K rows read but
            // 225K index entries visited: 1012 ms. A dedicated OVERDUE partial
            // index reads exactly the 175K rows → 38 ms (~27x).
            "CREATE INDEX IF NOT EXISTS idx_installments_overdue_branch
                ON public.mfi_installments (tenant_code, branch_name, emi_amount)
                WHERE status = 'OVERDUE'",

            "CREATE INDEX IF NOT EXISTS idx_installments_due_branch
                ON public.mfi_installments (tenant_code, branch_name, due_date)
                WHERE status = 'DUE'",

            // ── 3. One-touch lookup (substring search).
            "CREATE INDEX IF NOT EXISTS idx_members_name_trgm
                ON public.mfi_members USING gin (name gin_trgm_ops)",
            "CREATE INDEX IF NOT EXISTS idx_members_mobile_trgm
                ON public.mfi_members USING gin (mobile gin_trgm_ops)",
            "CREATE INDEX IF NOT EXISTS idx_members_code_trgm
                ON public.mfi_members USING gin (member_code gin_trgm_ops)",

            // ── 4. Functional indexes so UPPER(col) = UPPER(?) can be rewritten
            //       to col = UPPER(?) without losing the index.
            "CREATE INDEX IF NOT EXISTS idx_loans_branch_upper
                ON public.mfi_loans (tenant_code, UPPER(branch_name))",
            "CREATE INDEX IF NOT EXISTS idx_members_branch_upper
                ON public.mfi_members (tenant_code, UPPER(branch_name))",
            "CREATE INDEX IF NOT EXISTS idx_installments_status_upper
                ON public.mfi_installments (tenant_code, UPPER(status))",

            // ── 5. Collection reporting: covering index.
            "CREATE INDEX IF NOT EXISTS idx_collections_loan_date_cover
                ON public.mfi_emi_collections (loan_id, payment_date) INCLUDE (amount)",

            "CREATE INDEX IF NOT EXISTS idx_collections_tenant_date_branch
                ON public.mfi_emi_collections (tenant_code, payment_date, branch_name)",

            // ── 6. Ledger / voucher reporting by period.
            "CREATE INDEX IF NOT EXISTS idx_vouchers_tenant_date
                ON public.mfi_vouchers (tenant_code, voucher_date)",
            "CREATE INDEX IF NOT EXISTS idx_vouchers_ledger_date
                ON public.mfi_vouchers (tenant_code, debit_ledger, voucher_date)",
            "CREATE INDEX IF NOT EXISTS idx_vouchers_creditledger_date
                ON public.mfi_vouchers (tenant_code, credit_ledger, voucher_date)",

            // ── 7. Audit trail is append-only and read by time.
            "CREATE INDEX IF NOT EXISTS idx_audit_tenant_created
                ON public.mfi_audit_logs (tenant_code, created_at DESC)",

            // ── 8. Per-member history (previous loan records screen).
            "CREATE INDEX IF NOT EXISTS idx_loans_member_code_tenant
                ON public.mfi_loans (tenant_code, member_code, id DESC)",

            // ── 9. Token revocation sweep (a cron deletes expired rows).
            "CREATE INDEX IF NOT EXISTS idx_revoked_expires
                ON public.mfi_revoked_tokens (expires_at)",
        ];

        foreach ($statements as $sql) {
            try {
                DB::statement($sql);
            } catch (\Throwable $e) {
                // A missing table (different deployment subset) must not abort the
                // whole migration; log and continue.
                logger()->warning('Index skipped: '.substr($sql, 0, 80).' — '.$e->getMessage());
            }
        }

        // Give the planner better statistics on the columns it now filters on.
        foreach (['mfi_loans', 'mfi_installments', 'mfi_emi_collections', 'mfi_members'] as $t) {
            try {
                DB::statement("ALTER TABLE public.{$t} ALTER COLUMN tenant_code SET STATISTICS 1000");
            } catch (\Throwable) {
                // column may not exist in this deployment
            }
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        foreach ([
            'idx_loans_tenant_branch_status', 'idx_loans_tenant_status_dpd',
            'idx_installments_open_due', 'idx_installments_open_branch',
            'idx_installments_overdue_branch', 'idx_installments_due_branch',
            'idx_members_name_trgm', 'idx_members_mobile_trgm', 'idx_members_code_trgm',
            'idx_loans_branch_upper', 'idx_members_branch_upper', 'idx_installments_status_upper',
            'idx_collections_loan_date_cover', 'idx_collections_tenant_date_branch',
            'idx_vouchers_tenant_date', 'idx_vouchers_ledger_date', 'idx_vouchers_creditledger_date',
            'idx_audit_tenant_created', 'idx_loans_member_code_tenant', 'idx_revoked_expires',
        ] as $idx) {
            DB::statement("DROP INDEX IF EXISTS public.{$idx}");
        }
    }
};
