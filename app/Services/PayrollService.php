<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Employee;
use App\Models\Salary;
use App\Models\Scopes\TenantScope;
use Carbon\CarbonImmutable;
use DomainException;
use Illuminate\Support\Facades\DB;

/**
 * Salary / payroll service — Feature 5.
 *
 * Payroll rules (India, simplified statutory):
 *  - PF employee 8% of basic, PF employer 12% of basic
 *  - Professional tax: slab by state — default 2% of gross capped at Rs.2000/mo
 *  - Income tax: flat 10% on income above Rs.5,00,000/yr (simplified)
 */
class PayrollService
{
    public const PF_EMPLOYEE_RATE = 0.08;
    public const PF_EMPLOYER_RATE = 0.12;
    public const PROF_TAX_RATE = 0.02;
    public const PROF_TAX_CAP = 2000;
    public const INCOME_TAX_THRESHOLD = 500000;
    public const INCOME_TAX_RATE = 0.10;

    /**
     * Run payroll for a month for all active employees (or selected ids).
     *
     * @return array summary
     */
    public static function run(string $month, array $employeeIds = [], array $config = []): array
    {
        self::assertMonthFormat($month);

        $query = Employee::query()->where('login_status', 'ACTIVE');
        if ($employeeIds !== []) {
            $query->whereIn('id', $employeeIds);
        }
        $employees = $query->get();

        if ($employees->isEmpty()) {
            throw new DomainException('No active employees to run payroll for.');
        }

        $rows = [];
        foreach ($employees as $employee) {
            $basic = (float) ($config['basic_salary'] ?? 25000);
            $allowances = (float) ($config['allowances'] ?? 0);

            $gross = round($basic + $allowances, 2);
            $pfEmp = round($basic * self::PF_EMPLOYEE_RATE, 2);
            $pfEr = round($basic * self::PF_EMPLOYER_RATE, 2);
            $profTax = min($gross * self::PROF_TAX_RATE, self::PROF_TAX_CAP);
            $incomeTax = self::incomeTax($basic * 12, $employee);
            $net = round($gross - $pfEmp - $profTax - $incomeTax, 2);

            $existing = Salary::query()
                ->where('employee_id', $employee->id)
                ->where('month', $month)
                ->first();

            $payload = [
                'tenant_code' => $employee->tenant_code,
                'employee_id' => $employee->id,
                'user_code' => $employee->user_code,
                'branch_name' => $employee->branch_name ?? '',
                'month' => $month,
                'basic_salary' => $basic,
                'allowances' => $allowances,
                'gross_salary' => $gross,
                'pf_employee' => $pfEmp,
                'pf_employer' => $pfEr,
                'professional_tax' => $profTax,
                'income_tax' => $incomeTax,
                'net_salary' => $net,
                'status' => 'DRAFT',
            ];

            if ($existing !== null) {
                $existing->fill($payload);
                $existing->save();
                $rows[] = $existing;
            } else {
                $rows[] = Salary::create($payload);
            }
        }

        return [
            'month' => $month,
            'employees_processed' => count($rows),
            'total_gross' => (float) (DB::table('mfi_salaries')
                ->where('month', $month)->where('status', 'DRAFT')
                ->sum('gross_salary') ?? 0),
            'total_net' => (float) (DB::table('mfi_salaries')
                ->where('month', $month)->where('status', 'DRAFT')
                ->sum('net_salary') ?? 0),
            'salaries' => $rows,
        ];
    }

    /**
     * Mark a salary record as paid (runs on pay date).
     */
    public static function markPaid(Salary $salary): Salary
    {
        $salary->status = 'PAID';
        $salary->paid_at = now();
        $salary->save();
        return $salary;
    }

    private static function incomeTax(float $annualBasic, Employee $employee): float
    {
        if ($annualBasic <= self::INCOME_TAX_THRESHOLD) {
            return 0.00;
        }
        // Simplified slab: 10% on excess, minus standard deduction effect ignored here.
        return round(max(0.0, $annualBasic - self::INCOME_TAX_THRESHOLD) * self::INCOME_TAX_RATE, 2);
    }

    private static function assertMonthFormat(string $month): void
    {
        if (!preg_match('/^\d{4}-\d{2}$/', $month) || !CarbonImmutable::createFromFormat('Y-m', $month)) {
            throw new DomainException('month must be in YYYY-MM format.');
        }
    }
}
