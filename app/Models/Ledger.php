<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Model;
use RuntimeException;

class Ledger extends Model
{
    protected $table = 'mfi_ledgers';

    protected $fillable = [
        'tenant_code',
        'name',
        'alias',
        'group_name',
        'nature',
        'branch_name',
        'opening_balance',
        'current_debit',
        'current_credit',
        'closing_balance',
        'status',
    ];

    protected static function booted(): void
    {
        static::addGlobalScope(new TenantScope());

        static::creating(function (self $model): void {
            if (empty($model->tenant_code)) {
                $model->tenant_code = TenantScope::currentTenantCode();
            }
        });

        static::deleting(function (): void {
            throw new RuntimeException(
                'Financial Immutability Violation: Ledger accounts cannot be deleted from the General Ledger.'
            );
        });
    }
}
