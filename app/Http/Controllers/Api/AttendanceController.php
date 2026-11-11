<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Attendance;
use App\Models\Employee;
use App\Services\AttendanceService;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Employee attendance API — Feature 4.
 *
 * POST /api/attendance/check-in        {employee_id, date?, location?}
 * POST /api/attendance/check-out       {employee_id, date?}
 * POST /api/attendance/mark-absent     {employee_id, date?, remark?, status?}
 * GET  /api/attendance                 ?employee_id=&from=&to=
 * GET  /api/attendance/summary         ?employee_id=&month=
 */
class AttendanceController extends Controller
{
    public function checkIn(Request $request): JsonResponse
    {
        try {
            $employee = $this->findEmployee($request);
            $attendance = AttendanceService::checkIn(
                $employee,
                $request->input('date'),
                (string) $request->input('location', '')
            );
        } catch (DomainException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Checked in.',
            'attendance' => $attendance,
        ], 201);
    }

    public function checkOut(Request $request): JsonResponse
    {
        try {
            $employee = $this->findEmployee($request);
            $attendance = AttendanceService::checkOut($employee, $request->input('date'));
        } catch (DomainException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Checked out.',
            'attendance' => $attendance,
        ]);
    }

    public function markAbsent(Request $request): JsonResponse
    {
        try {
            $employee = $this->findEmployee($request);
            $attendance = AttendanceService::markAbsent(
                $employee,
                $request->input('date'),
                (string) $request->input('remark', ''),
                (string) $request->input('status', 'ABSENT')
            );
        } catch (DomainException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Absence recorded.',
            'attendance' => $attendance,
        ], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $query = Attendance::query()
            ->when($request->input('employee_id'), fn ($q, $v) => $q->where('employee_id', (int) $v))
            ->when($request->input('branch_name'), fn ($q, $v) => $q->where('branch_name', (string) $v))
            ->when($request->input('status'), fn ($q, $v) => $q->where('status', strtoupper((string) $v)))
            ->when($request->input('from'), fn ($q, $v) => $q->whereDate('attendance_date', '>=', (string) $v))
            ->when($request->input('to'), fn ($q, $v) => $q->whereDate('attendance_date', '<=', (string) $v))
            ->orderByDesc('attendance_date')
            ->orderByDesc('id')
            ->limit(min((int) $request->input('limit', 50), 200));

        return response()->json(['attendance' => $query->get()]);
    }

    public function summary(Request $request): JsonResponse
    {
        $employee = $this->findEmployee($request);

        return response()->json([
            'summary' => AttendanceService::monthSummary($employee, $request->input('month')),
        ]);
    }

    private function findEmployee(Request $request): Employee
    {
        $employeeId = (int) $request->input('employee_id', 0);
        $employee = Employee::withoutGlobalScopes()->find($employeeId);
        if ($employee === null) {
            throw new DomainException('Employee not found.');
        }
        return $employee;
    }
}
