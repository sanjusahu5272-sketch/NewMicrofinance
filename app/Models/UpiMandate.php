<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UpiMandate extends Model
{
    protected $table = 'mfi_upi_mandates';

    protected $fillable = [
        'tenant_code',
        'member_id',
        'member_code',
        'member_name',
        'mobile',
        'loan_id',
        'mandate_ref',
        'bank_name',
        'account_last4',
        'upi_id',
        'frequency',
        'mandate_amount',
        'start_date',
        'end_date',
        'status',
        'debit_count',
        'last_debit_at',
        'remark',
    ];

    protected function casts(): array
    {
        return [
            'mandate_amount' => 'decimal:2',
            'start_date' => 'date',
            'end_date' => 'date',
            'last_debit_at' => 'datetime',
            'debit_count' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::addGlobalScope(new TenantScope());
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(Member::class, 'member_id');
    }

    public function loan(): BelongsTo
    {
        return $this->belongsTo(Loan::class, 'loan_id');
    }
}
