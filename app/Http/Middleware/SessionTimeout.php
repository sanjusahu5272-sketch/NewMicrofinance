<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Services\TokenService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Session Timeout Middleware
 *
 * Checks if the user's token is still valid (not revoked) and adds
 * warning headers when the session is about to expire.
 * The actual expiry is handled by the token's 'exp' claim in TokenService.
 */
class SessionTimeout
{
    private const WARNING_SECONDS = 60; // 1 minute before timeout

    public function handle(Request $request, Closure $next): Response
    {
        $timeout = (int) config('auth.session_timeout_minutes', 30) * 60;
        $token = $request->bearerToken();

        if (!$token) {
            return $next($request);
        }

        // Check if token is revoked
        if (TokenService::isRevoked($token)) {
            return response()->json(['success' => false, 'error' => 'Session expired'], 401);
        }

        // Verify token is valid
        $claims = TokenService::verify($token);
        if (!$claims) {
            return response()->json(['success' => false, 'error' => 'Session expired'], 401);
        }

        // Token has 'exp' claim — check remaining time
        $exp = (int) ($claims['exp'] ?? 0);
        $remaining = $exp - time();

        if ($remaining <= 0) {
            return response()->json(['success' => false, 'error' => 'Session expired'], 401);
        }

        $response = $next($request);

        if ($remaining < self::WARNING_SECONDS) {
            $response->headers->set('X-Session-Timeout-Warning', '1');
            $response->headers->set('X-Session-Expires-In', (string) $remaining);
        }

        return $response;
    }
}
