<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Ledger;
use App\Models\Voucher;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;

/**
 * Port of backend/core/ledger_treasury_engine.py into Pure PHP 8.3+ / Laravel 11 + PostgreSQL 16.
 *
 * Enforces bank-grade double-entry accounting & treasury controls:
 * 1. Physical Cash & Bank Sufficiency Guard (assertCashBankSufficiency):
 *    - Consolidated CASH IN HAND can NEVER drop below ₹0.00.
 *    - Consolidated BANK ACCOUNT can NEVER drop below -BANK_OVERDRAFT_LIMIT (default ₹0.00).
 *    - Branch-level cash/bank drawers in mfi_branch_ledger_balances cannot go negative; if
 *      BRANCH DISBURSEMENT FROM HEAD OFFICE == 'YES' and Head Office holds surplus funds,
 *      an automatic balanced Inter-Branch Float CONTRA transfer is posted.
 * 2. Branch Opening Capital Allocation (allocateInitialBranchOpeningBalances).
 * 3. True Inter-Branch Fund Transfer Posting (postInterBranchFundTransfer).
 * 4. Real-Time Double-Entry Balance Sheet & Subledger-to-GL Reconciliation
 *    (buildBalanceSheet, buildSubledgerGlReconciliation, verifyAuditHashChain).
 */
class TreasuryReconciliationService
{
    public const PROTECTED_IMMUTABLE_RESOURCES = [
        'vouchers',
        'collections',
        'settlements',
        'deposit-collections',
        'payout-disbursements',
        'payment-webhooks',
        'payment-refunds',
        'daily-cash-reconciliations',
        'fy-closing-runs',
        'audit-logs',
    ];

    /**
     * Return 'CASH' or 'BANK' if the ledger represents liquid treasury money, else null.
     */
    public function classifyLiquidLedger(object|array $ledgerRow): ?string
    {
        $row = (array) $ledgerRow;
        $nameUp = strtoupper(trim((string) ($row['name'] ?? '')));
        $aliasUp = strtoupper(trim((string) ($row['alias'] ?? '')));
        $natureUp = strtoupper(trim((string) ($row['nature'] ?? '')));

        if ($natureUp !== 'ASSET') {
            return null;
        }
        if ($nameUp === 'CASH IN HAND' || $aliasUp === 'CASH' || str_starts_with($nameUp, 'CASH ')) {
            return 'CASH';
        }
        if (
            $nameUp === 'BANK ACCOUNT'
            || str_contains($nameUp, 'BANK')
            || str_starts_with($aliasUp, 'SBI')
            || str_starts_with($aliasUp, 'HDFC')
        ) {
            return 'BANK';
        }

        return null;
    }

    /**
     * Read system setting value for the active tenant.
     */
    public function getSystemSettingValue(string $key, string $default = '', ?string $tenantCode = null): string
    {
        $tenant = $tenantCode ?? (string) config('mfi.default_tenant', 'TNT-NEEV-01');
        $row = DB::table('mfi_system_settings')
            ->where('tenant_code', $tenant)
            ->whereRaw('UPPER(key) = UPPER(?)', [$key])
            ->first();

        return ($row && $row->value !== null) ? trim((string) $row->value) : $default;
    }

    /**
     * Fetch branch-specific liquid closing balance with optional row lock.
     */
    public function getBranchLiquidBalance(
        string $branchName,
        string $ledgerName,
        ?string $tenantCode = null,
        bool $lockForUpdate = false
    ): string {
        $tenant = $tenantCode ?? (string) config('mfi.default_tenant', 'TNT-NEEV-01');
        $query = DB::table('mfi_branch_ledger_balances')
            ->where('tenant_code', $tenant)
            ->where('branch_name', $branchName)
            ->where('ledger_name', $ledgerName);

        if ($lockForUpdate) {
            $query->lockForUpdate();
        }

        $row = $query->first();

        return $row ? BcMathCalculator::money((string) $row->closing_balance) : '0.00';
    }

    /**
     * Validate consolidated and branch-level liquid balance before crediting Cash or Bank.
     * Must be invoked inside an active DB::transaction() with the credit Ledger row locked via lockForUpdate().
     */
    public function assertCashBankSufficiency(
        Ledger $creditLedger,
        string $outflowAmount,
        string $branchName,
        bool $allowHoFloatCover = true,
        bool $isLoanDisbursement = false,
        bool $isLiquidityRelocation = false,
        bool $isHeadOfficeFunding = false
    ): ?array {
        $outflow = BcMathCalculator::money($outflowAmount);
        $kind = $this->classifyLiquidLedger($creditLedger->toArray());
        if ($kind === null || BcMathCalculator::comp($outflow, '0.00') <= 0) {
            return null;
        }

        $tenantCode = (string) ($creditLedger->tenant_code ?: config('mfi.default_tenant', 'TNT-NEEV-01'));
        $hoFunded = $isHeadOfficeFunding && $isLoanDisbursement;
        $ledgerName = (string) $creditLedger->name;
        $consClosing = BcMathCalculator::money((string) $creditLedger->closing_balance);

        if ($kind === 'CASH') {
            $minAllowed = '0.00';
        } else {
            $odLimit = BcMathCalculator::abs(
                $this->getSystemSettingValue('BANK_OVERDRAFT_LIMIT', '0.00', $tenantCode)
            );
            $minAllowed = BcMathCalculator:: comp($odLimit, '0.00') > 0 ? '-' . $odLimit : '0.00';
        }

        $projectedCons = BcMathCalculator::sub($consClosing, $outflow, BcMathCalculator::LEDGER_SCALE);
        if (BcMathCalculator::comp($projectedCons, $minAllowed) < 0 && !$isLiquidityRelocation) {
            throw new InvalidArgumentException(
                "Insufficient Treasury {$ledgerName} balance: Available ₹{$consClosing}, Required Outflow ₹{$outflow}."
            );
        }

        if ($hoFunded) {
            return null;
        }

        $effBranch = trim($branchName) !== '' ? trim($branchName) : 'INDORE HEAD OFFICE';
        if (strtoupper($effBranch) === 'ALL BRANCHES') {
            return null;
        }

        $branchBal = $this->getBranchLiquidBalance($effBranch, $ledgerName, $tenantCode, true);
        $strictBranch = in_array(
            strtoupper($this->getSystemSettingValue('STRICT_BRANCH_CASH_LIMIT', 'NO', $tenantCode)),
            ['YES', 'TRUE', '1'],
            true
        );
        $hoCoverAllowed = in_array(
            strtoupper($this->getSystemSettingValue('BRANCH DISBURSEMENT FROM HEAD OFFICE', 'YES', $tenantCode)),
            ['YES', 'TRUE', '1'],
            true
        );

        if (BcMathCalculator::comp($branchBal, $outflow) >= 0) {
            return null;
        }

        $nonNegBranchBal = BcMathCalculator::max('0.00', $branchBal);
        $shortfall = BcMathCalculator::sub($outflow, $nonNegBranchBal, BcMathCalculator::LEDGER_SCALE);

        if (
            $kind === 'CASH'
            && BcMathCalculator::comp($branchBal, $outflow) < 0
            && !(!$strictBranch && $hoCoverAllowed && $allowHoFloatCover && $isLoanDisbursement && strtoupper($effBranch) !== 'INDORE HEAD OFFICE')
        ) {
            throw new InvalidArgumentException(
                "Insufficient branch {$ledgerName} balance at '{$effBranch}': Branch Available ₹{$branchBal}, Required ₹{$outflow}. Approve an Inter-Branch Fund Transfer first."
            );
        }

        if (!$strictBranch && $hoCoverAllowed && $allowHoFloatCover && strtoupper($effBranch) !== 'INDORE HEAD OFFICE') {
            $hoBal = $this->getBranchLiquidBalance('INDORE HEAD OFFICE', $ledgerName, $tenantCode, true);
            if (BcMathCalculator::comp($hoBal, $shortfall) >= 0) {
                return [
                    'auto_ho_float' => true,
                    'tenant_code' => $tenantCode,
                    'from_branch' => 'INDORE HEAD OFFICE',
                    'to_branch' => $effBranch,
                    'ledger_name' => $ledgerName,
                    'amount' => $shortfall,
                ];
            }
        }

        $hoMinAllowed = $kind === 'CASH' ? '0.00' : $minAllowed;
        $localMin = null;
        if (strtoupper($effBranch) === 'INDORE HEAD OFFICE') {
            $localMin = $strictBranch ? '0.00' : $hoMinAllowed;
        } elseif ($strictBranch) {
            $localMin = '0.00';
        }

        if ($localMin !== null) {
            $projectedBranch = BcMathCalculator::sub($branchBal, $outflow, BcMathCalculator::LEDGER_SCALE);
            if (BcMathCalculator::comp($projectedBranch, $localMin) < 0) {
                throw new InvalidArgumentException(
                    "Insufficient branch {$ledgerName} balance at '{$effBranch}': Branch Available ₹{$branchBal}, Required ₹{$outflow}. Approve an Inter-Branch Fund Transfer (or CONTRA) to fund this branch first."
                );
            }
        }

        return null;
    }

    /**
     * Move exact liquidity float from INDORE HEAD OFFICE to branch via balanced paired
     * INTER-BRANCH SETTLEMENT CONTROL CONTRA vouchers.
     */
    public function applyAutoHoFloatAdjustment(
        array $floatMeta,
        DoubleEntryLedgerService $ledgerService,
        ?string $voucherDate = null,
        string $actorCode = 'ADM01'
    ): void {
        $amt = BcMathCalculator::money((string) ($floatMeta['amount'] ?? '0.00'));
        if (BcMathCalculator::comp($amt, '0.00') <= 0) {
            return;
        }

        $tenantCode = (string) ($floatMeta['tenant_code'] ?? config('mfi.default_tenant', 'TNT-NEEV-01'));
        $ledgerName = (string) $floatMeta['ledger_name'];
        $fromBranch = (string) $floatMeta['from_branch'];
        $toBranch = (string) $floatMeta['to_branch'];
        $vDate = substr((string) ($voucherDate ?: date('Y-m-d')), 0, 10);

        $ledgerService->postVoucher([
            'tenant_code' => $tenantCode,
            'voucher_type' => 'CONTRA',
            'voucher_date' => $vDate,
            'branch_name' => $fromBranch,
            'particular' => "Auto HO Treasury Float Out to {$toBranch} ({$ledgerName})",
            'debit_ledger' => 'INTER-BRANCH SETTLEMENT CONTROL',
            'credit_ledger' => $ledgerName,
            'amount' => $amt,
            'narration' => "Automatic Head Office liquidity float cover to {$toBranch}",
            'is_liquidity_relocation' => true,
        ], $actorCode, true);

        $ledgerService->postVoucher([
            'tenant_code' => $tenantCode,
            'voucher_type' => 'CONTRA',
            'voucher_date' => $vDate,
            'branch_name' => $toBranch,
            'particular' => "Auto HO Treasury Float In from {$fromBranch} ({$ledgerName})",
            'debit_ledger' => $ledgerName,
            'credit_ledger' => 'INTER-BRANCH SETTLEMENT CONTROL',
            'amount' => $amt,
            'narration' => "Automatic Head Office liquidity float cover from {$fromBranch}",
            'is_liquidity_relocation' => true,
        ], $actorCode, true);
    }

    /**
     * Synchronize branch-level sub-ledger balance in mfi_branch_ledger_balances under row lock.
     */
    public function updateBranchLedgerBalance(
        string $tenantCode,
        string $branchName,
        string $ledgerName,
        string $nature,
        string $debitDelta,
        string $creditDelta
    ): void {
        $effBranch = trim($branchName) !== '' ? trim($branchName) : 'INDORE HEAD OFFICE';
        if (strtoupper($effBranch) === 'ALL BRANCHES') {
            $effBranch = 'INDORE HEAD OFFICE';
        }

        $dr = BcMathCalculator::money($debitDelta);
        $cr = BcMathCalculator::money($creditDelta);
        $natureUp = strtoupper(trim($nature));
        $isDrNature = in_array($natureUp, ['ASSET', 'EXPENSE'], true);

        $existing = DB::table('mfi_branch_ledger_balances')
            ->where('tenant_code', $tenantCode)
            ->where('branch_name', $effBranch)
            ->where('ledger_name', $ledgerName)
            ->lockForUpdate()
            ->first();

        if ($existing) {
            $openBal = BcMathCalculator::money((string) $existing->opening_balance);
            $newDr = BcMathCalculator::add((string) $existing->current_debit, $dr, BcMathCalculator::LEDGER_SCALE);
            $newCr = BcMathCalculator::add((string) $existing->current_credit, $cr, BcMathCalculator::LEDGER_SCALE);
            $newClose = $isDrNature
                ? BcMathCalculator::sub(BcMathCalculator::add($openBal, $newDr, BcMathCalculator::LEDGER_SCALE), $newCr, BcMathCalculator::LEDGER_SCALE)
                : BcMathCalculator::sub(BcMathCalculator::add($openBal, $newCr, BcMathCalculator::LEDGER_SCALE), $newDr, BcMathCalculator::LEDGER_SCALE);

            DB::table('mfi_branch_ledger_balances')
                ->where('id', $existing->id)
                ->update([
                    'nature' => $natureUp,
                    'current_debit' => $newDr,
                    'current_credit' => $newCr,
                    'closing_balance' => $newClose,
                    'updated_at' => now(),
                ]);
        } else {
            $newClose = $isDrNature
                ? BcMathCalculator::sub($dr, $cr, BcMathCalculator::LEDGER_SCALE)
                : BcMathCalculator::sub($cr, $dr, BcMathCalculator::LEDGER_SCALE);

            DB::table('mfi_branch_ledger_balances')->insert([
                'tenant_code' => $tenantCode,
                'branch_name' => $effBranch,
                'ledger_name' => $ledgerName,
                'nature' => $natureUp,
                'opening_balance' => '0.00',
                'current_debit' => $dr,
                'current_credit' => $cr,
                'closing_balance' => $newClose,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    /**
     * Allocate initial branch opening balances so SUM(mfi_branch_ledger_balances.opening_balance) == mfi_ledgers.opening_balance.
     */
    public function allocateInitialBranchOpeningBalances(?string $tenantCode = null): void
    {
        $tenant = $tenantCode ?? (string) config('mfi.default_tenant', 'TNT-NEEV-01');

        DB::transaction(function () use ($tenant): void {
            $ledgers = Ledger::where('tenant_code', $tenant)->lockForUpdate()->get();
            foreach ($ledgers as $led) {
                $consOpen = BcMathCalculator::money((string) $led->opening_balance);
                if (BcMathCalculator::comp($consOpen, '0.00') === 0) {
                    continue;
                }

                $branchRows = DB::table('mfi_branch_ledger_balances')
                    ->where('tenant_code', $tenant)
                    ->where('ledger_name', $led->name)
                    ->lockForUpdate()
                    ->get();

                $existingOpenSum = '0.00';
                foreach ($branchRows as $bRow) {
                    $existingOpenSum = BcMathCalculator::add($existingOpenSum, (string) $bRow->opening_balance, BcMathCalculator::LEDGER_SCALE);
                }

                if (BcMathCalculator::comp($existingOpenSum, $consOpen) === 0) {
                    continue;
                }

                $remOpen = BcMathCalculator::sub($consOpen, $existingOpenSum, BcMathCalculator::LEDGER_SCALE);
                $targetBranch = (!empty($led->branch_name) && strtoupper((string) $led->branch_name) !== 'ALL BRANCHES')
                    ? (string) $led->branch_name
                    : 'INDORE HEAD OFFICE';

                $natureUp = strtoupper((string) ($led->nature ?: 'ASSET'));
                $isDrNature = in_array($natureUp, ['ASSET', 'EXPENSE'], true);

                $existingTarget = DB::table('mfi_branch_ledger_balances')
                    ->where('tenant_code', $tenant)
                    ->where('branch_name', $targetBranch)
                    ->where('ledger_name', $led->name)
                    ->lockForUpdate()
                    ->first();

                if ($existingTarget) {
                    $newOpen = BcMathCalculator::add((string) $existingTarget->opening_balance, $remOpen, BcMathCalculator::LEDGER_SCALE);
                    $curDr = BcMathCalculator::money((string) $existingTarget->current_debit);
                    $curCr = BcMathCalculator::money((string) $existingTarget->current_credit);
                    $newClose = $isDrNature
                        ? BcMathCalculator::sub(BcMathCalculator::add($newOpen, $curDr, BcMathCalculator::LEDGER_SCALE), $curCr, BcMathCalculator::LEDGER_SCALE)
                        : BcMathCalculator::sub(BcMathCalculator::add($newOpen, $curCr, BcMathCalculator::LEDGER_SCALE), $curDr, BcMathCalculator::LEDGER_SCALE);

                    DB::table('mfi_branch_ledger_balances')
                        ->where('id', $existingTarget->id)
                        ->update([
                            'opening_balance' => $newOpen,
                            'closing_balance' => $newClose,
                            'updated_at' => now(),
                        ]);
                } else {
                    DB::table('mfi_branch_ledger_balances')->insert([
                        'tenant_code' => $tenant,
                        'branch_name' => $targetBranch,
                        'ledger_name' => $led->name,
                        'nature' => $natureUp,
                        'opening_balance' => $remOpen,
                        'current_debit' => '0.00',
                        'current_credit' => '0.00',
                        'closing_balance' => $remOpen,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }
        });
    }

    /**
     * Post balanced paired CONTRA vouchers for an Inter-Branch Fund Transfer.
     */
    public function postInterBranchFundTransfer(
        array $transferRow,
        DoubleEntryLedgerService $ledgerService,
        string $actorCode = 'ADM01'
    ): array {
        return DB::transaction(function () use ($transferRow, $ledgerService, $actorCode): array {
            $tenantCode = (string) ($transferRow['tenant_code'] ?? config('mfi.default_tenant', 'TNT-NEEV-01'));
            $transferNo = trim((string) ($transferRow['transfer_no'] ?? ''));
            $amt = BcMathCalculator::money((string) ($transferRow['amount'] ?? '0.00'));

            if (BcMathCalculator::comp($amt, '0.00') <= 0) {
                throw new InvalidArgumentException('Fund transfer amount must be greater than ₹0.00.');
            }

            $ledgerName = strtoupper(trim((string) ($transferRow['ledger_name'] ?? 'BANK ACCOUNT')));
            $fromBranch = trim((string) ($transferRow['from_branch'] ?? 'INDORE HEAD OFFICE'));
            $toBranch = trim((string) ($transferRow['to_branch'] ?? ''));

            if ($toBranch === '' || strtoupper($fromBranch) === strtoupper($toBranch)) {
                throw new InvalidArgumentException('Inter-branch fund transfer requires distinct source and destination branches.');
            }

            $fromBal = $this->getBranchLiquidBalance($fromBranch, $ledgerName, $tenantCode, true);
            if (BcMathCalculator::comp($fromBal, $amt) < 0) {
                throw new InvalidArgumentException(
                    "Cannot transfer ₹{$amt} from '{$fromBranch}' ({$ledgerName}): available branch balance is ₹{$fromBal}."
                );
            }

            $tDate = substr((string) ($transferRow['transfer_date'] ?? date('Y-m-d')), 0, 10);

            $vOut = $ledgerService->postVoucher([
                'tenant_code' => $tenantCode,
                'voucher_type' => 'CONTRA',
                'voucher_date' => $tDate,
                'branch_name' => $fromBranch,
                'particular' => "Inter-Branch Transfer Out ({$transferNo}) to {$toBranch}",
                'debit_ledger' => 'INTER-BRANCH SETTLEMENT CONTROL',
                'credit_ledger' => $ledgerName,
                'amount' => $amt,
                'narration' => $transferRow['remark'] ?? "Treasury transfer {$transferNo} -> {$toBranch}",
                'idempotency_key' => "FT-OUT-{$transferNo}",
                'is_liquidity_relocation' => true,
            ], $actorCode, true);

            $vIn = $ledgerService->postVoucher([
                'tenant_code' => $tenantCode,
                'voucher_type' => 'CONTRA',
                'voucher_date' => $tDate,
                'branch_name' => $toBranch,
                'particular' => "Inter-Branch Transfer In ({$transferNo}) from {$fromBranch}",
                'debit_ledger' => $ledgerName,
                'credit_ledger' => 'INTER-BRANCH SETTLEMENT CONTROL',
                'amount' => $amt,
                'narration' => $transferRow['remark'] ?? "Treasury transfer {$transferNo} <- {$fromBranch}",
                'idempotency_key' => "FT-IN-{$transferNo}",
                'is_liquidity_relocation' => true,
            ], $actorCode, true);

            if (!empty($transferRow['id'])) {
                DB::table('mfi_fund_transfers')
                    ->where('id', $transferRow['id'])
                    ->update([
                        'voucher_out_no' => $vOut->voucher_no,
                        'voucher_in_no' => $vIn->voucher_no,
                        'approved_by' => $actorCode,
                        'status' => 'APPROVED',
                        'updated_at' => now(),
                    ]);
            }

            return [
                'voucher_out_no' => $vOut->voucher_no,
                'voucher_in_no' => $vIn->voucher_no,
            ];
        });
    }

    /**
     * Generate real-time Double-Entry Trial Balance using pure BCMath.
     */
    public function getTrialBalance(?string $branchName = null, ?string $tenantCode = null): array
    {
        $tenant = $tenantCode ?? (string) config('mfi.default_tenant', 'TNT-NEEV-01');
        $branch = trim((string) $branchName);
        $useBranchSubledger = $branch !== '' && strtoupper($branch) !== 'ALL BRANCHES' && strtoupper($branch) !== 'ALL';

        $rows = [];
        $totalDr = '0.00';
        $totalCr = '0.00';
        $closingDr = '0.00';
        $closingCr = '0.00';

        if ($useBranchSubledger) {
            $ledgers = DB::table('mfi_branch_ledger_balances')
                ->where('tenant_code', $tenant)
                ->where('branch_name', $branch)
                ->orderBy('ledger_name')
                ->get();
        } else {
            $ledgers = Ledger::where('tenant_code', $tenant)->orderBy('name')->get();
        }

        foreach ($ledgers as $led) {
            $name = (string) ($led->name ?? $led->ledger_name);
            $nature = strtoupper((string) ($led->nature ?? 'ASSET'));
            $openBal = BcMathCalculator::money((string) $led->opening_balance);
            $curDr = BcMathCalculator::money((string) $led->current_debit);
            $curCr = BcMathCalculator::money((string) $led->current_credit);
            $closeBal = BcMathCalculator::money((string) $led->closing_balance);

            $totalDr = BcMathCalculator::add($totalDr, $curDr, BcMathCalculator::LEDGER_SCALE);
            $totalCr = BcMathCalculator::add($totalCr, $curCr, BcMathCalculator::LEDGER_SCALE);

            $isDrNature = in_array($nature, ['ASSET', 'EXPENSE'], true);
            if ($isDrNature) {
                if (BcMathCalculator::comp($closeBal, '0.00') >= 0) {
                    $closingDr = BcMathCalculator::add($closingDr, $closeBal, BcMathCalculator::LEDGER_SCALE);
                } else {
                    $closingCr = BcMathCalculator::add($closingCr, BcMathCalculator::abs($closeBal), BcMathCalculator::LEDGER_SCALE);
                }
            } else {
                if (BcMathCalculator::comp($closeBal, '0.00') >= 0) {
                    $closingCr = BcMathCalculator::add($closingCr, $closeBal, BcMathCalculator::LEDGER_SCALE);
                } else {
                    $closingDr = BcMathCalculator::add($closingDr, BcMathCalculator::abs($closeBal), BcMathCalculator::LEDGER_SCALE);
                }
            }

            $rows[] = [
                'name' => $name,
                'group_name' => (string) ($led->group_name ?? $nature),
                'nature' => $nature,
                'opening_balance' => $openBal,
                'current_debit' => $curDr,
                'current_credit' => $curCr,
                'closing_balance' => $closeBal,
            ];
        }

        $diff = BcMathCalculator::abs(BcMathCalculator::sub($closingDr, $closingCr, BcMathCalculator::LEDGER_SCALE));

        return [
            'branch_filter' => $useBranchSubledger ? $branch : 'ALL BRANCHES',
            'rows' => $rows,
            'ledgers' => $rows,
            'totals' => [
                'current_debit' => $totalDr,
                'current_credit' => $totalCr,
                'closing_debit' => $closingDr,
                'closing_credit' => $closingCr,
                'difference' => $diff,
                'is_balanced' => BcMathCalculator::comp($diff, '0.05') <= 0,
            ],
        ];
    }

    /**
     * Generate real-time Profit & Loss statement using pure BCMath.
     */
    public function getProfitLoss(?string $branchName = null, ?string $tenantCode = null): array
    {
        $tb = $this->getTrialBalance($branchName, $tenantCode);
        $incomeRows = [];
        $expenseRows = [];
        $totalIncome = '0.00';
        $totalExpense = '0.00';

        foreach ($tb['rows'] as $row) {
            if ($row['nature'] === 'INCOME') {
                $incomeRows[] = $row;
                $totalIncome = BcMathCalculator::add($totalIncome, $row['closing_balance'], BcMathCalculator::LEDGER_SCALE);
            } elseif ($row['nature'] === 'EXPENSE') {
                $expenseRows[] = $row;
                $totalExpense = BcMathCalculator::add($totalExpense, $row['closing_balance'], BcMathCalculator::LEDGER_SCALE);
            }
        }

        $netProfit = BcMathCalculator::sub($totalIncome, $totalExpense, BcMathCalculator::LEDGER_SCALE);

        return [
            'branch_filter' => $tb['branch_filter'],
            'total_income' => $totalIncome,
            'total_expense' => $totalExpense,
            'net_profit' => $netProfit,
            'period_net_profit' => $netProfit,
            'income_rows' => $incomeRows,
            'expense_rows' => $expenseRows,
        ];
    }

    /**
     * Generate real-time Double-Entry Balance Sheet (Assets == Liabilities + Capital + Net Profit).
     */
    public function buildBalanceSheet(?string $branchName = null, ?string $tenantCode = null): array
    {
        $tb = $this->getTrialBalance($branchName, $tenantCode);
        $pnl = $this->getProfitLoss($branchName, $tenantCode);
        $netProfit = BcMathCalculator::money($pnl['net_profit']);

        $assets = [];
        $liabilities = [];
        $totalAssets = '0.00';
        $totalLiabilities = '0.00';

        foreach ($tb['rows'] as $r) {
            $bal = BcMathCalculator::money($r['closing_balance']);
            $item = array_merge($r, [
                'ledger_name' => $r['name'],
                'group_name' => $r['group_name'] ?: $r['nature'],
                'amount' => $bal,
            ]);
            if ($r['nature'] === 'ASSET') {
                $assets[] = $item;
                $totalAssets = BcMathCalculator::add($totalAssets, $bal, BcMathCalculator::LEDGER_SCALE);
            } elseif (in_array($r['nature'], ['LIABILITY', 'EQUITY'], true)) {
                $liabilities[] = $item;
                $totalLiabilities = BcMathCalculator::add($totalLiabilities, $bal, BcMathCalculator::LEDGER_SCALE);
            }
        }

        $liabilitiesWithSurplus = $liabilities;
        if (BcMathCalculator::comp($netProfit, '0.00') !== 0) {
            $liabilitiesWithSurplus[] = [
                'name' => 'RETAINED EARNINGS & CURRENT PERIOD SURPLUS',
                'ledger_name' => 'RETAINED EARNINGS & CURRENT PERIOD SURPLUS',
                'group_name' => 'RESERVES & SURPLUS',
                'nature' => 'EQUITY',
                'closing_balance' => $netProfit,
                'amount' => $netProfit,
            ];
        }

        $liabilitiesPlusEquity = BcMathCalculator::add($totalLiabilities, $netProfit, BcMathCalculator::LEDGER_SCALE);
        $diff = BcMathCalculator::sub($totalAssets, $liabilitiesPlusEquity, BcMathCalculator::LEDGER_SCALE);

        return [
            'branch_filter' => $tb['branch_filter'],
            'assets' => $assets,
            'liabilities_and_capital' => $liabilities,
            'liabilities_and_equity' => $liabilitiesWithSurplus,
            'current_period_net_profit' => $netProfit,
            'retained_surplus_net_profit' => $netProfit,
            'total_assets' => $totalAssets,
            'total_liabilities_before_surplus' => $totalLiabilities,
            'total_liabilities_and_equity' => $liabilitiesPlusEquity,
            'difference' => $diff,
            'is_balanced' => BcMathCalculator::comp(BcMathCalculator::abs($diff), '0.05') <= 0,
        ];
    }

    /**
     * Comprehensive Real-Money Subledger-to-GL & Schedule Reconciliation.
     */
    public function buildSubledgerGlReconciliation(?string $branchName = null, ?string $tenantCode = null): array
    {
        $tenant = $tenantCode ?? (string) config('mfi.default_tenant', 'TNT-NEEV-01');
        $branch = trim((string) $branchName);
        $filterBranch = $branch !== '' && strtoupper($branch) !== 'ALL BRANCHES' && strtoupper($branch) !== 'ALL';

        $tb = $this->getTrialBalance($branchName, $tenant);
        $tbBalanced = (bool) ($tb['totals']['is_balanced'] ?? true);
        $bs = $this->buildBalanceSheet($branchName, $tenant);

        $loansQuery = DB::table('mfi_loans')
            ->where('tenant_code', $tenant)
            ->where('status', 'DISBURSED');
        if ($filterBranch) {
            $loansQuery->where('branch_name', $branch);
        }

        $subledgerPrinTotal = '0.00';
        $subledgerIntTotal = '0.00';
        $subledgerPenTotal = '0.00';
        $scheduleMismatches = [];
        $activeLoanCount = 0;

        // SQL AGGREGATE: compute subledger totals in one query.
        // Then load only loan_id list for schedule mismatch checking.
        $aggRow = $loansQuery->selectRaw(
            'COUNT(*) AS loan_count, ' .
            'COALESCE(SUM(principal_outstanding), 0) AS prin_total, ' .
            'COALESCE(SUM(interest_outstanding), 0) AS int_total, ' .
            'COALESCE(SUM(penalty_due), 0) AS pen_total'
        )->first();

        $activeLoanCount = (int) ($aggRow->loan_count ?? 0);
        $subledgerPrinTotal = BcMathCalculator::money((string) ($aggRow->prin_total ?? '0'));
        $subledgerIntTotal = BcMathCalculator::money((string) ($aggRow->int_total ?? '0'));
        $subledgerPenTotal = BcMathCalculator::money((string) ($aggRow->pen_total ?? '0'));

        // Load loan list for schedule mismatch checking (only loan_id + outstanding values).
        $loanRows = $loansQuery->select('loan_id', 'principal_outstanding', 'interest_outstanding', 'penalty_due', 'total_outstanding')->get();

        $loanIds = array_map('strval', $loanRows->pluck('loan_id')->filter()->all());

        $instsByLoan = DB::table('mfi_installments')
            ->where('tenant_code', $tenant)
            ->whereIn('loan_id', $loanIds)
            ->where('status', '!=', 'CANCELLED')
            ->orderBy('emi_no')
            ->get()
            ->groupBy('loan_id');

        foreach ($loanRows as $ln) {
            $lid = (string) $ln->loan_id;
            $pOut = BcMathCalculator::money((string) $ln->principal_outstanding);
            $iOut = BcMathCalculator::money((string) $ln->interest_outstanding);
            $penOut = BcMathCalculator::money((string) $ln->penalty_due);
            $totOut = BcMathCalculator::money((string) $ln->total_outstanding);

            $expectedTotOut = BcMathCalculator::add(
                BcMathCalculator::add($pOut, $iOut, BcMathCalculator::LEDGER_SCALE),
                $penOut,
                BcMathCalculator::LEDGER_SCALE
            );

            $insts = $instsByLoan->get($lid, collect());

            $schedUnpaidPrin = '0.00';
            $schedUnpaidInt = '0.00';
            $schedUnpaidPen = '0.00';

            foreach ($insts as $ins) {
                $stUp = strtoupper((string) $ins->status);
                $penRowDue = BcMathCalculator::max(
                    '0.00',
                    BcMathCalculator::sub((string) $ins->penalty_amount, (string) $ins->penalty_paid, BcMathCalculator::LEDGER_SCALE)
                );
                $schedUnpaidPen = BcMathCalculator::add($schedUnpaidPen, $penRowDue, BcMathCalculator::LEDGER_SCALE);
                if ($stUp === 'PAID') {
                    continue;
                }
                $paidAmt = BcMathCalculator::money((string) $ins->paid_amount);
                $iComp = BcMathCalculator::money((string) $ins->interest_component);
                $pComp = BcMathCalculator::money((string) $ins->principal_component);

                $intPaidOnRow = BcMathCalculator::min($iComp, $paidAmt);
                $remAfterInt = BcMathCalculator::sub($paidAmt, $intPaidOnRow, BcMathCalculator::LEDGER_SCALE);
                $prinPaidOnRow = BcMathCalculator::max('0.00', BcMathCalculator::min($pComp, $remAfterInt));

                $schedUnpaidInt = BcMathCalculator::add(
                    $schedUnpaidInt,
                    BcMathCalculator::max('0.00', BcMathCalculator::sub($iComp, $intPaidOnRow, BcMathCalculator::LEDGER_SCALE)),
                    BcMathCalculator::LEDGER_SCALE
                );
                $schedUnpaidPrin = BcMathCalculator::add(
                    $schedUnpaidPrin,
                    BcMathCalculator::max('0.00', BcMathCalculator::sub($pComp, $prinPaidOnRow, BcMathCalculator::LEDGER_SCALE)),
                    BcMathCalculator::LEDGER_SCALE
                );
            }

            if (
                $insts->isEmpty()
                || BcMathCalculator::comp(BcMathCalculator::abs(BcMathCalculator::sub($schedUnpaidPrin, $pOut, BcMathCalculator::LEDGER_SCALE)), '0.05') > 0
                || BcMathCalculator::comp(BcMathCalculator::abs(BcMathCalculator::sub($schedUnpaidInt, $iOut, BcMathCalculator::LEDGER_SCALE)), '0.05') > 0
                || BcMathCalculator::comp(BcMathCalculator::abs(BcMathCalculator::sub($schedUnpaidPen, $penOut, BcMathCalculator::LEDGER_SCALE)), '0.05') > 0
                || BcMathCalculator::comp(BcMathCalculator::abs(BcMathCalculator::sub($expectedTotOut, $totOut, BcMathCalculator::LEDGER_SCALE)), '0.05') > 0
            ) {
                $scheduleMismatches[] = [
                    'loan_id' => $lid,
                    'installments_count' => $insts->count(),
                    'loan_principal_outstanding' => $pOut,
                    'schedule_unpaid_principal' => $schedUnpaidPrin,
                    'loan_interest_outstanding' => $iOut,
                    'schedule_unpaid_interest' => $schedUnpaidInt,
                    'loan_penalty_due' => $penOut,
                    'schedule_unpaid_penalty' => $schedUnpaidPen,
                    'loan_total_outstanding' => $totOut,
                    'expected_total_outstanding' => $expectedTotOut,
                    'variance' => BcMathCalculator::sub($pOut, $schedUnpaidPrin, BcMathCalculator::LEDGER_SCALE),
                ];
            }
        }

        $glLoanReceivable = $filterBranch
            ? $this->getBranchLiquidBalance($branch, 'LOAN PORTFOLIO RECEIVABLE', $tenant, false)
            : BcMathCalculator::money((string) (Ledger::where('tenant_code', $tenant)->where('name', 'LOAN PORTFOLIO RECEIVABLE')->value('closing_balance') ?? '0.00'));

        $branchLiquidQuery = DB::table('mfi_branch_ledger_balances')
            ->where('tenant_code', $tenant)
            ->whereIn('ledger_name', ['CASH IN HAND', 'BANK ACCOUNT']);
        if ($filterBranch) {
            $branchLiquidQuery->where('branch_name', $branch);
        }
        $branchLiquidRows = $branchLiquidQuery->orderBy('branch_name')->orderBy('ledger_name')->get()->map(fn ($r) => (array) $r)->all();
        $negativeDrawers = array_values(array_filter(
            $branchLiquidRows,
            fn (array $r): bool => BcMathCalculator::comp((string) $r['closing_balance'], '0.00') < 0
        ));

        $chainRes = $this->verifyAuditHashChain($tenant);
        $variance = BcMathCalculator::sub($subledgerPrinTotal, $glLoanReceivable, BcMathCalculator::LEDGER_SCALE);

        $isReconciled = BcMathCalculator::comp(BcMathCalculator::abs($variance), '0.05') <= 0
            && $tbBalanced
            && $bs['is_balanced']
            && count($negativeDrawers) === 0
            && count($scheduleMismatches) === 0
            && $chainRes['is_intact'];

        return [
            'status' => $isReconciled ? 'RECONCILED_OK' : 'VARIANCE_DETECTED',
            'is_reconciled' => $isReconciled,
            'variance' => $variance,
            'trial_balance_balanced' => $tbBalanced,
            'balance_sheet_balanced' => $bs['is_balanced'],
            'active_loans_count' => $activeLoanCount,
            'active_disbursed_loans_count' => $activeLoanCount,
            'subledger_principal_outstanding' => $subledgerPrinTotal,
            'subledger_interest_outstanding' => $subledgerIntTotal,
            'subledger_penalty_outstanding' => $subledgerPenTotal,
            'gl_loan_portfolio_receivable' => $glLoanReceivable,
            'schedule_mismatches_count' => count($scheduleMismatches),
            'schedule_mismatches' => array_slice($scheduleMismatches, 0, 20),
            'branch_treasury_balances' => $branchLiquidRows,
            'negative_treasury_drawers' => $negativeDrawers,
            'audit_hash_chain_verified' => $chainRes['is_intact'],
            'hashed_audit_entries_checked' => $chainRes['checked_rows'],
        ];
    }

    /**
     * Compute deterministic SHA-256 hash chain digest for tamper-evident audit logging.
     */
    public function computeAuditHash(
        string $prevHash,
        string $userCode,
        string $action,
        string $module,
        string $recordId,
        string $details
    ): string {
        $payload = "{$prevHash}|{$userCode}|{$action}|{$module}|{$recordId}|{$details}";

        return hash('sha256', $payload);
    }

    /**
     * Append a cryptographically chained audit log entry under row lock.
     */
    public function appendChainedAuditLog(
        string $userCode,
        string $action,
        string $module,
        string $recordId,
        string $details,
        ?string $tenantCode = null
    ): void {
        $tenant = $tenantCode ?? (string) config('mfi.default_tenant', 'TNT-NEEV-01');
        $lastLog = DB::table('mfi_audit_logs')
            ->where('tenant_code', $tenant)
            ->where('entry_hash', '!=', '')
            ->orderByDesc('id')
            ->lockForUpdate()
            ->first();

        $prevHash = $lastLog ? (string) $lastLog->entry_hash : 'GENESIS';
        $entryHash = $this->computeAuditHash($prevHash, $userCode, $action, $module, $recordId, $details);

        DB::table('mfi_audit_logs')->insert([
            'tenant_code' => $tenant,
            'user_code' => $userCode,
            'action' => $action,
            'module' => $module,
            'record_id' => $recordId,
            'details' => $details,
            'prev_hash' => $prevHash,
            'entry_hash' => $entryHash,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Verify tamper-evident SHA-256 hash chain across mfi_audit_logs.
     */
    public function verifyAuditHashChain(?string $tenantCode = null): array
    {
        $tenant = $tenantCode ?? (string) config('mfi.default_tenant', 'TNT-NEEV-01');

        $rows = DB::table('mfi_audit_logs')
            ->where('tenant_code', $tenant)
            ->where('entry_hash', '!=', '')
            ->orderBy('id')
            ->get();

        $lastHash = 'GENESIS';
        $brokenAtId = null;

        foreach ($rows as $idx => $r) {
            if ($brokenAtId !== null) {
                break;
            }
            $expectedPrev = $lastHash;
            if ((string) $r->prev_hash !== $expectedPrev) {
                $brokenAtId = (int) $r->id;
                break;
            }
            $expected = $this->computeAuditHash(
                (string) $r->prev_hash ?: 'GENESIS',
                (string) $r->user_code,
                (string) $r->action,
                (string) $r->module,
                (string) $r->record_id,
                (string) $r->details
            );
            if ((string) $r->entry_hash !== $expected) {
                $brokenAtId = (int) $r->id;
                break;
            }
            $lastHash = (string) $r->entry_hash;
        }

        return [
            'is_intact' => $brokenAtId === null,
            'checked_rows' => $rows->count(),
            'broken_at_id' => $brokenAtId,
            'head_hash' => $rows->isNotEmpty() ? $lastHash : 'GENESIS',
        ];
    }
}
