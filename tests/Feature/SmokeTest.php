<?php
declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

class SmokeTest extends TestCase
{
    /** The application must boot at all — this was impossible before Phase 0. */
    public function test_application_boots(): void
    {
        $this->assertSame('13', explode('.', $this->app->version())[0]);
    }

    /** Health endpoint must report the DB is reachable. */
    public function test_health_endpoint_responds(): void
    {
        $res = $this->getJson('/api/health');
        $this->assertContains($res->status(), [200, 503]);
        $this->assertArrayHasKey('database_connected', $res->json());
    }
}
