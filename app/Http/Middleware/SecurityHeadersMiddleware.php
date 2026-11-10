<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Baseline hardening headers. A financial back-office handling KYC and money
 * must not be frameable, must not sniff MIME types, must not leak the
 * full referrer (which can carry member codes) to third parties, and must
 * enforce a Content-Security-Policy to prevent XSS.
 */
final class SecurityHeadersMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // Remove X-Powered-By to avoid disclosing server software version.
        $response->headers->remove('X-Powered-By');

        // Core security headers
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
        $response->headers->set('X-Permitted-Cross-Domain-Policies', 'none');

        // HSTS: force HTTPS for 1 year, include subdomains, preload
        // Only set on HTTPS to avoid locking out HTTP dev environments.
        if ($request->isSecure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        }

        // Content-Security-Policy: prevent XSS by restricting script sources
        $response = $this->addCSP($request, $response);

        return $response;
    }

    /**
     * Content Security Policy header.
     * Prevents XSS by restricting script sources to the app's own bundle.
     */
    private function addCSP(Request $request, Response $response): Response
    {
        $isDev = config('app.env', 'production') !== 'production';

        $csp = "default-src 'self'";
        if ($isDev) {
            $csp .= " 'unsafe-inline'";
        }
        $csp .= "; img-src 'self' data: https:";
        $csp .= "; style-src 'self' 'unsafe-inline' https:";
        $csp .= "; script-src 'self'";
        if ($isDev) {
            $csp .= " 'unsafe-eval' http://localhost:* http://127.0.0.1:*";
        }
        $csp .= "; connect-src 'self' https: http://localhost:*";
        $csp .= "; font-src 'self' https: data:";
        $csp .= "; frame-ancestors 'none'";
        $csp .= "; form-action 'self'";
        $csp .= "; base-uri 'self'";

        $response->headers->set('Content-Security-Policy', $csp);

        return $response;
    }
}
