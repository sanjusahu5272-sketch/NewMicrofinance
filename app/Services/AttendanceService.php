<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Scopes\TenantScope;
use DateTimeImmutable;
use DateTimeInterface;
use DomainException;
use Illuminate\Support\Facades\DB;

/**
 * Employee attendance service — Feature 4.
 */
class AttendanceService
{
    public const SHIFT_START = '09:30';
    public const SHIFT_END = '18:30';

    /**
     * Clock-in for an employee on (optional) date.
     */
    public static function checkIn(Employee $employee, ?string $date = null, string $location = ''): Attendance
    {
        $date = $date ?: now()->toDateString();

        $existing = Attendance::query()
            ->where('employee_id', $employee->id)
            ->whereDate('attendance_date', $date)
            ->first();

        if ($existing !== null && $existing->status !== 'ABSENT') {
            if ($existing->check_in_time !== null) {
                throw new DomainException('Already checked in at ' . $existing->check_in_time . '. Use check-out first.');
            }
        }

        $checkIn = self::parseTime(now());
        $late = max(0, self::minutesBetween(self::SHIFT_START, $checkIn));

        if ($existing === null) {
            $attendance = new Attendance([
                'tenant_code' => $employee->tenant_code,
                'employee_id' => $employee->id,
                'user_code' => $employee->user_code,
                'branch_name' => $employee->branch_name ?? '',
                'attendance_date' => $date,
                'check_in_time' => $checkIn,
                'status' => 'PRESENT',
                'late_minutes' => $late,
                'location' => $location,
            ]);
        } else {
            $attendance = $existing;
            $attendance->check_in_time = $checkIn;
            $attendance->status = 'PRESENT';
            $attendance->late_minutes = $late;
            if ($location !== '') {
                $attendance->location = $location;
            }
        }

        $attendance->save();
        return $attendance;
    }

    /**
     * Clock-out for an employee on (optional) date.
     */
    public static function checkOut(Employee $employee, ?string $date = null): Attendance
    {
        $date = $date ?: now()->toDateString();

        $attendance = Attendance::query()
            ->where('employee_id', $employee->id)
            ->whereDate('attendance_date', $date)
            ->first();

        if ($attendance === null) {
            throw new DomainException('No attendance record for this date. Check in first.');
        }
        if ($attendance->check_out_time !== null) {
            throw new DomainException('Already checked out at ' . $attendance->check_out_time . '.');
        }

        $checkOut = self::parseTime(now());
        $attendance->check_out_time = $checkOut;
        $attendance->early_exit_minutes = max(0, self::minutesBetween($checkOut, self::SHIFT_END));
        $attendance->overtime_minutes = max(0, self::minutesBetween(self::SHIFT_END, $checkOut));
        $attendance->status = $attendance->late_minutes > 0 ? 'HALF_DAY' : 'PRESENT';
        $attendance->save();

        return $attendance;
    }

    /**
     * Mark a full-day absence / leave.
     */
    public static function markAbsent(Employee $employee, ?string $date = null, string $remark = '', string $status = 'ABSENT'): Attendance
    {
        $date = $date ?: now()->toDateString();
        if (!in_array($status, ['ABSENT', 'LEAVE'], true)) {
            throw new DomainException('status must be ABSENT or LEAVE.');
        }

        $attendance = Attendance::query()
            ->where('employee_id', $employee->id)
            ->whereDate('attendance_date', $date)
            ->first();

        if ($attendance === null) {
            $attendance = new Attendance([
                'tenant_code' => $employee->tenant_code,
                'employee_id' => $employee->id,
                'user_code' => $employee->user_code,
                'branch_name' => $employee->branch_name ?? '',
                'attendance_date' => $date,
                'status' => $status,
                'remark' => $remark,
            ]);
        } else {
            $attendance->status = $status;
            $attendance->check_in_time = null;
            $attendance->check_out_time = null;
            if ($remark !== '') {
                $attendance->remark = $remark;
            }
        }

        $attendance->save();
        return $attendance;
    }

    /**
     * Monthly summary for one employee.
     */
    public static function monthSummary(Employee $employee, ?string $month = null): array
    {
        $month = $month ?: now()->format('Y-m');

        $rows = Attendance::query()
            ->where('employee_id', $employee->id)
            ->where(function ($q) use ($month): void {
                $q->whereRaw("to_char(attendance_date, 'YYYY-MM') = ?", [$month])
                    ->orWhereRaw("to_char(attendance_date, 'YYYY-MM') LIKE ?", [$month . '%']);
            })
            ->get();

        $present = $rows->whereIn('status', ['PRESENT', 'HALF_DAY'])->count();
        $absent = $rows->where('status', 'ABSENT')->count();
        $leave = $rows->where('status', 'LEAVE')->count();

        return [
            'employee_id' => $employee->id,
            'user_code' => $employee->user_code,
            'month' => $month,
            'present' => $present,
            'half_day' => $rows->where('status', 'HALF_DAY')->count(),
            'absent' => $absent,
            'leave' => $leave,
            'total_late_minutes' => $rows->sum('late_minutes'),
            'total_overtime_minutes' => $rows->sum('overtime_minutes'),
            'attendance_ratio' => $present > 0 ? round($present / ($present + $absent + $leave), 4) : 0,
        ];
    }

    private static function parseTime(DateTimeInterface $dt): string
    {
        return $dt->format('H:i:s');
    }

    private static function minutesBetween(string $from, string $to): int
    {
        $fromDt = new DateTimeImmutable('today ' . ($from === '' ? '00:00:00' : $from));
        $toDt = new DateTimeImmutable('today ' . $to);
        return (int) (($toDt->getTimestamp() - $fromDt->getTimestamp()) / 60);
    }
}
