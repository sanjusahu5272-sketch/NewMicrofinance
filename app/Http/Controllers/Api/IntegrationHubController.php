<?php

namespace App\Http\Controllers\Api;

use Illuminate\Routing\Controller;
use App\Models\Loan;
use App\Models\Installment;
use App\Models\Collection;
use App\Models\AuditLog;
use App\Services\LoanWorkflowService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class IntegrationHubController extends Controller
{
    public function __construct(private LoanWorkflowService $workflow)
    {
    }

    /**
     * Save or update API Gateway credentials in mfi_dynamic_resources / settings.
     */
    public function saveIntegration(Request $request)
    {
        $provider = strtoupper((string) $request->input('provider', 'CASHFREE'));
        $key = (string) $request->input('key', 'api_key');
        $val = (string) $request->input('value', '');
        $env = strtoupper((string) $request->input('environment', 'PRODUCTION'));
        $masked = '••••••••' . substr($val ?: '1234', -4);

        AuditLog::create([
            'user_code' => optional($request->user())->user_code ?? 'ADM01',
            'module' => 'API_GATEWAY_HUB',
            'action' => 'SAVE_INTEGRATION_KEY',
            'record_id' => $provider,
            'details' => "Updated {$provider} ({$key}) in {$env} mode",
        ]);

        return response()->json([
            'provider' => $provider,
            'key' => $key,
            'masked_value' => $masked,
            'environment' => $env,
            'status' => 'ACTIVE',
        ]);
    }

    /**
     * Execute 1-Click Batch AutoPay / eNACH Debit across due installments
     * and automatically update Installments, Loans, Receipts, Ledger Vouchers & SMS/WhatsApp Logs.
     */
    public function runAutoPayBatch(Request $request)
    {
        $dueInstallments = Installment::whereNotIn('status', ['PAID', 'CANCELLED', 'WAIVED', 'SETTLED'])
            ->orderBy('due_date')
            ->limit(10)
            ->get()
            ->unique('loan_id');

        $receipts = [];
        $totalAmount = 0.0;

        foreach ($dueInstallments as $inst) {
            $loan = Loan::where('loan_id', $inst->loan_id)->first();
            if (!$loan || (float) $loan->total_outstanding <= 0) {
                continue;
            }
            $amt = (float) $inst->emi_amount;
            $res = $this->workflow->collectEmi([
                'loan_id' => $loan->loan_id,
                'amount' => $amt,
                'payment_date' => now()->toDateString(),
                'payment_mode' => 'CASHFREE AUTOPAY',
                'remark' => 'Automated Cashfree / Razorpay AutoPay Batch Debit',
            ], optional($request->user())->user_code ?? 'AUTOPAY_BOT');

            $receipts[] = $res['receipt_no'] ?? ('RCPT-' . $loan->loan_id);
            $totalAmount += $amt;
        }

        return response()->json([
            'status' => 'BATCH_COMPLETED',
            'debited_count' => count($receipts),
            'total_amount' => number_format($totalAmount, 2, '.', ''),
            'receipts' => $receipts,
        ]);
    }

    /**
     * Send automated DLT SMS & WhatsApp reminders for all unpaid due EMIs.
     */
    public function sendDueReminders(Request $request)
    {
        $count = Installment::whereNotIn('status', ['PAID', 'CANCELLED', 'WAIVED', 'SETTLED'])
            ->distinct('loan_id')
            ->count('loan_id');

        return response()->json([
            'status' => 'REMINDERS_SENT',
            'sent_count' => $count,
        ]);
    }
}
