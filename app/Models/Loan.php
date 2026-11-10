<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Model;

class Loan extends Model
{
    protected $table = 'mfi_loans';

    protected $fillable = [
        'tenant_code',
        'application_no',
        'loan_id',
        'member_id',
        'member_code',
        'member_name',
        'mobile',
        'branch_name',
        'center_name',
        'staff_name',
        'plan_id',
        'plan_name',
        'application_type',
        'product_name',
        'product_serial_no',
        'application_date',
        'approval_date',
        'disbursement_date',
        'emi_start_date',
        'emi_end_date',
        'loan_close_date',
        'plan_amount',
        'deductions_total',
        'gst_amount',
        'disbursement_amount',
        'total_interest',
        'total_repayable',
        'emi_amount',
        'tenure_emis',
        'recovery_type',
        'interest_type',
        'interest_rate_pa',
        'effective_apr_pct',
        'principal_outstanding',
        'interest_outstanding',
        'penalty_due',
        'total_outstanding',
        'total_collected',
        'dpd_days',
        'asset_class',
        'npa_provision_amount',
        'bounce_count',
        'pay_mode',
        'utr_no',
        'purpose',
        'guarantor_name',
        'description',
        'penalty_scheme',
        'loan_type',
        'amount_type',
        'hide_interest_rate',
        'status',
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
    }
}
