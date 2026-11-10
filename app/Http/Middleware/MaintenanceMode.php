<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Maintenance Mode Middleware
 *
 * When APP_MAINTENANCE=true, blocks all non-admin requests with 503.
 * Superadmin (is_superadmin GUC) bypasses.
 */
class MaintenanceMode
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!config('app.maintenance_enabled', false)) {
            return $next($request);
        }

        $isSuperadmin = $request->header('X-Superadmin') === 'true'
            || (function_exists('request') && request()->attributes->get('is_superadmin'));

        if ($isSuperadmin) {
            return $next($request);
        }

        if ($request->is('health', 'health/ready', 'api/health')) {
            return $next($request);
        }

        return response()->json([
            'success' => false,
            'error' => 'System is under maintenance. Please try again later.',
            'retry_after' => config('app.maintenance_retry_after', 3600),
        ], 503);
    }
}
