<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Model;

class Role extends Model
{
    protected $table = 'mfi_roles';

    protected $fillable = [
        'tenant_code',
        'name',
        'status',
    ];

    protected static function booted(): void
    {
        static::addGlobalScope(new TenantScope());
    }
}
