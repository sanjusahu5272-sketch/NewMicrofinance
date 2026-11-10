<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Removes RLS from the two AUTHENTICATION tables.
 *
 * mfi_employees and mfi_branches are read BEFORE a tenant is known — that is the
 * whole point of a login request. A tenant policy on them makes the login query
 * return zero rows, which presents to the user as "wrong password" and to the
 * operator as an unexplainable lockout.
 *
 * These tables stay protected by:
 *   - globally unique user_code / branch code
 *   - the signed token, which pins exactly one tenant for every later request
 *   - RequireAuthentication on every business route
 *
 * All customer, loan, money and audit tables keep FORCE RLS.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        foreach (['mfi_employees', 'mfi_branches'] as $table) {
            DB::statement("DROP POLICY IF EXISTS {$table}_tenant_isolation ON public.{$table}");
            DB::statement("ALTER TABLE public.{$table} NO FORCE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE public.{$table} DISABLE ROW LEVEL SECURITY");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        foreach (['mfi_employees', 'mfi_branches'] as $table) {
            DB::statement("ALTER TABLE public.{$table} ENABLE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE public.{$table} FORCE ROW LEVEL SECURITY");
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
};
