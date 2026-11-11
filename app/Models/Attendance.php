<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Attendance extends Model
{
    protected $table = 'mfi_attendance';

    public const SHIFT_START = '09:30';
    public const SHIFT_END = '18:30';

    protected $fillable = [
        'tenant_code',
        'employee_id',
        'user_code',
        'branch_name',
        'attendance_date',
        'check_in_time',
        'check_out_time',
        'status',
        'late_minutes',
        'early_exit_minutes',
        'overtime_minutes',
        'location',
        'remark',
    ];

    protected function casts(): array
    {
        return [
            'attendance_date' => 'date',
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
