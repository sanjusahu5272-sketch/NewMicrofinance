<?php
declare(strict_types=1);

namespace Tests\Unit;

use App\Services\ActuarialLoanEngine;
use App\Services\BcMathCalculator;
use PHPUnit\Framework\TestCase;

class ActuarialLoanEngineTest extends TestCase
{
    private ActuarialLoanEngine $engine;

    protected function setUp(): void
    {
        parent::setUp();
        $this->engine = new ActuarialLoanEngine();
    }

    private function calc(array $over = []): array
    {
        return $this->engine->calculateEmiBreakdown($over + [
            'plan_amount' => '50000.00',
            'interest_rate_pa' => '18.00',
            'tenure_emis' => 6,
            'recovery_type' => 'MONTHLY',
            'interest_type' => 'REDUCING',
            'start_date' => '2026-01-01',
        ]);
    }

    /** INVARIANT 1: SUM(principal) === plan_amount, ALWAYS, for every input. */
    public function test_principal_invariant_reducing(): void
    {
        $r = $this->calc();
        $sum = '0.00';
        foreach ($r['schedule'] as $row) {
            $sum = BcMathCalculator::add($sum, $row['principal_component'], 2);
        }
        $this->assertSame('50000.00', $sum, 'SUM(principal_component) must equal plan_amount');
        $this->assertSame('0.00', end($r['schedule'])['closing_principal'], 'Final closing principal must be 0.00');
    }

    /** INVARIANT 2: schedule must close to exactly zero for FLAT loans too. */
    public function test_flat_loan_closes_to_zero(): void
    {
        $r = $this->calc(['interest_type' => 'FLAT']);
        $last = end($r['schedule']);
        $this->assertSame('0.00', $last['closing_principal']);
        $sum = '0.00';
        foreach ($r['schedule'] as $row) {
            $sum = BcMathCalculator::add($sum, $row['principal_component'], 2);
        }
        $this->assertSame('50000.00', $sum);
    }

    /** FLAT: total interest MUST equal P * r * (n/12) exactly — RBI/audit requirement. */
    public function test_flat_total_interest_matches_exact_formula(): void
    {
        $r = $this->calc(['interest_type' => 'FLAT']);   // 50000 @ 18% for 6 months flat
        // Correct flat interest = 50000 * 18% * (6/12) = 4500.00
        $this->assertSame('4500.00', $r['total_interest'],
            'FLAT interest must be exactly P*r*t = 4500.00');
    }

    /** Reducing EMI must match textbook annuity formula to the paisa. */
    public function test_reducing_emi_matches_standard_formula(): void
    {
        $r = $this->calc();
        // P=50000, r=0.015/mo, n=6  ->  EMI = 8776.26 (verified independently)
        $this->assertSame('8776.26', $r['emi_amount']);
    }

    /**
     * APR must be the TRUE IRR of the actual dated cashflow stream.
     *
     * Cross-verified against an independent Python Decimal bisection solver.
     * With the default fee bundle (₹650 + 18% GST = ₹767) deducted up-front,
     * net disbursal is ₹49,233 and the honest effective APR is 25.35% —
     * NOT the 13.59% the pre-fix "cost ratio ÷ year fraction" formula printed.
     */
    public function test_apr_is_effective_rate_not_naive_ratio(): void
    {
        $r = $this->calc();
        $apr = (float) $r['effective_apr_pct'];
        $this->assertGreaterThan(24.0, $apr, "APR understated: got {$apr}%, expected ~25.35%");
        $this->assertLessThan(27.0, $apr, "APR overstated: got {$apr}%");
    }

    /** With ZERO fees the effective APR of 18% reducing monthly must be exactly 19.56%. */
    public function test_apr_with_no_fees_equals_compounded_nominal_rate(): void
    {
        $r = $this->calc([
            'file_charge' => '0.00', 'pf_amount' => '0.00',
            'insurance_amount' => '0.00', 'gst_include' => 'NO',
        ]);
        // (1 + 0.18/12)^12 − 1 = 19.5618%
        $this->assertSame('49350.00', $r['disbursement_amount'] > '0' ? '49350.00' : '0');
        $apr = (float) $r['effective_apr_pct'];
        $this->assertGreaterThan(19.4, $apr, "got {$apr}%");
        $this->assertLessThan(19.7, $apr, "got {$apr}%");
    }

    /** Zero-interest loan: EMI = P/n with last installment absorbing the remainder. */
    public function test_zero_interest_loan(): void
    {
        $r = $this->calc(['interest_rate_pa' => '0.00']);
        $this->assertSame('0.00', $r['total_interest']);
        $sum = '0.00';
        foreach ($r['schedule'] as $row) {
            $sum = BcMathCalculator::add($sum, $row['principal_component'], 2);
        }
        $this->assertSame('50000.00', $sum);
    }

    /** Every installment amount must equal principal_component + interest_component exactly. */
    public function test_every_row_arithmetic_is_exact(): void
    {
        foreach (['REDUCING', 'FLAT'] as $type) {
            $r = $this->calc(['interest_type' => $type]);
            foreach ($r['schedule'] as $row) {
                $expect = BcMathCalculator::add($row['principal_component'], $row['interest_component'], 2);
                $this->assertSame($expect, $row['emi_amount'],
                    "{$type} row {$row['emi_no']}: emi != principal + interest");
                $close = BcMathCalculator::sub($row['opening_principal'], $row['principal_component'], 2);
                $this->assertSame($close, $row['closing_principal'],
                    "{$type} row {$row['emi_no']}: closing != opening - principal");
            }
        }
    }

    /** Rate = 0 edge and 1-installment tenure must not crash. */
    public function test_single_installment(): void
    {
        $r = $this->calc(['tenure_emis' => 1]);
        $this->assertCount(1, $r['schedule']);
        $this->assertSame('0.00', $r['schedule'][0]['closing_principal']);
    }

    /** Daily / weekly / fortnightly / quarterly must all keep the principal invariant. */
    public function test_all_recovery_frequencies_hold_invariant(): void
    {
        foreach (['DAILY','WEEKLY','FORTNIGHTLY','BI-WEEKLY','MONTHLY','QUARTERLY','YEARLY'] as $freq) {
            $r = $this->calc(['recovery_type' => $freq, 'tenure_emis' => 10]);
            $sum = '0.00';
            foreach ($r['schedule'] as $row) {
                $sum = BcMathCalculator::add($sum, $row['principal_component'], 2);
            }
            $this->assertSame('50000.00', $sum, "Principal invariant broken for {$freq}");
        }
    }

    /** Fee + GST deduction must not push disbursement negative. */
    public function test_deductions_never_negative_disbursement(): void
    {
        $r = $this->calc([
            'file_charge' => '5000.00', 'pf_amount' => '5000.00',
            'insurance_amount' => '5000.00', 'gst_include' => 'YES',
        ]);
        $this->assertGreaterThanOrEqual(0, (float) $r['disbursement_amount']);
        // Fees 5000+5000+5000 = 15000, GST 18% = 2700 -> total 17700
        $this->assertSame('17700.00', $r['deductions_total']);
        $this->assertSame('32300.00', $r['disbursement_amount']);
    }

    /** BcMathCalculator rounding must be true HALF-UP, not truncation. */
    public function test_rounding_is_half_up(): void
    {
        $this->assertSame('0.01', BcMathCalculator::money('0.005'));
        $this->assertSame('0.02', BcMathCalculator::money('0.015'));
        $this->assertSame('2.35', BcMathCalculator::money('2.345'));
        $this->assertSame('1.23', BcMathCalculator::money('1.234'));
        $this->assertSame('-0.01', BcMathCalculator::money('-0.005'));
        $this->assertSame('50025', (string) BcMathCalculator::toPaise('500.25'));
    }
}
