<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Services\UpiMandateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * eNACH / AutoPay mandate webhook receiver.
 *
 * Security:
 *   1. HMAC-SHA256 over the RAW request body with ENACH_WEBHOOK_SECRET.
 *   2. Unknown events rejected.
 *   3. Every event audit-logged.
 *   4. Debit events are idempotent — a mandate can only debit a DUE
 *      installment once (status transitions to PAID).
 *
 * Events:
 *   mandate.status_updated  -> activate / cancel / fail mandate
 *   mandate.debit_success   -> book collection + mark installment paid
 *   mandate.debit_failed    -> bounce handling
 */
class EnachWebhookController extends Controller
{
    public function receive(Request $request): JsonResponse
    {
        $rawBody = $request->getContent();

        // ── 1. Signature verification ──
        $secret = (string) config('services.enanch.secret', env('ENACH_WEBHOOK_SECRET', ''));
        if ($secret === '') {
            Log::error('eNACH webhook received but ENACH_WEBHOOK_SECRET is not configured.');
            return response()->json(['success' => false, 'error' => 'Webhook secret not configured'], 503);
        }

        $signature = (string) ($request->header('X-Signature') ?? $request->header('X-Enach-Signature') ?? '');
        $expected = 'sha256=' . hash_hmac('sha256', $rawBody, $secret);
        if (!hash_equals($expected, $signature)) {
            Log::warning('eNACH webhook signature mismatch');
            return response()->json(['success' => false, 'error' => 'Invalid signature'], 401);
        }

        $payload = json_decode($rawBody, true);
        if (!is_array($payload)) {
            return response()->json(['success' => false, 'error' => 'Invalid payload'], 400);
        }

        $event = strtolower((string) ($payload['event'] ?? ''));
        $eventId = (string) ($payload['event_id'] ?? $payload['id'] ?? '');
        $data = (array) ($payload['data'] ?? $payload);

        try {
            $result = UpiMandateService::processWebhookEvent($event, $data);
        } catch (Throwable $e) {
            Log::warning('eNACH webhook processing failed', [
                'event' => $event,
                'error' => $e->getMessage(),
            ]);
            return response()->json(['success' => false, 'error' => $e->getMessage()], 422);
        }

        return response()->json(['success' => true, 'result' => $result], 200);
    }
}
