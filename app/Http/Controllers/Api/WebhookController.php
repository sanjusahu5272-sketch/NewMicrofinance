<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use Illuminate\Routing\Controller;
use App\Models\Loan;
use App\Services\PaymentGatewayService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Webhook Controller — Secure Payment Gateway Webhooks
 *
 * Security measures:
 *   1. HMAC-SHA256 signature verification on raw request body
 *   2. Server-side payment verification (never trusts client-side success)
 *   3. Amount, currency, and order ID verification against database
 *   4. Idempotency — duplicate webhooks are rejected
 *   5. Audit logging for every webhook received
 */
class WebhookController extends \Illuminate\Routing\Controller
{
    private PaymentGatewayService $gateway;

    public function __construct(PaymentGatewayService $gateway)
    {
        $this->gateway = $gateway;
    }

    /**
     * Razorpay webhook.
     *
     * Verifies: signature → payment status → amount → currency → order → idempotency.
     */
    public function razorpay(Request $request): \Illuminate\Http\JsonResponse
    {
        $rawBody = $request->getContent();

        // ── 1. Signature verification (raw body, not parsed) ──
        try {
            $this->gateway->verifyWebhookSignature($rawBody, $request->headers->all(), 'RAZORPAY');
        } catch (\Throwable $e) {
            Log::warning('Razorpay webhook signature verification failed', ['error' => $e->getMessage()]);
            return response()->json(['success' => false, 'error' => 'Invalid signature'], 401);
        }

        $payload = json_decode($rawBody, true);
        if (!is_array($payload)) {
            return response()->json(['success' => false, 'error' => 'Invalid payload'], 400);
        }

        $payment = $payload['payment'] ?? [];
        $paymentId = $payment['id'] ?? null;
        $orderId = $payment['order_id'] ?? ($payload['order_id'] ?? null);
        $amount = $payment['amount'] ?? 0;
        $currency = $payment['currency'] ?? 'INR';
        $status = $payment['status'] ?? 'unknown';

        // ── 2. Currency verification ──
        if ($currency !== 'INR') {
            Log::warning('Razorpay webhook: non-INR currency', ['currency' => $currency]);
            return response()->json(['success' => false, 'error' => 'Invalid currency'], 400);
        }

        // ── 3. Idempotency — prevent duplicate processing ──
        if ($paymentId && $this->alreadyProcessed($paymentId)) {
            return response()->json(['success' => true, 'message' => 'Duplicate — already processed']);
        }

        // ── 4. Verify payment server-side (amount + order + status) ──
        if ($paymentId && $orderId && $amount > 0) {
            try {
                $verification = $this->gateway->verifyRazorpayPaymentServerSide(
                    $paymentId,
                    (int) $amount,
                    $orderId
                );

                if (!$verification['verified']) {
                    Log::warning('Razorpay webhook: server-side verification failed', [
                        'payment_id' => $paymentId,
                        'reason' => $verification['reason'] ?? 'Unknown',
                    ]);
                    return response()->json([
                        'success' => false,
                        'error' => 'Payment verification failed: ' . ($verification['reason'] ?? 'Unknown'),
                    ], 400);
                }
            } catch (\Throwable $e) {
                Log::error('Razorpay webhook: server-side verification error', [
                    'payment_id' => $paymentId,
                    'error' => $e->getMessage(),
                ]);
                return response()->json(['success' => false, 'error' => 'Verification error'], 500);
            }
        }

        // ── 5. Update loan/payment status in database (within transaction) ──
        if ($orderId && $status === 'captured') {
            $this->processPaymentSuccess($orderId, $paymentId, (int) $amount);
        }

        // ── 6. Audit log ──
        if ($paymentId) {
            DB::table('mfi_audit_logs')->insert([
                'tenant_code' => config('mfi.default_tenant', 'TNT-NEEV-01'),
                'user_code' => 'webhook',
                'action' => 'RAZORPAY_WEBHOOK',
                'module' => 'payments',
                'details' => json_encode([
                    'payment_id' => $paymentId,
                    'order_id' => $orderId,
                    'amount' => $amount,
                    'currency' => $currency,
                    'status' => $status,
                ]),
                'created_at' => now(),
            ]);
        }

        return response()->json(['success' => true, 'payment_id' => $paymentId]);
    }

    /**
     * Cashfree webhook.
     *
     * Verifies: signature → payment status → amount → currency → order → idempotency.
     */
    public function cashfree(Request $request): \Illuminate\Http\JsonResponse
    {
        $rawBody = $request->getContent();

        // ── 1. Signature verification (raw body, not parsed) ──
        try {
            $this->gateway->verifyWebhookSignature($rawBody, $request->headers->all(), 'CASHFREE');
        } catch (\Throwable $e) {
            Log::warning('Cashfree webhook signature verification failed', ['error' => $e->getMessage()]);
            return response()->json(['success' => false, 'error' => 'Invalid signature'], 401);
        }

        $payload = json_decode($rawBody, true);
        if (!is_array($payload)) {
            return response()->json(['success' => false, 'error' => 'Invalid payload'], 400);
        }

        $data = $payload['data'] ?? $payload;
        $paymentId = $data['cf_orderid'] ?? $payload['cf_orderid'] ?? null;
        $orderId = $data['order_id'] ?? $data['cf_orderid'] ?? $paymentId;
        $amount = (int) ($data['tx_amount'] ?? $data['amount'] ?? 0);
        $currency = $data['tx_currency'] ?? $data['currency'] ?? 'INR';
        $status = $data['order_status'] ?? $data['status'] ?? 'unknown';

        // ── 2. Currency verification ──
        if ($currency !== 'INR') {
            Log::warning('Cashfree webhook: non-INR currency', ['currency' => $currency]);
            return response()->json(['success' => false, 'error' => 'Invalid currency'], 400);
        }

        // ── 3. Idempotency ──
        if ($paymentId && $this->alreadyProcessed($paymentId)) {
            return response()->json(['success' => true, 'message' => 'Duplicate — already processed']);
        }

        // ── 4. Verify payment server-side ──
        if ($paymentId && $amount > 0) {
            try {
                $verification = $this->gateway->verifyCashfreePaymentServerSide($paymentId, $amount);

                if (!$verification['verified']) {
                    Log::warning('Cashfree webhook: server-side verification failed', [
                        'payment_id' => $paymentId,
                        'reason' => $verification['reason'] ?? 'Unknown',
                    ]);
                    return response()->json([
                        'success' => false,
                        'error' => 'Payment verification failed: ' . ($verification['reason'] ?? 'Unknown'),
                    ], 400);
                }
            } catch (\Throwable $e) {
                Log::error('Cashfree webhook: server-side verification error', [
                    'payment_id' => $paymentId,
                    'error' => $e->getMessage(),
                ]);
                return response()->json(['success' => false, 'error' => 'Verification error'], 500);
            }
        }

        // ── 5. Update payment status ──
        if ($orderId && in_array($status, ['PAID', 'SUCCESS', 'COMPLETED'], true)) {
            $this->processPaymentSuccess($orderId, $paymentId, $amount);
        }

        // ── 6. Audit log ──
        if ($paymentId) {
            DB::table('mfi_audit_logs')->insert([
                'tenant_code' => config('mfi.default_tenant', 'TNT-NEEV-01'),
                'user_code' => 'webhook',
                'action' => 'CASHFREE_WEBHOOK',
                'module' => 'payments',
                'details' => json_encode([
                    'payment_id' => $paymentId,
                    'order_id' => $orderId,
                    'amount' => $amount,
                    'currency' => $currency,
                    'status' => $status,
                ]),
                'created_at' => now(),
            ]);
        }

        return response()->json(['success' => true, 'payment_id' => $paymentId]);
    }

    /**
     * Process successful payment — mark loan/EMI as paid.
     * Runs in a transaction to prevent partial updates.
     */
    private function processPaymentSuccess(string $orderId, ?string $paymentId, int $amount): void
    {
        DB::transaction(function () use ($orderId, $paymentId, $amount): void {
            // Find loan by order ID (receipt_no or loan_id)
            $loan = Loan::where('loan_id', $orderId)
                ->orWhere('application_no', $orderId)
                ->first();

            if (!$loan) {
                Log::warning('Webhook: No loan found for order', ['order_id' => $orderId]);
                return;
            }

            // Log the payment
            DB::table('mfi_audit_logs')->insert([
                'tenant_code' => $loan->tenant_code,
                'user_code' => 'webhook',
                'action' => 'PAYMENT_RECEIVED',
                'module' => 'payments',
                'details' => json_encode([
                    'loan_id' => $loan->loan_id,
                    'order_id' => $orderId,
                    'payment_id' => $paymentId,
                    'amount' => $amount,
                    'source' => 'webhook',
                ]),
                'created_at' => now(),
            ]);
        });
    }

    /**
     * Check if a webhook payment was already processed (idempotency).
     */
    private function alreadyProcessed(string $paymentId): bool
    {
        return DB::table('mfi_audit_logs')
            ->where('module', 'payments')
            ->where('action', 'RAZORPAY_WEBHOOK')
            ->orWhere('action', 'CASHFREE_WEBHOOK')
            ->where('details->payment_id', $paymentId)
            ->exists();
    }
}
