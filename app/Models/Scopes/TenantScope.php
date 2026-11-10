<?php

declare(strict_types=1);

namespace App\Models\Scopes;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/**
 * Global Multi-Tenant Isolation Scope.
 * Ensures every Eloquent query on tenant-scoped models is strictly partitioned by tenant_code.
 */
class TenantScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $tenantCode = self::currentTenantCode();
        $builder->where($model->getTable() . '.tenant_code', $tenantCode);
    }

    public static function currentTenantCode(): string
    {
        if (app()->bound('mfi.current_tenant')) {
            $bound = trim((string) app('mfi.current_tenant'));
            if ($bound !== '') {
                return strtoupper($bound);
            }
        }

        if (function_exists('request') && request() !== null) {
            $attr = trim((string) request()->attributes->get('tenant_code', ''));
            if ($attr !== '') {
                return strtoupper($attr);
            }
        }

        return strtoupper((string) config('mfi.default_tenant', 'TNT-NEEV-01'));
    }
}
