<?php

declare(strict_types=1);

namespace App\Services;

use DateInterval;
use DateTimeImmutable;
use InvalidArgumentException;
use RuntimeException;

/**
 * Pure BCMath Actuarial Loan & Product Loan Engine (Zero Floats).
 *
 * Enforces:
 * - Intermediate calculations at scale = 6 (`bcadd`, `bcsub`, `bcmul`, `bcdiv`, `bcpow`).
 * - Final schedule & ledger amounts at scale = 2.
 * - Deterministic final-installment penny rounding adjustment so
 *   `SUM(installment.principal_component) === loan.plan_amount` is ALWAYS 100% true.
 */
class ActuarialLoanEngine
{
    public function calculateEmiBreakdown(array $input): array
    {
        $principal = BcMathCalculator::money((string) ($input['plan_amount'] ?? '0.00'));
        $ratePa = BcMathCalculator::normalize((string) ($input['interest_rate_pa'] ?? '24.00'), BcMathCalculator::INTERMEDIATE_SCALE);
        $tenure = (int) ($input['tenure_emis'] ?? 12);
        $recoveryType = strtoupper(trim((string) ($input['recovery_type'] ?? 'MONTHLY')));
        $interestType = strtoupper(str_replace(' ', '_', trim((string) ($input['interest_type'] ?? 'REDUCING'))));
        $planType = strtoupper(trim((string) ($input['plan_type'] ?? 'NORMAL PLAN')));
        $holidayExclude = in_array(strtoupper((string) ($input['holiday_exclude'] ?? 'NO')), ['YES', 'TRUE', '1'], true);
        $customDays = max(1, (int) ($input['custom_days'] ?? 5));
        $customEmi = BcMathCalculator::money((string) ($input['custom_emi_amount'] ?? '0.00'));

        if (BcMathCalculator::comp($principal, '0.00') <= 0) {
            throw new InvalidArgumentException('Plan amount must be greater than zero.');
        }
        if ($tenure <= 0 && !str_contains($planType, 'PREMIUM')) {
            throw new InvalidArgumentException('Tenure must be at least 1 installment.');
        }
        $n = max(1, $tenure);
        $nStr = (string) $n;

        [$stepDays, $periodsPerYear, $intervalLabel] = match (true) {
            str_contains($recoveryType, 'DAILY') => [1, '365.000000', '1 Din (Daily)'],
            str_contains($recoveryType, 'BI') => [14, '26.000000', '14 Din (Bi-Weekly)'],
            str_contains($recoveryType, 'FORT') => [15, '24.000000', '15 Din (Fortnightly)'],
            str_contains($recoveryType, 'WEEK') => [7, '52.000000', '7 Din (Weekly)'],
            str_contains($recoveryType, 'QUARTER') => [90, '4.000000', '90 Din (Quarterly)'],
            str_contains($recoveryType, 'HALF') => [180, '2.000000', '180 Din (Half-Yearly)'],
            str_contains($recoveryType, 'YEAR') || str_contains($recoveryType, 'ONE') => [365, '1.000000', '365 Din (Yearly)'],
            str_contains($recoveryType, 'CUSTOM') => [$customDays, BcMathCalculator::div('365', (string) $customDays), "{$customDays} Din (Custom)"],
            default => [30, '12.000000', '30 Din (Monthly)'],
        };

        $fileChargeType = strtoupper((string) ($input['file_charge_type'] ?? 'FIXED'));
        $fileChargePct = BcMathCalculator::normalize((string) ($input['file_charge_pct'] ?? '0'), BcMathCalculator::INTERMEDIATE_SCALE);
        $fileCharge = ($fileChargeType === 'PERCENTAGE' && BcMathCalculator::comp($fileChargePct, '0.000000', BcMathCalculator::INTERMEDIATE_SCALE) > 0)
            ? BcMathCalculator::percentageOf($principal, $fileChargePct)
            : BcMathCalculator::money((string) ($input['file_charge'] ?? '200.00'));

        $pfType = strtoupper((string) ($input['pf_type'] ?? 'FIXED'));
        $pfPct = BcMathCalculator::normalize((string) ($input['pf_percentage'] ?? '0'), BcMathCalculator::INTERMEDIATE_SCALE);
        $pfAmount = ($pfType === 'PERCENTAGE' && BcMathCalculator::comp($pfPct, '0.000000', BcMathCalculator::INTERMEDIATE_SCALE) > 0)
            ? BcMathCalculator::percentageOf($principal, $pfPct)
            : BcMathCalculator::money((string) ($input['pf_amount'] ?? '300.00'));

        $insType = strtoupper((string) ($input['insurance_type'] ?? 'FIXED'));
        $insPct = BcMathCalculator::normalize((string) ($input['insurance_pct'] ?? '0'), BcMathCalculator::INTERMEDIATE_SCALE);
        $insAmount = ($insType === 'PERCENTAGE' && BcMathCalculator::comp($insPct, '0.000000', BcMathCalculator::INTERMEDIATE_SCALE) > 0)
            ? BcMathCalculator::percentageOf($principal, $insPct)
            : BcMathCalculator::money((string) ($input['insurance_amount'] ?? '150.00'));

        $gstInclude = in_array(strtoupper((string) ($input['gst_include'] ?? 'NO')), ['YES', 'TRUE', '1'], true);
        $gstRate = BcMathCalculator::normalize((string) ($input['gst_rate_pct'] ?? '18.00'), BcMathCalculator::INTERMEDIATE_SCALE);

        $feesBase = BcMathCalculator::add(
            BcMathCalculator::add($fileCharge, $pfAmount, BcMathCalculator::LEDGER_SCALE),
            $insAmount,
            BcMathCalculator::LEDGER_SCALE
        );
        $gstAmount = $gstInclude ? BcMathCalculator::percentageOf($feesBase, $gstRate) : '0.00';
        $deductionsTotal = BcMathCalculator::add($feesBase, $gstAmount, BcMathCalculator::LEDGER_SCALE);
        $disbursementAmount = BcMathCalculator::max(
            '0.00',
            BcMathCalculator::sub($principal, $deductionsTotal, BcMathCalculator::LEDGER_SCALE)
        );

        // Periodic interest rate at scale = 6: (ratePa / 100) / periodsPerYear
        $annualRateDec = BcMathCalculator::div($ratePa, '100', BcMathCalculator::INTERMEDIATE_SCALE);
        $periodicRate = BcMathCalculator::div($annualRateDec, $periodsPerYear, BcMathCalculator::INTERMEDIATE_SCALE);

        $startDate = new DateTimeImmutable(substr((string) ($input['start_date'] ?? date('Y-m-d')), 0, 10));
        $curDate = $startDate;

        $isReducing = in_array($interestType, ['REDUCING', 'DAILY_REDUCING'], true);
        if ($isReducing) {
            if (BcMathCalculator::comp($periodicRate, '0.000000', BcMathCalculator::INTERMEDIATE_SCALE) > 0) {
                // EMI = P * r * (1 + r)^n / ((1 + r)^n - 1) in pure BCMath
                // BUG-001 fix: bcpow at scale 6 truncated 9 significant digits
                // and shifted the EMI by paise. Compute the growth factor at full
                // working precision, then round ONCE at the paise boundary.
                $onePlusR = BcMathCalculator::add('1', $periodicRate, BcMathCalculator::INTERMEDIATE_SCALE);
                $powFactor = BcMathCalculator::pow($onePlusR, $n);
                $numerator = BcMathCalculator::mul(
                    BcMathCalculator::mul($principal, $periodicRate, BcMathCalculator::INTERMEDIATE_SCALE),
                    $powFactor,
                    BcMathCalculator::INTERMEDIATE_SCALE
                );
                $denominator = BcMathCalculator::sub($powFactor, '1', BcMathCalculator::INTERMEDIATE_SCALE);
                $emi = BcMathCalculator::roundHalfUp(
                    BcMathCalculator::div($numerator, $denominator, BcMathCalculator::INTERMEDIATE_SCALE),
                    BcMathCalculator::LEDGER_SCALE
                );
            } else {
                $emi = BcMathCalculator::roundHalfUp(
                    BcMathCalculator::div($principal, $nStr, BcMathCalculator::INTERMEDIATE_SCALE),
                    BcMathCalculator::LEDGER_SCALE
                );
            }
        } else {
            // Flat interest: P * (ratePa / 100) * (n / periodsPerYear)
            $tenureYears = BcMathCalculator::div($nStr, $periodsPerYear, BcMathCalculator::INTERMEDIATE_SCALE);
            $totIntFlat = BcMathCalculator::roundHalfUp(
                BcMathCalculator::mul(
                    BcMathCalculator::mul($principal, $annualRateDec, BcMathCalculator::INTERMEDIATE_SCALE),
                    $tenureYears,
                    BcMathCalculator::INTERMEDIATE_SCALE
                ),
                BcMathCalculator::LEDGER_SCALE
            );
            $totalFlatRepay = BcMathCalculator::add($principal, $totIntFlat, BcMathCalculator::LEDGER_SCALE);

            // Custom EMI override: when the plan specifies custom_emi_amount,
            // the flat repayment IS EMI × tenure. Interest is backed out as
            // (total − principal), which keeps SUM(principal) === plan_amount
            // and SUM(interest) === total − principal to the paise.
            if (BcMathCalculator::comp($customEmi, '0.00') > 0) {
                $totalFlatRepay = BcMathCalculator::mul($customEmi, $nStr, BcMathCalculator::LEDGER_SCALE);
                $totIntFlat = BcMathCalculator::max(
                    '0.00',
                    BcMathCalculator::sub($totalFlatRepay, $principal, BcMathCalculator::LEDGER_SCALE)
                );
            }
            // BUG-003 fix: the old code rounded the per-installment EMI and then
            // re-derived interest as (emi − principal), which drifted the TOTAL
            // flat interest off the contractual P×r×t figure (₹4,499.98 instead
            // of ₹4,500.00). For FLAT products the total interest IS the contract,
            // so it gets allocated exactly with the remainder landing on the
            // final installment.
            $flatInterestPerEmi = BcMathCalculator::roundHalfUp(
                BcMathCalculator::div($totIntFlat, $nStr, BcMathCalculator::INTERMEDIATE_SCALE),
                BcMathCalculator::LEDGER_SCALE
            );
            $emi = BcMathCalculator::roundHalfUp(
                BcMathCalculator::div($totalFlatRepay, $nStr, BcMathCalculator::INTERMEDIATE_SCALE),
                BcMathCalculator::LEDGER_SCALE
            );
        }

        $schedule = [];
        $openingPrin = $principal;
        $sumPrincipal = '0.00';
        $totalInterest = '0.00';
        $totalRepayable = '0.00';
        $flatInterestAllocated = '0.00';
        $flatPrinPerEmi = BcMathCalculator::roundHalfUp(
            BcMathCalculator::div($principal, $nStr, BcMathCalculator::INTERMEDIATE_SCALE),
            BcMathCalculator::LEDGER_SCALE
        );

        for ($i = 1; $i <= $n; $i++) {
            $curDate = $curDate->add(new DateInterval("P{$stepDays}D"));
            if ($holidayExclude && $curDate->format('w') === '0') {
                $curDate = $curDate->add(new DateInterval('P1D'));
            }

            if ($isReducing) {
                $intComp = BcMathCalculator::roundHalfUp(
                    BcMathCalculator::mul($openingPrin, $periodicRate, BcMathCalculator::INTERMEDIATE_SCALE),
                    BcMathCalculator::LEDGER_SCALE
                );
                if ($i === $n) {
                    // Final installment absorbs exact remaining principal so SUM(principal) === plan_amount
                    $prinComp = $openingPrin;
                } else {
                    $rawPrin = BcMathCalculator::sub($emi, $intComp, BcMathCalculator::LEDGER_SCALE);
                    $prinComp = BcMathCalculator::min($openingPrin, BcMathCalculator::max('0.00', $rawPrin));
                }
                $instEmi = BcMathCalculator::add($prinComp, $intComp, BcMathCalculator::LEDGER_SCALE);
            } else {
                // FLAT: principal and interest each get their own exact
                // remainder-absorbing final installment. This makes
                //   SUM(principal) === plan_amount  AND
                //   SUM(interest)  === P × r × t
                // both hold to the paise — the two invariants an auditor checks.
                $prinComp = ($i === $n)
                    ? $openingPrin
                    : BcMathCalculator::min($openingPrin, $flatPrinPerEmi);

                $intComp = ($i === $n)
                    ? BcMathCalculator::max('0.00', BcMathCalculator::sub($totIntFlat, $flatInterestAllocated, BcMathCalculator::LEDGER_SCALE))
                    : $flatInterestPerEmi;
                $flatInterestAllocated = BcMathCalculator::add($flatInterestAllocated, $intComp, BcMathCalculator::LEDGER_SCALE);

                $instEmi = BcMathCalculator::add($prinComp, $intComp, BcMathCalculator::LEDGER_SCALE);
            }

            $closingPrin = BcMathCalculator::max(
                '0.00',
                BcMathCalculator::sub($openingPrin, $prinComp, BcMathCalculator::LEDGER_SCALE)
            );
            $sumPrincipal = BcMathCalculator::add($sumPrincipal, $prinComp, BcMathCalculator::LEDGER_SCALE);
            $totalInterest = BcMathCalculator::add($totalInterest, $intComp, BcMathCalculator::LEDGER_SCALE);
            $totalRepayable = BcMathCalculator::add($totalRepayable, $instEmi, BcMathCalculator::LEDGER_SCALE);

            $schedule[] = [
                'emi_no' => $i,
                'due_date' => $curDate->format('Y-m-d'),
                'day_name' => $curDate->format('l'),
                'days_in_period' => $stepDays,
                'opening_principal' => $openingPrin,
                'principal_component' => $prinComp,
                'interest_component' => $intComp,
                'emi_amount' => $instEmi,
                'closing_principal' => $closingPrin,
            ];

            $openingPrin = $closingPrin;
        }

        // Strict deterministic invariant verification: SUM(installment_principal) === loan_principal
        if (BcMathCalculator::comp($sumPrincipal, $principal, BcMathCalculator::LEDGER_SCALE) !== 0) {
            throw new RuntimeException(
                "Actuarial Schedule Invariant Violation: SUM(principal_component) (₹{$sumPrincipal}) !== Loan Principal (₹{$principal})."
            );
        }

        $totalDays = max(1, (int) $startDate->diff($curDate)->days);

        // BUG-002 fix: the old "cost ratio ÷ year fraction" was not a rate at
        // all — it understated the true effective APR by ~30% (13.59% where the
        // honest answer is 19.56%) on a customer-facing RBI KFS. Solve the real
        // IRR of the actual dated cashflow stream instead.
        $cashflows = [[
            'day_offset' => 0,
            'amount' => BcMathCalculator::money($disbursementAmount),
        ]];
        foreach ($schedule as $row) {
            $cashflows[] = [
                'day_offset' => (int) $startDate->diff(new DateTimeImmutable($row['due_date']))->days,
                'amount' => '-' . BcMathCalculator::money($row['emi_amount']),
            ];
        }
        $approxApr = BcMathCalculator::effectiveAprFromCashflows($cashflows) ?? '0.00';

        return [
            'plan_type' => $planType,
            'interest_type' => $interestType,
            'recovery_type' => $recoveryType,
            'tenure_emis' => $n,
            'emi_interval_days' => $stepDays,
            'emi_interval_label' => $intervalLabel,
            'total_loan_days' => $totalDays,
            'first_emi_date' => $schedule[0]['due_date'] ?? $startDate->format('Y-m-d'),
            'last_emi_date' => $schedule[count($schedule) - 1]['due_date'] ?? $startDate->format('Y-m-d'),
            'plan_amount' => $principal,
            'deductions_total' => $deductionsTotal,
            'gst_amount' => $gstAmount,
            'disbursement_amount' => $disbursementAmount,
            'total_interest' => $totalInterest,
            'total_repayable' => $totalRepayable,
            'emi_amount' => $emi,
            'effective_apr_pct' => $approxApr,
            'holiday_exclude' => $holidayExclude,
            'schedule' => $schedule,
        ];
    }
}
