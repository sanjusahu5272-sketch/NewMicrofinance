<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Model;

class Installment extends Model
{
    protected $table = 'mfi_installments';

    protected $fillable = [
        'tenant_code',
        'loan_pk',
        'loan_id',
        'member_code',
        'member_name',
        'branch_name',
        'center_name',
        'staff_name',
        'emi_no',
        'due_date',
        'opening_principal',
        'principal_component',
        'interest_component',
        'emi_amount',
        'closing_principal',
        'paid_amount',
        'penalty_amount',
        'penalty_paid',
        'paid_date',
        'dpd_days',
        'asset_class',
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
    }
}
