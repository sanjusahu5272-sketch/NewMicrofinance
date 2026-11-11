<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Salary;
use App\Services\PayrollService;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Salary / payroll API — Feature 5.
 *
 * POST /api/payroll/run                 {month, employee_ids?, basic_salary?, allowances?}
 * GET  /api/payroll?month=&status=&branch_name=
 * GET  /api/payroll/employee/{id}
 * POST /api/payroll/{id}/pay
 */
class PayrollController extends Controller
{
    public function run(Request $request): JsonResponse
    {
        try {
            $month = (string) $request->input('month', now()->format('Y-m'));
            $employeeIds = array_values(array_filter(array_map('intval', (array) $request->input('employee_ids', []))));
            $result = PayrollService::run($month, $employeeIds, [
                'basic_salary' => (float) $request->input('basic_salary', 25000),
                'allowances' => (float) $request->input('allowances', 0),
            ]);
        } catch (DomainException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Payroll run complete.',
            'payroll' => $result,
        ], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $query = Salary::query()
            ->when($request->input('month'), fn ($q, $v) => $q->where('month', (string) $v))
            ->when($request->input('status'), fn ($q, $v) => $q->where('status', strtoupper((string) $v)))
            ->when($request->input('branch_name'), fn ($q, $v) => $q->where('branch_name', (string) $v))
            ->when($request->input('employee_id'), fn ($q, $v) => $q->where('employee_id', (int) $v))
            ->orderByDesc('month')
            ->orderByDesc('id');

        return response()->json(['salaries' => $query->paginate(min((int) $request->input('limit', 25), 100))]);
    }

    public function employeeHistory(int $employeeId): JsonResponse
    {
        $salaries = Salary::query()
            ->where('employee_id', $employeeId)
            ->orderByDesc('month')
            ->limit(24)
            ->get();

        return response()->json([
            'employee_id' => $employeeId,
            'count' => $salaries->count(),
            'salaries' => $salaries,
        ]);
    }

    public function pay(int $id): JsonResponse
    {
        $salary = Salary::query()->whereKey($id)->first();
        if ($salary === null) {
            return response()->json(['error' => 'Salary record not found.'], 404);
        }
        if ($salary->status === 'PAID') {
            return response()->json(['error' => 'Salary already paid.'], 422);
        }

        PayrollService::markPaid($salary);

        return response()->json(['message' => 'Salary marked as paid.', 'salary' => $salary]);
    }
}
