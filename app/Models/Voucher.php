<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Model;
use RuntimeException;

class Voucher extends Model
{
    protected $table = 'mfi_vouchers';

    protected $fillable = [
        'tenant_code',
        'voucher_no',
        'voucher_date',
        'voucher_type',
        'branch_name',
        'loan_id',
        'particular',
        'debit_ledger',
        'credit_ledger',
        'amount_dr',
        'amount_cr',
        'narration',
        'created_by',
        'is_reversed',
        'reversal_of',
        'idempotency_key',
    ];

    protected static function booted(): void
    {
        static::addGlobalScope(new TenantScope());

        static::creating(function (self $model): void {
            if (empty($model->tenant_code)) {
                $model->tenant_code = TenantScope::currentTenantCode();
            }
        });

        static::updating(function (self $model): void {
            $immutableCols = [
                'tenant_code',
                'voucher_no',
                'voucher_date',
                'debit_ledger',
                'credit_ledger',
                'amount_dr',
                'amount_cr',
            ];
            foreach ($immutableCols as $col) {
                if ($model->isDirty($col)) {
                    throw new RuntimeException(
                        "Financial Immutability Violation: Voucher column '{$col}' is append-only and cannot be mutated."
                    );
                }
            }
        });

        static::deleting(function (): void {
            throw new RuntimeException(
                'Financial Immutability Violation: Vouchers are append-only and cannot be deleted. Post a contra/reversal voucher instead.'
            );
        });
    }
}
