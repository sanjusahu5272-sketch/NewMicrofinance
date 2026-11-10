<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mandatory authentication gate for all business API routes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VULN-003 (fixed 2026-11-09) — CRITICAL: the entire API was anonymous.
 *
 * Before this middleware, TenantScopeMiddleware treated a *missing* bearer
 * token as "no problem, fall back to the default tenant". So:
 *
 *     curl https://erp.example.com/api/dashboard
 *     → 200 OK, full cashbook, bank balances, loan portfolio
 *
 * Every member record, every loan, every collection, every ledger — readable
 * by anyone who could reach the host, with no credential at all. 79 endpoints.
 *
 * A tenant filter is not an authentication control. This middleware makes
 * authentication explicit and mandatory, with an allow-list for the handful of
 * endpoints that genuinely must be public (login, health probes).
 * ─────────────────────────────────────────────────────────────────────────────
 */
final class RequireAuthentication
{
    public function handle(Request $request, Closure $next): Response
    {
        $bearer = trim((string) ($request->bearerToken() ?: $request->header('X-Auth-Token', '')));
        // Also accept httpOnly cookie (set by login response)
        if ($bearer === '' && $request->hasCookie('auth_token')) {
            $bearer = trim((string) $request->cookie('auth_token'));
        }

        if ($bearer === '') {
            return response()->json([
                'error' => 'Authentication required.',
                'code' => 'AUTH_MISSING',
            ], 401);
        }

        // TenantScopeMiddleware has already verified the signature and set the
        // principal; if it is absent something is wrong with the chain order.
        $user = $request->attributes->get('auth_user');
        if (! is_array($user) || empty($user['user_code'])) {
            return response()->json([
                'error' => 'Invalid or expired authentication token.',
                'code' => 'AUTH_INVALID',
            ], 401);
        }

        return $next($request);
    }
}
