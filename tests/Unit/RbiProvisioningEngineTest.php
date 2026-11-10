<?php
declare(strict_types=1);

namespace Tests\Unit;

use App\Services\RbiProvisioningEngine;
use PHPUnit\Framework\TestCase;

/**
 * RBI IRACP provisioning, verified against the published rate ladder.
 *
 * Rules under test (NBFC Directions 14.1 / IRACP 2025):
 *   Standard / SMA       : 0.25% of outstanding (configurable)
 *   Sub-standard (≤18 mo): 10% of outstanding + extra 10% on unsecured slice
 *   Doubtful ≤1 year     : 100% unsecured + 25% secured
 *   Doubtful 1–3 years   : 100% unsecured + 40% secured
 *   Doubtful >3 years    : 100% unsecured + 100% secured
 */
class RbiProvisioningEngineTest extends TestCase
{
    private RbiProvisioningEngine $e;

    protected function setUp(): void
    {
        parent::setUp();
        $this->e = new RbiProvisioningEngine();
    }

    /** Day 90 is SMA-2 (not yet NPA); day 91 is NPA. The classic off-by-one. */
    public function test_npa_boundary_is_exactly_91(): void
    {
        $d90 = $this->e->classifyLoan(90, '100000.00');
        $d91 = $this->e->classifyLoan(91, '100000.00');

        $this->assertFalse($d90['is_npa']);
        $this->assertSame('SMA-2', $d90['asset_class']);
        $this->assertTrue($d91['is_npa']);
        $this->assertSame('SUB-STANDARD', $d91['asset_class']);
    }

    /** Standard asset: 0.25% of outstanding. */
    public function test_standard_provision_rate(): void
    {
        $r = $this->e->classifyLoan(0, '1000000.00');
        $this->assertSame('STANDARD', $r['asset_class']);
        $this->assertSame('2500.00', $r['provision']);   // 0.25% of 10,00,000
    }

    /**
     * Fully unsecured JLG loan at 91 DPD: 10% + extra 10% = 20% of outstanding.
     * This is the classic MFI case and the one the old blended "15%" got wrong.
     */
    public function test_unsecured_substandard_is_twenty_percent(): void
    {
        $r = $this->e->classifyLoan(91, '50000.00', '0.00');
        $this->assertSame('SUB-STANDARD', $r['asset_class']);
        $this->assertSame('0.00', $r['secured_portion']);
        $this->assertSame('50000.00', $r['unsecured_portion']);
        $this->assertSame('10000.00', $r['provision']);   // 10% base + 10% unsecured
        $this->assertSame('20.00', $r['provision_rate_pct']);
    }

    /** Fully SECURED sub-standard (gold loan): only the 10% base applies. */
    public function test_secured_substandard_is_ten_percent(): void
    {
        $r = $this->e->classifyLoan(91, '50000.00', '50000.00');
        $this->assertSame('0.00', $r['unsecured_portion']);
        $this->assertSame('5000.00', $r['provision']);
        $this->assertSame('10.00', $r['provision_rate_pct']);
    }

    /** Security is capped at the exposure — collateral can't exceed the debt. */
    public function test_security_is_capped_at_outstanding(): void
    {
        $r = $this->e->classifyLoan(91, '30000.00', '900000.00');
        $this->assertSame('30000.00', $r['secured_portion']);
        $this->assertSame('0.00', $r['unsecured_portion']);
    }

    /** Partially secured: 10% base on all + 10% extra on the unsecured slice. */
    public function test_partially_secured_substandard(): void
    {
        // 100000 outstanding, 60000 gold security → 40000 unsecured
        $r = $this->e->classifyLoan(120, '100000.00', '60000.00');
        $this->assertSame('60000.00', $r['secured_portion']);
        $this->assertSame('40000.00', $r['unsecured_portion']);
        // 10% of 100000 = 10000, + 10% of 40000 = 4000 → 14000
        $this->assertSame('14000.00', $r['provision']);
    }

    /**
     * Doubtful-1 starts once the account has been NPA for MORE than 18 months.
     * DPD 630 → 540 days in NPA → exactly 18 months → still sub-standard.
     * DPD 660 → 570 days in NPA → 19 months → doubtful.
     */
    public function test_doubtful_start_is_after_eighteen_months_of_npa(): void
    {
        $this->assertSame('SUB-STANDARD', $this->e->classifyLoan(630, '100000.00')['asset_class']);
        $this->assertSame('SUB-STANDARD', $this->e->classifyLoan(631, '100000.00')['asset_class']);
        $this->assertSame('DOUBTFUL-1', $this->e->classifyLoan(660, '100000.00')['asset_class']);
    }

    /** Doubtful-1: 100% unsecured + 25% secured. */
    public function test_doubtful_1_unsecured_and_secured(): void
    {
        $allUnsecured = $this->e->classifyLoan(700, '100000.00', '0.00');
        $this->assertSame('DOUBTFUL-1', $allUnsecured['asset_class']);
        $this->assertSame('100000.00', $allUnsecured['provision']);

        $allSecured = $this->e->classifyLoan(700, '100000.00', '100000.00');
        $this->assertSame('25000.00', $allSecured['provision']);   // 25%
    }

    /** Doubtful-2 (13–36 months doubtful): 40% secured. */
    public function test_doubtful_2_is_forty_percent_secured(): void
    {
        // 18mo sub-std (540) + 90 (NPA) + 13 months doubtful ≈ 1080 DPD
        $r = $this->e->classifyLoan(1080, '100000.00', '100000.00');
        $this->assertSame('DOUBTFUL-2', $r['asset_class']);
        $this->assertSame('40000.00', $r['provision']);
    }

    /** Doubtful-3 (>36 months doubtful): 100% secured. */
    public function test_doubtful_3_is_full_provision(): void
    {
        $r = $this->e->classifyLoan(2000, '100000.00', '100000.00');
        $this->assertSame('DOUBTFUL-3', $r['asset_class']);
        $this->assertSame('100000.00', $r['provision']);
    }

    /** Portfolio roll-up must tie: bucket sum === total, no money lost. */
    public function test_portfolio_rollup_ties_out(): void
    {
        $loans = [
            ['dpd' => 0, 'outstanding' => '100000.00', 'security_value' => '0.00'],
            ['dpd' => 45, 'outstanding' => '50000.00', 'security_value' => '0.00'],
            ['dpd' => 91, 'outstanding' => '40000.00', 'security_value' => '0.00'],
            ['dpd' => 120, 'outstanding' => '60000.00', 'security_value' => '20000.00'],
            ['dpd' => 700, 'outstanding' => '25000.00', 'security_value' => '0.00'],
            ['dpd' => 1500, 'outstanding' => '15000.00', 'security_value' => '10000.00'],
        ];
        $r = $this->e->classifyPortfolio($loans);

        $sumOut = '0.00';
        $sumProv = '0.00';
        foreach ($r['buckets'] as $b) {
            $sumOut = \App\Services\BcMathCalculator::add($sumOut, $b['outstanding'], 2);
            $sumProv = \App\Services\BcMathCalculator::add($sumProv, $b['provision'], 2);
        }
        $this->assertSame($sumOut, $r['totals']['portfolio_outstanding']);
        $this->assertSame($sumProv, $r['totals']['provision_required']);
        $this->assertSame('290000.00', $r['totals']['portfolio_outstanding']);
    }

    /** GNPA % and coverage ratio must be arithmetically right. */
    public function test_npa_ratios(): void
    {
        $r = $this->e->classifyPortfolio([
            ['dpd' => 0,   'outstanding' => '75000.00'],
            ['dpd' => 200, 'outstanding' => '25000.00'],
        ]);
        // NPA = 25000 of 100000 = 25%
        $this->assertSame('25000.00', $r['totals']['npa_outstanding']);
        $this->assertSame('25.00', $r['totals']['gross_npa_pct']);
        // Sub-standard fully unsecured → provision 5000 → coverage 20%
        $this->assertSame('5000.00', $r['totals']['npa_provision']);
        $this->assertSame('20.00', $r['totals']['provision_coverage_pct']);
        // Net NPA = 25000 − 5000
        $this->assertSame('20000.00', $r['totals']['net_npa']);
    }

    /** Zero-value inputs must not divide by zero anywhere. */
    public function test_zero_portfolio_is_safe(): void
    {
        $r = $this->e->classifyPortfolio([]);
        $this->assertSame('0.00', $r['totals']['gross_npa_pct']);
        $this->assertSame('0.00', $r['totals']['provision_coverage_pct']);
        $this->assertSame('0.00', $r['totals']['portfolio_outstanding']);
    }
}
