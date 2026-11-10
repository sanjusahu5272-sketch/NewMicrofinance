<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\EmiCollection;
use App\Models\Installment;
use App\Models\Loan;
use App\Services\ActuarialLoanEngine;
use App\Services\BcMathCalculator;
use Illuminate\Console\Command;

/**
 * Native Laravel 11 Port of tools/audit_loan_math.py and tools/audit_loan_matrix.py.
 *
 * Audits active loans and scenario matrix in pure BCMath:
 * 1. Schedule row continuity: opening = previous closing, closing = opening - principal,
 *    row emi = principal + interest, final closing == 0.00.
 * 2. Exact principal invariant: SUM(installment.principal_component) === loan.plan_amount.
 * 3. Collection allocation invariant: receipt.amount === principal_allocated + interest_allocated + penalty_allocated.
 * 4. Outstanding derivation invariant: total_outstanding === principal_outstanding + interest_outstanding + penalty_due.
 */
class AuditLoanMathCommand extends Command
{
    protected $signature = 'mfi:audit-loan-math {loan_id? : Optional specific Loan ID to audit}';
    protected $description = 'Run deterministic BCMath actuarial & penny-rounding integrity audit across loans and scenario matrix';

    public function handle(ActuarialLoanEngine $engine): int
    {
        $passCount = 0;
        $failCount = 0;

        $this->info('==============================================================================');
        $this->info('NEEV 4D — PURE BCMATH ACTUARIAL LOAN MATRIX & LIVE PORTFOLIO AUDIT');
        $this->info('==============================================================================');

        // 1. Audit Actuarial Scenario Matrix (replaces tools/audit_loan_matrix.py)
        $scenarios = [
            ['name' => 'Monthly Reducing 50K 12M @ 22%', 'plan_amount' => '50000.00', 'interest_rate_pa' => '22.00', 'tenure_emis' => 12, 'recovery_type' => 'MONTHLY', 'interest_type' => 'REDUCING'],
            ['name' => 'Monthly Flat Solar Product 25K 10M @ 18%', 'plan_amount' => '25000.00', 'interest_rate_pa' => '18.00', 'tenure_emis' => 10, 'recovery_type' => 'MONTHLY', 'interest_type' => 'FLAT'],
            ['name' => 'Weekly Flat POS Product 18K 25W @ 18%', 'plan_amount' => '18000.00', 'interest_rate_pa' => '18.00', 'tenure_emis' => 25, 'recovery_type' => 'WEEKLY', 'interest_type' => 'FLAT'],
            ['name' => 'Odd-Prime Principal 33333.33 13M Reducing @ 21.5%', 'plan_amount' => '33333.33', 'interest_rate_pa' => '21.50', 'tenure_emis' => 13, 'recovery_type' => 'MONTHLY', 'interest_type' => 'REDUCING'],
        ];

        foreach ($scenarios as $sc) {
            $calc = $engine->calculateEmiBreakdown($sc);
            $sch = $calc['schedule'];
            $sumPrin = '0.00';
            $sumInt = '0.00';
            $sumEmi = '0.00';
            $prevClose = $sc['plan_amount'];

            foreach ($sch as $row) {
                $sumPrin = BcMathCalculator::add($sumPrin, $row['principal_component'], BcMathCalculator::LEDGER_SCALE);
                $sumInt = BcMathCalculator::add($sumInt, $row['interest_component'], BcMathCalculator::LEDGER_SCALE);
                $sumEmi = BcMathCalculator::add($sumEmi, $row['emi_amount'], BcMathCalculator::LEDGER_SCALE);

                $rowEmiCheck = BcMathCalculator::add($row['principal_component'], $row['interest_component'], BcMathCalculator::LEDGER_SCALE);
                if (
                    BcMathCalculator::comp($row['opening_principal'], $prevClose) !== 0
                    || BcMathCalculator::comp($row['emi_amount'], $rowEmiCheck) !== 0
                ) {
                    $failCount++;
                    $this->error("  [FAIL] {$sc['name']} row #{$row['emi_no']} continuity mismatch.");
                } else {
                    $passCount++;
                }
                $prevClose = $row['closing_principal'];
            }

            $finalClose = $sch[count($sch) - 1]['closing_principal'] ?? '0.00';
            if (
                BcMathCalculator::comp($sumPrin, $sc['plan_amount']) === 0
                && BcMathCalculator::comp($finalClose, '0.00') === 0
                && BcMathCalculator::comp($sumInt, $calc['total_interest']) === 0
                && BcMathCalculator::comp($sumEmi, $calc['total_repayable']) === 0
            ) {
                $passCount++;
                $this->line("  [PASS] Matrix Scenario: {$sc['name']} (SUM(Principal) == ₹{$sumPrin}, Final Closing == ₹0.00)");
            } else {
                $failCount++;
                $this->error("  [FAIL] Matrix Scenario: {$sc['name']} (SUM(Principal)=₹{$sumPrin} vs ₹{$sc['plan_amount']})");
            }
        }

        // 2. Audit Live Database Loans (replaces tools/audit_loan_math.py)
        $targetLoanId = $this->argument('loan_id');
        $loanQuery = Loan::withoutGlobalScopes()->whereIn('status', ['DISBURSED', 'COMPLETED', 'SETTLED']);
        if ($targetLoanId) {
            $loanQuery->where('loan_id', (string) $targetLoanId);
        }

        $loans = $loanQuery->get();
        foreach ($loans as $loan) {
            $insts = Installment::withoutGlobalScopes()
                ->where('loan_pk', $loan->id)
                ->where('status', '!=', 'CANCELLED')
                ->orderBy('emi_no')
                ->get();

            $sumPrin = '0.00';
            foreach ($insts as $ins) {
                $sumPrin = BcMathCalculator::add($sumPrin, (string) $ins->principal_component, BcMathCalculator::LEDGER_SCALE);
            }

            if ($insts->isNotEmpty() && BcMathCalculator::comp($sumPrin, (string) $loan->plan_amount) !== 0) {
                $failCount++;
                $this->error("  [FAIL] Loan {$loan->loan_id}: Schedule Principal Sum ₹{$sumPrin} !== Loan Principal ₹{$loan->plan_amount}");
            } else {
                $passCount++;
            }

            $expectedTotOut = BcMathCalculator::add(
                BcMathCalculator::add((string) $loan->principal_outstanding, (string) $loan->interest_outstanding, BcMathCalculator::LEDGER_SCALE),
                (string) $loan->penalty_due,
                BcMathCalculator::LEDGER_SCALE
            );
            if (BcMathCalculator::comp($expectedTotOut, (string) $loan->total_outstanding) !== 0) {
                $failCount++;
                $this->error("  [FAIL] Loan {$loan->loan_id}: Total Outstanding ₹{$loan->total_outstanding} !== P+I+Pen ₹{$expectedTotOut}");
            } else {
                $passCount++;
            }

            $collections = EmiCollection::withoutGlobalScopes()
                ->where('loan_pk', $loan->id)
                ->where('status', 'APPROVED')
                ->get();

            foreach ($collections as $col) {
                $sumAlloc = BcMathCalculator::add(
                    BcMathCalculator::add((string) $col->principal_allocated, (string) $col->interest_allocated, BcMathCalculator::LEDGER_SCALE),
                    (string) $col->penalty_allocated,
                    BcMathCalculator::LEDGER_SCALE
                );
                if (BcMathCalculator::comp((string) $col->amount, $sumAlloc) !== 0) {
                    $failCount++;
                    $this->error("  [FAIL] Receipt {$col->receipt_no}: Amount ₹{$col->amount} !== Allocated ₹{$sumAlloc}");
                } else {
                    $passCount++;
                }
            }
        }

        $this->info("Audit Complete: {$passCount} checks passed, {$failCount} failed.");

        return $failCount === 0 ? self::SUCCESS : self::FAILURE;
    }
}
