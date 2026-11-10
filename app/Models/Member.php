<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Model;

class Member extends Model
{
    protected $table = 'mfi_members';

    protected $fillable = [
        'tenant_code',
        'member_code',
        'name',
        'alias',
        'father_name',
        'mother_name',
        'spouse_name',
        'gender',
        'dob',
        'mobile',
        'alt_mobile',
        'email',
        'marital_status',
        'religion',
        'aadhar_no',
        'pan_no',
        'voter_id',
        'ration_card_no',
        'driving_licence_no',
        'passport_no',
        'address',
        'area',
        'city',
        'district',
        'state',
        'pincode',
        'branch_id',
        'branch_name',
        'center_name',
        'agent_name',
        'customer_type',
        'bank_name',
        'bank_branch',
        'account_holder_name',
        'bank_account_no',
        'ifsc_code',
        'family_monthly_expense',
        'job_type',
        'income_type',
        'income_duration',
        'monthly_income',
        'monthly_expense',
        'min_amount',
        'max_amount',
        'business_name',
        'business_address',
        'office_phone',
        'loan_purpose',
        'co_applicant_name',
        'co_applicant_mobile',
        'co_applicant_address',
        'co_applicant_relation',
        'co_applicant_aadhar',
        'co_applicant_pan',
        'nominee_name',
        'nominee_mobile',
        'nominee_relation',
        'nominee_dob',
        'nominee_aadhar_no',
        'nominee_spouse',
        'cibil_score',
        'aadhar_verified',
        'pan_verified',
        'cust_mobile_verified',
        'co_mobile_verified',
        'kyc_status',
        'loan_exist',
        'documents_json',
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
