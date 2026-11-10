<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\EmiCollection;
use App\Models\Installment;
use App\Models\Ledger;
use App\Models\Loan;
use App\Models\LoanPlan;
use DateTimeImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;
use RuntimeException;

/**
 * Port of backend/core/collections_npa_engine.py into Pure PHP 8.3+ / Laravel 11 + PostgreSQL 16.
 *
 * Implements production NBFC-MFI repayment & asset-quality controls using pure BCMath:
 * 1. Digital Payment Order & Bank UTR Uniqueness Enforcement (validateAndCheckUniqueUtr, createPaymentOrder).
 * 2. Cheque / eNACH / AutoPay / UPI Dishonour & Bounce Engine (dishonourBounceCollection).
 * 3. RBI Master Direction DPD / SMA-0 / SMA-1 / SMA-2 / NPA Classification & Provisioning
 *    (mapDpdToRbiAssetClass, classifyPortfolioDpdSmaNpa).
 * 4. Decimal-exact RBI Non-Capitalized Penal Charge Engine (assessOverduePenaltiesDecimal).
 */
class CollectionsNpaService
{
    public const NON_CASH_MODES = [
        'BANK',
        'BANK TRANSFER',
        'NEFT',
        'RTGS',
        'IMPS',
        'UPI',
        'UPI QR',
        'ONLINE',
        'CHEQUE',
        'ENACH',
        'AUTOPAY',
    ];

    public function __construct(
        protected DoubleEntryLedgerService $ledgerService,
        protected TreasuryReconciliationService $treasuryService
    ) {}

    /**
     * Normalize and verify bank UTR / RRN / Cheque reference number.
     * Prevents duplicate UTR replay across active collections, settlements, and disbursements.
     */
    public function validateAndCheckUniqueUtr(
        string $paymentMode,
        ?string $utrNo,
        bool $requireUtr = false,
        ?int $excludeCollectionId = null,
        ?string $tenantCode = null
    ): string {
        $tenant = $tenantCode ?? (string) config('mfi.default_tenant', 'TNT-NEEV-01');
        $modeUp = strtoupper(trim($paymentMode ?: 'CASH'));
        $cleaned = strtoupper((string) preg_replace('/\s+/', '', (string) $utrNo));

        $strictGlobal = in_array(
            strtoupper($this->treasuryService->getSystemSettingValue('REQUIRE_STRICT_DIGITAL_UTR', 'NO', $tenant)),
            ['YES', 'TRUE', '1'],
            true
        );

        if (($requireUtr || $strictGlobal) && in_array($modeUp, self::NON_CASH_MODES, true) && $cleaned === '') {
            throw new InvalidArgumentException("Valid Bank UTR / Reference / Instrument No. is mandatory for {$modeUp} transactions.");
        }

        if ($cleaned === '') {
            return '';
        }

        if (strlen($cleaned) < 6 || !preg_match('/^[A-Z0-9\-_\/]{6,48}$/', $cleaned)) {
            throw new InvalidArgumentException("Invalid UTR / Reference format '{$cleaned}'. Must be 6–48 alphanumeric characters.");
        }

        $colQuery = DB::table('mfi_emi_collections')
            ->where('tenant_code', $tenant)
            ->whereRaw('UPPER(COALESCE(utr_no, \'\')) = ?', [$cleaned])
            ->whereNotIn(DB::raw('UPPER(COALESCE(status, \'\'))'), ['REVERSED', 'BOUNCED', 'REJECTED']);

        if ($excludeCollectionId !== null) {
            $colQuery->where('id', '!=', $excludeCollectionId);
        }

        $dupCol = $colQuery->first();
        if ($dupCol) {
            throw new InvalidArgumentException(
                "Duplicate UTR '{$cleaned}' blocked: already recorded on Receipt {$dupCol->receipt_no} (Loan {$dupCol->loan_id})."
            );
        }

        $dupSettle = DB::table('mfi_loan_settlements')
            ->where('tenant_code', $tenant)
            ->whereRaw('UPPER(COALESCE(utr_no, \'\')) = ?', [$cleaned])
            ->whereNotIn(DB::raw('UPPER(COALESCE(status, \'\'))'), ['REVERSED', 'REJECTED'])
            ->first();

        if ($dupSettle) {
            throw new InvalidArgumentException(
                "Duplicate UTR '{$cleaned}' blocked: already used in Settlement #{$dupSettle->id} (Loan {$dupSettle->loan_id})."
            );
        }

        $dupDisb = DB::table('mfi_loans')
            ->where('tenant_code', $tenant)
            ->whereRaw('UPPER(COALESCE(utr_no, \'\')) = ?', [$cleaned])
            ->whereNotIn(DB::raw('UPPER(COALESCE(status, \'\'))'), ['DISBURSEMENT_REVERSED', 'REJECTED'])
            ->first();

        if ($dupDisb) {
            throw new InvalidArgumentException(
                "Duplicate UTR '{$cleaned}' blocked: already used in Disbursement of Loan {$dupDisb->loan_id}."
            );
        }

        return $cleaned;
    }

    /**
     * Create a tracked payment order before UPI/Gateway collection for deterministic reconciliation.
     */
    public function createPaymentOrder(array $payload, string $actorCode = 'ADM01'): array
    {
        return DB::transaction(function () use ($payload, $actorCode): array {
            $loanKey = trim((string) ($payload['loan_id'] ?? ''));
            $amt = BcMathCalculator::money((string) ($payload['amount'] ?? '0.00'));

            if (BcMathCalculator::comp($amt, '0.00') <= 0) {
                throw new InvalidArgumentException('Payment order amount must be greater than ₹0.00.');
            }

            $loan = Loan::where('loan_id', $loanKey)
                ->orWhere('application_no', $loanKey)
                ->orWhere('id', is_numeric($loanKey) ? (int) $loanKey : 0)
                ->lockForUpdate()
                ->firstOrFail();

            $orderId = 'ORD-' . date('Ymd') . '-' . strtoupper(substr(Str::uuid()->toString(), 0, 8));
            $provider = strtoupper(trim((string) ($payload['provider'] ?? 'UPI_BANK_DIRECT')));
            $purpose = strtoupper(trim((string) ($payload['purpose'] ?? 'EMI_COLLECTION')));
            $tenantCode = (string) ($loan->tenant_code ?: config('mfi.default_tenant', 'TNT-NEEV-01'));

            $id = DB::table('mfi_payment_orders')->insertGetId([
                'tenant_code' => $tenantCode,
                'order_id' => $orderId,
                'loan_id' => $loan->loan_id ?: $loan->application_no,
                'member_code' => $loan->member_code ?: '',
                'member_name' => $loan->member_name ?: '',
                'purpose' => $purpose,
                'amount' => $amt,
                'currency' => 'INR',
                'provider' => $provider,
                'status' => 'CREATED',
                'utr_no' => '',
                'gateway_payment_id' => '',
                'receipt_no' => '',
                'created_by' => $actorCode,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return (array) DB::table('mfi_payment_orders')->where('id', $id)->first();
        });
    }

    /**
     * Process a bounced Cheque / eNACH / AutoPay / UPI collection:
     * 1. Posts reversal vouchers unwinding Principal, Interest, and Penalty GL entries.
     * 2. Restores unpaid installment amounts and loan principal/interest outstanding.
     * 3. Assesses non-compounding bounce_charge onto earliest unpaid installment & loan.penalty_due,
     *    and increments loan.bounce_count.
     */
    public function dishonourBounceCollection(
        string|int $receiptIdentifier,
        string $bounceReason = 'Insufficient Funds / Instrument Dishonoured',
        string|int|null $bounceCharge = null,
        string $actorCode = 'ADM01',
        string $callerRole = 'ADMIN'
    ): array {
        if (!in_array(strtoupper(trim($callerRole)), ['ADMIN', 'SUPER ADMIN', 'BRANCH MANAGER', 'ACCOUNTANT'], true)) {
            throw new RuntimeException('Bounce / Dishonour processing requires Admin, Branch Manager, or Accountant role.');
        }

        return DB::transaction(function () use ($receiptIdentifier, $bounceReason, $bounceCharge, $actorCode): array {
            $col = EmiCollection::where('receipt_no', (string) $receiptIdentifier)
                ->orWhere('id', is_numeric($receiptIdentifier) ? (int) $receiptIdentifier : 0)
                ->lockForUpdate()
                ->firstOrFail();

            if (in_array(strtoupper((string) $col->status), ['BOUNCED', 'REVERSED'], true)) {
                throw new InvalidArgumentException("Receipt {$col->receipt_no} is already {$col->status}.");
            }

            $loan = Loan::where('id', $col->loan_pk)
                ->orWhere('loan_id', $col->loan_id)
                ->lockForUpdate()
                ->firstOrFail();

            $tenantCode = (string) ($loan->tenant_code ?: config('mfi.default_tenant', 'TNT-NEEV-01'));
            $payModeUp = strtoupper((string) $col->payment_mode);
            $liquidLedger = (str_contains($payModeUp, 'CASH') && !str_contains($payModeUp, 'CASHFREE'))
                ? 'CASH IN HAND'
                : 'BANK ACCOUNT';

            $prinRev = BcMathCalculator::money((string) $col->principal_allocated);
            $intRev = BcMathCalculator::money((string) $col->interest_allocated);
            $penRev = BcMathCalculator::money((string) $col->penalty_allocated);
            $reversalVouchers = [];

            if (BcMathCalculator::comp($prinRev, '0.00') > 0) {
                $vPrin = $this->ledgerService->postVoucher([
                    'tenant_code' => $tenantCode,
                    'voucher_type' => 'JOURNAL',
                    'voucher_date' => date('Y-m-d'),
                    'branch_name' => $loan->branch_name,
                    'loan_id' => $loan->loan_id,
                    'particular' => "BOUNCE REVERSAL Principal ({$col->receipt_no}) - {$bounceReason}",
                    'debit_ledger' => 'LOAN PORTFOLIO RECEIVABLE',
                    'credit_ledger' => $liquidLedger,
                    'amount' => $prinRev,
                    'idempotency_key' => "BOUNCE-PRIN-{$col->receipt_no}",
                ], $actorCode, true);
                $reversalVouchers[] = $vPrin->voucher_no;
            }

            if (BcMathCalculator::comp($intRev, '0.00') > 0) {
                $vInt = $this->ledgerService->postVoucher([
                    'tenant_code' => $tenantCode,
                    'voucher_type' => 'JOURNAL',
                    'voucher_date' => date('Y-m-d'),
                    'branch_name' => $loan->branch_name,
                    'loan_id' => $loan->loan_id,
                    'particular' => "BOUNCE REVERSAL Interest ({$col->receipt_no}) - {$bounceReason}",
                    'debit_ledger' => 'LOAN INTEREST INCOME',
                    'credit_ledger' => $liquidLedger,
                    'amount' => $intRev,
                    'idempotency_key' => "BOUNCE-INT-{$col->receipt_no}",
                ], $actorCode, true);
                $reversalVouchers[] = $vInt->voucher_no;
            }

            if (BcMathCalculator::comp($penRev, '0.00') > 0) {
                $vPen = $this->ledgerService->postVoucher([
                    'tenant_code' => $tenantCode,
                    'voucher_type' => 'JOURNAL',
                    'voucher_date' => date('Y-m-d'),
                    'branch_name' => $loan->branch_name,
                    'loan_id' => $loan->loan_id,
                    'particular' => "BOUNCE REVERSAL Penalty ({$col->receipt_no}) - {$bounceReason}",
                    'debit_ledger' => 'PENALTY & BOUNCE CHARGE INCOME',
                    'credit_ledger' => $liquidLedger,
                    'amount' => $penRev,
                    'idempotency_key' => "BOUNCE-PEN-{$col->receipt_no}",
                ], $actorCode, true);
                $reversalVouchers[] = $vPen->voucher_no;
            }

            // Determine non-compounding bounce charge
            if ($bounceCharge !== null && trim((string) $bounceCharge) !== '') {
                $chargeAmt = BcMathCalculator::money($bounceCharge);
            } else {
                $plan = LoanPlan::where('id', $loan->plan_id)
                    ->orWhere('plan_name', $loan->plan_name)
                    ->first();
                $chargeAmt = $plan ? BcMathCalculator::money((string) $plan->bounce_charge_amount) : '250.00';
            }

            // Restore installment paid amount on the target installment
            $inst = Installment::where('loan_id', $loan->loan_id)
                ->where('emi_no', $col->emi_no)
                ->lockForUpdate()
                ->first();

            if (!$inst) {
                $inst = Installment::where('loan_id', $loan->loan_id)
                    ->where('paid_amount', '>', 0)
                    ->orderByDesc('emi_no')
                    ->lockForUpdate()
                    ->first();
            }

            $emiPaidReversed = BcMathCalculator::add($prinRev, $intRev, BcMathCalculator::LEDGER_SCALE);
            if ($inst) {
                $newInstPaid = BcMathCalculator::max(
                    '0.00',
                    BcMathCalculator::sub((string) $inst->paid_amount, $emiPaidReversed, BcMathCalculator::LEDGER_SCALE)
                );
                $newPenPaid = BcMathCalculator::max(
                    '0.00',
                    BcMathCalculator::sub((string) $inst->penalty_paid, $penRev, BcMathCalculator::LEDGER_SCALE)
                );
                $newPenAmt = BcMathCalculator::add((string) $inst->penalty_amount, $chargeAmt, BcMathCalculator::LEDGER_SCALE);
                $inst->update([
                    'paid_amount' => $newInstPaid,
                    'penalty_paid' => $newPenPaid,
                    'penalty_amount' => $newPenAmt,
                    'status' => BcMathCalculator::comp($newInstPaid, '0.00') > 0 ? 'PARTIAL' : 'OVERDUE',
                ]);
            }

            $newPrinOut = BcMathCalculator::add((string) $loan->principal_outstanding, $prinRev, BcMathCalculator::LEDGER_SCALE);
            $newIntOut = BcMathCalculator::add((string) $loan->interest_outstanding, $intRev, BcMathCalculator::LEDGER_SCALE);
            $newPenDue = BcMathCalculator::add(
                BcMathCalculator::add((string) $loan->penalty_due, $penRev, BcMathCalculator::LEDGER_SCALE),
                $chargeAmt,
                BcMathCalculator::LEDGER_SCALE
            );
            $newTotOut = BcMathCalculator::add(
                BcMathCalculator::add($newPrinOut, $newIntOut, BcMathCalculator::LEDGER_SCALE),
                $newPenDue,
                BcMathCalculator::LEDGER_SCALE
            );
            $newTotCol = BcMathCalculator::max(
                '0.00',
                BcMathCalculator::sub((string) $loan->total_collected, (string) $col->amount, BcMathCalculator::LEDGER_SCALE)
            );
            $newBounceCount = ((int) ($loan->bounce_count ?? 0)) + 1;

            $loan->update([
                'principal_outstanding' => $newPrinOut,
                'interest_outstanding' => $newIntOut,
                'penalty_due' => $newPenDue,
                'total_outstanding' => $newTotOut,
                'total_collected' => $newTotCol,
                'bounce_count' => $newBounceCount,
                'status' => 'DISBURSED',
            ]);

            // Record bounce metadata on the collection row via controlled status transition
            DB::table('mfi_emi_collections')
                ->where('id', $col->id)
                ->update([
                    'status' => 'BOUNCED',
                    'bounced_at' => now()->toIso8601String(),
                    'bounce_reason' => $bounceReason,
                    'bounce_charge' => $chargeAmt,
                    'updated_at' => now(),
                ]);

            $this->treasuryService->appendChainedAuditLog(
                $actorCode,
                'COLLECTION_BOUNCED',
                'COLLECTIONS',
                (string) $col->receipt_no,
                "Dishonoured {$col->receipt_no} on {$loan->loan_id}; bounce_charge=₹{$chargeAmt}; reason={$bounceReason}",
                $tenantCode
            );

            return [
                'status' => 'BOUNCED',
                'receipt_no' => $col->receipt_no,
                'loan_id' => $loan->loan_id,
                'bounce_reason' => $bounceReason,
                'bounce_charge_assessed' => $chargeAmt,
                'bounce_count' => $newBounceCount,
                'loan_penalty_due' => $newPenDue,
                'reversal_vouchers' => $reversalVouchers,
            ];
        });
    }

    /**
     * Map Days Past Due (DPD) to RBI IRACP asset class and provisioning rate percentage.
     *
     * Delegates to RbiProvisioningEngine — the single source of truth for the
     * DPD ladder and the provisioning percentages. The rates that lived here
     * (STANDARD 1%, SMA-0 1%, SMA-1 2%, SMA-2 5%, SUB-STANDARD 15%, DOUBTFUL 50%)
     * were a third, inconsistent reading of the RBI table that disagreed with
     * both the settlement engine and the provisioning engine.
     *
     * @return array{0: string, 1: string} [rbi_asset_class, rbi_provision_rate_pct]
     */
    public function mapDpdToRbiAssetClass(int $dpdDays): array
    {
        // Pass a dummy outstanding of 100 so the provision RATE (not the amount)
        // is computed correctly. Passing '0.00' would make every rate 0.00.
        $c = (new \App\Services\RbiProvisioningEngine())->classifyLoan(
            $dpdDays,
            '100.00',
            '0.00'
        );

        return [$c['asset_class'], $c['provision_rate_pct']];
    }

    /**
     * Evaluate exact Days Past Due (DPD), RBI SMA-0/1/2 & NPA classification, and required
     * Loan Loss Provisioning across active loans using pure BCMath.
     */
    public function classifyPortfolioDpdSmaNpa(
        ?string $asOfDate = null,
        ?string $branchName = null,
        bool $persist = false,
        bool $postProvisionVoucher = false,
        string $actorCode = 'ADM01',
        ?string $tenantCode = null
    ): array {
        $tenant = $tenantCode ?? (string) config('mfi.default_tenant', 'TNT-NEEV-01');
        $refDateStr = $asOfDate ? substr(trim($asOfDate), 0, 10) : date('Y-m-d');
        $refDt = new DateTimeImmutable($refDateStr);
        $branch = trim((string) $branchName);
        $filterBranch = $branch !== '' && strtoupper($branch) !== 'ALL BRANCHES' && strtoupper($branch) !== 'ALL';

        $bucketNames = [
            'STANDARD',
            'SMA-0',
            'SMA-1',
            'SMA-2',
            'SUB-STANDARD (NPA)',
            'DOUBTFUL-1 (NPA)',
            'LOSS / DOUBTFUL-2 (NPA)',
        ];
        $buckets = [];
        foreach ($bucketNames as $bName) {
            $buckets[$bName] = [
                'count' => 0,
                'principal_exposure' => '0.00',
                'required_provision' => '0.00',
            ];
        }

        // Map RBI asset class names to bucket display names
        $assetClassToBucket = [
            'STANDARD' => 'STANDARD',
            'SMA-0' => 'SMA-0',
            'SMA-1' => 'SMA-1',
            'SMA-2' => 'SMA-2',
            'SUB-STANDARD' => 'SUB-STANDARD (NPA)',
            'DOUBTFUL-1' => 'DOUBTFUL-1 (NPA)',
            'DOUBTFUL-2' => 'LOSS / DOUBTFUL-2 (NPA)',
            'DOUBTFUL-3' => 'LOSS / DOUBTFUL-2 (NPA)',
            'LOSS' => 'LOSS / DOUBTFUL-2 (NPA)',
        ];

        $runner = function () use (
            $tenant,
            $refDateStr,
            $refDt,
            $branch,
            $filterBranch,
            $persist,
            $postProvisionVoucher,
            $actorCode,
            &$buckets,
            $assetClassToBucket
        ): array {
            file_put_contents(storage_path('logs/npa_debug.log'), "[" . date('Y-m-d H:i:s') . "] Runner started, tenant=$tenant\n", FILE_APPEND);

            // SQL AGGREGATE: compute max DPD per loan in a single query.
            // Avoids loading all loans + installments into PHP memory.
            // This is O(loans) in PHP memory, not O(loans × installments).
            $sql = 'SELECT l.loan_id, l.id, l.principal_outstanding, ' .
                'COALESCE(MAX(CASE WHEN i.due_date < ? THEN GREATEST(0, (?::date - i.due_date)) ELSE 0 END), 0) AS max_dpd ' .
                'FROM mfi_loans l ' .
                'LEFT JOIN mfi_installments i ON i.loan_id = l.loan_id AND i.tenant_code = l.tenant_code AND i.status NOT IN (?, ?) ' .
                'WHERE l.tenant_code = ? AND l.status = ? ' .
                ($filterBranch ? 'AND l.branch_name = ? ' : '') .
                'GROUP BY l.loan_id, l.id, l.principal_outstanding ' .
                'ORDER BY l.id';

            $bindings = array_merge(
                [$refDateStr, $refDateStr, 'PAID', 'CANCELLED', $tenant, 'DISBURSED'],
                $filterBranch ? [$branch] : []
            );

            $loanDpdRows = DB::select($sql, $bindings);
            file_put_contents(storage_path('logs/npa_debug.log'), "[" . date('Y-m-d H:i:s') . "] Loan aggregate done, loans=" . count($loanDpdRows) . "\n", FILE_APPEND);

            $totalLoanCount = 0;
            $npaLoanCount = 0;
            $totalPortfolio = '0.00';
            $totalProvisionRequired = '0.00';
            $npaPrincipal = '0.00';
            $par30Principal = '0.00';
            $par90Principal = '0.00';
            $provisionVoucherNo = null;
            $deltaProv = '0.00';

            foreach ($loanDpdRows as $row) {
                $lid = (string) $row->loan_id;
                $pOut = BcMathCalculator::money((string) $row->principal_outstanding);
                $maxDpd = (int) $row->max_dpd;
                $totalPortfolio = BcMathCalculator::add($totalPortfolio, $pOut, BcMathCalculator::LEDGER_SCALE);

                // When persist=true, update individual installments and loans.
                // When persist=false (read-only), skip all UPDATEs — SQL aggregate is sufficient.
                if ($persist) {
                    // Update each installment's DPD, asset_class, and status
                    $instRows = DB::table('mfi_installments')
                        ->where('tenant_code', $tenant)
                        ->where('loan_id', $lid)
                        ->whereNotIn('status', ['PAID', 'CANCELLED'])
                        ->orderBy('due_date')
                        ->get();

                    foreach ($instRows as $ins) {
                        $rem = BcMathCalculator::sub((string) $ins->emi_amount, (string) $ins->paid_amount, BcMathCalculator::LEDGER_SCALE);
                        if (BcMathCalculator::comp($rem, '0.00') <= 0) {
                            continue;
                        }
                        $dueDt = new DateTimeImmutable(substr((string) $ins->due_date, 0, 10));
                        $diffDays = (int) $dueDt->diff($refDt)->format('%r%a');
                        $dpd = max(0, $diffDays);
                        [$insClass] = $this->mapDpdToRbiAssetClass($dpd);

                        $newSt = ($dpd > 0 && strtoupper((string) $ins->status) === 'DUE') ? 'OVERDUE' : $ins->status;
                        DB::table('mfi_installments')
                            ->where('id', $ins->id)
                            ->update([
                                'dpd_days' => $dpd,
                                'asset_class' => $insClass,
                                'status' => $newSt,
                                'updated_at' => now(),
                            ]);
                    }
                }

                [$assetClass, $provRate] = $this->mapDpdToRbiAssetClass($maxDpd);
                $reqProv = BcMathCalculator::percentageOf($pOut, $provRate);
                $totalProvisionRequired = BcMathCalculator::add($totalProvisionRequired, $reqProv, BcMathCalculator::LEDGER_SCALE);

                if ($maxDpd > 30) {
                    $par30Principal = BcMathCalculator::add($par30Principal, $pOut, BcMathCalculator::LEDGER_SCALE);
                }
                if ($maxDpd > 90) {
                    $par90Principal = BcMathCalculator::add($par90Principal, $pOut, BcMathCalculator::LEDGER_SCALE);
                    $npaPrincipal = BcMathCalculator::add($npaPrincipal, $pOut, BcMathCalculator::LEDGER_SCALE);
                }

                $bucketKey = $assetClassToBucket[$assetClass] ?? $assetClass;
                $buckets[$bucketKey]['count']++;
                $buckets[$bucketKey]['principal_exposure'] = BcMathCalculator::add(
                    $buckets[$bucketKey]['principal_exposure'],
                    $pOut,
                    BcMathCalculator::LEDGER_SCALE
                );
                $buckets[$bucketKey]['required_provision'] = BcMathCalculator::add(
                    $buckets[$bucketKey]['required_provision'],
                    $reqProv,
                    BcMathCalculator::LEDGER_SCALE
                );

                if ($persist) {
                    DB::table('mfi_loans')
                        ->where('id', $row->id)
                        ->update([
                            'dpd_days' => $maxDpd,
                            'asset_class' => $assetClass,
                            'npa_provision_amount' => $reqProv,
                            'updated_at' => now(),
                        ]);
                }

                // Counters — do NOT accumulate per-loan detail arrays.
                $totalLoanCount++;
                if ($maxDpd > 90) {
                    $npaLoanCount++;
                }
            }

            if ($persist && $postProvisionVoucher) {
                $existingProv = $filterBranch
                    ? $this->treasuryService->getBranchLiquidBalance($branch, 'PROVISION FOR STANDARD & NPA ASSETS', $tenant, true)
                    : BcMathCalculator::money((string) (Ledger::where('tenant_code', $tenant)->where('name', 'PROVISION FOR STANDARD & NPA ASSETS')->lockForUpdate()->value('closing_balance') ?? '0.00'));

                $deltaProv = BcMathCalculator::sub($totalProvisionRequired, $existingProv, BcMathCalculator::LEDGER_SCALE);
                if (BcMathCalculator::comp($deltaProv, '0.00') > 0) {
                    $vProv = $this->ledgerService->postVoucher([
                        'tenant_code' => $tenant,
                        'voucher_type' => 'JOURNAL',
                        'voucher_date' => $refDateStr,
                        'branch_name' => $filterBranch ? $branch : 'INDORE HEAD OFFICE',
                        'particular' => "RBI IRAC Standard/NPA Provisioning as of {$refDateStr}",
                        'debit_ledger' => 'NPA PROVISION EXPENSE',
                        'credit_ledger' => 'PROVISION FOR STANDARD & NPA ASSETS',
                        'amount' => $deltaProv,
                        'idempotency_key' => "EOD-PROV-{$refDateStr}-" . ($filterBranch ? $branch : 'ALL') . "-{$totalProvisionRequired}",
                    ], $actorCode, true);
                    $provisionVoucherNo = $vProv->voucher_no;
                } elseif (BcMathCalculator::comp($deltaProv, '0.00') < 0) {
                    $absDelta = BcMathCalculator::abs($deltaProv);
                    $vProv = $this->ledgerService->postVoucher([
                        'tenant_code' => $tenant,
                        'voucher_type' => 'JOURNAL',
                        'voucher_date' => $refDateStr,
                        'branch_name' => $filterBranch ? $branch : 'INDORE HEAD OFFICE',
                        'particular' => "RBI IRAC Provision Write-Back as of {$refDateStr}",
                        'debit_ledger' => 'PROVISION FOR STANDARD & NPA ASSETS',
                        'credit_ledger' => 'NPA PROVISION EXPENSE',
                        'amount' => $absDelta,
                        'idempotency_key' => "EOD-PROV-WB-{$refDateStr}-" . ($filterBranch ? $branch : 'ALL') . "-{$totalProvisionRequired}",
                    ], $actorCode, true);
                    $provisionVoucherNo = $vProv->voucher_no;
                }
            }

            $gnpaPct = BcMathCalculator::comp($totalPortfolio, '0.00') > 0
                ? BcMathCalculator::roundHalfUp(
                    BcMathCalculator::div(BcMathCalculator::mul($npaPrincipal, '100'), $totalPortfolio),
                    BcMathCalculator::LEDGER_SCALE
                )
                : '0.00';

            $par30Pct = BcMathCalculator::comp($totalPortfolio, '0.00') > 0
                ? BcMathCalculator::roundHalfUp(
                    BcMathCalculator::div(BcMathCalculator::mul($par30Principal, '100'), $totalPortfolio),
                    BcMathCalculator::LEDGER_SCALE
                )
                : '0.00';

            return [
                'as_of_date' => $refDateStr,
                'branch_filter' => $filterBranch ? $branch : 'ALL BRANCHES',
                'persisted' => $persist,
                'provision_voucher_no' => $provisionVoucherNo,
                'total_active_loans' => $totalLoanCount,
                'loans_evaluated_count' => $totalLoanCount,
                'npa_loans_count' => $npaLoanCount,
                'total_portfolio_principal' => $totalPortfolio,
                'gnpa_principal' => $npaPrincipal,
                'gnpa_ratio_pct' => $gnpaPct,
                'par_30_principal' => $par30Principal,
                'par_30_ratio_pct' => $par30Pct,
                'par_90_principal' => $par90Principal,
                'total_required_provision' => $totalProvisionRequired,
                'total_provision_required' => $totalProvisionRequired,
                'delta_provision_posted' => $provisionVoucherNo ? $deltaProv : '0.00',
                'buckets' => $buckets,
            ];
            file_put_contents(storage_path('logs/npa_debug.log'), "[" . date('Y-m-d H:i:s') . "] Runner returning result\n", FILE_APPEND);
        };

        return $persist ? DB::transaction($runner) : $runner();
    }

    /**
     * Decimal-exact RBI-compliant non-capitalized penal charge assessment across overdue installments.
     */
    public function assessOverduePenaltiesDecimal(
        ?string $asOfDate = null,
        string $actorCode = 'ADM01',
        ?string $tenantCode = null
    ): array {
        $tenant = $tenantCode ?? (string) config('mfi.default_tenant', 'TNT-NEEV-01');
        $refStr = $asOfDate ? substr(trim($asOfDate), 0, 10) : date('Y-m-d');
        $refDt = new DateTimeImmutable($refStr);

        return DB::transaction(function () use ($tenant, $refStr, $refDt, $actorCode): array {
            $rows = DB::table('mfi_installments as i')
                ->join('mfi_loans as l', 'l.loan_id', '=', 'i.loan_id')
                ->where('i.tenant_code', $tenant)
                ->where('l.status', 'DISBURSED')
                ->whereIn('i.status', ['DUE', 'PARTIAL', 'OVERDUE'])
                ->where('i.due_date', '<', $refStr)
                ->select('i.*', 'l.plan_id', 'l.plan_name')
                ->lockForUpdate()
                ->get();

            $updatedInstallments = 0;
            $totalPenaltyAssessed = '0.00';
            $affectedLoans = [];

            foreach ($rows as $ins) {
                $plan = DB::table('mfi_loan_plans')
                    ->where('tenant_code', $tenant)
                    ->where(function ($q) use ($ins): void {
                        $q->where('id', $ins->plan_id)->orWhere('plan_name', $ins->plan_name);
                    })
                    ->first();

                $schemeName = ($plan && !empty($plan->penalty_scheme_name))
                    ? (string) $plan->penalty_scheme_name
                    : 'STANDARD PENALTY 50';
                $capPct = ($plan && isset($plan->max_penalty_cap_pct))
                    ? BcMathCalculator::money((string) $plan->max_penalty_cap_pct)
                    : '25.00';

                $emiAmt = BcMathCalculator::money((string) $ins->emi_amount);
                $unpaidEmi = BcMathCalculator::max(
                    '0.00',
                    BcMathCalculator::sub($emiAmt, (string) $ins->paid_amount, BcMathCalculator::LEDGER_SCALE)
                );
                if (BcMathCalculator::comp($unpaidEmi, '0.00') <= 0) {
                    continue;
                }

                $scheme = DB::table('mfi_penalty_schemes')
                    ->where('tenant_code', $tenant)
                    ->where('name', $schemeName)
                    ->first()
                    ?? DB::table('mfi_penalty_schemes')->where('tenant_code', $tenant)->first();

                $minDue = $scheme ? BcMathCalculator::money((string) $scheme->minimum_due_amount) : '500.00';
                $graceDays = $scheme ? (int) $scheme->grace_period_days : 3;
                $pType = strtoupper($scheme ? (string) $scheme->penalty_type : 'FIXED');
                $valS = $scheme ? BcMathCalculator::money((string) $scheme->amount_or_pct) : '50.00';
                $pMode = strtoupper($scheme ? (string) $scheme->penalty_mode : 'ONE TIME');

                $dueDt = new DateTimeImmutable(substr((string) $ins->due_date, 0, 10));
                $daysOv = max(0, (int) $dueDt->diff($refDt)->format('%r%a'));

                if (BcMathCalculator::comp($unpaidEmi, $minDue) < 0 || $daysOv <= $graceDays) {
                    $rawPen = '0.00';
                } else {
                    $basePen = $pType === 'PERCENTAGE'
                        ? BcMathCalculator::percentageOf($unpaidEmi, $valS)
                        : $valS;
                    $chargeableDays = $daysOv - $graceDays;
                    $rawPen = $pMode === 'DAILY'
                        ? BcMathCalculator::roundHalfUp(BcMathCalculator::mul($basePen, (string) $chargeableDays), BcMathCalculator::LEDGER_SCALE)
                        : $basePen;
                }

                $maxCapAmt = BcMathCalculator::percentageOf($emiAmt, $capPct);
                $cappedPen = BcMathCalculator::comp($maxCapAmt, '0.00') > 0
                    ? BcMathCalculator::min($rawPen, $maxCapAmt)
                    : $rawPen;

                $existingPen = BcMathCalculator::money((string) $ins->penalty_amount);
                $alreadyPaidPen = BcMathCalculator::money((string) $ins->penalty_paid);
                $finalInstPen = BcMathCalculator::max($existingPen, BcMathCalculator::max($alreadyPaidPen, $cappedPen));

                DB::table('mfi_installments')
                    ->where('id', $ins->id)
                    ->update([
                        'status' => 'OVERDUE',
                        'penalty_amount' => $finalInstPen,
                        'updated_at' => now(),
                    ]);

                $updatedInstallments++;
                $netRowPen = BcMathCalculator::max(
                    '0.00',
                    BcMathCalculator::sub($finalInstPen, $alreadyPaidPen, BcMathCalculator::LEDGER_SCALE)
                );
                $totalPenaltyAssessed = BcMathCalculator::add($totalPenaltyAssessed, $netRowPen, BcMathCalculator::LEDGER_SCALE);
                $affectedLoans[(string) $ins->loan_id] = true;
            }

            foreach (array_keys($affectedLoans) as $lid) {
                $instPens = DB::table('mfi_installments')
                    ->where('tenant_code', $tenant)
                    ->where('loan_id', $lid)
                    ->where('status', '!=', 'CANCELLED')
                    ->get();

                $netPenDue = '0.00';
                foreach ($instPens as $ip) {
                    $rowRem = BcMathCalculator::max(
                        '0.00',
                        BcMathCalculator::sub((string) $ip->penalty_amount, (string) $ip->penalty_paid, BcMathCalculator::LEDGER_SCALE)
                    );
                    $netPenDue = BcMathCalculator::add($netPenDue, $rowRem, BcMathCalculator::LEDGER_SCALE);
                }

                $ln = Loan::where('tenant_code', $tenant)->where('loan_id', $lid)->lockForUpdate()->first();
                if ($ln) {
                    $totOut = BcMathCalculator::add(
                        BcMathCalculator::add((string) $ln->principal_outstanding, (string) $ln->interest_outstanding, BcMathCalculator::LEDGER_SCALE),
                        $netPenDue,
                        BcMathCalculator::LEDGER_SCALE
                    );
                    $ln->update([
                        'penalty_due' => $netPenDue,
                        'total_outstanding' => $totOut,
                    ]);
                }
            }

            return [
                'as_of_date' => $refStr,
                'updated_installments' => $updatedInstallments,
                'affected_loans_count' => count($affectedLoans),
                'total_net_penalty_due_assessed' => $totalPenaltyAssessed,
            ];
        });
    }
}
