<?php

declare(strict_types=1);

namespace App\Services;

use InvalidArgumentException;

/**
 * RFC 6238 TOTP (Google Authenticator / Authy / Microsoft Authenticator compatible)
 * plus RFC 4226 HOTP, implemented on vanilla PHP + hash_hmac.
 *
 * Deliberately dependency-free:
 *   - no `pragmarx/google2fa`, no `spomky-labs/otphp`, no QR vendor SDK
 *   - every line is auditable, and there is no third-party package in the
 *     authentication path that can be typosquatted or abandoned.
 *
 * Correctness matters more here than anywhere else in the codebase: a TOTP
 * implementation that is subtly wrong either locks every user out or accepts
 * codes it should not. The test suite pins the RFC 6238 Appendix B vectors.
 */
final class TotpService
{
    /** 30-second time step, per RFC 6238 §5.2 recommendation. */
    public const PERIOD = 30;

    /** 6 digits — what every authenticator app defaults to. */
    public const DIGITS = 6;

    /** Accept the previous/next step to tolerate clock drift (±30s). */
    public const DEFAULT_DRIFT_STEPS = 1;

    /** Base32 alphabet (RFC 4648 §6), no padding char. */
    private const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    /**
     * Generate a new random Base32 secret.
     *
     * 160 bits (20 bytes) is the RFC 4226 §4 recommendation for HMAC-SHA1 and
     * is what Google Authenticator expects.
     */
    public static function generateSecret(int $bytes = 20): string
    {
        return self::base32Encode(random_bytes($bytes));
    }

    /** RFC 4648 §6 Base32 encode, unpadded. */
    public static function base32Encode(string $raw): string
    {
        $bits = '';
        foreach (str_split($raw) as $char) {
            $bits .= str_pad(decbin(ord($char)), 8, '0', STR_PAD_LEFT);
        }

        $out = '';
        foreach (str_split($bits, 5) as $chunk) {
            $chunk = str_pad($chunk, 5, '0', STR_PAD_RIGHT);
            $out .= self::B32[bindec($chunk)];
        }

        return $out;
    }

    /** RFC 4648 §6 Base32 decode, tolerating lowercase, spaces, padding and '0'/'1'. */
    public static function base32Decode(string $encoded): string
    {
        $clean = strtoupper(preg_replace('/[\s=]+/', '', $encoded) ?? '');
        // Common human transcription errors in Base32 secrets.
        $clean = str_replace(['0', '1', '8', '9'], ['O', 'I', 'B', 'G'], $clean);

        $bits = '';
        foreach (str_split($clean) as $char) {
            $idx = strpos(self::B32, $char);
            if ($idx === false) {
                throw new InvalidArgumentException("Invalid Base32 character '{$char}' in TOTP secret.");
            }
            $bits .= str_pad(decbin($idx), 5, '0', STR_PAD_LEFT);
        }

        $out = '';
        foreach (str_split($bits, 8) as $byte) {
            if (strlen($byte) === 8) {
                $out .= chr(bindec($byte));
            }
        }

        return $out;
    }

    /**
     * RFC 4226 HOTP.
     *
     * @param  string  $secret  raw binary key (not Base32)
     */
    public static function hotp(string $secret, int $counter, int $digits = self::DIGITS): string
    {
        // 8-byte big-endian counter.
        $binCounter = pack('J', $counter);
        $hash = hash_hmac('sha1', $binCounter, $secret, true);

        // Dynamic truncation, RFC 4226 §5.3.
        $offset = ord($hash[19]) & 0x0F;
        $value = (
            ((ord($hash[$offset]) & 0x7F) << 24) |
            ((ord($hash[$offset + 1]) & 0xFF) << 16) |
            ((ord($hash[$offset + 2]) & 0xFF) << 8) |
            (ord($hash[$offset + 3]) & 0xFF)
        );

        return str_pad((string) ($value % (10 ** $digits)), $digits, '0', STR_PAD_LEFT);
    }

    /** RFC 6238 TOTP for a given unix timestamp. */
    public static function totp(string $base32Secret, ?int $timestamp = null, int $digits = self::DIGITS): string
    {
        $ts = $timestamp ?? time();
        $counter = intdiv($ts, self::PERIOD);

        return self::hotp(self::base32Decode($base32Secret), $counter, $digits);
    }

    /**
     * Constant-time verification with drift tolerance.
     *
     * Returns the matched time step on success (so the caller can persist it and
     * refuse a replay), or null on failure.
     */
    public static function verify(
        string $base32Secret,
        string $code,
        ?int $timestamp = null,
        int $driftSteps = self::DEFAULT_DRIFT_STEPS
    ): ?int {
        $code = preg_replace('/\D/', '', $code) ?? '';
        if (strlen($code) !== self::DIGITS) {
            return null;
        }

        $ts = $timestamp ?? time();
        $current = intdiv($ts, self::PERIOD);

        // Loop every candidate rather than early-returning, so the response time
        // does not reveal which step matched.
        $matched = null;
        for ($drift = -$driftSteps; $drift <= $driftSteps; $drift++) {
            $step = $current + $drift;
            $expected = self::totp($base32Secret, $step * self::PERIOD);
            if (hash_equals($expected, $code)) {
                $matched = $step;
            }
        }

        return $matched;
    }

    /**
     * otpauth:// URI for the enrolment QR code.
     *
     * Issuer and account are URL-encoded exactly as the Key URI Format spec
     * requires, otherwise Google Authenticator shows a garbled account name.
     */
    public static function provisioningUri(string $base32Secret, string $account, string $issuer): string
    {
        $label = rawurlencode($issuer) . ':' . rawurlencode($account);
        $params = [
            'secret' => $base32Secret,
            'issuer' => $issuer,
            'algorithm' => 'SHA1',
            'digits' => (string) self::DIGITS,
            'period' => (string) self::PERIOD,
        ];

        return 'otpauth://totp/' . $label . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    }

    /**
     * Single-use recovery codes.
     *
     * Stored as hashes, shown to the user exactly once. 10 codes × 10 chars is
     * ~49 bits of entropy each — enough that online guessing is hopeless even
     * without rate limiting, and they are rate limited anyway.
     *
     * @return array{plain: array<int,string>, hashed: array<int,string>}
     */
    public static function generateRecoveryCodes(int $count = 10): array
    {
        $plain = [];
        for ($i = 0; $i < $count; $i++) {
            $raw = strtoupper(bin2hex(random_bytes(5)));   // 10 hex chars
            $plain[] = substr($raw, 0, 5) . '-' . substr($raw, 5, 5);
        }

        return [
            'plain' => $plain,
            'hashed' => array_map(static fn (string $c): string => hash('sha256', $c), $plain),
        ];
    }

    /** Normalise a recovery code the user typed (case, dashes, spaces). */
    public static function normaliseRecoveryCode(string $code): string
    {
        $c = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $code) ?? '');

        return strlen($c) === 10 ? substr($c, 0, 5) . '-' . substr($c, 5) : $c;
    }
}
