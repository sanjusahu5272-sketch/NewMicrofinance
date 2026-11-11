<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\CreditScore;
use App\Models\Installment;
use App\Models\Member;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Member credit score / risk rating engine.
 *
 * CIBIL-style score 300–900 from repayment behaviour:
 *  - on-time repayment ratio (installments paid before due date)
 *  - average DPD (days past due)
 *  - bounce history (failed collections)
 *  - active loan load
 *  - relationship tenure
 *
 * Feature 2 of the new-feature batch (option 1).
 */
class CreditScoreService
{
    public const MIN_SCORE = 300;
    public const MAX_SCORE = 900;

    /**
     * Compute + persist a score for a member. Returns the CreditScore model.
     */
    public static function computeForMember(Member $member, bool $persist = true): CreditScore
    {
        $breakdown = self::buildBreakdown($member);
        $score = max(self::MIN_SCORE, min(self::MAX_SCORE, (int) round($breakdown['total'])));
        $band = self::bandFor($score);

        $record = new CreditScore([
            'tenant_code' => $member->tenant_code,
            'member_id' => $member->id,
            'member_code' => $member->member_code ?? '',
            'member_name' => $member->name ?? $member->member_name ?? '',
            'score' => $score,
            'rating_band' => $band,
            'source' => 'AUTO',
            'breakdown' => $breakdown,
            'computed_at' => now(),
        ]);

        if ($persist) {
            $record->save();
        }

        return $record;
    }

    /**
     * Manual override (admin only — enforced by controller).
     */
    public static function override(Member $member, int $score, string $reason = ''): CreditScore
    {
        $score = max(self::MIN_SCORE, min(self::MAX_SCORE, $score));
        $record = CreditScore::create([
            'tenant_code' => $member->tenant_code,
            'member_id' => $member->id,
            'member_code' => $member->member_code ?? '',
            'member_name' => $member->name ?? $member->member_name ?? '',
            'score' => $score,
            'rating_band' => self::bandFor($score),
            'source' => 'MANUAL',
            'breakdown' => ['reason' => $reason, 'manual_override' => true],
            'computed_at' => now(),
        ]);

        return $record;
    }

    public static function bandFor(int $score): string
    {
        if ($score < 450) {
            return 'LOW';        // high risk
        }
        if ($score < 600) {
            return 'MEDIUM';     // moderate risk
        }
        if ($score < 750) {
            return 'HIGH';       // low risk
        }
        return 'PREMIUM';        // best
    }

    /**
     * Scoring inputs and weighted total (0..900 achievable points).
     */
    public static function buildBreakdown(Member $member): array
    {
        $loanIds = DB::table('mfi_loans')
            ->where('member_id', $member->id)
            ->pluck('id')
            ->all();

        $empty = [
            'has_history' => false,
            'on_time_ratio' => null,
            'avg_dpd' => null,
            'bounce_count' => 0,
            'active_loans' => 0,
            'total_installments' => 0,
            'overdue_installments' => 0,
            'tenure_months' => 0,
            'components' => [
                'on_time' => 0,
                'dpd' => 0,
                'bounce' => 0,
                'load' => 0,
                'tenure' => 0,
            ],
            'total' => self::MIN_SCORE,
            'note' => 'No credit history yet.',
        ];

        if ($loanIds === []) {
            return $empty;
        }

        // Installments across the member's loans
        $installments = DB::table('mfi_installments')
            ->whereIn('loan_pk', $loanIds)
            ->get(['id', 'due_date', 'paid_date', 'dpd_days', 'status']);

        $total = $installments->count();
        if ($total === 0) {
            return $empty;
        }

        $paid = $installments->whereNotNull('paid_date');
        $onTime = 0;
        foreach ($paid as $i) {
            try {
                $paidDt = new \DateTimeImmutable((string) $i->paid_date);
                $dueDt = new \DateTimeImmutable((string) $i->due_date);
                if ($paidDt <= $dueDt) {
                    $onTime++;
                }
            } catch (Throwable) {
                // unparseable dates simply do not count as on-time
            }
        }
        $onTimeRatio = $onTime / $total;

        $avgDpd = (int) round(
            $installments->sum('dpd_days') / $total
        );

        $bounceCount = DB::table('mfi_emi_collections')
            ->whereIn('loan_pk', $loanIds)
            ->where('status', 'BOUNCED')
            ->count();

        $activeLoans = DB::table('mfi_loans')
            ->whereIn('id', $loanIds)
            ->whereIn('status', ['APPROVED', 'DISBURSED'])
            ->count();

        $firstLoan = DB::table('mfi_loans')
            ->whereIn('id', $loanIds)
            ->orderBy('application_date', 'asc')
            ->value('application_date');
        $tenureMonths = 0;
        if ($firstLoan !== null) {
            try {
                $tenureMonths = (int) max(0, (int) ((time() - (int) (new \DateTimeImmutable((string) $firstLoan))->getTimestamp()) / 86400) / 30);
            } catch (Throwable) {
                $tenureMonths = 0;
            }
        }

        // ── weighted components (sum ≤ ~600, added onto the 300 base) ──
        $onTimeScore = (int) round(($onTimeRatio) * 250);   // up to 250
        $dpdScore = $avgDpd < 5 ? 100 : ($avgDpd < 15 ? 70 : ($avgDpd < 30 ? 40 : 0));
        $bounceScore = match (true) {
            $bounceCount === 0 => 100,
            $bounceCount === 1 => 60,
            $bounceCount === 2 => 20,
            default => 0,
        };
        $loadScore = match (true) {
            $activeLoans === 0 => 0,
            $activeLoans <= 3 => 70,
            $activeLoans <= 5 => 50,
            default => 10,
        };
        $tenureScore = match (true) {
            $tenureMonths >= 12 => 70,
            $tenureMonths >= 6 => 40,
            default => 20,
        };

        $total = self::MIN_SCORE + $onTimeScore + $dpdScore + $bounceScore + $loadScore + $tenureScore;

        return [
            'has_history' => true,
            'on_time_ratio' => round($onTimeRatio, 4),
            'avg_dpd' => $avgDpd,
            'bounce_count' => $bounceCount,
            'active_loans' => $activeLoans,
            'total_installments' => $total,
            'overdue_installments' => $installments->where('dpd_days', '>', 0)->count(),
            'tenure_months' => $tenureMonths,
            'components' => [
                'on_time' => $onTimeScore,
                'dpd' => $dpdScore,
                'bounce' => $bounceScore,
                'load' => $loadScore,
                'tenure' => $tenureScore,
            ],
            'total' => $total,
        ];
    }
}
