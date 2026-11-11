<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CreditScore extends Model
{
    protected $table = 'mfi_credit_scores';

    protected $fillable = [
        'tenant_code',
        'member_id',
        'member_code',
        'member_name',
        'score',
        'rating_band',
        'source',
        'breakdown',
        'computed_at',
    ];

    protected function casts(): array
    {
        return [
            'breakdown' => 'array',
            'computed_at' => 'datetime',
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
}
