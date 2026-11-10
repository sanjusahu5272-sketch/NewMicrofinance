<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Ledger;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Port of backend/core/owner_funding.py into Pure PHP 8.3+ / Laravel 11 + PostgreSQL 16.
 *
 * Manages Promoter Share Capital, Director Loan, Bank Term Loan, Cash Credit, and Refinance
 * infusions via atomic Double-Entry vouchers, plus RBI 15% Owned-Fund Capital Adequacy & Lending Headroom.
 */
class OwnerFundingService
{
    public const OWNER_FUND_HEADS = [
        'PROMOTER_SHARE_CAPITAL' => [
            'ledger' => 'PROMOTER SHARE CAPITAL',
            'alias' => 'PROM-CAP',
            'group_name' => 'CAPITAL & RESERVES',
            'nature' => 'LIABILITY',
            'kind' => 'EQUITY',
        ],
        'DIRECTOR_LOAN' => [
            'ledger' => 'DIRECTOR CAPITAL ACCOUNT',
            'alias' => 'DIR-CAP',
            'group_name' => 'BORROWINGS & FUNDS',
            'nature' => 'LIABILITY',
            'kind' => 'OWNER_LOAN',
        ],
        'BANK_TERM_LOAN' => [
            'ledger' => 'BANK WHOLESALE TERM LOAN',
            'alias' => 'BANK-TL',
            'group_name' => 'BORROWINGS & FUNDS',
            'nature' => 'LIABILITY',
            'kind' => 'BANK_BORROWING',
        ],
        'CASH_CREDIT' => [
            'ledger' => 'BANK CASH CREDIT / OVERDRAFT',
            'alias' => 'BANK-CC',
            'group_name' => 'BORROWINGS & FUNDS',
            'nature' => 'LIABILITY',
            'kind' => 'BANK_BORROWING',
        ],
        'REFINANCE' => [
            'ledger' => 'REFINANCE LINE',
            'alias' => 'REFIN',
            'group_name' => 'BORROWINGS & FUNDS',
            'nature' => 'LIABILITY',
            'kind' => 'REFINANCE',
        ],
    ];

    public const CASH_LEDGER = 'CASH IN HAND';
    public const BANK_LEDGER_DEFAULT = 'BANK ACCOUNT';
    public const OWNED_FUND_MIN_RATIO = '0.150000';

    public function __construct(
        protected DoubleEntryLedgerService $ledgerService,
        protected TreasuryReconciliationService $treasuryService
    ) {}

    /**
     * Fetch closing balance of a specific ledger head in BCMath scale = 2.
     */
    protected function ledgerBalance(string $ledgerName, string $tenantCode): string
    {
        $bal = Ledger::where('tenant_code', $tenantCode)
            ->whereRaw('UPPER(name) = UPPER(?)', [$ledgerName])
            ->value('closing_balance');

        return $bal !== null ? BcMathCalculator::money((string) $bal) : '0.00';
    }

    /**
     * Compute the owner's funding dashboard: owned funds, borrowed funds, cash/bank liquidity,
     * outstanding portfolio, and safe lending headroom at the 15% owned-fund capital adequacy ratio.
     */
    public function getFundingPosition(?string $tenantCode = null): array
    {
        $tenant = $tenantCode ?? (string) config('mfi.default_tenant', 'TNT-NEEV-01');

        $promoterCap = $this->ledgerBalance(self::OWNER_FUND_HEADS['PROMOTER_SHARE_CAPITAL']['ledger'], $tenant);
        $directorLoan = $this->ledgerBalance(self::OWNER_FUND_HEADS['DIRECTOR_LOAN']['ledger'], $tenant);
        $ownedFunds = BcMathCalculator::add($promoterCap, $directorLoan, BcMathCalculator::LEDGER_SCALE);

        $borrowedFunds = '0.00';
        foreach (['BANK_TERM_LOAN', 'CASH_CREDIT', 'REFINANCE'] as $bKey) {
            $bBal = $this->ledgerBalance(self::OWNER_FUND_HEADS[$bKey]['ledger'], $tenant);
            $borrowedFunds = BcMathCalculator::add($borrowedFunds, $bBal, BcMathCalculator::LEDGER_SCALE);
        }

        $cashInHand = $this->ledgerBalance(self::CASH_LEDGER, $tenant);
        $bankBalance = $this->ledgerBalance(self::BANK_LEDGER_DEFAULT, $tenant);
        $liquidTotal = BcMathCalculator::add($cashInHand, $bankBalance, BcMathCalculator::LEDGER_SCALE);

        $activeLoans = DB::table('mfi_loans')
            ->where('tenant_code', $tenant)
            ->whereIn(DB::raw('UPPER(status)'), ['DISBURSED', 'ACTIVE', 'OVERDUE'])
            ->pluck('total_outstanding');

        $outstandingPortfolio = '0.00';
        foreach ($activeLoans as $outVal) {
            $outstandingPortfolio = BcMathCalculator::add($outstandingPortfolio, (string) $outVal, BcMathCalculator::LEDGER_SCALE);
        }

        $maxPortfolio = BcMathCalculator::comp($ownedFunds, '0.00') > 0
            ? BcMathCalculator::roundHalfUp(
                BcMathCalculator::div($ownedFunds, self::OWNED_FUND_MIN_RATIO),
                BcMathCalculator::LEDGER_SCALE
            )
            : '0.00';

        $headRoom = BcMathCalculator::max(
            '0.00',
            BcMathCalculator::sub($maxPortfolio, $outstandingPortfolio, BcMathCalculator::LEDGER_SCALE)
        );
        $totalFunds = BcMathCalculator::add($ownedFunds, $borrowedFunds, BcMathCalculator::LEDGER_SCALE);

        $utilPct = BcMathCalculator::comp($totalFunds, '0.00') > 0
            ? BcMathCalculator::roundHalfUp(
                BcMathCalculator::mul(BcMathCalculator::div($outstandingPortfolio, $totalFunds), '100'),
                BcMathCalculator::LEDGER_SCALE
            )
            : '0.00';

        $ownedRatio = BcMathCalculator::comp($outstandingPortfolio, '0.00') > 0
            ? BcMathCalculator::roundHalfUp(
                BcMathCalculator::mul(BcMathCalculator::div($ownedFunds, $outstandingPortfolio), '100'),
                BcMathCalculator::LEDGER_SCALE
            )
            : '100.00';

        $leverageX = BcMathCalculator::roundHalfUp(
            BcMathCalculator::div('1', self::OWNED_FUND_MIN_RATIO),
            BcMathCalculator::LEDGER_SCALE
        );

        return [
            'owned_funds' => $ownedFunds,
            'promoter_capital' => $promoterCap,
            'owner_loan' => $directorLoan,
            'borrowed_funds' => $borrowedFunds,
            'total_funds' => $totalFunds,
            'cash_in_hand' => $cashInHand,
            'bank_balance' => $bankBalance,
            'liquid_total' => $liquidTotal,
            'outstanding_portfolio' => $outstandingPortfolio,
            'max_safe_portfolio' => $maxPortfolio,
            'lending_head_room' => $headRoom,
            'fund_utilisation_pct' => $utilPct,
            'owned_fund_cover_pct' => $ownedRatio,
            'owned_fund_min_ratio_pct' => '15.00',
            'leverage_x' => $leverageX,
            'can_lend_now' => BcMathCalculator::min($headRoom, $liquidTotal),
        ];
    }

    /**
     * Post a real capital or wholesale borrowing infusion via atomic double-entry RECEIPT voucher.
     */
    public function addOwnerFund(array $payload, string $actorCode = 'ADM01'): array
    {
        return DB::transaction(function () use ($payload, $actorCode): array {
            $tenant = (string) ($payload['tenant_code'] ?? config('mfi.default_tenant', 'TNT-NEEV-01'));
            $fundHead = strtoupper(trim((string) ($payload['fund_head'] ?? '')));

            if (!isset(self::OWNER_FUND_HEADS[$fundHead])) {
                throw new InvalidArgumentException(
                    'fund_head must be one of: ' . implode(', ', array_keys(self::OWNER_FUND_HEADS))
                );
            }

            $head = self::OWNER_FUND_HEADS[$fundHead];
            $amt = BcMathCalculator::money((string) ($payload['amount'] ?? '0.00'));
            if (BcMathCalculator::comp($amt, '0.00') <= 0) {
                throw new InvalidArgumentException('Funding amount must be greater than zero.');
            }

            $receivedIn = strtoupper(trim((string) ($payload['received_in'] ?? 'BANK')));
            if (!in_array($receivedIn, ['CASH', 'BANK'], true)) {
                throw new InvalidArgumentException('received_in must be CASH or BANK.');
            }

            $debitLedger = $receivedIn === 'CASH' ? self::CASH_LEDGER : self::BANK_LEDGER_DEFAULT;
            $bankAccount = trim((string) ($payload['bank_account'] ?? ''));

            if ($receivedIn === 'BANK') {
                $bankQuery = DB::table('mfi_bank_accounts')
                    ->where('tenant_code', $tenant)
                    ->whereRaw("UPPER(status) = 'ACTIVE'");
                if ($bankAccount !== '') {
                    $bankQuery->where('account_no', $bankAccount);
                }
                if (!$bankQuery->exists()) {
                    throw new InvalidArgumentException(
                        'No active bank account found. Add the bank account first in Master > Bank Account, then select it while posting the fund entry.'
                    );
                }
            }

            $fundDate = substr((string) ($payload['fund_date'] ?? date('Y-m-d')), 0, 10);
            $branchName = strtoupper(trim((string) ($payload['branch_name'] ?? 'INDORE HEAD OFFICE'))) ?: 'INDORE HEAD OFFICE';
            $reference = trim((string) ($payload['reference'] ?? ''));
            $rate = $payload['interest_rate_pct'] ?? null;
            $terms = trim((string) ($payload['repayment_terms'] ?? ''));

            $refTxt = $reference !== '' ? " Ref: {$reference}." : '';
            $rateTxt = ($rate !== null && $rate !== '') ? " Rate {$rate}% p.a." : '';
            $termsTxt = $terms !== '' ? " Terms: {$terms}." : '';
            $kindTitle = ucwords(strtolower(str_replace('_', ' ', $head['kind'])));
            $narration = "{$kindTitle} infusion of Rs.{$amt} into {$debitLedger} against {$head['ledger']}.{$refTxt}{$rateTxt}{$termsTxt}";

            $voucher = $this->ledgerService->postVoucher([
                'tenant_code' => $tenant,
                'voucher_type' => 'RECEIPT',
                'voucher_date' => $fundDate,
                'branch_name' => $branchName,
                'particular' => "{$kindTitle} infusion — {$head['ledger']}",
                'debit_ledger' => $debitLedger,
                'credit_ledger' => $head['ledger'],
                'amount' => $amt,
                'narration' => $narration,
                'idempotency_key' => !empty($payload['idempotency_key']) ? (string) $payload['idempotency_key'] : null,
            ], $actorCode, true);

            $this->treasuryService->appendChainedAuditLog(
                $actorCode,
                'OWNER_FUND_INFUSION',
                'ACCOUNTING',
                (string) $voucher->voucher_no,
                "{$head['ledger']} +{$amt} into {$debitLedger} ({$fundHead})",
                $tenant
            );

            return [
                'voucher' => $voucher->toArray(),
                'fund_head' => $fundHead,
                'ledger' => $head['ledger'],
                'position' => $this->getFundingPosition($tenant),
            ];
        });
    }

    /**
     * Pay Director / Promoter Interest via atomic PAYMENT voucher with treasury sufficiency guard.
     */
    public function payDirectorInterest(array $payload, string $actorCode = 'ADM01'): array
    {
        return DB::transaction(function () use ($payload, $actorCode): array {
            $tenant = (string) ($payload['tenant_code'] ?? config('mfi.default_tenant', 'TNT-NEEV-01'));
            $amt = BcMathCalculator::money((string) ($payload['amount'] ?? '0.00'));
            if (BcMathCalculator::comp($amt, '0.00') <= 0) {
                throw new InvalidArgumentException('Director interest amount must be greater than zero.');
            }

            $payMode = strtoupper(trim((string) ($payload['pay_mode'] ?? 'BANK TRANSFER')));
            $creditLedger = str_contains($payMode, 'CASH') ? self::CASH_LEDGER : self::BANK_LEDGER_DEFAULT;
            $branchName = trim((string) ($payload['branch_name'] ?? 'INDORE HEAD OFFICE')) ?: 'INDORE HEAD OFFICE';
            $directorName = trim((string) ($payload['director_name'] ?? 'PROMOTER DIRECTOR'));
            $payDate = substr((string) ($payload['payment_date'] ?? date('Y-m-d')), 0, 10);

            $voucher = $this->ledgerService->postVoucher([
                'tenant_code' => $tenant,
                'voucher_type' => 'PAYMENT',
                'voucher_date' => $payDate,
                'branch_name' => $branchName,
                'particular' => "Director Capital Interest Paid - {$directorName}",
                'debit_ledger' => 'DIRECTOR INTEREST EXPENSE',
                'credit_ledger' => $creditLedger,
                'amount' => $amt,
                'narration' => $payload['remark'] ?? "Interest on Director Loan paid to {$directorName}",
                'idempotency_key' => $payload['idempotency_key'] ?? null,
            ], $actorCode, true);

            return [
                'status' => 'POSTED',
                'voucher' => $voucher->toArray(),
            ];
        });
    }

    /**
     * List existing owner fund + borrowing ledgers with live balances and active bank accounts.
     */
    public function getFundingLedgers(?string $tenantCode = null): array
    {
        $tenant = $tenantCode ?? (string) config('mfi.default_tenant', 'TNT-NEEV-01');

        $ledgers = Ledger::where('tenant_code', $tenant)
            ->whereIn(DB::raw('UPPER(group_name)'), [
                'CAPITAL & RESERVES',
                'BORROWINGS & FUNDS',
                'CAPITAL & LIABILITIES',
                'CAPITAL ACCOUNT',
                'LIABILITIES',
            ])
            ->orderBy('name')
            ->limit(500)
            ->get()
            ->toArray();

        $banks = DB::table('mfi_bank_accounts')
            ->where('tenant_code', $tenant)
            ->whereRaw("UPPER(status) = 'ACTIVE'")
            ->limit(100)
            ->get()
            ->map(fn ($b) => (array) $b)
            ->all();

        $heads = [];
        foreach (self::OWNER_FUND_HEADS as $code => $meta) {
            $heads[] = [
                'code' => $code,
                'ledger' => $meta['ledger'],
                'kind' => $meta['kind'],
                'balance' => $this->ledgerBalance($meta['ledger'], $tenant),
            ];
        }

        return [
            'owner_fund_heads' => $heads,
            'ledgers' => $ledgers,
            'bank_accounts' => $banks,
        ];
    }
}
