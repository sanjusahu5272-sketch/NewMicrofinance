<?php

declare(strict_types=1);

use Laravel\Horizon\Horizon;
use Laravel\Horizon\HorizonServiceProvider;

return [
    'environments' => [
        'production' => [
            'supervisor-1' => [
                'connection' => 'redis',
                'queue' => ['default', 'notifications', 'reports'],
                'balance' => 'auto',
                'minProcesses' => 2,
                'maxProcesses' => 20,
                'balanceCooldown' => 3,
                'maxTime' => 3600,
                'maxJobs' => 1000,
                'memory' => 256,
                'tries' => 3,
                'timeout' => 300,
                'nice' => 0,
            ],
            'supervisor-reports' => [
                'connection' => 'redis',
                'queue' => ['reports'],
                'balance' => 'simple',
                'processes' => 2,
                'maxTime' => 3600,
                'memory' => 512,
                'tries' => 1,
                'timeout' => 600,
            ],
        ],
        'local' => [
            'supervisor-1' => [
                'connection' => 'redis',
                'queue' => ['default', 'notifications', 'reports'],
                'balance' => 'simple',
                'processes' => 3,
                'tries' => 3,
                'timeout' => 60,
            ],
        ],
    ],
];
