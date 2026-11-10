<?php

declare(strict_types=1);

namespace App\Services;

use App\Services\BcMathCalculator as C;

/**
 * RBI IRACP Asset Classification & Provisioning Engine.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS REPLACES mapDpdToRbiAssetClass()
 *
 * The original method returned a single "provision %" per DPD bucket:
 *
 *     0-90d → STANDARD 1%   |  91-365d → SUB-STANDARD 15%
 *     366-730d → DOUBTFUL-1 50%  |  >730d → LOSS 100%
 *
 * Three things are wrong with that under RBI's NBFC Directions:
 *
 * 1. DOUBTFUL IS SPLIT BY SECURITY. RBI requires 100% on the UNSECURED
 *    portion and only 20%/30%/50% (or 25/40/100 under the newer IRACP) on the
 *    SECURED portion. A single blended rate cannot be right for both a
 *    collateral-free JLG loan and a gold loan — yet MFI books contain both.
 *
 * 2. THE DOUBTFUL CLOCK STARTS AT NPA, NOT AT DISBURSEMENT. Doubtful-1 means
 *    "in the sub-standard bucket for up to 12 months", i.e. DPD 91→455,
 *    not "DPD 366→730". The old ladder provisioned too little for far too long.
 *
 * 3. SUB-STANDARD IS 10%, NOT 15%, plus an extra 10% if unsecured.
 *
 * This engine takes DPD plus the realisable security value and returns the
 * exact provision, the exact asset class, and a per-bucket portfolio roll-up
 * that ties to the trial balance.
 * ─────────────────────────────────────────────────────────────────────────────
 */
final class RbiProvisioningEngine
{
    /** RBI: NPA at 90 days past due (uniform for all NBFC layers from 31-03-2026). */
    public const NPA_DPD = 90;

    /** Sub-standard ends after 18 months in NPA (IRACP 2025 wording). */
    public const SUBSTANDARD_MAX_NPA_MONTHS = 18;

    /**
     * Classify one loan.
     *
     * @param  int  $dpd  days past due
     * @param  string  $outstanding  total principal outstanding (decimal string)
     * @param  string  $securityValue  realisable value of security; '0.00' for unsecured (JLG)
     * @param  array{
     *     standard_rate_pct?: string,
     *     unsecured_substandard_extra_pct?: string
     * }  $policy
     * @return array{
     *     dpd:int, asset_class:string, is_npa:bool,
     *     secured_portion:string, unsecured_portion:string,
     *     provision:string, provision_rate_pct:string, rationale:string
     * }
     */
    public function classifyLoan(
        int $dpd,
        string $outstanding,
        string $securityValue = '0.00',
        array $policy = []
    ): array {
        $os = C::money($outstanding);
        $sec = C::money($securityValue);

        // Security can never exceed the exposure — a gold loan's collateral is
        // capped at what is actually owed.
        $secured = C::min($sec, $os);
        $unsecured = C::max('0.00', C::sub($os, $secured, C::LEDGER_SCALE));

        $standardRate = C::normalize((string) ($policy['standard_rate_pct'] ?? '0.25'), C::INTERMEDIATE_SCALE);
        $unsecuredExtra = C::normalize((string) ($policy['unsecured_substandard_extra_pct'] ?? '10.00'), C::INTERMEDIATE_SCALE);

        // ── Standard & SMA: no NPA provision, just the flat standard-asset rate.
        if ($dpd <= self::NPA_DPD) {
            $cls = match (true) {
                $dpd <= 0 => 'STANDARD',
                $dpd <= 30 => 'SMA-0',
                $dpd <= 60 => 'SMA-1',
                default => 'SMA-2',
            };
            $prov = C::percentageOf($os, $standardRate);

            return [
                'dpd' => $dpd,
                'asset_class' => $cls,
                'is_npa' => false,
                'secured_portion' => $secured,
                'unsecured_portion' => $unsecured,
                'provision' => $prov,
                'provision_rate_pct' => $standardRate,
                'rationale' => "{$cls}: standard-asset provision @ {$standardRate}% of ₹{$os}",
            ];
        }

        // ── NPA territory. Months elapsed since the account BECAME an NPA.
        $npaDays = $dpd - self::NPA_DPD;
        $npaMonths = intdiv($npaDays, 30);

        if ($npaMonths <= self::SUBSTANDARD_MAX_NPA_MONTHS) {
            // SUB-STANDARD: 10% general on the whole outstanding, plus an extra
            // 10% specifically on the unsecured slice (i.e. 20% there).
            $base = C::percentageOf($os, '10.00');
            $extra = C::percentageOf($unsecured, $unsecuredExtra);
            $prov = C::add($base, $extra, C::LEDGER_SCALE);

            return [
                'dpd' => $dpd,
                'asset_class' => 'SUB-STANDARD',
                'is_npa' => true,
                'secured_portion' => $secured,
                'unsecured_portion' => $unsecured,
                'provision' => $prov,
                'provision_rate_pct' => C::comp($os, '0.00') > 0
                    ? C::roundHalfUp(C::mul(C::div($prov, $os, C::INTERMEDIATE_SCALE), '100', C::INTERMEDIATE_SCALE), C::LEDGER_SCALE)
                    : '0.00',
                'rationale' => "SUB-STANDARD ({$npaMonths} months in NPA): 10% of ₹{$os} + {$unsecuredExtra}% of unsecured ₹{$unsecured}",
            ];
        }

        // ── DOUBTFUL: 100% of the unsecured slice ALWAYS, plus a time-scaled
        // rate on the secured slice. The clock starts in the doubtful bucket.
        $doubtfulDays = $npaDays - (self::SUBSTANDARD_MAX_NPA_MONTHS * 30);
        $doubtfulMonths = intdiv(max(0, $doubtfulDays), 30);

        // RBI Master Direction 14.1 / IRACP: up to 1 year 25%, 1–3 years 40%,
        // beyond 3 years 100% on the secured portion.
        if ($doubtfulMonths <= 12) {
            $cls = 'DOUBTFUL-1';
            $secRate = '25.00';
        } elseif ($doubtfulMonths <= 36) {
            $cls = 'DOUBTFUL-2';
            $secRate = '40.00';
        } else {
            $cls = 'DOUBTFUL-3';
            $secRate = '100.00';
        }

        $provUnsecured = C::percentageOf($unsecured, '100.00');
        $provSecured = C::percentageOf($secured, $secRate);
        $prov = C::add($provUnsecured, $provSecured, C::LEDGER_SCALE);

        return [
            'dpd' => $dpd,
            'asset_class' => $cls,
            'is_npa' => true,
            'secured_portion' => $secured,
            'unsecured_portion' => $unsecured,
            'provision' => $prov,
            'provision_rate_pct' => C::comp($os, '0.00') > 0
                ? C::roundHalfUp(C::mul(C::div($prov, $os, C::INTERMEDIATE_SCALE), '100', C::INTERMEDIATE_SCALE), C::LEDGER_SCALE)
                : '0.00',
            'rationale' => "{$cls} ({$doubtfulMonths} months doubtful): 100% of unsecured ₹{$unsecured} + {$secRate}% of secured ₹{$secured}",
        ];
    }

    /**
     * Roll a whole portfolio up into RBI buckets, with a provision that ties out.
     *
     * @param  iterable<array{dpd:int,outstanding:string,security_value?:string}>  $loans
     * @return array<string,mixed>
     */
    public function classifyPortfolio(iterable $loans, array $policy = []): array
    {
        $buckets = [];
        foreach (['STANDARD','SMA-0','SMA-1','SMA-2','SUB-STANDARD','DOUBTFUL-1','DOUBTFUL-2','DOUBTFUL-3'] as $b) {
            $buckets[$b] = ['count' => 0, 'outstanding' => '0.00', 'secured' => '0.00',
                'unsecured' => '0.00', 'provision' => '0.00'];
        }

        $totalOut = '0.00';
        $totalProv = '0.00';
        $npaOut = '0.00';
        $npaProv = '0.00';
        $par30 = '0.00';
        $par90 = '0.00';

        foreach ($loans as $loan) {
            $r = $this->classifyLoan(
                (int) ($loan['dpd']),
                (string) ($loan['outstanding'] ?? '0'),
                (string) ($loan['security_value'] ?? '0.00'),
                $policy
            );

            $b = &$buckets[$r['asset_class']];
            $b['count']++;
            $b['outstanding'] = C::add($b['outstanding'], C::money((string) ($loan['outstanding'] ?? '0')), C::LEDGER_SCALE);
            $b['secured'] = C::add($b['secured'], $r['secured_portion'], C::LEDGER_SCALE);
            $b['unsecured'] = C::add($b['unsecured'], $r['unsecured_portion'], C::LEDGER_SCALE);
            $b['provision'] = C::add($b['provision'], $r['provision'], C::LEDGER_SCALE);
            unset($b);

            $os = C::money((string) ($loan['outstanding'] ?? '0'));
            $totalOut = C::add($totalOut, $os, C::LEDGER_SCALE);
            $totalProv = C::add($totalProv, $r['provision'], C::LEDGER_SCALE);

            if ((int) ($loan['dpd']) > 30) {
                $par30 = C::add($par30, $os, C::LEDGER_SCALE);
            }
            if ((int) ($loan['dpd']) > self::NPA_DPD) {
                $par90 = C::add($par90, $os, C::LEDGER_SCALE);
            }
            if ($r['is_npa']) {
                $npaOut = C::add($npaOut, $os, C::LEDGER_SCALE);
                $npaProv = C::add($npaProv, $r['provision'], C::LEDGER_SCALE);
            }
        }

        $pct = static function (string $num, string $den): string {
            if (C::comp($den, '0.00') <= 0) {
                return '0.00';
            }

            return C::roundHalfUp(C::mul(C::div($num, $den, C::INTERMEDIATE_SCALE), '100', C::INTERMEDIATE_SCALE), C::LEDGER_SCALE);
        };

        return [
            'buckets' => $buckets,
            'totals' => [
                'portfolio_outstanding' => $totalOut,
                'provision_required' => $totalProv,
                'npa_outstanding' => $npaOut,
                'npa_provision' => $npaProv,
                'gross_npa_pct' => $pct($npaOut, $totalOut),
                'provision_coverage_pct' => $pct($npaProv, $npaOut),
                'par30_pct' => $pct($par30, $totalOut),
                'par90_pct' => $pct($par90, $totalOut),
                'net_npa' => C::max('0.00', C::sub($npaOut, $npaProv, C::LEDGER_SCALE)),
            ],
        ];
    }
}
