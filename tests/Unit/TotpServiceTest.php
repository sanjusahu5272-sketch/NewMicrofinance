<?php
declare(strict_types=1);

namespace Tests\Unit;

use App\Services\TotpService;
use PHPUnit\Framework\TestCase;

/**
 * TOTP verified against the OFFICIAL RFC 6238 Appendix B test vectors.
 *
 * These are not values I invented — they are the reference vectors published in
 * the RFC. If these pass, Google Authenticator, Authy and Microsoft
 * Authenticator will all agree with us. If they fail, every user is locked out.
 *
 * RFC 6238 uses the ASCII seed "12345678901234567890" (20 bytes, HMAC-SHA1).
 */
class TotpServiceTest extends TestCase
{
    /** Base32 of "12345678901234567890" — the RFC 6238 seed. */
    private const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

    /** RFC 6238 Appendix B — TOTP-HMAC-SHA1, 8 digits. */
    public function test_rfc6238_official_vectors_sha1(): void
    {
        $vectors = [
            59          => '94287082',
            1111111109  => '07081804',
            1111111111  => '14050471',
            1234567890  => '89005924',
            2000000000  => '69279037',
            20000000000 => '65353130',
        ];

        foreach ($vectors as $time => $expected) {
            $actual = TotpService::totp(self::RFC_SECRET, $time, 8);
            $this->assertSame($expected, $actual,
                "RFC 6238 vector failed at T={$time}: expected {$expected}, got {$actual}");
        }
    }

    /** Base32 round-trip must be lossless for arbitrary bytes. */
    public function test_base32_roundtrip(): void
    {
        foreach ([1, 5, 10, 20, 32, 64] as $len) {
            $raw = random_bytes($len);
            $this->assertSame($raw, TotpService::base32Decode(TotpService::base32Encode($raw)));
        }
        // Known value: "12345678901234567890" → GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
        $this->assertSame(self::RFC_SECRET, TotpService::base32Encode('12345678901234567890'));
    }

    /** RFC 4226 Appendix D HOTP vectors. */
    public function test_rfc4226_hotp_vectors(): void
    {
        $vectors = ['755224', '287082', '359152', '969429', '338314',
                    '254676', '287922', '162583', '399871', '520489'];
        $key = '12345678901234567890';
        foreach ($vectors as $counter => $expected) {
            $this->assertSame($expected, TotpService::hotp($key, $counter));
        }
    }

    /** A valid code must verify, and return the step it matched. */
    public function test_verify_accepts_current_code(): void
    {
        $secret = TotpService::generateSecret();
        $now = 1_800_000_000;
        $code = TotpService::totp($secret, $now);
        $step = TotpService::verify($secret, $code, $now);
        $this->assertNotNull($step);
        $this->assertSame(intdiv($now, 30), $step);
    }

    /** ±1 step drift (30 s) must be tolerated — phone clocks are never exact. */
    public function test_verify_tolerates_one_step_drift(): void
    {
        $secret = TotpService::generateSecret();
        $now = 1_800_000_000;
        $prev = TotpService::totp($secret, $now - 30);
        $next = TotpService::totp($secret, $now + 30);
        $this->assertNotNull(TotpService::verify($secret, $prev, $now), 'previous step must verify');
        $this->assertNotNull(TotpService::verify($secret, $next, $now), 'next step must verify');
    }

    /** Two steps away must NOT verify — that would widen the brute-force window. */
    public function test_verify_rejects_drift_beyond_tolerance(): void
    {
        $secret = TotpService::generateSecret();
        $now = 1_800_000_000;
        $far = TotpService::totp($secret, $now - 90);
        $this->assertNull(TotpService::verify($secret, $far, $now));
    }

    /** Wrong codes, short codes and garbage must all be rejected. */
    public function test_verify_rejects_invalid_input(): void
    {
        $secret = TotpService::generateSecret();
        $now = 1_800_000_000;
        $real = TotpService::totp($secret, $now);
        $wrong = $real === '000000' ? '111111' : '000000';

        $this->assertNull(TotpService::verify($secret, $wrong, $now));
        $this->assertNull(TotpService::verify($secret, '12345', $now),     'short code');
        $this->assertNull(TotpService::verify($secret, '', $now));
        $this->assertNull(TotpService::verify($secret, 'abcdef', $now));
        $this->assertNull(TotpService::verify('', $real, $now), 'empty secret');
    }

    /** A code from a DIFFERENT secret must never verify. */
    public function test_verify_rejects_code_from_other_secret(): void
    {
        $a = TotpService::generateSecret();
        $b = TotpService::generateSecret();
        $now = 1_800_000_000;
        $codeForB = TotpService::totp($b, $now);
        $this->assertNull(TotpService::verify($a, $codeForB, $now));
    }

    /** Two generated secrets must never collide. */
    public function test_generated_secrets_are_unique_and_20_bytes(): void
    {
        $a = TotpService::generateSecret();
        $b = TotpService::generateSecret();
        $this->assertNotSame($a, $b);
        $this->assertSame(20, strlen(TotpService::base32Decode($a)));
        $this->assertMatchesRegularExpression('/^[A-Z2-7]+$/', $a);
    }

    /** The otpauth:// URI must be parseable and carry the right params. */
    public function test_provisioning_uri_format(): void
    {
        $uri = TotpService::provisioningUri('ABCDEFGH23456789', 'ADM01', 'NEEV 4D Microfinance');
        $this->assertStringStartsWith('otpauth://totp/', $uri);

        $parts = parse_url($uri);
        $this->assertSame('otpauth', $parts['scheme']);
        $this->assertSame('totp', $parts['host']);

        parse_str($parts['query'], $q);
        $this->assertSame('ABCDEFGH23456789', $q['secret']);
        $this->assertSame('NEEV 4D Microfinance', $q['issuer']);
        $this->assertSame('SHA1', $q['algorithm']);
        $this->assertSame('6', $q['digits']);
        $this->assertSame('30', $q['period']);
        // Label must be issuer:account, URL-encoded
        $this->assertSame('/NEEV%204D%20Microfinance:ADM01', $parts['path']);
    }

    /** Recovery codes: unique, well-formed, and their hashes actually match. */
    public function test_recovery_codes(): void
    {
        $r = TotpService::generateRecoveryCodes(10);
        $this->assertCount(10, $r['plain']);
        $this->assertCount(10, $r['hashed']);
        $this->assertSame(10, count(array_unique($r['plain'])), 'recovery codes must be unique');

        foreach ($r['plain'] as $i => $code) {
            $this->assertMatchesRegularExpression('/^[0-9A-F]{5}-[0-9A-F]{5}$/', $code);
            $this->assertSame(hash('sha256', $code), $r['hashed'][$i]);
        }
    }

    /** Recovery code entry must be forgiving: case, dashes, spaces. */
    public function test_recovery_code_normalisation(): void
    {
        $this->assertSame('ABCDE-12345', TotpService::normaliseRecoveryCode('abcde-12345'));
        $this->assertSame('ABCDE-12345', TotpService::normaliseRecoveryCode('ABCDE 12345'));
        $this->assertSame('ABCDE-12345', TotpService::normaliseRecoveryCode('  abcde12345  '));
        $this->assertSame(hash('sha256', 'ABCDE-12345'),
            hash('sha256', TotpService::normaliseRecoveryCode('abcde12345')));
    }
}
