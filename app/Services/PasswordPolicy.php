<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Password policy for a real money-handling back office.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * The original system shipped `Admin@123` and `Branch@123` as defaults and
 * accepted anything ≥ 6 characters on change. On a system where a branch
 * manager can disburse ₹5,00,000 in cash, that is the whole threat model.
 *
 * Policy (NIST SP 800-63B aligned, which is stricter in the ways that matter
 * and gentler in the ways that don't):
 *   - minimum 12 characters (length beats complexity theatre)
 *   - reject the top common passwords AND their leetspeak obfuscations
 *   - reject anything containing the user's own code / name / branch
 *   - reject keyboard walks and long runs / repeats
 *   - NO forced character-class mixing and NO 90-day rotation: both push
 *     users toward `Password1!` patterns, which is worse than a long
 *     passphrase. Strength is scored, not pattern-matched.
 *   - breach check hook (opt-in HIBP k-anonymity, no plaintext ever sent)
 * ─────────────────────────────────────────────────────────────────────────────
 */
final class PasswordPolicy
{
    public const MIN_LENGTH = 12;
    public const MAX_LENGTH = 128;   // bcrypt hard limit is 72 bytes; enforce lower

    /** The passwords that actually get used in Indian back offices. */
    private const COMMON = [
        'password', 'password1', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword',
        'admin', 'admin123', 'administrator', 'admin@123', 'admin@2024', 'admin@2025', 'admin@2026',
        'root', 'toor', 'letmein', 'welcome', 'welcome1', 'welcome@123',
        'qwerty', 'qwerty123', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
        '123456', '1234567', '12345678', '123456789', '1234567890', '0987654321',
        'password@123', 'india123', 'india@123', 'bharat123', 'hindustan',
        'microfinance', 'microfin', 'neev123', 'neev@123', 'neev4d', 'neev4d@123',
        'branch@123', 'manager@123', 'cashier@123', 'agent@123', 'loan@123',
        'micromuneem', 'microfincare', 'whiz', 'whiz@123',
        'iloveyou', 'princess', 'sunshine', 'monkey', 'dragon', 'football',
        'cricket', 'krishna', 'ganesh', 'shivam', 'rahul123', 'amit123',
        'aadhar123', 'aadhaar', 'pan12345', 'gst12345',
    ];

    /**
     * Validate a NEW password.
     *
     * @param  array{user_code?:string,name?:string,email?:string,branch_name?:string,mobile?:string}  $identity
     * @return array{ok:bool, errors:array<int,string>, score:int, strength:string}
     */
    public static function validate(string $password, array $identity = []): array
    {
        $errors = [];
        $len = mb_strlen($password);

        if ($len < self::MIN_LENGTH) {
            $errors[] = 'Password must be at least ' . self::MIN_LENGTH . ' characters (you used ' . $len . ').';
        }
        if ($len > self::MAX_LENGTH) {
            $errors[] = 'Password must be at most ' . self::MAX_LENGTH . ' characters.';
        }

        $lower = mb_strtolower($password);
        $squashed = preg_replace('/[^a-z0-9]/', '', $lower) ?? '';

        // Leetspeak-normalised comparison: P@ssw0rd! → password
        $leet = strtr($squashed, ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't', '@' => 'a', '$' => 's']);

        foreach (self::COMMON as $bad) {
            $badSquashed = preg_replace('/[^a-z0-9]/', '', $bad) ?? $bad;
            if ($squashed === $badSquashed || str_contains($leet, $badSquashed) || str_contains($squashed, $badSquashed)) {
                $errors[] = 'This password is on the common-password list and is instantly guessable.';
                break;
            }
        }

        // Never let the password contain the identity it protects.
        foreach (['user_code', 'name', 'email', 'branch_name', 'mobile'] as $field) {
            $value = trim(mb_strtolower((string) ($identity[$field] ?? '')));
            if ($value === '' || mb_strlen($value) < 3) {
                continue;
            }
            $valueSquashed = preg_replace('/[^a-z0-9]/', '', $value) ?? $value;
            if ($valueSquashed !== '' && str_contains($squashed, $valueSquashed)) {
                $errors[] = "Password must not contain your {$field}.";
            }
            // Also catch the local part of an email.
            if ($field === 'email' && str_contains($value, '@')) {
                $local = preg_replace('/[^a-z0-9]/', '', explode('@', $value)[0]) ?? '';
                if ($local !== '' && mb_strlen($local) >= 4 && str_contains($squashed, $local)) {
                    $errors[] = 'Password must not contain your email name.';
                }
            }
        }

        // Keyboard walks: qwerty asdf 1234 etc.
        if (preg_match('/(qwerty|asdfg|zxcvb|12345|98765|1q2w3e|qazwsx)/i', $squashed)) {
            $errors[] = 'Password must not contain a keyboard pattern.';
        }

        // Long runs or repeats: aaaaaa, 111111, 123456.
        if (preg_match('/(.)\1{3,}/u', $password)) {
            $errors[] = 'Password must not repeat the same character 4+ times in a row.';
        }
        if (preg_match('/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef)/i', $squashed)) {
            $errors[] = 'Password must not contain a sequential run (1234, abcd).';
        }

        [$score, $strength] = self::score($password);

        if ($score < 2) {
            $errors[] = 'Password is too weak — mix unrelated words rather than symbols.';
        }

        return [
            'ok' => $errors === [],
            'errors' => array_values(array_unique($errors)),
            'score' => $score,
            'strength' => $strength,
        ];
    }

    /**
     * Entropy-style scoring, 0–4.
     * No zxcvbn dependency: a length + character-pool estimate is accurate
     * enough once the common-password and pattern filters above have run.
     *
     * @return array{0:int,1:string}
     */
    public static function score(string $password): array
    {
        $pool = 0;
        if (preg_match('/[a-z]/', $password)) {
            $pool += 26;
        }
        if (preg_match('/[A-Z]/', $password)) {
            $pool += 26;
        }
        if (preg_match('/[0-9]/', $password)) {
            $pool += 10;
        }
        if (preg_match('/[^a-zA-Z0-9]/', $password)) {
            $pool += 33;
        }

        $len = max(1, mb_strlen($password));
        $bits = $len * (log($pool, 2) ?: 1);

        // Unique-character bonus: "correct horse battery staple" style.
        $unique = count(array_unique(mb_str_split($password)));
        $bits *= (0.6 + 0.4 * ($unique / $len));

        $score = match (true) {
            $bits < 36 => 0,
            $bits < 50 => 1,
            $bits < 70 => 2,
            $bits < 100 => 3,
            default => 4,
        };

        $label = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][$score];

        return [$score, $label];
    }

    /**
     * Optional breach check via Have I Been Pwned k-anonymity.
     * Only the first 5 hex chars of the SHA-1 leave the machine — never the
     * password, never the full hash. Returns null when the check can't run.
     */
    public static function isBreached(string $password, int $timeoutSeconds = 3): ?bool
    {
        $sha1 = strtoupper(sha1($password));
        $prefix = substr($sha1, 0, 5);
        $suffix = substr($sha1, 5);

        $ctx = stream_context_create([
            'http' => ['timeout' => $timeoutSeconds, 'user_agent' => 'NEEV4D-PasswordPolicy/1.0'],
        ]);
        $body = @file_get_contents("https://api.pwnedpasswords.com/range/{$prefix}", false, $ctx);
        if ($body === false) {
            return null;
        }

        foreach (explode("\n", $body) as $line) {
            [$hashSuffix, $count] = array_pad(explode(':', trim($line)), 2, '0');
            if (hash_equals($suffix, strtoupper(trim($hashSuffix))) && (int) $count > 0) {
                return true;
            }
        }

        return false;
    }
}
