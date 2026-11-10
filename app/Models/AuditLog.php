<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Audit log model for IntegrationHubController.
 * Maps to mfi_audit_logs table (which has hash chaining).
 */
class AuditLog extends Model
{
    protected $table = 'mfi_audit_logs';

    protected $fillable = [
        'tenant_code',
        'user_code',
        'action',
        'module',
        'record_id',
        'details',
        'prev_hash',
        'entry_hash',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
