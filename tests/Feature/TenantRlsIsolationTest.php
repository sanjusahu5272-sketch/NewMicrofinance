<?php
declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * VULN-004 regression guard.
 *
 * These tests fail loudly if anyone ever drops FORCE ROW LEVEL SECURITY, runs
 * migrations as the application role, or "helpfully" re-grants BYPASSRLS.
 */
class TenantRlsIsolationTest extends TestCase
{
    private const T1 = 'TNT-TEST-A';
    private const T2 = 'TNT-TEST-B';

    protected function setUp(): void
    {
        parent::setUp();
        DB::statement("SELECT set_config('app.is_superadmin','on',false)");
        DB::table('mfi_members')->whereIn('tenant_code', [self::T1, self::T2])->delete();

        DB::table('mfi_members')->insert([
            ['tenant_code' => self::T1, 'member_code' => 'A-1', 'name' => 'Alpha One', 'mobile' => '9111111111', 'created_at' => now(), 'updated_at' => now()],
            ['tenant_code' => self::T2, 'member_code' => 'B-1', 'name' => 'Bravo One', 'mobile' => '9222222222', 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    /** A tenant must never see another tenant's members — even with no WHERE clause. */
    public function test_tenant_sees_only_its_own_rows(): void
    {
        DB::statement("SELECT set_config('app.is_superadmin','off',false)");
        DB::statement("SELECT set_config('app.tenant_code',?,false)", [self::T1]);

        $rows = DB::table('mfi_members')->get();   // deliberately NO where clause

        $this->assertCount(1, $rows, 'RLS leaked rows across tenants');
        $this->assertSame(self::T1, $rows->first()->tenant_code);
    }

    /** Even an explicit cross-tenant filter must return nothing. */
    public function test_explicit_cross_tenant_query_returns_nothing(): void
    {
        DB::statement("SELECT set_config('app.is_superadmin','off',false)");
        DB::statement("SELECT set_config('app.tenant_code',?,false)", [self::T1]);

        $rows = DB::table('mfi_members')->where('tenant_code', self::T2)->get();
        $this->assertCount(0, $rows);
    }

    /** Writing into another tenant must be refused by the database. */
    public function test_cross_tenant_insert_is_blocked(): void
    {
        DB::statement("SELECT set_config('app.is_superadmin','off',false)");
        DB::statement("SELECT set_config('app.tenant_code',?,false)", [self::T1]);

        $this->expectException(\Illuminate\Database\QueryException::class);

        DB::table('mfi_members')->insert([
            'tenant_code' => self::T2, 'member_code' => 'HACK-1',
            'name' => 'Injected', 'mobile' => '9333333333',
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    /** FORCE RLS must be on — otherwise the table owner silently bypasses everything. */
    public function test_force_row_level_security_is_enabled(): void
    {
        $tables = ['mfi_members', 'mfi_loans', 'mfi_installments', 'mfi_emi_collections', 'mfi_vouchers'];

        foreach ($tables as $table) {
            $row = DB::selectOne(
                'SELECT relrowsecurity, relforcerowsecurity FROM pg_class c
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = ? AND c.relname = ?',
                ['public', $table]
            );
            $this->assertNotNull($row, "{$table} not found");
            $this->assertTrue((bool) $row->relrowsecurity, "{$table}: RLS not enabled");
            $this->assertTrue((bool) $row->relforcerowsecurity, "{$table}: FORCE RLS missing — owner bypass is live");
        }
    }

    /** The audit trail must stay append-only. */
    public function test_audit_log_is_append_only(): void
    {
        DB::statement("SELECT set_config('app.is_superadmin','on',false)");
        DB::table('mfi_audit_logs')->insert([
            'tenant_code' => self::T1, 'user_code' => 'TESTER', 'action' => 'PROBE',
            'module' => 'test', 'record_id' => '1', 'details' => '{}',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->expectException(\Illuminate\Database\QueryException::class);
        DB::table('mfi_audit_logs')->where('action', 'PROBE')->update(['action' => 'TAMPERED']);
    }

    /** Deleting a posted voucher must be refused. */
    public function test_voucher_delete_is_blocked(): void
    {
        DB::statement("SELECT set_config('app.is_superadmin','on',false)");
        DB::table('mfi_vouchers')->insert([
            'tenant_code' => self::T1, 'voucher_no' => 'V-TEST-'.bin2hex(random_bytes(4)), 'voucher_date' => '2026-01-01',
            'voucher_type' => 'JOURNAL', 'branch_name' => 'HO', 'particular' => 'probe-'.bin2hex(random_bytes(4)),
            'debit_ledger' => 'CASH', 'credit_ledger' => 'LOAN PORTFOLIO RECEIVABLE',
            'amount_dr' => '100.00', 'amount_cr' => '100.00',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->expectException(\Illuminate\Database\QueryException::class);
        DB::table('mfi_vouchers')->where('branch_name','HO')->delete();
    }
}
