<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\CreditScore;
use App\Models\Member;
use App\Services\CreditScoreService;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Credit score / risk rating API — Feature 2.
 *
 * POST /api/credit-scores/compute          {member_id} → compute + store
 * GET  /api/credit-scores/member/{id}      latest score
 * GET  /api/credit-scores/member/{id}/history   all score history
 * POST /api/credit-scores/member/{id}/override {score, reason}  admin manual override
 */
class CreditScoreController extends Controller
{
    public function compute(Request $request): JsonResponse
    {
        $memberId = (int) $request->input('member_id', 0);
        $member = Member::query()->find($memberId);
        if ($member === null) {
            return response()->json(['error' => 'Member not found.'], 404);
        }

        $record = CreditScoreService::computeForMember($member);

        return response()->json([
            'message' => 'Credit score computed.',
            'credit_score' => $record,
        ], 201);
    }

    public function latestForMember(int $memberId): JsonResponse
    {
        $member = Member::query()->find($memberId);
        if ($member === null) {
            return response()->json(['error' => 'Member not found.'], 404);
        }

        $record = CreditScore::query()
            ->where('member_id', $memberId)
            ->orderByDesc('computed_at')
            ->orderByDesc('id')
            ->first();

        if ($record === null) {
            return response()->json([
                'member_id' => $memberId,
                'credit_score' => null,
                'message' => 'No score computed yet. Call POST /api/credit-scores/compute first.',
            ]);
        }

        return response()->json(['credit_score' => $record]);
    }

    public function history(int $memberId): JsonResponse
    {
        $member = Member::query()->find($memberId);
        if ($member === null) {
            return response()->json(['error' => 'Member not found.'], 404);
        }

        $records = CreditScore::query()
            ->where('member_id', $memberId)
            ->orderByDesc('computed_at')
            ->orderByDesc('id')
            ->limit(50)
            ->get();

        return response()->json([
            'member_id' => $memberId,
            'count' => $records->count(),
            'scores' => $records,
        ]);
    }

    public function override(Request $request, int $memberId): JsonResponse
    {
        $member = Member::query()->find($memberId);
        if ($member === null) {
            return response()->json(['error' => 'Member not found.'], 404);
        }

        $score = (int) $request->input('score', 0);
        if ($score < CreditScoreService::MIN_SCORE || $score > CreditScoreService::MAX_SCORE) {
            return response()->json([
                'error' => 'score must be between ' . CreditScoreService::MIN_SCORE . ' and ' . CreditScoreService::MAX_SCORE . '.',
            ], 422);
        }

        try {
            $record = CreditScoreService::override(
                $member,
                $score,
                (string) $request->input('reason', '')
            );
        } catch (DomainException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Score manually overridden.',
            'credit_score' => $record,
        ], 201);
    }
}
