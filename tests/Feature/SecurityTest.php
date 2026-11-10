<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Member;
use App\Services\SecureFileUploadService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Security Tests
 *
 * Covers: file upload security, webhook signature verification,
 * tenant isolation, IDOR prevention, and session security.
 */
class SecurityTest extends TestCase
{
    use RefreshDatabase;

    // ── File Upload Security ────────────────────────────────────────────

    /** Test that executable files are blocked. */
    public function test_upload_blocks_executable_files(): void
    {
        $service = new SecureFileUploadService();
        $tmpFile = tempnam(sys_get_temp_dir(), 'test_') . '.php';
        file_put_contents($tmpFile, '<?php echo "malicious"; ?>');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('not allowed');

        $service->storeSecure($tmpFile, 'malicious.php', sys_get_temp_dir(), 'TNT-TEST-01');
    }

    /** Test that oversized files are rejected. */
    public function test_upload_blocks_oversized_files(): void
    {
        $service = new SecureFileUploadService();
        $tmpFile = tempnam(sys_get_temp_dir(), 'test_') . '.pdf';
        // Write 11 MB of data (exceeds 10 MB limit)
        file_put_contents($tmpFile, str_repeat('A', 11 * 1024 * 1024));

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('maximum allowed size');

        $service->storeSecure($tmpFile, 'large.pdf', sys_get_temp_dir(), 'TNT-TEST-01');
    }

    /** Test that empty files are rejected. */
    public function test_upload_blocks_empty_files(): void
    {
        $service = new SecureFileUploadService();
        $tmpFile = tempnam(sys_get_temp_dir(), 'test_') . '.pdf';
        file_put_contents($tmpFile, '');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('empty');

        $service->storeSecure($tmpFile, 'empty.pdf', sys_get_temp_dir(), 'TNT-TEST-01');
    }

    /** Test that path traversal in filename is blocked. */
    public function test_upload_blocks_path_traversal(): void
    {
        $service = new SecureFileUploadService();

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Invalid file path');

        $service->getSecurePath('../../etc/passwd', sys_get_temp_dir());
    }

    /** Test that file with wrong magic bytes is rejected. */
    public function test_upload_blocks_wrong_magic_bytes(): void
    {
        $service = new SecureFileUploadService();
        $tmpFile = tempnam(sys_get_temp_dir(), 'test_') . '.pdf';
        // Write fake content that claims to be PDF but isn't
        file_put_contents($tmpFile, 'This is not a real PDF file');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('magic bytes');

        $service->storeSecure($tmpFile, 'fake.pdf', sys_get_temp_dir(), 'TNT-TEST-01');
    }

    /** Test that valid PDF upload succeeds. */
    public function test_upload_allows_valid_pdf(): void
    {
        $service = new SecureFileUploadService();
        $tmpFile = tempnam(sys_get_temp_dir(), 'test_') . '.pdf';
        // Write minimal valid PDF
        file_put_contents($tmpFile, '%PDF-1.4 minimal content');
        $dest = sys_get_temp_dir() . '/test_uploads_' . uniqid();

        $result = $service->storeSecure($tmpFile, 'valid.pdf', $dest, 'TNT-TEST-01');

        $this->assertArrayHasKey('stored_path', $result);
        $this->assertFileExists($result['stored_path']);
        $this->assertSame('pdf', $result['extension']);

        // Clean up
        unlink($result['stored_path']);
        rmdir($dest);
    }

    /** Test that generated filenames are randomized. */
    public function test_upload_generates_randomized_filename(): void
    {
        $service = new SecureFileUploadService();
        $tmpFile = tempnam(sys_get_temp_dir(), 'test_') . '.pdf';
        file_put_contents($tmpFile, '%PDF-1.4 content');
        $dest = sys_get_temp_dir() . '/test_uploads_' . uniqid();

        $result = $service->storeSecure($tmpFile, 'mydocument.pdf', $dest, 'TNT-TEST-01');

        // Filename should NOT contain original name
        $this->assertStringNotContainsString('mydocument', $result['stored_name']);
        // Should contain tenant prefix
        $this->assertStringContainsString('TNTTEST', $result['stored_name']);

        unlink($result['stored_path']);
        rmdir($dest);
    }

    // ── Webhook Signature Verification ─────────────────────────────────

    /** Test that webhook with invalid signature is rejected. */
    public function test_webhook_rejects_invalid_signature(): void
    {
        $response = $this->postJson('/api/webhooks/razorpay', [
            'payment' => ['id' => 'fake_payment_123', 'status' => 'captured'],
        ], ['X-Razorpay-Signature' => 'invalid_signature']);

        $response->assertStatus(401);
    }

    /** Test that webhook with missing signature is rejected. */
    public function test_webhook_rejects_missing_signature(): void
    {
        $response = $this->postJson('/api/webhooks/razorpay', [
            'payment' => ['id' => 'fake_payment_123', 'status' => 'captured'],
        ]);

        $response->assertStatus(401);
    }

    // ── Tenant Isolation ──────────────────────────────────────────────

    /** Test that loans from other tenants are not accessible. */
    public function test_tenant_isolation_loans(): void
    {
        DB::statement("SELECT set_config('app.tenant_code', 'TNT-NEEV-01', false)");

        // Create loan in tenant 1
        DB::table('mfi_loans')->insert([
            'tenant_code' => 'TNT-NEEV-01',
            'application_no' => 'APP-SEC-001',
            'loan_id' => 'LN-SEC-001',
            'member_id' => 1,
            'member_code' => 'M0000001',
            'member_name' => 'Test',
            'branch_name' => 'TEST',
            'plan_name' => 'PLAN',
            'application_date' => '2026-01-01',
            'plan_amount' => 10000.00,
            'disbursement_amount' => 10000.00,
            'total_interest' => 1000.00,
            'total_repayable' => 11000.00,
            'emi_amount' => 1000.00,
            'tenure_emis' => 12,
            'interest_rate_pa' => 12.00,
            'principal_outstanding' => 5000.00,
            'interest_outstanding' => 500.00,
            'total_outstanding' => 5500.00,
            'status' => 'DISBURSED',
            'dpd_days' => 0,
            'asset_class' => 'STANDARD',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Switch to different tenant — should NOT find the loan
        DB::statement("SELECT set_config('app.tenant_code', 'TNT-OTHER-99', false)");

        $loan = \App\Models\Loan::where('loan_id', 'LN-SEC-001')->first();
        $this->assertNull($loan, 'Cross-tenant loan access must be blocked');
    }

    /** Test that members from other tenants are not accessible. */
    public function test_tenant_isolation_members(): void
    {
        DB::statement("SELECT set_config('app.tenant_code', 'TNT-NEEV-01', false)");

        DB::table('mfi_members')->insert([
            'tenant_code' => 'TNT-NEEV-01',
            'member_code' => 'M-SEC-001',
            'name' => 'Test Member',
            'mobile' => '9999999999',
            'branch_name' => 'TEST',
            'status' => 'ACTIVE',
            'kyc_status' => 'PENDING',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::statement("SELECT set_config('app.tenant_code', 'TNT-OTHER-99', false)");

        $member = Member::where('member_code', 'M-SEC-001')->first();
        $this->assertNull($member, 'Cross-tenant member access must be blocked');
    }

    // ── Session Security ──────────────────────────────────────────────

    /** Test that security headers are present. */
    public function test_security_headers(): void
    {
        $response = $this->getJson('/api/health');
        $response->assertStatus(200);

        $this->assertTrue(
            $response->headers->has('X-Content-Type-Options'),
            'X-Content-Type-Options header missing'
        );
        $this->assertTrue(
            $response->headers->has('X-Frame-Options'),
            'X-Frame-Options header missing'
        );
    }

    /** Test that unauthenticated access to protected endpoints returns 401. */
    public function test_unauthenticated_access_blocked(): void
    {
        $this->getJson('/api/dashboard')->assertStatus(401);
        $this->getJson("/api/dashboard")->assertStatus(401);
        $this->getJson('/api/notifications')->assertStatus(401);
    }
}
