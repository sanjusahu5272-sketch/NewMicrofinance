<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\CollectionsNpaService;
use App\Services\DoubleEntryLedgerService;
use App\Services\TreasuryReconciliationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * CollectionsNpaService Tests
 *
 * Covers the money-critical methods:
 *   - mapDpdToRbiAssetClass (delegates to RbiProvisioningEngine)
 *   - classifyPortfolioDpdSmaNpa (portfolio NPA classification)
 *   - assessOverduePenaltiesDecimal (overdue penalty calculation)
 *
 * These methods handle real money — a single wrong paisa here means
 * under-collecting or over-charging a borrower.
 */
class CollectionsNpaServiceTest extends TestCase
{
    use RefreshDatabase;
    private CollectionsNpaService $service;

    protected function setUp(): void
    {
        parent::setUp();

        // RLS requires tenant_code GUC to be set before any DB access
        DB::statement("SELECT set_config('app.tenant_code', 'TNT-NEEV-01', false)");

        $this->service = new CollectionsNpaService(
            new DoubleEntryLedgerService(),
            new TreasuryReconciliationService()
        );
    }

    // ── mapDpdToRbiAssetClass ────────────────────────────────────────────

    /** DPD 0 → STANDARD, not NPA. */
    public function test_map_dpd_zero_is_standard(): void
    {
        [$class, $rate] = $this->service->mapDpdToRbiAssetClass(0);

        $this->assertSame('STANDARD', $class);
        $this->assertFalse($this->isNpaClass($class));
    }

    /** DPD 90 → SMA-2, still not NPA. */
    public function test_map_dpd_90_is_sma2_not_npa(): void
    {
        [$class, $rate] = $this->service->mapDpdToRbiAssetClass(90);

        $this->assertSame('SMA-2', $class);
        $this->assertFalse($this->isNpaClass($class));
    }

    /** DPD 91 → SUB-STANDARD, first NPA day. */
    public function test_map_dpd_91_is_sub_standard_npa(): void
    {
        [$class, $rate] = $this->service->mapDpdToRbiAssetClass(91);

        $this->assertSame('SUB-STANDARD', $class);
        $this->assertTrue($this->isNpaClass($class));
        // RBI: sub-standard = 10% + 10% unsecured surcharge = 20% for JLG
        $this->assertSame('20.00', $rate);
    }

    /** DPD 630 → still SUB-STANDARD (18 months in NPA). */
    public function test_map_dpd_630_is_still_sub_standard(): void
    {
        [$class, $rate] = $this->service->mapDpdToRbiAssetClass(630);

        $this->assertSame('SUB-STANDARD', $class);
        $this->assertSame('20.00', $rate);
    }

    /** DPD 660 → DOUBTFUL-1 (19 months in NPA). */
    public function test_map_dpd_660_is_doubtful1(): void
    {
        [$class, $rate] = $this->service->mapDpdToRbiAssetClass(660);

        $this->assertSame('DOUBTFUL-1', $class);
        $this->assertTrue($this->isNpaClass($class));
        // Doubtful unsecured = 100% provision
        $this->assertSame('100.00', $rate);
    }

    /** DPD 1000 → DOUBTFUL-1 (12-30 months in NPA). */
    public function test_map_dpd_1000_is_doubtful1(): void
    {
        [$class, $rate] = $this->service->mapDpdToRbiAssetClass(1000);

        $this->assertSame('DOUBTFUL-1', $class);
        $this->assertSame('100.00', $rate);
    }

    /** DPD 1300 → DOUBTFUL-2 (30-36 months in NPA). */
    public function test_map_dpd_1300_is_doubtful2(): void
    {
        [$class, $rate] = $this->service->mapDpdToRbiAssetClass(1300);

        $this->assertSame('DOUBTFUL-2', $class);
        $this->assertSame('100.00', $rate);
    }

    /** DPD very high → DOUBTFUL-3. */
    public function test_map_dpd_2000_is_doubtful3(): void
    {
        [$class, $rate] = $this->service->mapDpdToRbiAssetClass(2000);

        $this->assertSame('DOUBTFUL-3', $class);
        $this->assertSame('100.00', $rate);
    }

    /** Boundary: DPD 90 vs 91 — the NPA threshold. */
    public function test_npa_threshold_boundary(): void
    {
        // Day 90 is SMA-2, day 91 is NPA
        $class90 = $this->service->mapDpdToRbiAssetClass(90)[0];
        $class91 = $this->service->mapDpdToRbiAssetClass(91)[0];

        $this->assertNotSame($class90, $class91);
        $this->assertSame('SMA-2', $class90);
        $this->assertSame('SUB-STANDARD', $class91);
    }

    /**
     * Ladder monotonicity: provision rate never decreases as DPD increases.
     * If rate goes down at any DPD, the RBI ladder is broken.
     */
    public function test_provision_rate_never_decreases_with_dpd(): void
    {
        $prevRate = '0.00';
        for ($dpd = 0; $dpd <= 2000; $dpd += 1) {
            [$class, $rate] = $this->service->mapDpdToRbiAssetClass($dpd);
            if ($this->isNpaClass($class)) {
                $this->assertGreaterThanOrEqual(
                    bccomp($prevRate, '0.00', 2) === 0 ? '0.00' : $prevRate,
                    $rate,
                    "DPD $dpd ($class): rate $rate < prev $prevRate"
                );
                $prevRate = $rate;
            }
        }
    }

    // ── classifyPortfolioDpdSmaNpa ─────────────────────────────────────

    /**
     * Empty portfolio → zero counts, zero percentages.
     * Must not crash or return NaN.
     */
    public function test_classify_empty_portfolio(): void
    {
        $result = $this->service->classifyPortfolioDpdSmaNpa(
            asOfDate: '2026-12-31',
            branchName: 'TEST-BRANCH-NONEXISTENT',
            persist: false
        );

        $this->assertIsArray($result);
        $this->assertSame(0, $result['total_active_loans'] ?? 0);
        $this->assertSame('0.00', (string) ($result['gnpa_ratio_pct'] ?? '0.00'));
    }

    /**
     * All-standard portfolio → GNPA = 0%.
     */
    public function test_classify_all_standard(): void
    {
        DB::table('mfi_loans')->insert([
            'tenant_code' => 'TNT-NEEV-01',
            'application_no' => 'APP-COL-STD-001',
            'loan_id' => 'LN-COL-STD-001',
            'member_id' => 1,
            'member_code' => 'M0000001',
            'member_name' => 'Test Standard',
            'branch_name' => 'TEST-COL',
            'plan_name' => 'TEST-STD-PLAN',
            'application_date' => '2026-01-01',
            'plan_amount' => 50000.00,
            'disbursement_amount' => 50000.00,
            'total_interest' => 12000.00,
            'total_repayable' => 62000.00,
            'emi_amount' => 4500.00,
            'tenure_emis' => 12,
            'interest_rate_pa' => 18.00,
            'principal_outstanding' => 20000.00,
            'interest_outstanding' => 4000.00,
            'total_outstanding' => 24000.00,
            'status' => 'DISBURSED',
            'dpd_days' => 0,
            'asset_class' => 'STANDARD',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Paid installments — all on time, no DPD
        DB::table('mfi_installments')->insert([
            'tenant_code' => 'TNT-NEEV-01',
            'loan_id' => 'LN-COL-STD-001',
            'loan_pk' => 1,
            'member_code' => 'M0000001',
            'member_name' => 'Test Standard',
            'branch_name' => 'TEST-COL',
            'emi_no' => 1,
            'emi_amount' => 4500.00,
            'principal_component' => 3500.00,
            'interest_component' => 1000.00,
            'due_date' => '2026-12-01',
            'paid_amount' => 4500.00,
            'paid_date' => '2026-12-01',
            'status' => 'PAID',
            'dpd_days' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $result = $this->service->classifyPortfolioDpdSmaNpa(
            asOfDate: '2026-12-31',
            branchName: 'TEST-COL',
            persist: false
        );

        $this->assertSame(1, $result['total_active_loans'] ?? 0);
        $this->assertSame(0, $result['npa_loans_count'] ?? 0);
        $this->assertSame('0.00', (string) ($result['gnpa_ratio_pct'] ?? '0.00'));
    }

    /**
     * One NPA loan in portfolio → GNPA = 100%.
     */
    public function test_classify_with_one_npa(): void
    {
        DB::table('mfi_loans')->insert([
            'tenant_code' => 'TNT-NEEV-01',
            'application_no' => 'APP-COL-NPA-001',
            'loan_id' => 'LN-COL-NPA-001',
            'member_id' => 1,
            'member_code' => 'M0000001',
            'member_name' => 'Test NPA',
            'branch_name' => 'TEST-COL2',
            'plan_name' => 'TEST-NPA-PLAN',
            'application_date' => '2026-01-01',
            'plan_amount' => 50000.00,
            'disbursement_amount' => 50000.00,
            'total_interest' => 12000.00,
            'total_repayable' => 62000.00,
            'emi_amount' => 4500.00,
            'tenure_emis' => 12,
            'interest_rate_pa' => 18.00,
            'principal_outstanding' => 20000.00,
            'interest_outstanding' => 4000.00,
            'total_outstanding' => 24000.00,
            'status' => 'DISBURSED',
            'dpd_days' => 120,
            'asset_class' => 'SUB-STANDARD',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Create overdue installments — due_date 120+ days before 2026-12-31
        DB::table('mfi_installments')->insert([
            'tenant_code' => 'TNT-NEEV-01',
            'loan_id' => 'LN-COL-NPA-001',
            'loan_pk' => 2,
            'member_code' => 'M0000001',
            'member_name' => 'Test NPA',
            'branch_name' => 'TEST-COL2',
            'emi_no' => 1,
            'emi_amount' => 4500.00,
            'principal_component' => 3500.00,
            'interest_component' => 1000.00,
            'due_date' => '2026-08-01',
            'paid_amount' => 0.00,
            'status' => 'DUE',
            'dpd_days' => 152,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $result = $this->service->classifyPortfolioDpdSmaNpa(
            asOfDate: '2026-12-31',
            branchName: 'TEST-COL2',
            persist: false
        );

        $this->assertSame(1, $result['total_active_loans'] ?? 0);
        $this->assertSame(1, $result['npa_loans_count'] ?? 0);
        $this->assertSame('100.00', (string) ($result['gnpa_ratio_pct'] ?? '0.00'));
    }

    /**
     * Mixed portfolio: 1 standard + 1 NPA → GNPA = 50%.
     */
    public function test_classify_mixed_portfolio(): void
    {
        DB::table('mfi_loans')->insert([
            'tenant_code' => 'TNT-NEEV-01',
            'application_no' => 'APP-COL-MIX-001',
            'loan_id' => 'LN-COL-MIX-001',
            'member_id' => 1,
            'member_code' => 'M0000001',
            'member_name' => 'Test Standard 2',
            'branch_name' => 'TEST-COL3',
            'plan_name' => 'TEST-MIX-STD-PLAN',
            'application_date' => '2026-01-01',
            'plan_amount' => 50000.00,
            'disbursement_amount' => 50000.00,
            'total_interest' => 12000.00,
            'total_repayable' => 62000.00,
            'emi_amount' => 4500.00,
            'tenure_emis' => 12,
            'interest_rate_pa' => 18.00,
            'principal_outstanding' => 20000.00,
            'interest_outstanding' => 4000.00,
            'total_outstanding' => 24000.00,
            'status' => 'DISBURSED',
            'dpd_days' => 0,
            'asset_class' => 'STANDARD',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('mfi_installments')->insert([
            'tenant_code' => 'TNT-NEEV-01',
            'loan_id' => 'LN-COL-MIX-001',
            'loan_pk' => 3,
            'member_code' => 'M0000001',
            'member_name' => 'Test Standard 2',
            'branch_name' => 'TEST-COL3',
            'emi_no' => 1,
            'emi_amount' => 4500.00,
            'principal_component' => 3500.00,
            'interest_component' => 1000.00,
            'due_date' => '2026-12-01',
            'paid_amount' => 4500.00,
            'paid_date' => '2026-12-01',
            'status' => 'PAID',
            'dpd_days' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('mfi_loans')->insert([
            'tenant_code' => 'TNT-NEEV-01',
            'application_no' => 'APP-COL-MIX-002',
            'loan_id' => 'LN-COL-MIX-002',
            'member_id' => 2,
            'member_code' => 'M0000002',
            'member_name' => 'Test NPA 2',
            'branch_name' => 'TEST-COL3',
            'plan_name' => 'TEST-MIX-NPA-PLAN',
            'application_date' => '2026-01-01',
            'plan_amount' => 50000.00,
            'disbursement_amount' => 50000.00,
            'total_interest' => 12000.00,
            'total_repayable' => 62000.00,
            'emi_amount' => 4500.00,
            'tenure_emis' => 12,
            'interest_rate_pa' => 18.00,
            'principal_outstanding' => 20000.00,
            'interest_outstanding' => 4000.00,
            'total_outstanding' => 24000.00,
            'status' => 'DISBURSED',
            'dpd_days' => 120,
            'asset_class' => 'SUB-STANDARD',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('mfi_installments')->insert([
            'tenant_code' => 'TNT-NEEV-01',
            'loan_id' => 'LN-COL-MIX-002',
            'loan_pk' => 4,
            'member_code' => 'M0000002',
            'member_name' => 'Test NPA 2',
            'branch_name' => 'TEST-COL3',
            'emi_no' => 1,
            'emi_amount' => 4500.00,
            'principal_component' => 3500.00,
            'interest_component' => 1000.00,
            'due_date' => '2026-08-01',
            'paid_amount' => 0.00,
            'status' => 'DUE',
            'dpd_days' => 152,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $result = $this->service->classifyPortfolioDpdSmaNpa(
            asOfDate: '2026-12-31',
            branchName: 'TEST-COL3',
            persist: false
        );

        $this->assertSame(2, $result['total_active_loans'] ?? 0);
        $this->assertSame(1, $result['npa_loans_count'] ?? 0);
        // 1 NPA out of 2 = 50% GNPA
        $this->assertSame('50.00', (string) ($result['gnpa_ratio_pct'] ?? '0.00'));
    }

    // ── assessOverduePenaltiesDecimal ───────────────────────────────────

    /**
     * No overdue installments → zero penalty, zero updates.
     */
    public function test_assess_no_overdue(): void
    {
        $result = $this->service->assessOverduePenaltiesDecimal(
            asOfDate: '2026-12-31',
            actorCode: 'TEST',
            tenantCode: 'TNT-NEEV-01'
        );

        $this->assertIsArray($result);
        $this->assertSame(0, $result['updated_installments'] ?? 0);
        $this->assertSame(0, $result['affected_loans_count'] ?? 0);
        $this->assertSame('0.00', $result['total_net_penalty_due_assessed'] ?? '0.00');
    }

    /**
     * Verify return structure has expected keys.
     */
    public function test_assess_returns_expected_structure(): void
    {
        $result = $this->service->assessOverduePenaltiesDecimal(
            asOfDate: '2026-12-31',
            actorCode: 'TEST',
            tenantCode: 'TNT-NEEV-01'
        );

        $this->assertArrayHasKey('as_of_date', $result);
        $this->assertArrayHasKey('updated_installments', $result);
        $this->assertArrayHasKey('affected_loans_count', $result);
        $this->assertArrayHasKey('total_net_penalty_due_assessed', $result);
    }

    /**
     * Verify penalty is never negative.
     */
    public function test_assess_penalty_never_negative(): void
    {
        $result = $this->service->assessOverduePenaltiesDecimal(
            asOfDate: '2026-12-31',
            actorCode: 'TEST',
            tenantCode: 'TNT-NEEV-01'
        );

        $penalty = $result['total_net_penalty_due_assessed'] ?? '0.00';
        $this->assertGreaterThanOrEqual(0, bccomp($penalty, '0.00', 2), 'Penalty must be >= 0');
    }

    // ── Helper ─────────────────────────────────────────────────────────

    private function isNpaClass(string $class): bool
    {
        return in_array($class, [
            'SUB-STANDARD',
            'DOUBTFUL-1',
            'DOUBTFUL-2',
            'DOUBTFUL-3',
            'LOSS',
        ], true);
    }
}
