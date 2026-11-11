<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Ledger;
use App\Models\Voucher;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;

/**
 * Atomic PostgreSQL Double-Entry General Ledger Service (100% BCMath, Zero Floats).
 *
 * Enforces:
 * - DB::transaction() with pessimistic row-level locking (->lockForUpdate()) on Ledger rows.
 * - Strict Double-Entry Invariant: bccomp($amountDr, $amountCr, 2) === 0 before commit.
 * - Physical Cash & Bank Sufficiency guard via TreasuryReconciliationService.
 * - Strict bifurcation of EMI collections into Principal Recovery, Interest Income, and Penalty Ledgers.
 */
class DoubleEntryLedgerService
{
    public function __construct(
        protected ?TreasuryReconciliationService $treasuryService = null
    ) {
        $this->treasuryService = $treasuryService ?? new TreasuryReconciliationService();
    }

    /**
     * Post an atomic, double-entry balanced voucher with pessimistic row locking on both ledgers.
     */
    public function postVoucher(array $data, string $actorCode = 'ADM01', bool $allowControlLedger = false): Voucher
    {
        return DB::transaction(function () use ($data, $actorCode, $allowControlLedger): Voucher {
            $tenantCode = strtoupper(trim((string) ($data['tenant_code'] ?? config('mfi.default_tenant', 'TNT-NEEV-01'))));
            $voucherType = strtoupper(trim((string) ($data['voucher_type'] ?? 'PAYMENT')));

            $rawDr = (string) ($data['amount_dr'] ?? $data['amount'] ?? '0.00');
            $rawCr = (string) ($data['amount_cr'] ?? $data['amount'] ?? '0.00');
            $amountDr = BcMathCalculator::money($rawDr);
            $amountCr = BcMathCalculator::money($rawCr);

            if (BcMathCalculator::comp($amountDr, '0.00') <= 0 || BcMathCalculator::comp($amountCr, '0.00') <= 0) {
                throw new InvalidArgumentException('Voucher debit and credit amounts must be strictly greater than ₹0.00.');
            }

            if (BcMathCalculator::comp($amountDr, $amountCr, BcMathCalculator::LEDGER_SCALE) !== 0) {
                throw new RuntimeException(
                    "Double-Entry Imbalance Exception: Debit (₹{$amountDr}) !== Credit (₹{$amountCr}). Unbalanced vouchers cannot be committed."
                );
            }

            $debitLedgerName = strtoupper(trim((string) ($data['debit_ledger'] ?? '')));
            $creditLedgerName = strtoupper(trim((string) ($data['credit_ledger'] ?? '')));
            if ($debitLedgerName === '' || $creditLedgerName === '') {
                throw new InvalidArgumentException('Both debit_ledger and credit_ledger are mandatory.');
            }
            if ($debitLedgerName === $creditLedgerName) {
                throw new InvalidArgumentException("Self-balancing voucher on identical ledger '{$debitLedgerName}' is prohibited.");
            }

            $branchName = trim((string) ($data['branch_name'] ?? 'INDORE HEAD OFFICE')) ?: 'INDORE HEAD OFFICE';
            $controlLedgers = (array) config('mfi.control_ledgers', [
                'LOAN PORTFOLIO RECEIVABLE',
                'MEMBER DEPOSITS LIABILITY',
                'ADVANCE SECURITY DEPOSIT LIABILITY',
                'INTER-BRANCH SETTLEMENT CONTROL',
            ]);

            if (!$allowControlLedger) {
                foreach ([$debitLedgerName, $creditLedgerName] as $led) {
                    if (in_array($led, $controlLedgers, true)) {
                        throw new InvalidArgumentException("Direct manual posting to Subledger Control Account '{$led}' is restricted.");
                    }
                }
            }

            $idempotencyKey = !empty($data['idempotency_key']) ? trim((string) $data['idempotency_key']) : null;
            if ($idempotencyKey !== null) {
                $existing = Voucher::withoutGlobalScopes()
                    ->where('idempotency_key', $idempotencyKey)
                    ->lockForUpdate()
                    ->first();
                if ($existing) {
                    return $existing;
                }
            }

            // Acquire pessimistic row locks in deterministic alphabetical order to prevent deadlocks
            $orderedNames = [$debitLedgerName, $creditLedgerName];
            sort($orderedNames, SORT_STRING);
            foreach ($orderedNames as $lName) {
                $this->lockOrCreateLedger($tenantCode, $lName, $branchName);
            }

            $creditLedger = $this->lockOrCreateLedger($tenantCode, $creditLedgerName, $branchName);

            // Enforce Treasury Cash/Bank Sufficiency Guard before crediting liquid assets
            $floatMeta = $this->treasuryService->assertCashBankSufficiency(
                $creditLedger,
                $amountCr,
                $branchName,
                allowHoFloatCover: (bool) ($data['allow_ho_float_cover'] ?? true),
                isLoanDisbursement: (bool) ($data['is_loan_disbursement'] ?? false),
                isLiquidityRelocation: (bool) ($data['is_liquidity_relocation'] ?? false),
                isHeadOfficeFunding: (bool) ($data['from_head_office'] ?? false)
            );

            if ($floatMeta !== null && !empty($floatMeta['auto_ho_float'])) {
                $this->treasuryService->applyAutoHoFloatAdjustment(
                    $floatMeta,
                    $this,
                    (string) ($data['voucher_date'] ?? date('Y-m-d')),
                    $actorCode
                );
            }

            $seq = DB::table('mfi_vouchers')->count() + 90001;
            $voucherNo = !empty($data['voucher_no']) ? (string) $data['voucher_no'] : "VCH{$seq}";
            $vDate = substr((string) ($data['voucher_date'] ?? date('Y-m-d')), 0, 10);

            $voucher = Voucher::create([
                'tenant_code' => $tenantCode,
                'voucher_no' => $voucherNo,
                'voucher_date' => $vDate,
                'voucher_type' => $voucherType,
                'branch_name' => $branchName,
                'loan_id' => (string) ($data['loan_id'] ?? ''),
                'particular' => (string) ($data['particular'] ?? 'Accounting Voucher Entry'),
                'debit_ledger' => $debitLedgerName,
                'credit_ledger' => $creditLedgerName,
                'amount_dr' => $amountDr,
                'amount_cr' => $amountCr,
                'narration' => (string) ($data['narration'] ?? ($data['particular'] ?? '')),
                'created_by' => $actorCode,
                'idempotency_key' => $idempotencyKey,
            ]);

            $this->updateLedgerBalance($tenantCode, $debitLedgerName, $amountDr, '0.00', $branchName);
            $this->updateLedgerBalance($tenantCode, $creditLedgerName, '0.00', $amountCr, $branchName);

            return $voucher;
        });
    }

    /**
     * Post strictly bifurcated EMI collection vouchers into Principal Recovery, Interest Income, and Penalty Ledgers.
     * Verifies that (principal + interest + penalty) === totalCollected before committing.
     *
     * @return array<int, Voucher>
     */
    public function postBifurcatedCollectionVouchers(
        string $tenantCode,
        string $receiptNo,
        string $loanId,
        string $memberName,
        string $branchName,
        string $paymentDate,
        string $paymentMode,
        string $totalCollected,
        string $principalAllocated,
        string $interestAllocated,
        string $penaltyAllocated,
        string $actorCode = 'ADM01'
    ): array {
        return DB::transaction(function () use (
            $tenantCode,
            $receiptNo,
            $loanId,
            $memberName,
            $branchName,
            $paymentDate,
            $paymentMode,
            $totalCollected,
            $principalAllocated,
            $interestAllocated,
            $penaltyAllocated,
            $actorCode
        ): array {
            $tot = BcMathCalculator::money($totalCollected);
            $prin = BcMathCalculator::money($principalAllocated);
            $int = BcMathCalculator::money($interestAllocated);
            $pen = BcMathCalculator::money($penaltyAllocated);

            $sumAllocated = BcMathCalculator::add(
                BcMathCalculator::add($prin, $int, BcMathCalculator::LEDGER_SCALE),
                $pen,
                BcMathCalculator::LEDGER_SCALE
            );

            if (BcMathCalculator::comp($tot, $sumAllocated, BcMathCalculator::LEDGER_SCALE) !== 0) {
                throw new RuntimeException(
                    "Collection Bifurcation Imbalance: Receipt Total (₹{$tot}) !== Principal (₹{$prin}) + Interest (₹{$int}) + Penalty (₹{$pen}) = ₹{$sumAllocated}."
                );
            }

            $modeUp = strtoupper(trim($paymentMode));
            $debitLedger = (str_contains($modeUp, 'CASH') && !str_contains($modeUp, 'CASHFREE'))
                ? 'CASH IN HAND'
                : 'BANK ACCOUNT';

            $vouchers = [];

            if (BcMathCalculator::comp($prin, '0.00') > 0) {
                $vouchers[] = $this->postVoucher([
                    'tenant_code' => $tenantCode,
                    'voucher_type' => 'RECEIPT',
                    'voucher_date' => $paymentDate,
                    'branch_name' => $branchName,
                    'loan_id' => $loanId,
                    'particular' => "EMI Principal Recovery ({$receiptNo}) - Loan {$loanId} ({$memberName})",
                    'debit_ledger' => $debitLedger,
                    'credit_ledger' => 'LOAN PORTFOLIO RECEIVABLE',
                    'amount_dr' => $prin,
                    'amount_cr' => $prin,
                    'idempotency_key' => "RCPT-PRIN-{$receiptNo}",
                ], $actorCode, true);
            }

            if (BcMathCalculator::comp($int, '0.00') > 0) {
                $vouchers[] = $this->postVoucher([
                    'tenant_code' => $tenantCode,
                    'voucher_type' => 'RECEIPT',
                    'voucher_date' => $paymentDate,
                    'branch_name' => $branchName,
                    'loan_id' => $loanId,
                    'particular' => "EMI Interest Income ({$receiptNo}) - Loan {$loanId} ({$memberName})",
                    'debit_ledger' => $debitLedger,
                    'credit_ledger' => 'LOAN INTEREST INCOME',
                    'amount_dr' => $int,
                    'amount_cr' => $int,
                    'idempotency_key' => "RCPT-INT-{$receiptNo}",
                ], $actorCode, true);
            }

            if (BcMathCalculator::comp($pen, '0.00') > 0) {
                $vouchers[] = $this->postVoucher([
                    'tenant_code' => $tenantCode,
                    'voucher_type' => 'RECEIPT',
                    'voucher_date' => $paymentDate,
                    'branch_name' => $branchName,
                    'loan_id' => $loanId,
                    'particular' => "EMI Penal Charge Income ({$receiptNo}) - Loan {$loanId} ({$memberName})",
                    'debit_ledger' => $debitLedger,
                    'credit_ledger' => 'PENALTY & BOUNCE CHARGE INCOME',
                    'amount_dr' => $pen,
                    'amount_cr' => $pen,
                    'idempotency_key' => "RCPT-PEN-{$receiptNo}",
                ], $actorCode, true);
            }

            return $vouchers;
        });
    }

    /**
     * Lock an existing Ledger row for update or create it atomically inside the active transaction.
     */
    protected function lockOrCreateLedger(string $tenantCode, string $ledgerName, string $branchName): Ledger
    {
        $ledger = Ledger::withoutGlobalScopes()
            ->where('tenant_code', $tenantCode)
            ->where('name', $ledgerName)
            ->lockForUpdate()
            ->first();

        if ($ledger) {
            return $ledger;
        }

        [$groupName, $nature] = $this->classifyLedgerNature($ledgerName);

        Ledger::create([
            'tenant_code' => $tenantCode,
            'name' => $ledgerName,
            'alias' => substr((string) preg_replace('/[^A-Z0-9]/', '', $ledgerName), 0, 10),
            'group_name' => $groupName,
            'nature' => $nature,
            'branch_name' => $branchName,
            'opening_balance' => '0.00',
            'current_debit' => '0.00',
            'current_credit' => '0.00',
            'closing_balance' => '0.00',
            'status' => 'ACTIVE',
        ]);

        return Ledger::withoutGlobalScopes()
            ->where('tenant_code', $tenantCode)
            ->where('name', $ledgerName)
            ->lockForUpdate()
            ->firstOrFail();
    }

    /**
     * Classify ledger group and accounting nature deterministically.
     *
     * @return array{0: string, 1: string}
     */
    protected function classifyLedgerNature(string $ledgerName): array
    {
        $u = strtoupper($ledgerName);
        if (
            (str_contains($u, 'INCOME') || str_contains($u, 'INTEREST') || str_contains($u, 'FEE') || str_contains($u, 'PENALTY') || str_contains($u, 'CHARGE'))
            && !str_contains($u, 'EXPENSE')
            && !str_contains($u, 'RECEIVABLE')
        ) {
            return ['DIRECT INCOME', 'INCOME'];
        }
        if (str_contains($u, 'EXPENSE') || str_contains($u, 'SALARY') || str_contains($u, 'RENT') || str_contains($u, 'COST')) {
            return ['INDIRECT EXPENSE', 'EXPENSE'];
        }
        if (
            (str_contains($u, 'CAPITAL') || str_contains($u, 'LIABILITY') || str_contains($u, 'PAYABLE') || str_contains($u, 'DEPOSIT') || str_contains($u, 'SECURITY') || str_contains($u, 'BORROWING') || str_contains($u, 'PROVISION') || str_contains($u, 'LOAN') || str_contains($u, 'REFINANCE'))
            && !str_contains($u, 'RECEIVABLE')
        ) {
            return ['CAPITAL & LIABILITIES', 'LIABILITY'];
        }

        return ['CURRENT ASSETS', 'ASSET'];
    }

    /**
     * Update consolidated Ledger balance and branch sub-ledger balance using pure BCMath under row lock.
     */
    protected function updateLedgerBalance(
        string $tenantCode,
        string $ledgerName,
        string $debit,
        string $credit,
        string $branchName
    ): void {
        $ledger = $this->lockOrCreateLedger($tenantCode, $ledgerName, $branchName);

        $dr = BcMathCalculator::money($debit);
        $cr = BcMathCalculator::money($credit);
        $openBal = BcMathCalculator::money((string) $ledger->opening_balance);
        $newDr = BcMathCalculator::add((string) $ledger->current_debit, $dr, BcMathCalculator::LEDGER_SCALE);
        $newCr = BcMathCalculator::add((string) $ledger->current_credit, $cr, BcMathCalculator::LEDGER_SCALE);

        $natureUp = strtoupper((string) $ledger->nature);
        $isDrNature = in_array($natureUp, ['ASSET', 'EXPENSE'], true);
        $closing = $isDrNature
            ? BcMathCalculator::sub(BcMathCalculator::add($openBal, $newDr, BcMathCalculator::LEDGER_SCALE), $newCr, BcMathCalculator::LEDGER_SCALE)
            : BcMathCalculator::sub(BcMathCalculator::add($openBal, $newCr, BcMathCalculator::LEDGER_SCALE), $newDr, BcMathCalculator::LEDGER_SCALE);

        $ledger->update([
            'current_debit' => $newDr,
            'current_credit' => $newCr,
            'closing_balance' => $closing,
        ]);

        $this->treasuryService->updateBranchLedgerBalance(
            $tenantCode,
            $branchName,
            $ledgerName,
            $natureUp,
            $dr,
            $cr
        );
    }
}
