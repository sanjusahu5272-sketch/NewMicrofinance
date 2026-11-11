<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Loan;
use App\Models\UpiMandate;
use App\Services\UpiMandateService;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * UPI mandate API — Feature 6.
 *
 * POST /api/upi-mandates/create        create mandate
 * GET  /api/upi-mandates?member_id=&status=&loan_id=
 * POST /api/upi-mandates/{id}/pause
 * POST /api/upi-mandates/{id}/resume
 * POST /api/upi-mandates/{id}/cancel
 * POST /api/upi-mandates/{id}/debit    execute one auto-debit
 */
class UpiMandateController extends Controller
{
    /**
     * Create a mandate at loan disbursement time.
     * POST /api/loans/{loanId}/mandate
     */
    public function createAtDisbursement(Request $request, string $loanId): JsonResponse
    {
        $loan = Loan::query()
            ->where('id', is_numeric($loanId) ? (int) $loanId : 0)
            ->orWhere('loan_id', $loanId)
            ->orWhere('application_no', $loanId)
            ->first();
        if ($loan === null) {
            return response()->json(['error' => 'Loan not found.'], 404);
        }

        try {
            $result = UpiMandateService::createAtDisbursement($loan, $request->all());
        } catch (DomainException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        $otp = (string) ($result['otp'] ?? '');
        $mandate = $result['mandate'];

        return response()->json([
            'message' => 'Mandate created. Consent OTP sent to member.',
            'mandate' => $mandate,
            'otp_sent_to' => $mandate->mobile,
            'consent_verify_url' => "/api/upi-mandates/{$mandate->id}/consent/verify",
            $otp !== '' ? 'otp' : 'otp_note' => $otp !== ''
                ? "Local dev: OTP is $otp. Verify via POST /api/upi-mandates/{$mandate->id}/consent/verify"
                : 'OTP delivered via SMS gateway only.',
        ], 201);
    }

    /**
     * Send consent OTP for a mandate.
     */
    public function sendConsentOtp(int $id): JsonResponse
    {
        $mandate = UpiMandate::query()->whereKey($id)->first();
        if ($mandate === null) {
            return response()->json(['error' => 'Mandate not found.'], 404);
        }

        try {
            $result = UpiMandateService::sendConsentOtp($mandate);
        } catch (DomainException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        $otp = (string) ($result['otp'] ?? '');

        return response()->json([
            'message' => 'Consent OTP sent.',
            $otp !== '' ? 'otp' : 'otp_note' => $otp !== ''
                ? "Local dev: OTP is $otp."
                : 'OTP delivered via SMS gateway only.',
            'expires_in_minutes' => $result['expires_in_minutes'],
        ]);
    }

    /**
     * Verify consent OTP → activate mandate.
     */
    public function verifyConsent(Request $request, int $id): JsonResponse
    {
        $mandate = UpiMandate::query()->whereKey($id)->first();
        if ($mandate === null) {
            return response()->json(['error' => 'Mandate not found.'], 404);
        }

        try {
            $mandate = UpiMandateService::verifyConsent($mandate, (string) $request->input('otp', ''));
        } catch (DomainException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Mandate consent verified. Mandate is ACTIVE.',
            'mandate' => $mandate,
        ]);
    }

    /**
     * Simulate bank approval (sandbox/demo).
     */
    public function approve(int $id): JsonResponse
    {
        $mandate = UpiMandate::query()->whereKey($id)->first();
        if ($mandate === null) {
            return response()->json(['error' => 'Mandate not found.'], 404);
        }

        try {
            $mandate = UpiMandateService::approveByBank($mandate);
        } catch (DomainException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Mandate approved by bank.',
            'mandate' => $mandate,
        ]);
    }

    public function create(Request $request): JsonResponse
    {
        try {
            $mandate = UpiMandateService::create($request->all());
        } catch (DomainException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'UPI mandate created.',
            'mandate' => $mandate,
        ], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $query = UpiMandate::query()
            ->when($request->input('member_id'), fn ($q, $v) => $q->where('member_id', (int) $v))
            ->when($request->input('loan_id'), fn ($q, $v) => $q->where('loan_id', (int) $v))
            ->when($request->input('status'), fn ($q, $v) => $q->where('status', strtoupper((string) $v)))
            ->orderByDesc('id');

        return response()->json(['mandates' => $query->paginate(min((int) $request->input('limit', 25), 100))]);
    }

    public function pause(Request $request, int $id): JsonResponse
    {
        return $this->transition($request, $id, 'pause');
    }

    public function resume(Request $request, int $id): JsonResponse
    {
        return $this->transition($request, $id, 'resume');
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        return $this->transition($request, $id, 'cancel');
    }

    public function transition(Request $request, int $id, string $action): JsonResponse
    {
        $map = ['pause' => 'PAUSED', 'resume' => 'ACTIVE', 'cancel' => 'CANCELLED'];
        $target = $map[$action] ?? null;
        if ($target === null) {
            return response()->json(['error' => 'Unknown transition.'], 422);
        }

        $mandate = UpiMandate::query()->whereKey($id)->first();
        if ($mandate === null) {
            return response()->json(['error' => 'Mandate not found.'], 404);
        }

        try {
            $mandate = UpiMandateService::transition($mandate, $target);
        } catch (DomainException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => "Mandate {$action}d.",
            'mandate' => $mandate,
        ]);
    }

    public function debit(int $id): JsonResponse
    {
        $mandate = UpiMandate::query()->whereKey($id)->first();
        if ($mandate === null) {
            return response()->json(['error' => 'Mandate not found.'], 404);
        }

        try {
            $result = UpiMandateService::debit($mandate);
        } catch (DomainException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Auto-debit executed.',
            'debit' => $result,
        ], 201);
    }
}
