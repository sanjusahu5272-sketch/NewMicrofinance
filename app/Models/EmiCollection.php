<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Model;
use RuntimeException;

class EmiCollection extends Model
{
    protected $table = 'mfi_emi_collections';

    protected $fillable = [
        'tenant_code',
        'receipt_no',
        'loan_pk',
        'loan_id',
        'member_code',
        'member_name',
        'branch_name',
        'emi_no',
        'amount',
        'principal_allocated',
        'interest_allocated',
        'penalty_allocated',
        'payment_date',
        'payment_mode',
        'utr_no',
        'instrument_date',
        'bank_name',
        'bounced_at',
        'bounce_reason',
        'bounce_charge',
        'collected_by',
        'status',
        'remark',
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
                'receipt_no',
                'loan_id',
                'amount',
                'principal_allocated',
                'interest_allocated',
                'penalty_allocated',
            ];
            foreach ($immutableCols as $col) {
                if ($model->isDirty($col)) {
                    throw new RuntimeException(
                        "Financial Immutability Violation: Column '{$col}' on EmiCollection cannot be mutated. Use reversal/bounce workflows."
                    );
                }
            }
        });

        static::deleting(function (): void {
            throw new RuntimeException(
                'Financial Immutability Violation: EmiCollection rows are append-only and cannot be deleted.'
            );
        });
    }
}
