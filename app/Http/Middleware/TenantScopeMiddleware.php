<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Services\TokenService;
use Illuminate\Support\Facades\DB;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Strict Multi-Tenant Context & Cross-Tenant Spoofing Guard Middleware.
 */
class TenantScopeMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $defaultTenant = strtoupper(trim((string) config('mfi.default_tenant', 'TNT-NEEV-01')));
        $headerTenant = strtoupper(trim((string) ($request->header('X-Tenant-Code') ?: $request->query('tenant_code', ''))));

        // Decode authenticated bearer token if present to bind tenant_code to the verified principal
        $authUserTenant = '';
        $bearer = trim((string) ($request->bearerToken() ?: $request->header('X-Auth-Token', '')));
        if ($bearer !== '') {
            // VULN-001 fix: this used to be
            //     json_decode(base64_decode($bearer, true), true)
            // trusting an UNSIGNED blob, so `base64(json({role:ADMIN}))` was a
            // valid admin session. Now the signature is verified in constant
            // time and revocation is honoured; anything else is rejected 401.
            if (TokenService::isRevoked($bearer)) {
                return response()->json(['error' => 'Token has been revoked. Please log in again.'], 401);
            }

            $verifiedUser = TokenService::verify($bearer);
            if ($verifiedUser === null) {
                return response()->json(['error' => 'Invalid or expired authentication token.'], 401);
            }

            if (! empty($verifiedUser['tenant_code'])) {
                $authUserTenant = strtoupper(trim((string) $verifiedUser['tenant_code']));
            }
            $request->attributes->set('auth_user', $verifiedUser);
        }

        if ($authUserTenant !== '' && $headerTenant !== '' && $authUserTenant !== $headerTenant) {
            return response()->json([
                'error' => "Multi-Tenant Security Violation: Authenticated principal belongs to tenant '{$authUserTenant}' and cannot access tenant '{$headerTenant}'.",
            ], 403);
        }

        $resolvedTenant = $authUserTenant ?: ($headerTenant ?: $defaultTenant);
        if (!preg_match('/^[A-Z0-9\-_]{3,64}$/', $resolvedTenant)) {
            return response()->json(['error' => 'Invalid tenant_code format.'], 400);
        }

        $request->attributes->set('tenant_code', $resolvedTenant);
        app()->instance('mfi.current_tenant', $resolvedTenant);

        // VULN-004 fix: push the tenant into the PostgreSQL session so Row Level
        // Security enforces isolation in the database, not just in Eloquent.
        // The Eloquent scope can be bypassed with withoutGlobalScopes(); a
        // FORCE RLS policy cannot.
        //
        // set_config(..., false) is transaction-scoped is NOT used here: we need
        // it for the whole connection, and we reset it after the response so a
        // reused FPM connection cannot leak the previous request's tenant.
        $authUser = $request->attributes->get('auth_user');
        $isSuperadmin = is_array($authUser)
            && in_array(strtoupper((string) ($authUser['role'] ?? '')), ['ADMIN', 'SUPERADMIN', 'MANAGING DIRECTOR'], true);

        try {
            DB::statement('SELECT set_config(?, ?, false)', ['app.tenant_code', $resolvedTenant]);
            DB::statement('SELECT set_config(?, ?, false)', ['app.is_superadmin', $isSuperadmin ? 'on' : 'off']);
        } catch (\Throwable $e) {
            logger()->error('Failed to set RLS session context: '.$e->getMessage());
            return response()->json(['error' => 'Tenant context could not be established.'], 500);
        }

        try {
            return $next($request);
        } finally {
            // Never let a pooled connection carry the previous tenant forward.
            try {
                DB::statement("SELECT set_config('app.tenant_code', '', false)");
                DB::statement("SELECT set_config('app.is_superadmin', 'off', false)");
            } catch (\Throwable) {
                // Connection may already be gone; nothing to clean.
            }
        }
    }
}
