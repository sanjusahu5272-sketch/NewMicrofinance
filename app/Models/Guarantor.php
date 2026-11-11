<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Guarantor extends Model
{
    protected $table = 'mfi_guarantors';

    protected $fillable = [
        'tenant_code',
        'loan_id',
        'guarantor_name',
        'guarantor_mobile',
        'guarantor_aadhaar',
        'guarantor_relation',
        'guarantor_occupation',
        'guarantor_address',
        'guarantor_annual_income',
        'guarantor_bank_account',
        'guarantor_ifsc',
        'is_primary',
        'status',
        'guarantor_notes',
    ];

    protected function casts(): array
    {
        return [
            'is_primary' => 'boolean',
            'guarantor_annual_income' => 'decimal:2',
        ];
    }

    protected static function booted(): void
    {
        static::addGlobalScope(new TenantScope());
    }

    public function loan(): BelongsTo
    {
        return $this->belongsTo(Loan::class, 'loan_id');
    }
}
