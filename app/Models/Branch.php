<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Model;

class Branch extends Model
{
    protected $table = 'mfi_branches';

    protected $fillable = [
        'tenant_code',
        'name',
        'code',
        'manager_name',
        'password_hash',
        'opening_date',
        'address',
        'city',
        'state',
        'country',
        'pincode',
        'contact_email',
        'phone',
        'landline_number',
        'gstin_number',
        'status',
    ];

    protected $hidden = ['password_hash'];

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
