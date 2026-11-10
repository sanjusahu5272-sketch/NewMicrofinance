<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Login History Model
 *
 * Records every authentication attempt with IP, device, and status.
 */
class LoginHistory extends Model
{
    protected $table = 'mfi_login_history';

    protected $fillable = [
        'tenant_code',
        'employee_id',
        'employee_code',
        'ip_address',
        'user_agent',
        'device_name',
        'was_successful',
        'status',
        'failure_reason',
        'login_at',
        'logout_at',
    ];

    protected $casts = [
        'was_successful' => 'boolean',
        'login_at' => 'datetime',
        'logout_at' => 'datetime',
    ];

    /**
     * Get a human-readable device name from user agent.
     */
    public function getDeviceNameAttribute(): string
    {
        if ($this->user_agent) {
            if (str_contains($this->user_agent, 'Mobile')) return 'Mobile';
            if (str_contains($this->user_agent, 'Chrome')) return 'Chrome';
            if (str_contains($this->user_agent, 'Firefox')) return 'Firefox';
            if (str_contains($this->user_agent, 'Safari')) return 'Safari';
            if (str_contains($this->user_agent, 'curl')) return 'API/CLI';
        }
        return 'Unknown';
    }

    /**
     * Get the employee's recent login history.
     */
    public static function forEmployee(string $employeeId, int $limit = 20): \Illuminate\Database\Eloquent\Collection
    {
        return self::where('employee_id', $employeeId)
            ->orderByDesc('login_at')
            ->limit($limit)
            ->get();
    }
}
