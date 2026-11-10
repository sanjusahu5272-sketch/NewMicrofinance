<?php
declare(strict_types=1);

namespace Tests\Unit;

use App\Services\PasswordPolicy;
use PHPUnit\Framework\TestCase;

class PasswordPolicyTest extends TestCase
{
    /** The shipped defaults must never be accepted again. */
    public function test_shipped_default_passwords_are_rejected(): void
    {
        foreach (['Admin@123', 'Branch@123', 'password123', 'Admin@2026', 'neev@123', 'microfinance'] as $bad) {
            $r = PasswordPolicy::validate($bad);
            $this->assertFalse($r['ok'], "'{$bad}' must be rejected but was accepted");
        }
    }

    /** Leetspeak obfuscation must not defeat the list. */
    public function test_leetspeak_variants_rejected(): void
    {
        foreach (['P@ssw0rd', 'P@ssw0rd123', 'Adm1n@123', 'p4ssw0rd!'] as $bad) {
            $this->assertFalse(PasswordPolicy::validate($bad)['ok'], "'{$bad}' should be rejected");
        }
    }

    /** Minimum length is enforced. */
    public function test_minimum_length(): void
    {
        $this->assertFalse(PasswordPolicy::validate('Ab1!xyz')['ok'], '7 chars must fail');
        $this->assertFalse(PasswordPolicy::validate('Abcdefgh123')['ok'], '11 chars must fail');
        $long = PasswordPolicy::validate('Quiet-Meadow-Lantern-9');
        $this->assertTrue($long['ok'], 'a 23-char passphrase must pass');
    }

    /** Password must not contain the user's own identity. */
    public function test_identity_leak_rejected(): void
    {
        $id = ['user_code' => 'ADM01', 'name' => 'Super Admin', 'email' => 'admin@microfincare.com'];
        $this->assertFalse(PasswordPolicy::validate('Quiet-Meadow-ADM01-x', $id)['ok'], 'user_code leak');
        $this->assertFalse(PasswordPolicy::validate('Super-Admin-Quiet-Meadow', $id)['ok'], 'name leak');
        $this->assertFalse(PasswordPolicy::validate('Quiet-Meadow-admin-123', $id)['ok'], 'email local part leak');
    }

    /** Keyboard walks and sequential runs. */
    public function test_keyboard_patterns_rejected(): void
    {
        $this->assertFalse(PasswordPolicy::validate('Qwerty-Keyboard-12')['ok']);
        $this->assertFalse(PasswordPolicy::validate('Quiet-1234-Meadow')['ok']);
        $this->assertFalse(PasswordPolicy::validate('Abcd-Quiet-Meadow')['ok']);
    }

    /** Character repeats. */
    public function test_repeats_rejected(): void
    {
        $this->assertFalse(PasswordPolicy::validate('Quiet-aaaa-Meadow9')['ok']);
        $this->assertFalse(PasswordPolicy::validate('Quiet-1111-Meadow9')['ok']);
    }

    /** Good passphrases must be accepted — policy must not be so strict nobody can log in. */
    public function test_good_passphrases_accepted(): void
    {
        $good = [
            'Quiet-Meadow-Lantern-9',
            'tantamount!walnut!harbour7',
            'Blue#River#Cascade#42',
            'किताब-नदी-पहाड़-2026',        // non-ASCII must be handled, not crash
            'Zebra7kangaroo$Lantern',
        ];
        foreach ($good as $pw) {
            $r = PasswordPolicy::validate($pw);
            $this->assertTrue($r['ok'], "'{$pw}' rejected: " . implode(' | ', $r['errors']));
        }
    }

    /** Scoring must order weak < strong sensibly. */
    public function test_scoring_is_monotonic(): void
    {
        [$w] = PasswordPolicy::score('abc');
        [$m] = PasswordPolicy::score('Quietmeadow');
        [$s] = PasswordPolicy::score('Quiet-Meadow-Lantern-9');
        $this->assertLessThan($m, $w, '3 chars must score below 11 chars');
        $this->assertLessThanOrEqual(4, $s, 'score is capped at 4');
        $this->assertGreaterThanOrEqual($m, $s, 'long passphrase must score at least as high');
    }

    /** Empty and whitespace-only input must fail cleanly, never throw. */
    public function test_empty_input_is_safe(): void
    {
        $this->assertFalse(PasswordPolicy::validate('')['ok']);
        $this->assertFalse(PasswordPolicy::validate('            ')['ok']);
    }

    /** Maximum length guard (bcrypt truncation). */
    public function test_max_length(): void
    {
        $this->assertFalse(PasswordPolicy::validate(str_repeat('Ab9!', 40))['ok']);
    }
}
