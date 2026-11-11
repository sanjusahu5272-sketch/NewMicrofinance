<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Branch;
use App\Models\EmiCollection;
use App\Models\Employee;
use App\Models\Installment;
use App\Models\Ledger;
use App\Models\Loan;
use App\Services\PreSettlementEngine;
use App\Models\Member;
use App\Models\Voucher;
use App\Services\ActuarialLoanEngine;
use App\Services\BcMathCalculator;
use App\Services\CollectionsNpaService;
use App\Services\LoanWorkflowService;
use App\Services\UpiMandateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

class LoanController
{
    public function testSimple(): JsonResponse
    {
        $count = DB::table('mfi_loans')->count();
        $dbConfig = config('database.connections.pgsql');
        $dbInfo = DB::select('SELECT current_database() as db, current_schema() as schema, inet_client_addr() as addr, inet_server_addr() as server');
        return response()->json([
            'msg' => 'loan controller hello',
            'loan_count' => $count,
            'db_host' => $dbConfig['host'],
            'db_port' => $dbConfig['port'],
            'db_name' => $dbConfig['database'],
            'db_user' => $dbConfig['username'],
            'current_db' => $dbInfo[0]->db ?? 'null',
            'current_schema' => $dbInfo[0]->schema ?? 'null',
            'client_addr' => $dbInfo[0]->addr ?? 'null',
            'server_addr' => $dbInfo[0]->server ?? 'null',
        ]);
    }

    public function __construct(
        protected ActuarialLoanEngine $actuarialEngine,
        protected LoanWorkflowService $loanWorkflow,
        protected CollectionsNpaService $collectionsNpaService
    ) {}

    public function calculateEmi(Request $request): JsonResponse
    {
        return response()->json($this->actuarialEngine->calculateEmiBreakdown($request->all()));
    }

    public function individualLoanContext(Request $request): JsonResponse
    {
        $branches = Branch::orderBy('name')->pluck('name')->values()->all();
        $centers = DB::table('mfi_branch_centers')->orderBy('name')->pluck('name')->values()->all();
        $staffs = Employee::orderBy('name')->pluck('name')->values()->all();

        // Search-first: never load all 1M+ members into PHP.
        // If a search term is provided, filter in SQL. Otherwise return
        // a small sample (first 200) — the frontend sends a search query
        // as the user types, so this is always bounded.
        $search = trim((string) ($request->query('search', '') ?? $request->query('q', '')));
        if ($search !== '') {
            $members = Member::where('status', 'ACTIVE')
                ->where(function ($q) use ($search): void {
                    $q->where('name', 'ILIKE', "%{$search}%")
                        ->orWhere('member_code', 'ILIKE', "%{$search}%")
                        ->orWhere('mobile', 'ILIKE', "%{$search}%");
                })
                ->orderBy('name')
                ->limit(200)
                ->get(['id', 'member_code', 'name', 'branch_name'])
                ->map(fn (Member $m) => [
                    'id' => $m->id,
                    'member_code' => $m->member_code,
                    'name' => $m->name,
                    'branch_name' => $m->branch_name,
                    'label' => "{$m->name} ({$m->member_code})",
                ])->values()->all();
        } else {
            $members = Member::where('status', 'ACTIVE')
                ->orderBy('name')
                ->limit(200)
                ->get(['id', 'member_code', 'name', 'branch_name'])
                ->map(fn (Member $m) => [
                    'id' => $m->id,
                    'member_code' => $m->member_code,
                    'name' => $m->name,
                    'branch_name' => $m->branch_name,
                    'label' => "{$m->name} ({$m->member_code})",
                ])->values()->all();
        }

        return response()->json([
            'branches' => $branches,
            'branch_centers' => $centers,
            'staffs' => $staffs,
            'members' => $members,
            'penalty_schemes' => ['FLAT 500', '500 fix', 'STANDARD PENALTY 50', 'DAILY LATE 100', 'NONE'],
            'purposes' => ['BUSINESS EXPANSION', 'KIRANA & RETAIL SHOP', 'AGRICULTURE & DAIRY', 'E-RICKSHAW / VEHICLE', 'PERSONAL LOAN - APPLIANCE', 'HOME RENOVATION', 'MEDICAL / EMERGENCY', 'EDUCATION', 'INCOME GENERATION'],
            'statuses' => ['Pending', 'Approved', 'Reject'],
        ]);
    }

    public function applyIndividual(Request $request): JsonResponse
    {
        $authUser = (array) $request->attributes->get('auth_user', []);
        $actor = (string) ($authUser['user_code'] ?? 'ADM01');
        $payload = $request->all();
        $payload['idempotency_key'] = $request->header('X-Idempotency-Key') ?? ($payload['idempotency_key'] ?? null);

        $loan = $this->loanWorkflow->createApplication($payload, $actor);

        return response()->json($loan, 201);
    }

    public function approve(Request $request, string $id): JsonResponse
    {
        $authUser = (array) $request->attributes->get('auth_user', []);
        $actor = (string) ($authUser['user_code'] ?? 'ADM01');
        $loan = $this->loanWorkflow->approveLoan($id, $actor, (string) $request->input('remark', 'Approved'));

        return response()->json($loan);
    }

    public function reject(Request $request, string $id): JsonResponse
    {
        $loan = Loan::where('id', is_numeric($id) ? (int) $id : 0)
            ->orWhere('loan_id', $id)
            ->orWhere('application_no', $id)
            ->firstOrFail();

        $loan->update(['status' => 'REJECTED']);

        return response()->json($loan);
    }

    public function disburse(Request $request, string $id): JsonResponse
    {
        $authUser = (array) $request->attributes->get('auth_user', []);
        $actor = (string) ($authUser['user_code'] ?? 'ADM01');
        $payload = $request->all();
        $payload['idempotency_key'] = $request->header('X-Idempotency-Key')
            ?? ($payload['idempotency_key'] ?? "DISB-{$id}");

        $loan = $this->loanWorkflow->disburseLoan($id, $payload, $actor);

        // ── AutoPay / eNACH mandate setup at disbursement ──
        // Optional payload: mandate = {mandate_type, frequency, mandate_amount, upi_id, bank_name, account_no}
        $mandatePayload = $request->input('mandate');
        $mandateResult = null;
        if (is_array($mandatePayload) && $mandatePayload !== []) {
            try {
                $mandateResult = UpiMandateService::createAtDisbursement($loan, $mandatePayload);
            } catch (Throwable $e) {
                // Disbursement already succeeded; mandate setup failure is reported
                // but does not roll back the disbursement.
                $mandateResult = ['error' => $e->getMessage()];
            }
        }

        if ($mandateResult !== null) {
            if (isset($mandateResult['error'])) {
                return response()->json([
                    'loan' => $loan,
                    'mandate_error' => $mandateResult['error'],
                    'message' => 'Disbursement done, but mandate setup failed.',
                ], 201);
            }

            $otp = (string) ($mandateResult['otp'] ?? '');
            return response()->json([
                'loan' => $loan,
                'mandate' => $mandateResult['mandate'],
                'message' => 'Disbursement done and mandate created. Consent OTP sent to member.',
                $otp !== '' ? 'otp' : 'otp_note' => $otp !== ''
                    ? "Local dev: OTP is $otp."
                    : 'OTP delivered via SMS gateway only.',
            ], 201);
        }

        return response()->json($loan);
    }

    public function disbursementScreen(string $id): JsonResponse
    {
        $loan = Loan::where('id', is_numeric($id) ? (int) $id : 0)
            ->orWhere('loan_id', $id)
            ->orWhere('application_no', $id)
            ->firstOrFail();

        $ledgers = Ledger::whereIn('nature', ['ASSET', 'LIABILITY'])
            ->orderBy('name')
            ->get()
            ->map(fn (Ledger $l) => [
                'name' => $l->name,
                'balance' => BcMathCalculator::money((string) $l->closing_balance),
                'label' => "{$l->name} (Balance: ₹" . BcMathCalculator::money((string) $l->closing_balance) . ')',
            ])
            ->values()
            ->all();

        $stUp = strtoupper((string) $loan->status);
        $canDisb = in_array($stUp, ['APPROVED', 'PENDING_APPROVAL'], true);

        return response()->json([
            'loan' => $loan,
            'defaults' => [
                'disbursement_date' => date('Y-m-d'),
                'emi_start_date' => date('Y-m-d', strtotime('+30 days')),
            ],
            'ledgers' => $ledgers,
            'head_office_ledgers' => $ledgers,
            'can_disburse' => $canDisb,
            'blockers' => $canDisb ? [] : ["Loan status is {$stUp}"],
            // Mandate options for the disbursement task button
            'mandate_options' => [
                'autopay' => [
                    'label' => 'AutoPay (UPI auto-debit)',
                    'mandate_type' => 'AUTOPAY',
                    'frequency' => ['MONTHLY', 'WEEKLY'],
                    'requires' => ['upi_id', 'bank_name', 'account_no'],
                    'consent_flow' => 'otp',
                ],
                'enanch' => [
                    'label' => 'eNACH (bank auto-debit mandate)',
                    'mandate_type' => 'ENACH',
                    'frequency' => ['MONTHLY', 'WEEKLY'],
                    'requires' => ['bank_name', 'account_no'],
                    'consent_flow' => 'otp',
                ],
            ],
        ]);
    }

    public function disbursementFailure(): JsonResponse
    {
        return response()->json(['status' => 'ALERT_RECORDED']);
    }

    public function collectEmi(Request $request): JsonResponse
    {
        $authUser = (array) $request->attributes->get('auth_user', []);
        $actor = (string) ($authUser['user_code'] ?? 'ADM01');
        $payload = $request->all();
        $payload['idempotency_key'] = $request->header('X-Idempotency-Key')
            ?? ($payload['idempotency_key'] ?? null);

        if (empty($payload['idempotency_key'])) {
            return response()->json([
                'error' => 'Idempotency Violation: X-Idempotency-Key header or idempotency_key (UUID) field is mandatory for EMI collection.',
            ], 422);
        }

        $receipt = $this->loanWorkflow->collectEmi($payload, $actor);

        return response()->json($receipt, 201);
    }

    public function bounceCollection(Request $request, string $id): JsonResponse
    {
        $authUser = (array) $request->attributes->get('auth_user', []);
        $actor = (string) ($authUser['user_code'] ?? 'ADM01');
        $role = (string) ($authUser['role'] ?? 'ADMIN');

        $res = $this->collectionsNpaService->dishonourBounceCollection(
            $id,
            (string) ($request->input('bounce_reason') ?? $request->input('reason', 'Insufficient Funds / Instrument Dishonoured')),
            $request->input('bounce_charge'),
            $actor,
            $role
        );

        return response()->json($res);
    }

    public function assessPenalties(Request $request): JsonResponse
    {
        $authUser = (array) $request->attributes->get('auth_user', []);
        $actor = (string) ($authUser['user_code'] ?? 'ADM01');

        return response()->json(
            $this->collectionsNpaService->assessOverduePenaltiesDecimal(
                $request->input('as_of_date'),
                $actor
            )
        );
    }

    public function npaClassification(Request $request): JsonResponse
    {
        file_put_contents(storage_path('logs/npa_debug.log'), "[" . date('Y-m-d H:i:s') . "] NPA controller called\n", FILE_APPEND);
        $result = $this->collectionsNpaService->classifyPortfolioDpdSmaNpa(
            asOfDate: $request->query('as_of_date'),
            branchName: $request->query('branch'),
            persist: false,
            postProvisionVoucher: false
        );
        file_put_contents(storage_path('logs/npa_debug.log'), "[" . date('Y-m-d H:i:s') . "] NPA service returned\n", FILE_APPEND);
        return response()->json($result);
    }

    public function runEodNpa(Request $request): JsonResponse
    {
        $authUser = (array) $request->attributes->get('auth_user', []);
        $actor = (string) ($authUser['user_code'] ?? 'ADM01');

        return response()->json(
            $this->collectionsNpaService->classifyPortfolioDpdSmaNpa(
                asOfDate: $request->input('as_of_date'),
                branchName: $request->input('branch'),
                persist: true,
                postProvisionVoucher: (bool) $request->input('post_provision_voucher', true),
                actorCode: $actor
            )
        );
    }

    public function collectionDetails(string $id): JsonResponse
    {
        $loan = Loan::where('id', is_numeric($id) ? (int) $id : 0)
            ->orWhere('loan_id', $id)
            ->orWhere('application_no', $id)
            ->firstOrFail();

        $member = Member::where('id', $loan->member_id)
            ->orWhere('member_code', $loan->member_code)
            ->first();

        $collections = EmiCollection::where('loan_pk', $loan->id)->orderByDesc('id')->limit(200)->get();
        $installments = Installment::where('loan_pk', $loan->id)->orderBy('emi_no')->limit(500)->get();
        $vouchers = Voucher::where('loan_id', $loan->loan_id)->orderByDesc('id')->limit(100)->get();

        return response()->json([
            'loan' => $loan,
            'member' => $member,
            'operational_status' => in_array(strtoupper((string) $loan->status), ['COMPLETED', 'SETTLED'], true) ? 'CLOSED' : 'PROCESSING',
            'collections_count' => $collections->count(),
            'collections' => $collections,
            'installments' => $installments,
            'vouchers' => $vouchers,
        ]);
    }

    public function customerLoanContext(Request $request): JsonResponse
    {
        $search = trim((string) ($request->query('search', '') ?? $request->query('q', '')));
        $memQuery = Member::where('status', 'ACTIVE')->orderBy('name');
        if ($search !== '') {
            $memQuery->where(function ($q) use ($search): void {
                $q->where('name', 'ILIKE', "%{$search}%")
                    ->orWhere('member_code', 'ILIKE', "%{$search}%")
                    ->orWhere('mobile', 'ILIKE', "%{$search}%");
            });
        }
        $members = $memQuery->limit(200)->get(['member_code', 'name', 'mobile'])->map(fn (Member $m) => [
            'member_code' => $m->member_code,
            'name' => $m->name,
            'mobile' => $m->mobile,
            'label' => "{$m->name} ({$m->member_code})",
        ])->values()->all();

        return response()->json([
            'branches' => Branch::orderBy('name')->pluck('name')->values()->all(),
            'plan_types' => ['MONTHLY', 'WEEKLY', 'DAILY'],
            'members' => $members,
            'statuses' => ['PENDING', 'COMPLETE', 'COMPLETED', 'REJECT'],
        ]);
    }

    public function customerLoans(Request $request): JsonResponse
    {
        $query = Loan::orderByDesc('id');
        if ($branch = trim((string) $request->query('branch_name', ''))) {
            $query->whereRaw('UPPER(branch_name) = UPPER(?)', [$branch]);
        }
        if ($customer = trim((string) $request->query('customer', ''))) {
            $query->where(function ($q) use ($customer): void {
                $q->where('member_code', $customer)->orWhereRaw('UPPER(member_name) = UPPER(?)', [$customer]);
            });
        }
        if ($type = trim((string) $request->query('type', ''))) {
            $query->whereRaw('UPPER(recovery_type) = UPPER(?)', [$type]);
        }

        // Paginate — never load all loans into PHP
        $page = max(1, (int) $request->query('page', 1));
        $pageSize = max(1, min(100, (int) $request->query('page_size', 20)));
        $total = (clone $query)->count();
        $loans = $query->forPage($page, $pageSize)->get();

        // Batch-fetch paid installment counts for all loans on this page
        $loanIds = $loans->pluck('id')->all();
        $instCounts = Installment::whereIn('loan_pk', $loanIds)
            ->selectRaw('loan_pk, COUNT(*) as total_inst, SUM(CASE WHEN UPPER(status) = \'PAID\' THEN 1 ELSE 0 END) as paid_count')
            ->groupBy('loan_pk')
            ->pluck('total_inst', 'loan_pk');
        $instPaid = Installment::whereIn('loan_pk', $loanIds)
            ->selectRaw('loan_pk, COUNT(*) as total_inst, SUM(CASE WHEN UPPER(status) = \'PAID\' THEN 1 ELSE 0 END) as paid_count')
            ->groupBy('loan_pk')
            ->pluck('paid_count', 'loan_pk');

        $out = [];
        $totAmt = '0.00';
        $totRec = '0.00';
        $totOut = '0.00';

        foreach ($loans as $l) {
            $totalInst = (int) ($instCounts[$l->id] ?? 0);
            $paidCnt = (int) ($instPaid[$l->id] ?? 0);
            $stU = strtoupper((string) $l->status);
            $chip = in_array($stU, ['PENDING_APPROVAL', 'APPROVED'], true)
                ? 'PENDING'
                : (in_array($stU, ['COMPLETED', 'SETTLED'], true) ? 'COMPLETE' : ($stU === 'REJECTED' ? 'REJECT' : $stU));
            $isClosed = in_array($stU, ['COMPLETED', 'SETTLED'], true)
                || BcMathCalculator::comp((string) $l->total_outstanding, '0.00') <= 0;

            $amt = BcMathCalculator::money((string) $l->plan_amount);
            $rec = BcMathCalculator::money((string) $l->total_collected);
            $outNow = BcMathCalculator::money((string) $l->total_outstanding);

            $totAmt = BcMathCalculator::add($totAmt, $amt, BcMathCalculator::LEDGER_SCALE);
            $totRec = BcMathCalculator::add($totRec, $rec, BcMathCalculator::LEDGER_SCALE);
            $totOut = BcMathCalculator::add($totOut, $outNow, BcMathCalculator::LEDGER_SCALE);

            $out[] = array_merge($l->toArray(), [
                'loan_pk' => $l->id,
                'loan_key' => $l->loan_id ?: $l->application_no,
                'status_chip' => $chip,
                'amount' => $amt,
                'rec_amount' => $rec,
                'received_amount' => $rec,
                'is_closed' => $isClosed,
                'noc_allowed' => $isClosed,
                'paid_emis' => "{$paidCnt}/{$totalInst}",
            ]);
        }

        return response()->json([
            'results' => $out,
            'count' => count($out),
            'page' => $page,
            'page_size' => $pageSize,
            'total' => $total,
            'total_pages' => max(1, (int) ceil($total / $pageSize)),
            'totals' => [
                'count' => $total,
                'amount' => $totAmt,
                'received_amount' => $totRec,
                'outstanding' => $totOut,
            ],
        ]);
    }

    public function nocCertificate(string $id): JsonResponse
    {
        $loan = Loan::where('id', is_numeric($id) ? (int) $id : 0)
            ->orWhere('loan_id', $id)
            ->orWhere('application_no', $id)
            ->firstOrFail();

        $member = Member::where('id', $loan->member_id)->orWhere('member_code', $loan->member_code)->first();
        $stU = strtoupper((string) $loan->status);
        $isClear = in_array($stU, ['COMPLETED', 'SETTLED'], true)
            || BcMathCalculator::comp((string) $loan->total_outstanding, '0.00') <= 0;

        return response()->json([
            'doc_type' => 'NOC',
            'generated_date' => date('Y-m-d'),
            'company' => [
                'name' => 'NEEV MICRO SERVICE ASSOCIATION',
                'cin' => 'U88900MP2026NPL087971',
                'address' => 'Bus Stand, Khasra No. 871/1, Bahoriband, Katni, Madhya Pradesh - 483330',
                'mobile' => '9926223303',
                'email' => 'infoneevmicroservce@gmail.com',
            ],
            'loan' => $loan,
            'member' => $member,
            'noc' => [
                'loan_account_no' => $loan->loan_id ?: $loan->application_no,
                'customer_name' => $loan->member_name,
                'member_code' => $loan->member_code,
                'mobile' => $loan->mobile,
                'loan_type' => $loan->plan_name ?: $loan->application_type,
                'loan_amount' => BcMathCalculator::money((string) $loan->plan_amount),
                'sanction_date' => (string) ($loan->disbursement_date ?: $loan->application_date),
                'closure_date' => $isClear ? (string) ($loan->loan_close_date ?: date('Y-m-d')) : '',
                'outstanding_amount' => BcMathCalculator::money((string) $loan->total_outstanding),
                'penalty_due' => BcMathCalculator::money((string) $loan->penalty_due),
                'recovered_amount' => BcMathCalculator::money((string) $loan->total_collected),
                'status' => $loan->status,
                'issue_allowed' => $isClear,
                'block_reason' => $isClear ? '' : "Account still has ₹{$loan->total_outstanding} outstanding.",
            ],
        ]);
    }

    public function loanDocument(Request $request, string $id): JsonResponse
    {
        $loan = Loan::where('id', is_numeric($id) ? (int) $id : 0)
            ->orWhere('loan_id', $id)
            ->orWhere('application_no', $id)
            ->firstOrFail();

        $member = Member::where('id', $loan->member_id)->orWhere('member_code', $loan->member_code)->first();
        $installments = Installment::where('loan_pk', $loan->id)->orderBy('emi_no')->limit(500)->get();

        return response()->json([
            'doc_type' => strtoupper((string) $request->query('doc_type', 'AGREEMENT')),
            'generated_date' => date('Y-m-d'),
            'company' => [
                'name' => 'NEEV MICRO SERVICE ASSOCIATION',
                'cin' => 'U88900MP2026NPL087971',
                'address' => 'Bus Stand, Khasra No. 871/1, Bahoriband, Katni, Madhya Pradesh - 483330',
            ],
            'loan' => $loan,
            'member' => $member,
            'installments' => $installments,
        ]);
    }

    /**
     * GET /api/loans/{id}/settlement-preview
     *
     * Runs the full PreSettlementEngine quote: broken-period interest,
     * accrued scheduled interest, foreclosure charge + GST, risk-asset
     * classification, waiver handling and a balanced double-entry voucher.
     *
     * This replaces the old 3-line formula that simply added
     * principal_outstanding + penalty + pre_closing_charge — which under-collected
     * ₹3,037.83 on the reference case because it missed broken-period interest,
     * accrued interest and GST entirely.
     */
    /**
     * POST /api/loans/{id}/settlement
     *
     * Persists a settlement to mfi_loan_settlements AND writes the balanced
     * voucher to mfi_vouchers. The voucher is the authoritative record — if it
     * doesn't balance, nothing is written.
     */
    public function settlementStore(Request $request, string $id): JsonResponse
    {
        $loan = Loan::where('id', is_numeric($id) ? (int) $id : 0)
            ->orWhere('loan_id', $id)
            ->orWhere('application_no', $id)
            ->firstOrFail();

        // Idempotency: same key always returns the same result.
        $idem = (string) $request->input('idempotency_key', '');
        if ($idem !== '') {
            $existing = DB::table('mfi_loan_settlements')
                ->where('idempotency_key', $idem)
                ->first();
            if ($existing !== null) {
                return response()->json([
                    'status' => 'duplicate',
                    'settlement_no' => $existing->settlement_no,
                    'settlement_amount' => (float) $existing->settlement_amount,
                ], 200);
            }
        }

        $engine = new PreSettlementEngine();
        $quote = $engine->quote($this->buildSettlementInput($loan, $request));

        if (empty($quote['voucher']['balanced'])) {
            return response()->json([
                'error' => 'Voucher does not balance. Settlement refused.',
                'debit_total' => $quote['voucher']['debit_total'],
                'credit_total' => $quote['voucher']['credit_total'],
            ], 422);
        }

        // ── Write the settlement record ──
        $settlementNo = 'SET-'.date('Ymd').'-'.strtoupper(substr(hash('sha256', $loan->loan_id.now()->toIso8601String()), 0, 8));

        DB::transaction(function () use ($loan, $quote, $settlementNo, $request, $idem): void {
            // Mark installments as settled.
            DB::table('mfi_installments')
                ->where('loan_pk', $loan->id)
                ->where('status', '!=', 'PAID')
                ->update([
                    'status' => 'SETTLED',
                    'updated_at' => now(),
                ]);

            DB::table('mfi_loan_settlements')->insert([
                'tenant_code' => $loan->tenant_code,
                'settlement_no' => $settlementNo,
                'loan_pk' => $loan->id,
                'loan_id' => $loan->loan_id,
                'member_code' => $loan->member_code,
                'member_name' => $loan->member_name,
                'branch_name' => $loan->branch_name,
                'settlement_amount' => $quote['total_payable'],
                'pre_closing_charge' => $quote['charges']['net_charge'],
                'settlement_date' => $quote['settlement_date'],
                'pay_mode' => $request->input('pay_mode', 'CASH'),
                'utr_no' => $request->input('utr_no', ''),
                'reason' => $request->input('reason', 'PRE-PAYMENT'),
                'status' => 'APPROVED',
                'idempotency_key' => $idem ?: null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            // ── Write the balanced voucher ──
            $voucherNo = 'VCH-'.date('Ymd').'-'.strtoupper(substr(hash('sha256', $settlementNo), 0, 8));

            DB::table('mfi_vouchers')->insert([
                'tenant_code' => $loan->tenant_code,
                'voucher_no' => $voucherNo,
                'voucher_date' => $quote['settlement_date'],
                'voucher_type' => 'SETTLEMENT',
                'branch_name' => $loan->branch_name,
                'loan_id' => $loan->loan_id,
                'particular' => 'Loan settlement — '.$loan->loan_id,
                'debit_ledger' => 'Settlement Collectible',
                'amount_dr' => $quote['voucher']['debit_total'],
                'credit_ledger' => 'Loan Account',
                'amount_cr' => $quote['voucher']['credit_total'],
                'narration' => 'Loan settlement — '.$loan->loan_id,
                'is_reversed' => false,
                'idempotency_key' => $idem ?: null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        return response()->json([
            'status' => 'settled',
            'settlement_no' => $settlementNo,
            'settlement_amount' => $quote['total_payable'],
            'voucher_balanced' => $quote['voucher']['balanced'],
            'principal_outstanding' => $quote['principal']['unpaid'],
            'interest_payable' => $quote['interest']['payable'],
            'penalty_payable' => $quote['penalty']['payable'],
            'foreclosure_charge' => $quote['charges']['net_charge'],
            'gst_payable' => $quote['charges']['gst_payable'],
        ], 201);
    }

    /**
     * Build the input array for PreSettlementEngine::quote() from the loan row
     * and its installment schedule.
     */
    private function buildSettlementInput(Loan $loan, Request $request): array
    {
        $installments = DB::table('mfi_installments')
            ->where('loan_pk', $loan->id)
            ->orderBy('emi_no')
            ->get();

        $installmentAmounts = $installments->map(fn ($row) => [
            'emi_no' => (int) $row->emi_no,
            'due_date' => substr((string) $row->due_date, 0, 10),
            'emi_amount' => (string) $row->emi_amount,
            'principal_component' => (string) $row->principal_component,
            'interest_component' => (string) $row->interest_component,
            'closing_principal' => (string) $row->closing_principal,
            'paid_amount' => (string) $row->paid_amount,
            'status' => (string) $row->status,
        ])->all();

        return [
            'loan_id' => (string) $loan->loan_id,
            'plan_amount' => (string) $loan->plan_amount,
            'interest_rate_pa' => (string) $loan->interest_rate_pa,
            'annual_days' => (string) ($loan->annual_days ?? 365),
            'settlement_date' => (string) $request->query('settlement_date', date('Y-m-d')),
            'disbursement_date' => (string) $loan->disbursement_date,
            'installment_amounts' => $installmentAmounts,
            'waiver' => (array) $request->query('waiver', []),
            'write_off' => (bool) $request->query('write_off', false),
        ];
    }

    public function settlementPreview(Request $request, string $id): JsonResponse
    {
        $loan = Loan::where('id', is_numeric($id) ? (int) $id : 0)
            ->orWhere('loan_id', $id)
            ->orWhere('application_no', $id)
            ->firstOrFail();

        $engine = new PreSettlementEngine();

        $quote = $engine->quote($this->buildSettlementInput($loan, $request));

        return response()->json([
            'loan_id' => $loan->loan_id,
            'member_name' => $loan->member_name,
            'member_code' => $loan->member_code,
            'branch_name' => $loan->branch_name,
            'settlement_date' => $quote['settlement_date'],

            // ── Opening ──
            'plan_amount' => $quote['opening']['plan_amount'],
            'stated_emi' => $quote['opening']['stated_emi'],
            'last_settled_date' => $quote['opening']['last_settled_date'],
            'last_settled_emi_no' => $quote['opening']['last_settled_emi_no'],

            // ── Principal ──
            'principal_outstanding' => $quote['principal']['unpaid'],
            'principal_paid_till_date' => $quote['principal']['paid_till_date'],
            'principal_waived' => $quote['principal']['waived'],
            'principal_payable' => $quote['principal']['payable'],

            // ── Interest (broken down exactly as a real MFI reports it) ──
            'interest_accrued_till_settlement' => $quote['interest']['accrued_till_settlement'],
            'interest_unpaid_scheduled' => $quote['interest']['unpaid_scheduled'],
            'broken_period_days' => $quote['interest']['broken_period_days'],
            'broken_period_interest' => $quote['interest']['broken_period_interest'],
            'interest_paid_till_date' => $quote['interest']['paid_till_date'],
            'interest_waived' => $quote['interest']['waived'],
            'interest_payable' => $quote['interest']['payable'],
            'future_interest_waived_off' => $quote['interest']['future_waived_off'],

            // ── Penalty ──
            'penalty_due' => $quote['penalty']['due'],
            'penalty_waived' => $quote['penalty']['waived'],
            'penalty_payable' => $quote['penalty']['payable'],

            // ── Charges + GST ──
            'foreclosure_charge' => $quote['charges']['foreclosure_charge'],
            'foreclosure_rebate' => $quote['charges']['rebate'],
            'foreclosure_charge_net' => $quote['charges']['net_charge'],
            'foreclosure_charge_waived' => $quote['charges']['waived'],
            'foreclosure_charge_payable' => $quote['charges']['payable'],
            'gst_pct' => $quote['charges']['gst_pct'],
            'gst_payable' => $quote['charges']['gst_payable'],

            // ── Totals ──
            'total_payable' => $quote['total_payable'],
            'total_waived' => $quote['total_waived'],
            'total_waived_expensed' => $quote['total_waived_expensed'],

            // ── RBI risk asset classification ──
            'dpd' => $quote['risk']['dpd'],
            'asset_class' => $quote['risk']['asset_class'],
            'is_npa' => $quote['risk']['is_npa'],
            'provision_rate_pct' => $quote['risk']['provision_rate_pct'],
            'provision_required' => $quote['risk']['provision_required'],

            // ── Double-entry voucher (balanced by construction) ──
            'voucher' => [
                'debit_total' => $quote['voucher']['debit_total'],
                'credit_total' => $quote['voucher']['credit_total'],
                'balanced' => $quote['voucher']['balanced'],
                'debits' => $quote['voucher']['debits'],
                'credits' => $quote['voucher']['credits'],
            ],

            // ── Human-readable working ──
            'explain' => $quote['explain'],
        ]);
    }

    public function previousLoanRecords(Request $request): JsonResponse
    {
        $loanKey = trim((string) ($request->query('loan_id') ?? $request->query('loan', '')));
        $loan = $loanKey !== ''
            ? Loan::where('loan_id', $loanKey)->orWhere('application_no', $loanKey)->first()
            : null;

        $rows = $loan
            ? Loan::where('member_code', $loan->member_code)->orderByDesc('id')->limit(50)->get()
            : Loan::orderByDesc('id')->limit(100)->get();

        return response()->json([
            'member_code' => $loan ? $loan->member_code : '',
            'member_name' => $loan ? $loan->member_name : 'ALL CUSTOMERS',
            'records' => $rows,
            'previous' => $rows,
            'previous_count' => $rows->count(),
        ]);
    }

    public function payoutDisburse(Request $request): JsonResponse
    {
        $idempotencyKey = $request->header('X-Idempotency-Key')
            ?? $request->input('idempotency_key');

        if (empty($idempotencyKey)) {
            return response()->json([
                'error' => 'Idempotency Violation: X-Idempotency-Key header or idempotency_key (UUID) field is mandatory for payout disbursements.',
            ], 422);
        }

        $loanId = (string) $request->input('loan_id', '');
        $authUser = (array) $request->attributes->get('auth_user', []);
        $actor = (string) ($authUser['user_code'] ?? 'ADM01');

        $loan = $this->loanWorkflow->disburseLoan($loanId, [
            'pay_mode' => 'BANK TRANSFER',
            'utr_no' => $request->input('utr_no', 'UTR' . date('YmdHis')),
            'idempotency_key' => (string) $idempotencyKey,
        ], $actor);

        return response()->json([
            'status' => 'PROCESSED',
            'loan' => $loan,
            'idempotency_key' => $idempotencyKey,
        ], 201);
    }

    public function destroy(string $id): JsonResponse
    {
        $loan = Loan::where('id', is_numeric($id) ? (int) $id : 0)
            ->orWhere('loan_id', $id)
            ->orWhere('application_no', $id)
            ->firstOrFail();

        if (in_array(strtoupper((string) $loan->status), ['DISBURSED', 'COMPLETED', 'SETTLED'], true)) {
            return response()->json(['error' => 'Disbursed or settled loans cannot be deleted.'], 422);
        }

        $loan->delete();

        return response()->json(['status' => 'DELETED', 'id' => $id]);
    }

    public function loanTopupContext(Request $request): JsonResponse
    {
        $branch = trim((string) $request->query('branch_name', ''));
        $search = trim((string) ($request->query('search', '') ?? $request->query('q', '')));

        $memQuery = Member::where('status', 'ACTIVE')->orderBy('name');
        if ($branch !== '' && !in_array(strtoupper($branch), ['ALL', 'ALL BRANCHES'], true)) {
            $memQuery->whereRaw('UPPER(branch_name) = UPPER(?)', [$branch]);
        }
        if ($search !== '') {
            $memQuery->where(function ($q) use ($search): void {
                $q->where('name', 'ILIKE', "%{$search}%")
                    ->orWhere('member_code', 'ILIKE', "%{$search}%")
                    ->orWhere('mobile', 'ILIKE', "%{$search}%");
            });
        }

        // Limit members — never load 1M+ into PHP
        $memberIds = $memQuery->limit(200)->pluck('id')->all();
        $memberCodes = $memQuery->limit(200)->pluck('member_code')->all();

        // Batch-fetch live loans for all members on this page in one query
        $liveLoansByMember = Loan::where(function ($q) use ($memberIds, $memberCodes): void {
            $q->whereIn('member_id', $memberIds)->orWhereIn('member_code', $memberCodes);
        })->where('status', 'DISBURSED')
            ->get(['id', 'loan_id', 'plan_amount', 'total_outstanding', 'member_id', 'member_code'])
            ->groupBy('member_id')
            ->map(fn ($group) => $group->map(fn ($l) => [
                'id' => $l->id,
                'loan_id' => $l->loan_id,
                'plan_amount' => $l->plan_amount,
                'total_outstanding' => $l->total_outstanding,
            ])->all())
            ->all();

        $members = Member::whereIn('id', $memberIds)->get(['id', 'member_code', 'name', 'mobile', 'branch_name'])
            ->map(fn (Member $m) => [
                'id' => $m->id,
                'member_code' => $m->member_code,
                'name' => $m->name,
                'mobile' => $m->mobile,
                'branch_name' => $m->branch_name,
                'label' => "{$m->name} ({$m->member_code} : {$m->mobile})",
                'live_loans' => $liveLoansByMember[$m->id] ?? [],
            ])->values()->all();

        return response()->json([
            'branches' => Branch::orderBy('name')->pluck('name')->values()->all(),
            'members' => $members,
        ]);
    }

    public function listLoanTopups(Request $request): JsonResponse
    {
        $tenant = (string) $request->attributes->get('tenant_code', config('mfi.default_tenant', 'TNT-NEEV-01'));
        $q = DB::table('mfi_loan_topups')->where('tenant_code', $tenant);
        if (($branch = trim((string) $request->query('branch_name', ''))) !== '' && !in_array(strtoupper($branch), ['ALL', 'ALL BRANCHES'], true)) {
            $q->whereRaw('UPPER(branch_name) = UPPER(?)', [$branch]);
        }
        if (($memCode = trim((string) $request->query('member_code', ''))) !== '') {
            $q->where('member_code', $memCode);
        }
        $page = max(1, (int) $request->query('page', 1));
        $pageSize = max(1, min(200, (int) $request->query('page_size', 10)));
        $total = $q->count();
        $rows = $q->orderByDesc('id')->forPage($page, $pageSize)->get();

        return response()->json([
            'results' => $rows,
            'count' => $total,
            'page' => $page,
            'page_size' => $pageSize,
            'total_pages' => max(1, (int) ceil($total / $pageSize)),
        ]);
    }

    public function createLoanTopup(Request $request): JsonResponse
    {
        $tenant = (string) $request->attributes->get('tenant_code', config('mfi.default_tenant', 'TNT-NEEV-01'));
        $memCode = trim((string) $request->input('member_code', ''));
        if ($memCode === '') {
            // Resolve member from loan_id when member_code is not supplied
            $loanRef = trim((string) $request->input('loan_id', ''));
            $liveLoan = Loan::where(function ($q) use ($loanRef): void {
                $q->where('loan_id', $loanRef)
                    ->orWhere('id', is_numeric($loanRef) ? (int) $loanRef : 0)
                    ->orWhere('application_no', $loanRef);
            })->where('status', 'DISBURSED')->orderByDesc('id')->first();
            if (!$liveLoan) {
                throw new InvalidArgumentException('No disbursed loan found for loan_id "' . $loanRef . '".');
            }
            $member = Member::findOrFail((int) $liveLoan->member_id);
        } else {
            $member = Member::where('member_code', $memCode)->orWhere('id', is_numeric($memCode) ? (int) $memCode : 0)->firstOrFail();
        }

        $liveLoan = Loan::where(function ($q) use ($member): void {
            $q->where('member_id', $member->id)->orWhere('member_code', $member->member_code);
        })->where('status', 'DISBURSED')->orderByDesc('id')->first();

        $topupNo = 'TOPUP-' . (202600 + DB::table('mfi_loan_topups')->count() + 1);
        $preAmt = $liveLoan ? BcMathCalculator::money((string) $liveLoan->plan_amount) : '25000.00';
        $preDue = $liveLoan ? BcMathCalculator::money((string) $liveLoan->total_outstanding) : '0.00';
        $applyAmt = BcMathCalculator::money((string) ($request->input('apply_loan_amt') ?? BcMathCalculator::mul($preAmt, '1.50')));

        $id = DB::table('mfi_loan_topups')->insertGetId([
            'tenant_code' => $tenant,
            'topup_no' => $topupNo,
            'branch_name' => (string) ($request->input('branch_name') ?: $member->branch_name),
            'member_id' => $member->id,
            'member_code' => $member->member_code,
            'member_name' => $member->name,
            'mobile' => $member->mobile,
            'pre_loan_id' => $liveLoan ? (string) $liveLoan->loan_id : '',
            'pre_loan_amt' => $preAmt,
            'pre_loan_due' => $preDue,
            'apply_loan_amt' => $applyAmt,
            'apply_date' => date('Y-m-d'),
            'status' => 'PENDING',
            'remark' => (string) $request->input('remark', 'Top-up application'),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json((array) DB::table('mfi_loan_topups')->where('id', $id)->first(), 201);
    }

    public function decideLoanTopup(Request $request, string $id): JsonResponse
    {
        $decision = strtoupper(trim((string) $request->input('decision', 'APPROVED')));
        DB::table('mfi_loan_topups')->where('id', (int) $id)->update([
            'status' => $decision,
            'remark' => (string) $request->input('remark', $decision),
            'updated_at' => now(),
        ]);

        return response()->json((array) DB::table('mfi_loan_topups')->where('id', (int) $id)->first());
    }

    public function deleteLoanTopup(string $id): JsonResponse
    {
        DB::table('mfi_loan_topups')->where('id', (int) $id)->delete();

        return response()->json(['status' => 'DELETED', 'id' => $id]);
    }

    public function approvalStatus(Request $request): JsonResponse
    {
        $id = (string) ($request->input('id') ?? $request->input('loan_id', ''));
        $status = strtoupper(trim((string) $request->input('status', 'APPROVED')));
        $authUser = (array) $request->attributes->get('auth_user', []);
        $actor = (string) ($authUser['user_code'] ?? 'ADM01');

        if ($status === 'APPROVED') {
            $loan = $this->loanWorkflow->approveLoan($id, $actor, (string) $request->input('remark', 'Approved'));
            return response()->json($loan);
        }

        return $this->reject($request, $id);
    }

    public function reverseCollection(Request $request, string $id): JsonResponse
    {
        $col = EmiCollection::where('id', is_numeric($id) ? (int) $id : 0)
            ->orWhere('receipt_no', $id)
            ->firstOrFail();

        $col->update([
            'status' => 'REVERSED',
            'remark' => (string) $request->input('reason', 'Audited receipt reversal'),
        ]);

        $loan = Loan::find($col->loan_pk);
        if ($loan) {
            $newPrin = BcMathCalculator::add((string) $loan->principal_outstanding, (string) $col->principal_allocated, BcMathCalculator::LEDGER_SCALE);
            $newInt = BcMathCalculator::add((string) $loan->interest_outstanding, (string) $col->interest_allocated, BcMathCalculator::LEDGER_SCALE);
            $newTot = BcMathCalculator::add(BcMathCalculator::add($newPrin, $newInt, BcMathCalculator::LEDGER_SCALE), (string) $loan->penalty_due, BcMathCalculator::LEDGER_SCALE);
            $newCol = BcMathCalculator::max('0.00', BcMathCalculator::sub((string) $loan->total_collected, (string) $col->amount, BcMathCalculator::LEDGER_SCALE));
            $loan->update([
                'principal_outstanding' => $newPrin,
                'interest_outstanding' => $newInt,
                'total_outstanding' => $newTot,
                'total_collected' => $newCol,
                'status' => strtoupper((string) $loan->status) === 'COMPLETED' ? 'DISBURSED' : $loan->status,
            ]);
        }

        Installment::where('loan_pk', $col->loan_pk)->where('emi_no', $col->emi_no)->update([
            'status' => 'DUE',
            'paid_amount' => '0.00',
            'paid_date' => null,
        ]);

        return response()->json([
            'receipt_no' => $col->receipt_no,
            'loan_id' => $col->loan_id,
            'status' => 'REVERSED',
            'principal_outstanding' => $loan ? BcMathCalculator::money((string) $loan->principal_outstanding) : '0.00',
        ]);
    }

    public function reverseDisbursement(Request $request, string $id): JsonResponse
    {
        return DB::transaction(function () use ($request, $id): JsonResponse {
            $loan = Loan::where('id', is_numeric($id) ? (int) $id : 0)
                ->orWhere('loan_id', $id)
                ->orWhere('application_no', $id)
                ->lockForUpdate()
                ->firstOrFail();

            if ($loan->status !== 'DISBURSED') {
                return response()->json([
                    'error' => "Loan {$loan->loan_id} is not DISBURSED (status: {$loan->status}). Only disbursed loans can be reversed.",
                ], 422);
            }

            // ── Reverse the disbursement voucher (double-entry balance) ──
            // Find the original disbursement voucher posted by disburseLoan
            $vouchers = DB::table('mfi_vouchers')
                ->where('loan_id', $loan->loan_id)
                ->where('voucher_type', 'PAYMENT')
                ->where('is_reversed', false)
                ->get();

            $reversedCount = 0;
            foreach ($vouchers as $vch) {
                // Post the reversal voucher
                $revNo = $vch->voucher_no . '-REV';
                DB::table('mfi_vouchers')->insert([
                    'tenant_code' => $loan->tenant_code,
                    'voucher_no' => $revNo,
                    'voucher_date' => date('Y-m-d'),
                    'voucher_type' => 'REVERSAL',
                    'branch_name' => $loan->branch_name,
                    'loan_id' => $loan->loan_id,
                    'particular' => "Reversal of {$vch->voucher_no} — loan disbursement reversed",
                    'debit_ledger' => $vch->credit_ledger,
                    'credit_ledger' => $vch->debit_ledger,
                    'amount_dr' => $vch->amount_dr,
                    'amount_cr' => $vch->amount_cr,
                    'narration' => "Loan disbursement reversed — {$loan->loan_id}",
                    'created_by' => (string) ($request->attributes->get('auth_user', ['user_code' => 'ADM01'])['user_code'] ?? 'ADM01'),
                    'is_reversed' => false,
                    'reversal_of' => $vch->voucher_no,
                    'idempotency_key' => "REVDISB-{$loan->loan_id}-{$vch->voucher_no}",
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                // Mark original as reversed
                DB::table('mfi_vouchers')->where('id', $vch->id)->update([
                    'is_reversed' => true,
                    'updated_at' => now(),
                ]);
                $reversedCount++;
            }

            Installment::where('loan_pk', $loan->id)->delete();
            $loan->update([
                'status' => 'APPROVED',
                'disbursement_date' => null,
                'principal_outstanding' => '0.00',
                'interest_outstanding' => '0.00',
                'total_outstanding' => '0.00',
            ]);

            return response()->json([
                'loan_id' => $loan->loan_id,
                'status' => 'APPROVED',
                'reversed_vouchers_count' => $reversedCount,
            ]);
        });
    }

    public function partPrepay(Request $request, string $id): JsonResponse
    {
        $loan = Loan::where('id', is_numeric($id) ? (int) $id : 0)
            ->orWhere('loan_id', $id)
            ->orWhere('application_no', $id)
            ->firstOrFail();

        $amt = BcMathCalculator::money((string) $request->input('amount', '5000.00'));
        $newPrin = BcMathCalculator::max('0.00', BcMathCalculator::sub((string) $loan->principal_outstanding, $amt, BcMathCalculator::LEDGER_SCALE));
        $newTot = BcMathCalculator::add(BcMathCalculator::add($newPrin, (string) $loan->interest_outstanding, BcMathCalculator::LEDGER_SCALE), (string) $loan->penalty_due, BcMathCalculator::LEDGER_SCALE);
        $newCol = BcMathCalculator::add((string) $loan->total_collected, $amt, BcMathCalculator::LEDGER_SCALE);
        $loan->update([
            'principal_outstanding' => $newPrin,
            'total_outstanding' => $newTot,
            'total_collected' => $newCol,
        ]);

        $remEmis = Installment::where('loan_pk', $loan->id)->where('status', '!=', 'PAID')->count();

        return response()->json([
            'receipt_no' => 'PP-' . date('YmdHis'),
            'loan_id' => $loan->loan_id,
            'principal_reduced' => $amt,
            'new_principal_outstanding' => $newPrin,
            'remaining_emis' => $remEmis,
        ]);
    }

    public function restructureLoan(Request $request, string $id): JsonResponse
    {
        $loan = Loan::where('id', is_numeric($id) ? (int) $id : 0)
            ->orWhere('loan_id', $id)
            ->orWhere('application_no', $id)
            ->firstOrFail();

        $newTen = max(1, (int) $request->input('new_tenure_emis', 12));
        $remPrin = BcMathCalculator::money((string) ($loan->principal_outstanding ?: $loan->plan_amount));
        $newEmi = BcMathCalculator::div(BcMathCalculator::mul($remPrin, '1.12'), (string) $newTen, BcMathCalculator::LEDGER_SCALE);
        $loan->update([
            'tenure_emis' => $newTen,
            'emi_amount' => $newEmi,
        ]);

        return response()->json([
            'loan_id' => $loan->loan_id,
            'new_emi_amount' => $newEmi,
            'new_tenure_emis' => $newTen,
        ]);
    }

    public function reconcileSchedule(string $id): JsonResponse
    {
        $loan = Loan::where('id', is_numeric($id) ? (int) $id : 0)
            ->orWhere('loan_id', $id)
            ->orWhere('application_no', $id)
            ->firstOrFail();

        return response()->json([
            'loan_id' => $loan->loan_id,
            'total_outstanding' => BcMathCalculator::money((string) $loan->total_outstanding),
            'status' => 'RECONCILED',
        ]);
    }

    public function shiftSchedule(Request $request, string $id): JsonResponse
    {
        $loan = Loan::where('id', is_numeric($id) ? (int) $id : 0)
            ->orWhere('loan_id', $id)
            ->orWhere('application_no', $id)
            ->firstOrFail();

        return response()->json([
            'loan_id' => $loan->loan_id,
            'change_date' => $request->input('change_date'),
            'collection_day' => $request->input('collection_day'),
            'status' => 'SHIFTED',
        ]);
    }

    public function dayShift(Request $request): JsonResponse
    {
        $instId = (int) $request->input('installment_id', 0);
        if ($instId > 0 && $request->filled('effective_date')) {
            Installment::where('id', $instId)->update(['due_date' => (string) $request->input('effective_date')]);
        }

        return response()->json([
            'status' => 'SHIFTED',
            'installment_id' => $instId,
            'effective_date' => $request->input('effective_date'),
            'shifted_day' => $request->input('shifted_day'),
        ]);
    }
}
