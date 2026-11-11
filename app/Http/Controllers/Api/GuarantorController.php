<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Guarantor;
use App\Models\Loan;
use App\Services\GuarantorService;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Guarantor management API — Feature 1.
 *
 * POST   /api/loans/{loanPk}/guarantors          attach guarantor
 * GET    /api/loans/{loanPk}/guarantors          list guarantors of loan
 * GET    /api/guarantors/{id}                    show guarantor
 * PATCH  /api/guarantors/{id}                    update guarantor details
 * DELETE /api/guarantors/{id}                    release guarantor
 */
class GuarantorController extends Controller
{
    public function forLoan(Request $request, int $loanPk): JsonResponse
    {
        $loan = Loan::query()->where('id', $loanPk)->first();
        if ($loan === null) {
            return response()->json(['error' => 'Loan not found.'], 404);
        }

        $rows = Guarantor::query()
            ->where('loan_id', $loanPk)
            ->orderByDesc('is_primary')
            ->orderBy('guarantor_name')
            ->get(['id', 'loan_id', 'guarantor_name', 'guarantor_mobile', 'guarantor_relation',
                'guarantor_occupation', 'guarantor_annual_income', 'is_primary', 'status', 'created_at']);

        return response()->json([
            'loan_id' => $loan->id,
            'application_no' => $loan->application_no,
            'guarantors' => $rows,
            'active_count' => (int) $rows->where('status', 'ACTIVE')->count(),
        ]);
    }

    public function store(Request $request, int $loanPk): JsonResponse
    {
        $loan = Loan::query()->where('id', $loanPk)->first();
        if ($loan === null) {
            return response()->json(['error' => 'Loan not found.'], 404);
        }

        try {
            $guarantor = GuarantorService::attach($loan, $request->all());
        } catch (DomainException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        $authUser = (array) $request->attributes->get('auth_user', []);
        GuarantorService::audit([
            'name' => 'GUARANTOR_ATTACHED',
            'performed_by' => (string) ($authUser['user_code'] ?? 'api'),
            'summary' => "Guarantor {$guarantor->guarantor_name} attached to loan {$loan->application_no}.",
        ], ['tenant_code' => $loan->tenant_code, 'entity_id' => $guarantor->id]);

        return response()->json([
            'message' => 'Guarantor attached to loan.',
            'guarantor' => $guarantor,
        ], 201);
    }

    public function show(int $id): JsonResponse
    {
        $guarantor = Guarantor::query()->whereKey($id)->first();
        if ($guarantor === null) {
            return response()->json(['error' => 'Guarantor not found.'], 404);
        }

        return response()->json(['guarantor' => $guarantor]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $guarantor = Guarantor::query()->whereKey($id)->first();
        if ($guarantor === null) {
            return response()->json(['error' => 'Guarantor not found.'], 404);
        }
        if (($guarantor->status ?? '') === 'RELEASED') {
            return response()->json(['error' => 'Released guarantors cannot be edited.'], 422);
        }

        $data = $request->all();
        unset($data['loan_id'], $data['status'], $data['tenant_code']);

        if ($data !== []) {
            $error = GuarantorService::validatePayload(array_merge($guarantor->toArray(), $data));
            if ($error !== null) {
                return response()->json(['error' => $error], 422);
            }
            $guarantor->fill($data);
            $guarantor->save();
        }

        return response()->json(['message' => 'Guarantor updated.', 'guarantor' => $guarantor]);
    }

    public function destroy(int $id): JsonResponse
    {
        $guarantor = Guarantor::query()->whereKey($id)->first();
        if ($guarantor === null) {
            return response()->json(['error' => 'Guarantor not found.'], 404);
        }

        try {
            GuarantorService::release($guarantor);
        } catch (DomainException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        GuarantorService::audit([
            'name' => 'GUARANTOR_RELEASED',
            'summary' => "Guarantor {$guarantor->guarantor_name} released from loan.",
        ], ['tenant_code' => $guarantor->tenant_code, 'entity_id' => $guarantor->id]);

        return response()->json(['message' => 'Guarantor released.', 'guarantor' => $guarantor]);
    }
}
