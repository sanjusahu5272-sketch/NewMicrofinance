<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use Illuminate\Routing\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

/**
 * System Health Monitoring Controller
 *
 * Endpoints for monitoring system health: database, cache, queue, disk.
 */
class SystemHealthController extends \Illuminate\Routing\Controller
{
    public function index()
    {
        return response()->json([
            'status' => 'healthy',
            'timestamp' => now()->toIso8601String(),
            'components' => $this->checkAll(),
        ]);
    }

    public function detailed()
    {
        return response()->json([
            'timestamp' => now()->toIso8601String(),
            'database' => $this->checkDatabase(),
            'cache' => $this->checkCache(),
            'queue' => $this->checkQueue(),
            'disk' => $this->checkDisk(),
            'memory' => $this->checkMemory(),
        ]);
    }

    private function checkAll(): array
    {
        return [
            'database' => $this->checkDatabase(),
            'cache' => $this->checkCache(),
            'queue' => $this->checkQueue(),
            'disk' => $this->checkDisk(),
        ];
    }

    private function checkDatabase(): array
    {
        try {
            $start = microtime(true);
            DB::connection()->getPdo();
            $latency = round((microtime(true) - $start) * 1000, 2);
            return [
                'status' => 'healthy',
                'latency_ms' => $latency,
                'driver' => config('database.default'),
            ];
        } catch (\Throwable $e) {
            return ['status' => 'error', 'error' => $e->getMessage()];
        }
    }

    private function checkCache(): array
    {
        try {
            $start = microtime(true);
            Redis::set('health_check', 'ok', '10');
            $latency = round((microtime(true) - $start) * 1000, 2);
            return ['status' => 'healthy', 'latency_ms' => $latency];
        } catch (\Throwable $e) {
            return ['status' => 'error', 'error' => $e->getMessage()];
        }
    }

    private function checkQueue(): array
    {
        try {
            $size = Redis::llen('horizon:default');
            return ['status' => 'healthy', 'queue_size' => $size];
        } catch (\Throwable $e) {
            return ['status' => 'unknown', 'error' => $e->getMessage()];
        }
    }

    private function checkDisk(): array
    {
        $free = disk_free_space(base_path());
        $total = disk_total_space(base_path());
        $free = $free === false ? 0 : (float) $free;
        $total = $total === false ? 1 : (float) $total;
        $pct = round(($free / $total) * 100, 2);
        return [
            'status' => $pct > 10 ? 'healthy' : 'warning',
            'free_mb' => round($free / 1048576, 2),
            'total_mb' => round($total / 1048576, 2),
            'free_pct' => $pct,
        ];
    }

    private function checkMemory(): array
    {
        $mem = memory_get_usage(true);
        $limit = (string) (ini_get('memory_limit') ?: '128M');
        // Convert "128M" / "512K" / "-1" (unlimited) to megabytes
        $limitMb = 128.0;
        if (strtoupper($limit) !== '-1') {
            $num = (float) preg_replace('/[^0-9.]/', '', $limit);
            $unit = strtoupper(preg_replace('/[0-9.]/', '', $limit));
            $limitMb = match ($unit) {
                'G' => $num * 1024,
                'K' => $num / 1024,
                default => $num,
            };
        }
        return [
            'usage_mb' => round($mem / 1048576, 2),
            'limit_mb' => round($limitMb, 2),
        ];
    }
}
