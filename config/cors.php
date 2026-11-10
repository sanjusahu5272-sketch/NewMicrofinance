<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | CORS allows your application to accept cross-domain API requests. By
    | default, Laravel allows requests from any origin. In production, you
    | should restrict this to your actual frontend domains.
    |
    */

    'paths' => ['api/*', 'auth/*', 'notifications/*', 'export/*', 'import/*', 'health/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => explode(',', env('CORS_ALLOWED_ORIGINS', env('APP_URL', ''))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Authorization', 'Content-Type', 'Accept', 'Origin', 'X-Requested-With', 'X-Auth-Token', 'X-Tenant-Code'],

    'exposed_headers' => ['X-Session-Timeout-Warning', 'X-Session-Expires-In', 'X-Total-Count'],

    'max_age' => 0,

    'supports_credentials' => true,
];
