<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class RateLimiterServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // API rate limiting: 60 requests per minute per IP for authenticated routes.
        RateLimiter::for('api', function (Request $request): Limit {
            return Limit::perMinute(60)->by($request->ip() ?? 'unknown');
        });

        // Login rate limiting: 5 attempts per minute per IP + account.
        RateLimiter::for('login', function (Request $request): Limit {
            $ident = trim((string) ($request->input('user_code') ?? $request->input('username', '')));

            return Limit::perMinute(5)->by(
                $ident !== '' ? $request->ip() . '|' . strtolower($ident) : $request->ip()
            );
        });
    }
}
