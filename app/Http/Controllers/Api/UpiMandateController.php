<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

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
