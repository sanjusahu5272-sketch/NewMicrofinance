<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Salary extends Model
{
    protected $table = 'mfi_salaries';

    protected $fillable = [
        'tenant_code',
        'employee_id',
        'user_code',
        'branch_name',
        'month',
        'basic_salary',
        'allowances',
        'gross_salary',
        'pf_employee',
        'pf_employer',
        'professional_tax',
        'income_tax',
        'net_salary',
        'status',
        'paid_at',
        'remark',
    ];

    protected function casts(): array
    {
        return [
            'basic_salary' => 'decimal:2',
            'allowances' => 'decimal:2',
            'gross_salary' => 'decimal:2',
            'pf_employee' => 'decimal:2',
            'pf_employer' => 'decimal:2',
            'professional_tax' => 'decimal:2',
            'income_tax' => 'decimal:2',
            'net_salary' => 'decimal:2',
            'paid_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::addGlobalScope(new TenantScope());
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'employee_id');
    }
}
