<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Branch;
use App\Services\TokenService;
use App\Models\Employee;
use App\Models\LoginHistory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AuthController
{
    public function login(Request $request): JsonResponse
    {
        $ident = trim((string) ($request->input('user_code') ?? $request->input('username', '')));
        $password = (string) $request->input('password', '');

        if ($ident === '' || $password === '') {
            return response()->json(['error' => 'Please provide both User Code and Password.'], 400);
        }

        $emp = Employee::withoutGlobalScopes()
            ->where(function ($q) use ($ident): void {
                $q->whereRaw('UPPER(user_code) = UPPER(?)', [$ident])
                    ->orWhereRaw('UPPER(email) = UPPER(?)', [$ident])
                    ->orWhere('mobile', $ident);
            })
            ->where('login_status', 'ACTIVE')
            ->first();

        if ($emp && Hash::check($password, (string) $emp->password_hash) === false) {
            $this->recordLoginAttempt($emp, $request, false);

            return response()->json(['error' => 'Invalid user code or password.'], 401);
        }

        if (!$emp || !Hash::check($password, (string) $emp->password_hash)) {
            $branch = Branch::withoutGlobalScopes()
                ->where(function ($q) use ($ident): void {
                    $q->whereRaw('UPPER(code) = UPPER(?)', [$ident])
                        ->orWhereRaw('UPPER(contact_email) = UPPER(?)', [$ident])
                        ->orWhere('phone', $ident);
                })
                ->where('status', 'ACTIVE')
                ->first();

            if ($branch && !empty($branch->password_hash) && Hash::check($password, (string) $branch->password_hash)) {
                $emp = Employee::withoutGlobalScopes()->firstOrCreate(
                    ['user_code' => $branch->code],
                    [
                        'tenant_code' => $branch->tenant_code,
                        'name' => $branch->manager_name ?: ($branch->name . ' MANAGER'),
                        'alias' => $branch->manager_name ?: ($branch->name . ' MANAGER'),
                        'email' => $branch->contact_email,
                        'mobile' => $branch->phone,
                        'designation' => 'BRANCH MANAGER',
                        'role_id' => 2,
                        'role_name' => 'BRANCH MANAGER',
                        'branch_id' => $branch->id,
                        'branch_name' => $branch->name,
                        'password_hash' => $branch->password_hash,
                        'kyc_status' => 'VERIFIED',
                        'login_status' => 'ACTIVE',
                    ]
                );
            } else {
                if (isset($emp)) {
                    $this->recordLoginAttempt($emp, $request, false);
                }

                return response()->json(['error' => 'Invalid user code, branch code, or password.'], 401);
            }
        }

        // ── Account lockout from repeated failures (per-account, not just per-IP).
        if ($emp->isLockedOut()) {
            return response()->json([
                'error' => 'Account temporarily locked after repeated failed logins.',
                'locked_until' => $emp->locked_until?->toIso8601String(),
                'code' => 'ACCOUNT_LOCKED',
            ], 423);
        }

        // ── SECOND FACTOR GATE.
        //
        // A correct password is NOT a session. If 2FA is enabled, the only thing
        // the password step earns is a short-lived challenge ticket. Issuing the
        // real token here is the single most common 2FA bug in production.
        if ($emp->totp_enabled) {
            $challenge = TokenService::issue([
                'user_code' => (string) $emp->user_code,
                'tenant_code' => (string) $emp->tenant_code,
                'scope' => '2fa_pending',
            ]);

            return response()->json([
                'status' => 'two_factor_required',
                'challenge' => $challenge,
                'next_step' => 'POST /api/auth/2fa/verify with {"code":"123456"}',
                'message' => 'Enter the 6-digit code from your authenticator app.',
            ], 200);
        }

        // ── Roles that handle money must enrol before they get a real session.
        //
        // Chicken-and-egg: enrolment needs an authenticated call, but we refuse
        // to issue a session to an unenrolled admin. The resolution is a
        // narrowly-scoped ENROLMENT ticket:
        //   - scope = '2fa_enrolment'
        //   - 15 minutes, not 8 hours
        //   - accepted ONLY by /auth/2fa/setup and /auth/2fa/confirm
        //   - cannot touch a single business endpoint
        // That gives an admin just enough rope to enrol, and no more.
        //
        // NOTE: The enrolment gate is DISABLED by default. Users can log in
        // without 2FA and enrol later from the admin panel (2FA Management).
        // To re-enable the mandatory enrolment gate, set the config flag
        // mfi.force_2fa_enrolment = true.
        if ($emp->requiresTwoFactor() && config('mfi.force_2fa_enrolment', false)) {
            $this->recordLoginAttempt($emp, $request, true);

            $enrolmentTicket = TokenService::issue([
                'user_code' => (string) $emp->user_code,
                'tenant_code' => (string) $emp->tenant_code,
                'branch_id' => (int) $emp->branch_id,
                'branch_name' => (string) $emp->branch_name,
                'role' => (string) $emp->role_name,
                'scope' => '2fa_enrolment',
                'exp' => time() + 900,
            ]);

            return response()->json([
                'status' => 'two_factor_enrolment_required',
                'code' => '2FA_ENROLMENT_REQUIRED',
                'enrolment_ticket' => $enrolmentTicket,
                'next_step' => 'POST /api/auth/2fa/setup with this ticket, then /api/auth/2fa/confirm, then log in again.',
                'expires_in' => 900,
                'message' => 'Two-factor authentication is mandatory for your role. Enrol now.',
            ], 403);
        }

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

        // VULN-001 fix: the previous implementation was
        //     base64_encode(json_encode([...]))
        // which is an ENCODING, not a signature — any caller could mint an
        // ADMIN token by hand. Now HMAC-SHA256 signed with a key derived from
        // APP_KEY, with constant-time verification.
        $token = TokenService::issue($userDict);

        $this->recordLoginAttempt($emp, $request, true);

        $response = response()->json([
            'access' => $token,
            'refresh' => $token,
            'token' => $token,
            'user' => $userDict,
            'must_change_password' => (bool) $emp->must_change_password,
        ]);

        // Set httpOnly cookie for secure token storage (prevents XSS token theft)
        $response->cookie(
            'auth_token',
            $token,
            10080, // 7 days in minutes
            '/',
            null,
            $request->isSecure(),
            true,
            false,
            'lax'
        );

        return $response;
    }

    /**
     * Track per-account failures so distributed guessing is stopped too.
     * 5 strikes → 15 minute lock. The counter clears on any success.
     */
    private function recordLoginAttempt(\App\Models\Employee $emp, Request $request, bool $success): void
    {
        try {
            // Always record to login history for audit trail
            $ip = $request->ip();
            $ua = $request->userAgent();
            $device = $ua && str_contains($ua, 'Mobile') ? 'Mobile'
                : ($ua && str_contains($ua, 'Chrome') ? 'Chrome'
                : ($ua && str_contains($ua, 'Firefox') ? 'Firefox'
                : ($ua && str_contains($ua, 'Safari') ? 'Safari'
                : ($ua && str_contains($ua, 'curl') ? 'API/CLI' : 'Unknown'))));

            LoginHistory::create([
                'tenant_code' => $emp->tenant_code,
                'employee_id' => $emp->id,
                'employee_code' => $emp->user_code,
                'ip_address' => $ip,
                'user_agent' => $ua,
                'device_name' => $device,
                'was_successful' => $success,
                'status' => $success ? 'SUCCESS' : 'FAILED',
                'failure_reason' => $success ? null : 'Invalid credentials',
                'login_at' => now(),
            ]);

            if ($success) {
                $emp->forceFill([
                    'failed_login_attempts' => 0,
                    'locked_until' => null,
                    'last_login_at' => now(),
                    'last_login_ip' => $ip,
                ])->save();

                return;
            }

            $attempts = ((int) $emp->failed_login_attempts) + 1;
            $update = ['failed_login_attempts' => $attempts];

            if ($attempts >= 5) {
                $update['locked_until'] = now()->addMinutes(15);
                $update['failed_login_attempts'] = 0;
            }

            $emp->forceFill($update)->save();
        } catch (\Throwable $e) {
            logger()->error('Could not record login attempt: '.$e->getMessage());
        }
    }

    public function logout(Request $request): JsonResponse
    {
        // Previously a no-op: the token stayed valid for its full 8 hours
        // even after "logging out". Revoke the jti now.
        $bearer = trim((string) ($request->bearerToken() ?: $request->header('X-Auth-Token', '')));
        if ($bearer !== '') {
            TokenService::revoke($bearer);
        }

        return response()->json(['status' => 'logged_out']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'user' => $request->attributes->get('auth_user', [
                'user_code' => 'ADM01',
                'role' => 'ADMIN',
                'tenant_code' => $request->attributes->get('tenant_code', 'TNT-NEEV-01'),
            ]),
        ]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $newPassword = trim((string) $request->input('new_password', ''));
        if (strlen($newPassword) < 6) {
            return response()->json(['error' => 'New password must be at least 6 characters.'], 422);
        }

        $authUser = (array) $request->attributes->get('auth_user', []);
        $userCode = (string) ($authUser['user_code'] ?? $request->input('user_code', 'ADM01'));

        Employee::where('user_code', $userCode)->update([
            'password_hash' => Hash::make($newPassword),
        ]);

        return response()->json(['status' => 'password_updated', 'user_code' => $userCode]);
    }

    public function loginHistory(Request $request)
    {
        // Middleware sets auth_user (array), not employee (model).
        $authUser = (array) $request->attributes->get('auth_user', []);
        if (empty($authUser['user_code'])) {
            return response()->json(['success' => false, 'error' => 'Unauthorized'], 401);
        }

        // Try to resolve the employee ID from the user_code
        $employeeId = $authUser['id'] ?? null;
        if (!$employeeId) {
            $emp = Employee::where('user_code', $authUser['user_code'])->first();
            $employeeId = $emp ? $emp->id : null;
        }
        if (!$employeeId) {
            return response()->json(['success' => false, 'error' => 'Employee not found'], 404);
        }

        $history = LoginHistory::forEmployee((string) $employeeId, 50);

        return response()->json([
            'success' => true,
            'login_history' => $history,
            'total' => $history->count(),
        ]);
    }

    public function health(): JsonResponse
    {
        $dbOk = false;
        try {
            DB::select('SELECT 1');
            $dbOk = true;
        } catch (\Throwable) {
            $dbOk = false;
        }

        return response()->json([
            'status' => $dbOk ? 'ok' : 'degraded',
            'service' => 'NEEV_4D_LARAVEL_POSTGRESQL_PRODUCTION',
            'database_backend' => 'PostgreSQL',
            'database_connected' => $dbOk,
        ], $dbOk ? 200 : 503);
    }
}
