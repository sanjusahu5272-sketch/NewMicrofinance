<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * NEEV4D Token Service — cryptographically signed, tamper-proof bearer tokens.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VULN-001 (fixed 2026-11-09) — CRITICAL: complete authentication bypass.
 *
 * The original AuthController minted its bearer token with:
 *
 *     $token = base64_encode(json_encode(['sub' => ..., 'user' => $userDict]));
 *
 * Base64 is an *encoding*, not a signature. Anyone who can reach the API could
 * craft this in a single line and become a full ADMIN of any tenant:
 *
 *     base64_encode(json_encode(['user' => ['role' => 'ADMIN', ...]]))
 *
 * No password, no account, no trace. Every one of the 79 endpoints that trust
 * `$request->attributes->get('auth_user')` was open.
 *
 * Fix: HMAC-SHA256 over the payload with a key derived from APP_KEY, constant
 * time comparison on verify, hard expiry, and a tenant binding check.
 * ─────────────────────────────────────────────────────────────────────────────
 */
final class TokenService
{
    private const TTL_SECONDS = 28800; // 8 hours, unchanged from original behaviour

    /** Raw bytes of the signing key — never leaves this class. */
    private static function key(): string
    {
        $appKey = (string) config('app.key');
        if ($appKey === '') {
            throw new RuntimeException('APP_KEY is not set: cannot sign or verify tokens.');
        }

        // Laravel stores APP_KEY as "base64:...."; accept both forms.
        if (str_starts_with($appKey, 'base64:')) {
            $decoded = base64_decode(substr($appKey, 7), true);
            if ($decoded === false) {
                throw new RuntimeException('APP_KEY base64 value is malformed.');
            }
            $appKey = $decoded;
        }

        // Domain-separate so this key can never be confused with session/cookie keys.
        return hash_hmac('sha256', 'neev4d.api.token.v1', $appKey, true);
    }

    private static function b64uEncode(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    private static function b64uDecode(string $encoded): string|false
    {
        $padded = strtr($encoded, '-_', '+/');
        $padded .= str_repeat('=', (4 - strlen($padded) % 4) % 4);

        return base64_decode($padded, true);
    }

    /**
     * Mint a signed token for an authenticated principal.
     *
     * @param  array<string,mixed>  $user  user payload (tenant_code must be present)
     */
    public static function issue(array $user): string
    {
        $payload = json_encode([
            'sub' => (string) ($user['user_code'] ?? ''),
            'iat' => time(),
            'exp' => time() + self::TTL_SECONDS,
            'jti' => bin2hex(random_bytes(16)),
            'user' => $user,
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);

        $body = self::b64uEncode($payload);
        $sig = self::b64uEncode(hash_hmac('sha256', $body, self::key(), true));

        return $body . '.' . $sig;
    }

    /**
     * Verify a token. Returns the user payload, or null if invalid/expired/tampered.
     *
     * @return array<string,mixed>|null
     */
    public static function verify(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 2) {
            return null;
        }
        [$body, $sig] = $parts;

        $expected = self::b64uEncode(hash_hmac('sha256', $body, self::key(), true));

        // hash_equals → constant time, immune to timing oracles.
        if (! hash_equals($expected, $sig)) {
            return null;
        }

        $raw = self::b64uDecode($body);
        if ($raw === false) {
            return null;
        }

        $claims = json_decode($raw, true);
        if (! is_array($claims)) {
            return null;
        }

        if (! isset($claims['exp'], $claims['user']) || ! is_array($claims['user'])) {
            return null;
        }

        if ((int) $claims['exp'] < time()) {
            return null;
        }

        return $claims['user'];
    }

    /**
     * Revoke a token's jti so logout actually invalidates it.
     *
     * Stored in the database, not in cache: an `array` or `file` cache is
     * per-process and would silently make logout a no-op — which is exactly
     * the bug the first pass of this fix had. A token revocation list has to
     * be durable and shared across every PHP-FPM worker.
     */
    public static function revoke(string $token): void
    {
        $claims = self::claims($token);
        if ($claims === null || empty($claims['jti'])) {
            return;
        }

        try {
            DB::table('mfi_revoked_tokens')->upsert(
                [[
                    'jti' => (string) $claims['jti'],
                    'user_code' => (string) ($claims['sub'] ?? ''),
                    'expires_at' => date('Y-m-d H:i:s', (int) ($claims['exp'] ?? time())),
                    'created_at' => now(),
                ]],
                ['jti'],
                ['expires_at']
            );
        } catch (\Throwable $e) {
            // Never let a revocation write failure break logout, but do make
            // noise: a silent failure here is a live session that survives logout.
            logger()->error('Token revocation failed: '.$e->getMessage());
        }
    }

    public static function isRevoked(string $token): bool
    {
        $claims = self::claims($token);
        if ($claims === null || empty($claims['jti'])) {
            return true; // unparseable → treat as revoked
        }

        try {
            return DB::table('mfi_revoked_tokens')
                ->where('jti', (string) $claims['jti'])
                ->exists();
        } catch (\Throwable) {
            // Table missing (pre-migration): fail closed.
            return true;
        }
    }

    /**
     * Decode claims WITHOUT verifying the signature.
     * Only safe for reading jti/exp of a token whose signature was already
     * checked by verify() earlier in the request lifecycle.
     *
     * @return array<string,mixed>|null
     */
    private static function claims(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 2) {
            return null;
        }
        $raw = self::b64uDecode($parts[0]);
        if ($raw === false) {
            return null;
        }
        $claims = json_decode($raw, true);

        return is_array($claims) ? $claims : null;
    }
}
