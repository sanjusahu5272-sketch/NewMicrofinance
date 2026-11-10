<?php

use App\Http\Middleware\SecurityHeadersMiddleware;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        apiPrefix: 'api',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Security headers on BOTH web and api groups — root page must be
        // hardened too (frameable admin pages are a real attack surface).
        $middleware->web(prepend: [
            SecurityHeadersMiddleware::class,
        ]);
        $middleware->api(prepend: [
            SecurityHeadersMiddleware::class,
        ]);

        // Enable API rate limiting — the named 'api' limiter is defined in
        // App\Providers\RateLimiterServiceProvider (60 req/min per IP).
        $middleware->throttleApi();

        // Login must be throttled: the original AuthController had no limit at
        // all, leaving password guessing completely unbounded. The named
        // 'login' limiter is defined in RateLimiterServiceProvider (5/min).
        $middleware->alias([
            'throttle.login' => \Illuminate\Routing\Middleware\ThrottleRequests::class.':login',
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })
    ->create();
