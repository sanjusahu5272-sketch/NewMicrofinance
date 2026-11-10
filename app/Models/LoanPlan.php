<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Model;

class LoanPlan extends Model
{
    protected $table = 'mfi_loan_plans';

    protected $fillable = [
        'tenant_code',
        'plan_name',
        'plan_type',
        'recovery_type',
        'tenure_emis',
        'interest_rate_pa',
        'interest_type',
        'roi_unit',
        'custom_days',
        'custom_emi_amount',
        'plan_amount',
        'disbursement_amount',
        'collection_amount',
        'emi_amount',
        'effective_apr_pct',
        'holiday_exclude',
        'gst_include',
        'file_charge',
        'pf_percentage',
        'pf_amount',
        'insurance_amount',
        'pre_closure_charge_pct',
        'bounce_charge_amount',
        'max_penalty_cap_pct',
        'penalty_scheme_name',
        'plan_version',
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
