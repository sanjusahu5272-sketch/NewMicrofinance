<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Employee;
use App\Services\PasswordPolicy;
use App\Services\TokenService;
use App\Services\TotpService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

/**
 * TOTP enrolment and the second-factor challenge step.
 *
 * Enrolment is three calls, in this order, and the secret is NOT activated
 * until the user proves their authenticator works:
 *
 *   1. POST /auth/2fa/setup      → returns secret + otpauth URI + QR data
 *   2. POST /auth/2fa/confirm    → user submits a code; secret becomes active
 *   3. POST /auth/2fa/verify     → the login-time second factor
 *
 * Step 2 is what stops the classic lockout: if we activated on step 1 and the
 * user's phone clock was wrong, they would be permanently locked out with a
 * recovery path that also lives behind 2FA.
 */
class TwoFactorController
{
    private const MAX_VERIFY_ATTEMPTS = 5;
    private const LOCKOUT_MINUTES = 15;

    /** Step 1 — mint a pending secret and return the enrolment payload. */
    public function setup(Request $request): JsonResponse
    {
        $emp = $this->currentEmployee($request);
        if ($emp === null) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        if ($emp->totp_enabled) {
            return response()->json([
                'error' => '2FA is already enabled. Disable it first to re-enrol.',
                'totp_enabled' => true,
            ], 409);
        }

        $secret = TotpService::generateSecret();
        $issuer = (string) config('mfi.totp_issuer', 'NEEV 4D Microfinance');
        $uri = TotpService::provisioningUri($secret, (string) $emp->user_code, $issuer);

        // Stored encrypted but NOT yet enabled — confirm() flips the flag.
        $emp->forceFill([
            'totp_secret_encrypted' => $secret,
            'totp_enabled' => false,
            'totp_confirmed_at' => null,
        ])->save();

        return response()->json([
            'secret' => $secret,
            'otpauth_uri' => $uri,
            'issuer' => $issuer,
            'account' => $emp->user_code,
            'algorithm' => 'SHA1',
            'digits' => TotpService::DIGITS,
            'period' => TotpService::PERIOD,
            'next_step' => 'Scan the URI/secret in Google Authenticator, then POST /api/auth/2fa/confirm with a 6-digit code.',
        ]);
    }

    /** Step 2 — prove the authenticator works, then activate + issue recovery codes. */
    public function confirm(Request $request): JsonResponse
    {
        $emp = $this->currentEmployee($request);
        if ($emp === null) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        $secret = (string) ($emp->totp_secret_encrypted ?? '');
        if ($secret === '') {
            return response()->json(['error' => 'Start 2FA setup first.'], 422);
        }
        if ($emp->totp_enabled) {
            return response()->json(['error' => '2FA is already enabled.'], 409);
        }

        $code = (string) $request->input('code', '');
        $step = TotpService::verify($secret, $code);
        if ($step === null) {
            return response()->json([
                'error' => 'That code did not match. Check your phone clock, then try the next code.',
            ], 422);
        }

        $recovery = TotpService::generateRecoveryCodes(10);

        $emp->forceFill([
            'totp_enabled' => true,
            'totp_confirmed_at' => now(),
            'last_totp_step' => $step,
            'totp_recovery_codes' => $recovery['hashed'],
        ])->save();

        $this->audit('2FA_ENABLED', (string) $emp->user_code);

        return response()->json([
            'status' => 'enabled',
            'recovery_codes' => $recovery['plain'],
            'warning' => 'These 10 recovery codes are shown ONCE. Store them offline. Each works a single time.',
        ]);
    }

    /** Step 3 — the login second factor. Accepts a TOTP code or a recovery code. */
    public function verify(Request $request): JsonResponse
    {
        // The challenge ticket was verified by TenantScopeMiddleware, which put
        // the principal on `auth_user`. Accept it ONLY when it carries the
        // `2fa_pending` scope — a full session must not be able to skip to here
        // and mint a second token without re-entering the code.
        $principal = (array) $request->attributes->get('auth_user', []);
        $scope = (string) ($principal['scope'] ?? '');
        $userCode = (string) ($principal['user_code'] ?? $request->input('user_code', ''));

        if ($userCode === '') {
            return response()->json(['error' => 'Complete the password step first.'], 401);
        }
        if ($scope !== '2fa_pending') {
            return response()->json([
                'error' => 'This endpoint only accepts a pending two-factor challenge.',
                'code' => 'WRONG_TICKET_SCOPE',
            ], 401);
        }

        $key = '2fa:'.$userCode;
        if (RateLimiter::tooManyAttempts($key, self::MAX_VERIFY_ATTEMPTS)) {
            return response()->json([
                'error' => 'Too many incorrect codes. Try again in '.RateLimiter::availableIn($key).' seconds.',
            ], 429);
        }

        $emp = Employee::withoutGlobalScopes()->where('user_code', $userCode)->first();
        if ($emp === null || ! $emp->totp_enabled) {
            return response()->json(['error' => 'Two-factor is not set up for this account.'], 422);
        }

        $input = trim((string) $request->input('code', ''));
        $ok = false;
        $usedRecovery = false;

        // Path A: TOTP, with replay protection.
        $step = TotpService::verify((string) $emp->totp_secret_encrypted, $input);
        if ($step !== null) {
            $lastStep = (int) ($emp->last_totp_step ?? 0);
            if ($step <= $lastStep) {
                RateLimiter::hit($key, self::LOCKOUT_MINUTES * 60);

                // A replayed code is a strong signal of interception — log it loudly.
                $this->audit('2FA_REPLAY_BLOCKED', $userCode);

                return response()->json([
                    'error' => 'This code has already been used. Wait for the next one.',
                    'code' => 'TOTP_REPLAY',
                ], 422);
            }
            $emp->forceFill(['last_totp_step' => $step])->save();
            $ok = true;
        }

        // Path B: single-use recovery code.
        if (! $ok) {
            $normalised = TotpService::normaliseRecoveryCode($input);
            $hash = hash('sha256', $normalised);
            $codes = (array) ($emp->totp_recovery_codes ?? []);
            $idx = array_search($hash, $codes, true);

            if ($idx !== false) {
                unset($codes[$idx]);
                $emp->forceFill(['totp_recovery_codes' => array_values($codes)])->save();
                $usedRecovery = true;
                $ok = true;
                $this->audit('2FA_RECOVERY_CODE_USED', $userCode,
                    'Recovery codes remaining: '.count($codes));
            }
        }

        if (! $ok) {
            RateLimiter::hit($key, self::LOCKOUT_MINUTES * 60);

            return response()->json([
                'error' => 'Invalid code.',
                'attempts_remaining' => RateLimiter::remaining($key, self::MAX_VERIFY_ATTEMPTS),
            ], 422);
        }

        RateLimiter::clear($key);

        $userDict = [
            'id' => $emp->id,
            'user_code' => $emp->user_code,
            'name' => $emp->name,
            'email' => $emp->email,
            'mobile' => $emp->mobile,
            'designation' => $emp->designation,
            'role_id' => $emp->role_id,
            'role' => $emp->role_name,
            'branch_id' => $emp->branch_id,
            'branch_name' => $emp->branch_name,
            'tenant_code' => $emp->tenant_code,
        ];

        $emp->forceFill([
            'last_login_at' => now(),
            'last_login_ip' => $request->ip(),
            'failed_login_attempts' => 0,
            'locked_until' => null,
        ])->save();

        $token = TokenService::issue($userDict);
        $this->audit('LOGIN_SUCCESS_2FA', (string) $emp->user_code, $usedRecovery ? 'via recovery code' : 'via TOTP');

        return response()->json([
            'access' => $token,
            'token' => $token,
            'user' => $userDict,
            'used_recovery_code' => $usedRecovery,
            'must_change_password' => (bool) $emp->must_change_password,
        ]);
    }

    /** Regenerate recovery codes (requires a valid TOTP code, not just a session). */
    public function regenerateRecoveryCodes(Request $request): JsonResponse
    {
        $emp = $this->currentEmployee($request);
        if ($emp === null || ! $emp->totp_enabled) {
            return response()->json(['error' => '2FA is not enabled.'], 422);
        }

        if (TotpService::verify((string) $emp->totp_secret_encrypted, (string) $request->input('code', '')) === null) {
            return response()->json(['error' => 'Enter a current 6-digit code to regenerate recovery codes.'], 422);
        }

        $recovery = TotpService::generateRecoveryCodes(10);
        $emp->forceFill(['totp_recovery_codes' => $recovery['hashed']])->save();
        $this->audit('2FA_RECOVERY_CODES_REGENERATED', (string) $emp->user_code);

        return response()->json([
            'recovery_codes' => $recovery['plain'],
            'warning' => 'Old recovery codes are now invalid.',
        ]);
    }

    /** Change password, enforcing the policy and clearing the force-change flag. */
    public function changePassword(Request $request): JsonResponse
    {
        $emp = $this->currentEmployee($request);
        if ($emp === null) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        $current = (string) $request->input('current_password', '');
        $new = (string) $request->input('new_password', '');

        if (! Hash::check($current, (string) $emp->password_hash)) {
            $this->audit('PASSWORD_CHANGE_FAILED', (string) $emp->user_code, 'wrong current password');

            return response()->json(['error' => 'Current password is incorrect.'], 422);
        }

        if (Hash::check($new, (string) $emp->password_hash)) {
            return response()->json(['error' => 'New password must be different from the current one.'], 422);
        }

        $result = PasswordPolicy::validate($new, [
            'user_code' => (string) $emp->user_code,
            'name' => (string) $emp->name,
            'email' => (string) $emp->email,
            'branch_name' => (string) $emp->branch_name,
            'mobile' => (string) $emp->mobile,
        ]);

        if (! $result['ok']) {
            return response()->json([
                'error' => 'Password does not meet policy.',
                'details' => $result['errors'],
                'strength' => $result['strength'],
            ], 422);
        }

        // Optional breach check — never blocks login if the API is unreachable.
        $breached = PasswordPolicy::isBreached($new);
        if ($breached === true) {
            return response()->json([
                'error' => 'This password has appeared in a public data breach. Choose another.',
                'code' => 'PASSWORD_BREACHED',
            ], 422);
        }

        $emp->forceFill([
            'password_hash' => Hash::make($new),
            'must_change_password' => false,
            'password_changed_at' => now(),
        ])->save();

        $this->audit('PASSWORD_CHANGED', (string) $emp->user_code);

        return response()->json([
            'status' => 'password_updated',
            'user_code' => $emp->user_code,
            'strength' => $result['strength'],
        ]);
    }

    /**
     * Resolve the acting employee.
     *
     * Accepts a full session OR — for /setup and /confirm only — a short-lived
     * `2fa_enrolment` ticket. The scope check is what stops that ticket being
     * replayed against any other controller.
     */
    private function currentEmployee(Request $request): ?Employee
    {
        $user = (array) $request->attributes->get('auth_user', []);
        $code = (string) ($user['user_code'] ?? '');
        if ($code === '') {
            return null;
        }

        $scope = (string) ($user['scope'] ?? 'full');
        $path = $request->path();
        $enrolmentAllowed = str_ends_with($path, 'auth/2fa/setup') || str_ends_with($path, 'auth/2fa/confirm');

        if ($scope !== 'full' && ! ($scope === '2fa_enrolment' && $enrolmentAllowed)) {
            logger()->warning("Blocked {$scope} ticket used against {$path} by {$code}");

            return null;
        }

        return Employee::withoutGlobalScopes()->where('user_code', $code)->first();
    }

    private function audit(string $action, string $userCode, string $details = ''): void
    {
        try {
            // Hash chain: each entry's hash includes the previous entry's hash.
            // This makes tampering detectable — changing one row breaks every
            // subsequent hash.
            $prev = DB::table('mfi_audit_logs')
                ->orderByDesc('id')
                ->value('entry_hash');
            $prevHash = $prev ?? '0'.str_repeat('0', 63);

            $payload = json_encode([
                'tenant' => (string) config('mfi.default_tenant', 'TNT-NEEV-01'),
                'user' => $userCode,
                'action' => $action,
                'module' => 'auth',
                'details' => $details,
                'prev_hash' => $prevHash,
                'ts' => now()->toIso8601String(),
            ], JSON_UNESCAPED_SLASHES);

            $entryHash = hash('sha256', $payload);

            DB::table('mfi_audit_logs')->insert([
                'tenant_code' => (string) config('mfi.default_tenant', 'TNT-NEEV-01'),
                'user_code' => $userCode,
                'action' => $action,
                'module' => 'auth',
                'record_id' => $userCode,
                'details' => $details,
                'prev_hash' => $prevHash,
                'entry_hash' => $entryHash,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (\Throwable $e) {
            // Audit must never break the auth path, but it must be visible.
            logger()->error("Audit write failed for {$action}: ".$e->getMessage());
        }
    }
}
