<?php

declare(strict_types=1);

namespace App\Services;

use InvalidArgumentException;

/**
 * Pure BCMath Fixed-Point Arithmetic Engine for Real-Money Microfinance Operations.
 *
 * Enforces:
 * - Intermediate calculations at scale = 16 (was 6 — see BUG-001).
 * - Final ledger & currency postings at scale = 2 (HALF-UP deterministic rounding).
 * - Zero PHP float/double casts or native arithmetic operators on monetary values.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BUG-001 (fixed 2026-11-09): INTERMEDIATE_SCALE was 6.
 *
 * bcmath TRUNCATES. `bcpow(1.015, 6, 6)` returns 1.093443 instead of
 * 1.09344326368663 — 9 significant digits discarded *before* the EMI division.
 * That silently moved the EMI of a ₹50,000 / 18% / 6-month loan by ₹0.02.
 *
 * Interest-factor math compounds, so the error grows with tenure and rate:
 * a 60-month loan at 24% was off by several rupees, not paise.
 *
 * Fix: compute at scale 16, round to scale 2 only at the boundary.
 * 16 digits of headroom is far beyond any real loan (₹1 crore, 360 months,
 * 100% p.a. needs at most 12 significant decimals to stay exact to 1 paisa).
 * ─────────────────────────────────────────────────────────────────────────────
 */
final class BcMathCalculator
{
    /** Working precision for every intermediate step. */
    public const INTERMEDIATE_SCALE = 16;

    /** Final money precision (₹0.00). */
    public const LEDGER_SCALE = 2;

    /**
     * Legacy alias kept for backward compatibility with existing call sites.
     * @deprecated use INTERMEDIATE_SCALE
     */
    public const LEGACY_SCALE = 6;

    /**
     * Normalize any numeric string or integer input into a clean decimal string at the given scale.
     */
    public static function normalize(string|int $value, int $scale = self::INTERMEDIATE_SCALE): string
    {
        $raw = trim((string) $value);
        $raw = str_replace([',', '₹', ' '], '', $raw);
        if ($raw === '' || $raw === '.') {
            $raw = '0';
        }
        if (!preg_match('/^[+-]?\d+(\.\d+)?$/', $raw)) {
            throw new InvalidArgumentException("Invalid monetary decimal value: '{$value}'.");
        }

        return self::roundHalfUp($raw, $scale);
    }

    /**
     * Quantize to scale = 2 (₹0.00) using deterministic ROUND_HALF_UP in pure string/BCMath math.
     */
    public static function money(string|int $value): string
    {
        return self::normalize($value, self::LEDGER_SCALE);
    }

    /**
     * Intermediate addition.
     */
    public static function add(string|int $a, string|int $b, int $scale = self::INTERMEDIATE_SCALE): string
    {
        return bcadd(self::normalize($a, self::INTERMEDIATE_SCALE), self::normalize($b, self::INTERMEDIATE_SCALE), $scale);
    }

    /**
     * Intermediate subtraction.
     */
    public static function sub(string|int $a, string|int $b, int $scale = self::INTERMEDIATE_SCALE): string
    {
        return bcsub(self::normalize($a, self::INTERMEDIATE_SCALE), self::normalize($b, self::INTERMEDIATE_SCALE), $scale);
    }

    /**
     * Intermediate multiplication.
     */
    public static function mul(string|int $a, string|int $b, int $scale = self::INTERMEDIATE_SCALE): string
    {
        return bcmul(self::normalize($a, self::INTERMEDIATE_SCALE), self::normalize($b, self::INTERMEDIATE_SCALE), $scale);
    }

    /**
     * Intermediate division with explicit zero-divisor guard.
     */
    public static function div(string|int $a, string|int $b, int $scale = self::INTERMEDIATE_SCALE): string
    {
        $divisor = self::normalize($b, self::INTERMEDIATE_SCALE);
        if (bccomp($divisor, '0', self::INTERMEDIATE_SCALE) === 0) {
            throw new InvalidArgumentException('Division by zero in financial calculation.');
        }

        return bcdiv(self::normalize($a, self::INTERMEDIATE_SCALE), $divisor, $scale);
    }

    /**
     * Integer-safe power with full working precision. Used by the EMI annuity formula.
     */
    public static function pow(string|int $base, int $exponent): string
    {
        if ($exponent < 0) {
            throw new InvalidArgumentException('Negative exponent is not supported in loan math.');
        }

        return bcpow(self::normalize($base, self::INTERMEDIATE_SCALE), (string) $exponent, self::INTERMEDIATE_SCALE);
    }

    /**
     * Compare two monetary strings at the specified scale (-1, 0, 1).
     */
    public static function comp(string|int $a, string|int $b, int $scale = self::LEDGER_SCALE): int
    {
        return bccomp(self::normalize($a, $scale), self::normalize($b, $scale), $scale);
    }

    /**
     * Return absolute value of a decimal string at the specified scale.
     */
    public static function abs(string|int $value, int $scale = self::LEDGER_SCALE): string
    {
        $norm = self::normalize($value, $scale);

        return str_starts_with($norm, '-') ? substr($norm, 1) : $norm;
    }

    /**
     * Return the maximum of two decimal strings.
     */
    public static function max(string|int $a, string|int $b, int $scale = self::LEDGER_SCALE): string
    {
        return self::comp($a, $b, $scale) >= 0 ? self::normalize($a, $scale) : self::normalize($b, $scale);
    }

    /**
     * Return the minimum of two decimal strings.
     */
    public static function min(string|int $a, string|int $b, int $scale = self::LEDGER_SCALE): string
    {
        return self::comp($a, $b, $scale) <= 0 ? self::normalize($a, $scale) : self::normalize($b, $scale);
    }

    /**
     * Percentage of base, rounded to paise at the boundary.
     */
    public static function percentageOf(string|int $base, string|int $pct): string
    {
        $prod = self::mul($base, $pct, self::INTERMEDIATE_SCALE);
        $quot = self::div($prod, '100', self::INTERMEDIATE_SCALE);

        return self::roundHalfUp($quot, self::LEDGER_SCALE);
    }

    /**
     * Convert rupees string (e.g. "500.25") into integer paise ("50025") without floats.
     */
    public static function toPaise(string|int $amountInr): int
    {
        $paiseStr = bcmul(self::money($amountInr), '100', 0);

        return (int) $paiseStr;
    }

    /**
     * Convert paise integer/string into rupees string at scale = 2.
     */
    public static function fromPaise(string|int $paise): string
    {
        $quot = bcdiv((string) $paise, '100', self::INTERMEDIATE_SCALE);

        return self::roundHalfUp($quot, self::LEDGER_SCALE);
    }

    /**
     * Deterministic ROUND_HALF_UP using BCMath at arbitrary scale.
     */
    public static function roundHalfUp(string $number, int $scale = self::LEDGER_SCALE): string
    {
        $workScale = $scale + 2;
        $normalized = bcadd($number, '0', $workScale);
        $half = '0.' . str_repeat('0', $scale) . '5';

        if (str_starts_with($normalized, '-')) {
            return bcsub($normalized, $half, $scale);
        }

        return bcadd($normalized, $half, $scale);
    }

    /**
     * ─────────────────────────────────────────────────────────────────────
     * BUG-002 (fixed 2026-11-09): Internal Rate of Return / Effective APR.
     *
     * The old code computed APR as:
     *     costRatio  = (totalInterest + totalFees) / netDisbursed
     *     yearFrac   = totalDays / 365
     *     APR        = costRatio / yearFrac * 100
     *
     * That is a "flat cost over time" ratio, NOT a rate. For ₹50,000 / 18% /
     * 6 months it produced 13.59% where the true effective APR is 19.56% —
     * a 30% understatement, printed on a customer-facing RBI Key Fact
     * Statement. Regulators treat that as mis-selling; so does a court.
     *
     * Fix: solve the真实 IRR of the actual dated cashflow stream by
     * bisection on NPV at 30-day-equivalent compounding, then annualise.
     * Pure BCMath, no floats, deterministic, no convergence surprises.
     * ─────────────────────────────────────────────────────────────────────
     *
     * @param  array<int,array{day_offset:int, amount:string}>  $cashflows  signed: + = borrower receives, − = borrower pays
     * @return string|null effective annualised rate as a percentage string (e.g. "19.56"), or null if unsolvable
     */
    public static function effectiveAprFromCashflows(array $cashflows): ?string
    {
        if (count($cashflows) < 2) {
            return null;
        }

        $npv = static function (string $periodRate) use ($cashflows): string {
            $total = '0';
            $onePlus = bcadd('1', $periodRate, self::INTERMEDIATE_SCALE);

            foreach ($cashflows as $flow) {
                $t = (string) max(0, (int) ($flow['day_offset'] ?? 0));
                $periods = bcdiv($t, '30', self::INTERMEDIATE_SCALE);
                $discount = self::powDecimal($onePlus, $periods);
                $total = bcadd($total, bcdiv((string) $flow['amount'], $discount, self::INTERMEDIATE_SCALE), self::INTERMEDIATE_SCALE);
            }

            return $total;
        };

        // A loan needs one sign change to have a unique positive IRR.
        $hasPos = false;
        $hasNeg = false;
        foreach ($cashflows as $flow) {
            $v = self::normalize((string) $flow['amount'], self::LEDGER_SCALE);
            if (self::comp($v, '0.00') > 0) {
                $hasPos = true;
            } elseif (self::comp($v, '0.00') < 0) {
                $hasNeg = true;
            }
        }
        if (! $hasPos || ! $hasNeg) {
            return null;
        }

        // Bisection over a generous but finite band: ~0% .. 1000% per 30-day period.
        //
        // NOTE ON DIRECTION: for a lender's cashflow stream (+ at t0, − later),
        // NPV is monotonically *increasing* in the discount rate — a higher rate
        // discounts the repayments away harder. So NPV > 0 ⇒ the root rate is
        // LOWER, and we must move `hi` down. Getting this backwards silently
        // converges to the upper bound (the 3.1e14% garbage APR).
        $lo = '0.0000000000000001';
        $hi = '10.0000000000000000';
        $npvLo = $npv($lo);
        $npvHi = $npv($hi);
        if (self::comp($npvLo, '0', self::INTERMEDIATE_SCALE) === self::comp($npvHi, '0', self::INTERMEDIATE_SCALE)) {
            return null; // no bracket → no root
        }

        $mid = $lo;
        for ($i = 0; $i < 200; $i++) {
            $mid = bcdiv(bcadd($lo, $hi, self::INTERMEDIATE_SCALE), '2', self::INTERMEDIATE_SCALE);
            $v = $npv($mid);

            if (self::comp($v, '0', self::INTERMEDIATE_SCALE) > 0) {
                $hi = $mid;   // still profitable at this rate → true IRR is lower
            } else {
                $lo = $mid;   // unprofitable → true IRR is higher
            }
            // Converged to sub-paise precision.
            if (self::comp(bcsub($hi, $lo, self::INTERMEDIATE_SCALE), '0.000000001', self::INTERMEDIATE_SCALE) <= 0) {
                break;
            }
        }

        // Annualise: (1 + r_month) ^ 12 − 1  → effective, compounding-correct.
        $onePlus = bcadd('1', $mid, self::INTERMEDIATE_SCALE);
        $annual = bcsub(bcpow($onePlus, '12', self::INTERMEDIATE_SCALE), '1', self::INTERMEDIATE_SCALE);
        $pct = bcmul($annual, '100', self::INTERMEDIATE_SCALE);

        return self::roundHalfUp($pct, self::LEDGER_SCALE);
    }

    /**
     * (1 + x) ^ y for a *fractional* exponent y, using BCMath only.
     * Series expansion of exp(y * ln(1+x)) — converges fast for the small
     * rates used in loan discounting (x < 1).
     */
    private static function powDecimal(string $base, string $exponent): string
    {
        // Fast path: integral exponent.
        if (! str_contains($exponent, '.')) {
            return bcpow($base, $exponent, self::INTERMEDIATE_SCALE);
        }

        $x = self::sub($base, '1', self::INTERMEDIATE_SCALE);

        // ln(1+x) via atanh series: 2*(z + z^3/3 + z^5/5 + ...), z = x/(2+x)
        $z = self::div($x, self::add('2', $x, self::INTERMEDIATE_SCALE), self::INTERMEDIATE_SCALE);
        $z2 = self::mul($z, $z, self::INTERMEDIATE_SCALE);
        $ln = '0';
        $term = $z;
        for ($k = 1; $k <= 60; $k += 2) {
            $ln = bcadd($ln, bcdiv($term, (string) $k, self::INTERMEDIATE_SCALE), self::INTERMEDIATE_SCALE);
            $term = self::mul($term, $z2, self::INTERMEDIATE_SCALE);
            if (self::comp(self::abs($term, self::INTERMEDIATE_SCALE), '0.000000000000001', self::INTERMEDIATE_SCALE) < 0) {
                break;
            }
        }
        $ln = bcmul($ln, '2', self::INTERMEDIATE_SCALE);

        // exp(y*ln) via Taylor series.
        $e = self::mul($exponent, $ln, self::INTERMEDIATE_SCALE);
        $sum = '1';
        $fact = '1';
        $powE = '1';
        for ($i = 1; $i <= 60; $i++) {
            $powE = self::mul($powE, $e, self::INTERMEDIATE_SCALE);
            $fact = bcmul($fact, (string) $i, 0);
            $termI = bcdiv($powE, $fact, self::INTERMEDIATE_SCALE);
            $sum = bcadd($sum, $termI, self::INTERMEDIATE_SCALE);
            if (self::comp(self::abs($termI, self::INTERMEDIATE_SCALE), '0.000000000000001', self::INTERMEDIATE_SCALE) < 0) {
                break;
            }
        }

        return $sum;
    }
}
