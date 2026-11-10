<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Model;

class Employee extends Model
{
    protected $table = 'mfi_employees';

    protected $fillable = [
        'tenant_code',
        'user_code',
        'name',
        'alias',
        'email',
        'mobile',
        'gender',
        'designation',
        'role_id',
        'role_name',
        'branch_id',
        'branch_name',
        'password_hash',
        'kyc_status',
        'login_status',
    ];

    protected $hidden = ['password_hash', 'totp_secret_encrypted', 'totp_recovery_codes'];

    /**
     * A TOTP seed in plaintext is as good as a plaintext password: a DB dump
     * would let an attacker mint valid codes forever. Laravel's `encrypted`
     * cast uses AES-256-GCM keyed by APP_KEY.
     *
     * `password_hash` is deliberately NOT cast — it is already a bcrypt hash
     * and double-encrypting it would make password verification impossible.
     */
    protected $casts = [
        'totp_secret_encrypted' => 'encrypted',
        'totp_recovery_codes' => 'array',
        'totp_enabled' => 'boolean',
        'must_change_password' => 'boolean',
        'last_totp_step' => 'integer',
        'failed_login_attempts' => 'integer',
        'totp_confirmed_at' => 'datetime',
        'password_changed_at' => 'datetime',
        'locked_until' => 'datetime',
        'last_login_at' => 'datetime',
    ];

    /**
     * Decrypt the TOTP seed, tolerating rows written before encryption existed.
     * Returns '' rather than throwing so a corrupt row can't brick the login page.
     */
    public function totpSecret(): string
    {
        // `encrypted` cast can throw if APP_KEY changed since the row was written.
        $value = $this->totp_secret_encrypted;

        return (string) ($value ?? '');
    }

    /** Is this account currently locked out by the failed-login counter? */
    public function isLockedOut(): bool
    {
        return $this->locked_until !== null && $this->locked_until->isFuture();
    }

    /** Roles that must have 2FA before they can touch money. */
    public function requiresTwoFactor(): bool
    {
        $role = strtoupper((string) $this->role_name);

        return (bool) preg_match('/ADMIN|MANAGER|CASHIER|ACCOUNTANT|DIRECTOR|AUDITOR/', $role);
    }

    protected static function booted(): void
    {
        static::addGlobalScope(new TenantScope());
        static::creating(function (self $model): void {
            if (empty($model->tenant_code)) {
                $model->tenant_code = TenantScope::currentTenantCode();
            }
        });
    }
}
