<?php

declare(strict_types=1);

namespace App\Services;

use App\Services\BcMathCalculator as C;
use InvalidArgumentException;

/**
 * Pre-Settlement / Foreclosure / NPA Engine — paisa-exact.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * The original implementation (LoanController::settlementPreview) simply added:
 *
 *     principal_outstanding + penalty_due + 3% of principal_outstanding
 *
 * and returned `interest_waived = interest_outstanding`. That is wrong in four
 * separate ways, each of which costs somebody real money on a real loan book:
 *
 *   1. NO INTEREST ACCRUAL SINCE LAST EMI. A member who prepays 20 days after
 *      their last due date owes interest for those 20 days. The old formula
 *      charged zero. On a ₹5,00,000 loan at 18% that is ₹246 of unrecovered
 *      income — silently, on every single early closure.
 *
 *   2. INTEREST WAIVED, NOT EARNED. For a REDUCING loan, only FUTURE interest
 *      is waived. The old code waived `interest_outstanding` but never checked
 *      whether part of it had already accrued and was contractually due.
 *
 *   3. PENALTY WAS NOT CAPPED OR GRACED consistently with the collection
 *      engine, so settlement and collection could disagree about the same loan.
 *
 *   4. NO GST ON THE FORECLOSURE CHARGE. A foreclosure/pre-closing fee is a
 *      service under SAC 997212 and attracts 18% GST. Charging ₹3,000 and
 *      remitting nothing to the government is a tax liability, not a rounding
 *      issue.
 *
 * This engine is deliberately PURE: no database, no clock, no config lookups
 * other than what is passed in. That is what makes it testable to the paisa —
 * and it is the only way an auditor can reproduce a settlement figure after
 * the fact.
 * ─────────────────────────────────────────────────────────────────────────────
 */
final class PreSettlementEngine
{
    /** RBI hard rule: an account is NPA at 90 days past due. */
    public const NPA_DPD_THRESHOLD = 90;

    /**
     * Build the full amortisation-derived prepayment quote.
     *
     * @param  array{
     *     loan_id?: string,
     *     plan_amount: string,
     *     interest_rate_pa: string,
     *     annual_days?: string,
     *     disbursement_date: string,
     *     settlement_date: string,
     *     installment_amounts: array<int,array{
     *         emi_no:int, due_date:string, emi_amount:string,
     *         principal_component:string, interest_component:string,
     *         paid_amount?:string, penalty_paid?:string, paid_date?:string
     *     }>,
     *     foreclosure_charge_pct?: string,
     *     foreclosure_charge_flat?: string,
     *     foreclosure_charge_gst_pct?: string,
     *     penalty_due?: string,
     *     allow_interest_rebate?: bool,
     *     rebate_pct?: string,
     *     waiver: array{principal?:string, interest?:string, penalty?:string, charge?:string, reason?:string},
     *     write_off: bool
     * }  $loan
     * @return array<string,mixed>
     */
    public function quote(array $loan): array
    {
        $planAmount = C::money((string) ($loan['plan_amount']));
        if (C::comp($planAmount, '0.00') <= 0) {
            throw new InvalidArgumentException('plan_amount must be greater than zero.');
        }

        $ratePa = C::normalize((string) ($loan['interest_rate_pa']), C::INTERMEDIATE_SCALE);
        $annualDays = C::normalize((string) ($loan['annual_days'] ?? '365'), C::INTERMEDIATE_SCALE);

        $settleDateStr = substr((string) ($loan['settlement_date']), 0, 10);
        $settleDt = new \DateTimeImmutable($settleDateStr);
        $disbDateStr = substr((string) ($loan['disbursement_date']), 0, 10);

        $installments = $loan['installment_amounts'];
        if ($installments === []) {
            throw new InvalidArgumentException('installment_amounts cannot be empty.');
        }
        usort($installments, static fn (array $a, array $b): int => ($a['emi_no']) <=> ($b['emi_no']));

        $waiver = $loan['waiver'];
        $wPrin = C::money((string) ($waiver['principal'] ?? '0'));
        $wInt = C::money((string) ($waiver['interest'] ?? '0'));
        $wPen = C::money((string) ($waiver['penalty'] ?? '0'));
        $wChg = C::money((string) ($waiver['charge'] ?? '0'));
        $writeOff = (bool) ($loan['write_off']);

        // ── 1. Split the schedule into PAID and UNPAID, on a to-the-paisa basis.
        $unpaidPrincipal = '0.00';
        $unpaidInterest = '0.00';
        $statedEmi = '0.00';
        $lastSettledDate = $disbDateStr;
        $lastSettledEmiNo = 0;

        $paidPrincipal = '0.00';
        $paidInterest = '0.00';
        $accruedInterestTotal = '0.00';

        foreach ($installments as $inst) {
            $emiAmt = C::money((string) ($inst['emi_amount']));
            $prinComp = C::money((string) ($inst['principal_component']));
            $intComp = C::money((string) ($inst['interest_component']));
            $paid = C::money((string) ($inst['paid_amount'] ?? '0'));
            $dueDate = substr((string) ($inst['due_date']), 0, 10);
            $paidDate = isset($inst['paid_date']) && $inst['paid_date'] ? substr((string) $inst['paid_date'], 0, 10) : null;

            if ($statedEmi === '0.00') {
                $statedEmi = $emiAmt;
            }

            $fullyPaid = C::comp($paid, $emiAmt) >= 0;

            if ($fullyPaid) {
                $paidPrincipal = C::add($paidPrincipal, $prinComp, 2);
                $paidInterest = C::add($paidInterest, $intComp, 2);
                // Interest is EARNED when the EMI falls due, not when it is paid.
                // A member who pays a 2026-04-01 EMI on 2026-04-20 has still been
                // charged interest up to 04-01 only; anything later is broken-period.
                if ($dueDate <= $settleDateStr) {
                    $accruedInterestTotal = C::add($accruedInterestTotal, $intComp, 2);
                }
                $candidate = $paidDate ?? $dueDate;
                if ($candidate > $lastSettledDate) {
                    $lastSettledDate = $candidate;
                }
                $lastSettledEmiNo = max($lastSettledEmiNo, (int) ($inst['emi_no']));
            } else {
                $unpaidPrincipal = C::add($unpaidPrincipal, $prinComp, 2);
                $unpaidInterest = C::add($unpaidInterest, $intComp, 2);
            }
        }

        // ── 2. Interest for the broken period since the last settled due date.
        //
        // This is the money the old formula silently gave away. Interest accrues
        // on the outstanding principal for the days actually elapsed, at the
        // contract rate, using the SAME day-count convention as the schedule
        // (365 for monthly products) so that a settlement can never disagree
        // with the amortisation it is closing out.
        $brokenPeriodDays = 0;
        $brokenPeriodInterest = '0.00';
        $lastSettledDt = new \DateTimeImmutable($lastSettledDate);
        if ($settleDt > $lastSettledDt) {
            $brokenPeriodDays = (int) $lastSettledDt->diff($settleDt)->days;
        }

        if ($brokenPeriodDays > 0 && C::comp($unpaidPrincipal, '0.00') > 0) {
            // dailyRate = ratePa / 100 / annualDays
            $dailyRate = C::div(
                C::div($ratePa, '100', C::INTERMEDIATE_SCALE),
                $annualDays,
                C::INTERMEDIATE_SCALE
            );
            $brokenPeriodInterest = C::roundHalfUp(
                C::mul(
                    C::mul($unpaidPrincipal, $dailyRate, C::INTERMEDIATE_SCALE),
                    (string) $brokenPeriodDays,
                    C::INTERMEDIATE_SCALE
                ),
                C::LEDGER_SCALE
            );
        }

        // ── 3. Principal and interest payable today.
        $closingPrincipal = $unpaidPrincipal;

        // Interest due = unpaid scheduled interest + broken-period accrual.
        // Unpaid scheduled interest beyond today's date is FUTURE interest and
        // is waived by definition on a foreclosure; only what has already
        // accrued is collected.
        $accruedUnpaidScheduled = '0.00';
        foreach ($installments as $inst) {
            $emiAmt = C::money((string) ($inst['emi_amount']));
            $paid = C::money((string) ($inst['paid_amount'] ?? '0'));
            if (C::comp($paid, $emiAmt) >= 0) {
                continue;
            }
            $dueDate = substr((string) ($inst['due_date']), 0, 10);
            if ($dueDate <= $settleDateStr) {
                $accruedUnpaidScheduled = C::add(
                    $accruedUnpaidScheduled,
                    C::money((string) ($inst['interest_component'])),
                    C::LEDGER_SCALE
                );
            }
        }

        $interestDue = C::add($accruedUnpaidScheduled, $brokenPeriodInterest, C::LEDGER_SCALE);
        $futureInterestWaivedOff = C::max('0.00', C::sub($unpaidInterest, $accruedUnpaidScheduled, C::LEDGER_SCALE));

        // ── 4. Foreclosure charge + GST.
        $chargePct = C::normalize((string) ($loan['foreclosure_charge_pct'] ?? '0'), C::INTERMEDIATE_SCALE);
        $chargeFlat = C::money((string) ($loan['foreclosure_charge_flat'] ?? '0'));
        $baseCharge = C::comp($chargePct, '0') > 0
            ? C::percentageOf($closingPrincipal, $chargePct)
            : $chargeFlat;

        $allowRebate = (bool) ($loan['allow_interest_rebate'] ?? false);
        $rebatePct = C::normalize((string) ($loan['rebate_pct'] ?? '0'), C::INTERMEDIATE_SCALE);
        $rebate = $allowRebate && C::comp($rebatePct, '0') > 0
            ? C::percentageOf($baseCharge, $rebatePct)
            : '0.00';
        $netCharge = C::max('0.00', C::sub($baseCharge, $rebate, C::LEDGER_SCALE));

        $gstPct = C::normalize((string) ($loan['foreclosure_charge_gst_pct'] ?? '18.00'), C::INTERMEDIATE_SCALE);
        $gstOnCharge = C::percentageOf($netCharge, $gstPct);

        // ── 5. Penalty.
        $penaltyDue = C::money((string) ($loan['penalty_due'] ?? '0'));

        // ── 6. Waivers (management-approved, logged).
        $waivedPrincipal = C::min($wPrin, $closingPrincipal);
        $waivedInterest = C::min($wInt, $interestDue);
        $waivedPenalty = C::min($wPen, $penaltyDue);
        $waivedCharge = C::min($wChg, $netCharge);

        $payablePrincipal = C::max('0.00', C::sub($closingPrincipal, $waivedPrincipal, C::LEDGER_SCALE));
        $payableInterest = C::max('0.00', C::sub($interestDue, $waivedInterest, C::LEDGER_SCALE));
        $payablePenalty = C::max('0.00', C::sub($penaltyDue, $waivedPenalty, C::LEDGER_SCALE));
        $payableCharge = C::max('0.00', C::sub($netCharge, $waivedCharge, C::LEDGER_SCALE));

        // GST is charged on the charge actually collected, so a charge waiver
        // must not leave a GST liability on money nobody paid.
        $payableGst = C::percentageOf($payableCharge, $gstPct);

        $totalBeforeRounding = C::add(
            C::add($payablePrincipal, $payableInterest, C::LEDGER_SCALE),
            C::add($payablePenalty, C::add($payableCharge, $payableGst, C::LEDGER_SCALE), C::LEDGER_SCALE),
            C::LEDGER_SCALE
        );
        $totalPayable = C::money($totalBeforeRounding);

        // ── 7. The posting breakdown. Debits must equal credits exactly.
        //
        // Debit  : Cash / Bank                       totalPayable
        // Debit  : Interest Rebate (expense)         futureInterestWaived + waivedInterest
        // Debit  : Penalty Waived (expense)          waivedPenalty
        // Debit  : Charge Waived (expense)           waivedCharge
        // Debit  : Principal Waived (expense/write-off) waivedPrincipal
        // Credit : Loan Portfolio (principal)        closingPrincipal
        // Credit : Interest Receivable               interestDue
        // Credit : Penalty Receivable                penaltyDue
        // Credit : Foreclosure Charge Income         netCharge
        // Credit : GST Output Liability              payableGst
        $totalWaived = C::add(
            C::add($waivedPrincipal, $waivedInterest, C::LEDGER_SCALE),
            C::add($waivedPenalty, $waivedCharge, C::LEDGER_SCALE),
            C::LEDGER_SCALE
        );

        // NOTE: future un-earned interest is deliberately NOT journalled.
        // It was never recognised as income (it sits in the schedule, not in
        // mfi_loans.interest_outstanding), so reversing it would invent an
        // expense out of nothing and unbalance the entry. It is disclosed in
        // the quote as `future_waived_off` for the member's benefit only.
        $debitTotal = C::add($totalPayable, $totalWaived, C::LEDGER_SCALE);
        $creditTotal = C::add(
            C::add($closingPrincipal, $interestDue, C::LEDGER_SCALE),
            C::add($penaltyDue, C::add($netCharge, $payableGst, C::LEDGER_SCALE), C::LEDGER_SCALE),
            C::LEDGER_SCALE
        );

        // Because waivedCharge reduces both the credit (netCharge is already
        // net of rebate) and the debit side identically, the books balance.
        // If they ever diverge, refuse to quote rather than post a broken entry.
        if (C::comp($debitTotal, $creditTotal, C::LEDGER_SCALE) !== 0) {
            throw new \RuntimeException(
                "Settlement voucher would not balance: debits ₹{$debitTotal} vs credits ₹{$creditTotal}."
            );
        }

        // ── 8. DPD / NPA classification as of settlement date.
        $dpd = $this->daysPastDue($installments, $settleDateStr);
        $classification = $this->classify($dpd);

        return [
            'loan_id' => (string) ($loan['loan_id'] ?? ''),
            'settlement_date' => $settleDateStr,
            'write_off' => $writeOff,

            'opening' => [
                'plan_amount' => $planAmount,
                'stated_emi' => $statedEmi,
                'last_settled_date' => $lastSettledDate,
                'last_settled_emi_no' => $lastSettledEmiNo,
            ],

            'principal' => [
                'unpaid' => $closingPrincipal,
                'paid_till_date' => $paidPrincipal,
                'waived' => $waivedPrincipal,
                'payable' => $payablePrincipal,
            ],

            'interest' => [
                'accrued_till_settlement' => $interestDue,
                'unpaid_scheduled' => $accruedUnpaidScheduled,
                'broken_period_days' => $brokenPeriodDays,
                'broken_period_interest' => $brokenPeriodInterest,
                'future_waived_off' => $futureInterestWaivedOff,
                'paid_till_date' => $paidInterest,
                'waived' => $waivedInterest,
                'payable' => $payableInterest,
            ],

            'penalty' => [
                'due' => $penaltyDue,
                'waived' => $waivedPenalty,
                'payable' => $payablePenalty,
            ],

            'charges' => [
                'foreclosure_charge' => $baseCharge,
                'rebate' => $rebate,
                'net_charge' => $netCharge,
                'waived' => $waivedCharge,
                'payable' => $payableCharge,
                'gst_pct' => $gstPct,
                'gst_payable' => $payableGst,
            ],

            'total_payable' => $totalPayable,
            // Total relieved to the member = approved waivers + unearned future interest.
            'total_waived' => C::add($totalWaived, $futureInterestWaivedOff, C::LEDGER_SCALE),
            // ...but only this much actually hits the P&L as an expense.
            'total_waived_expensed' => $totalWaived,

            'risk' => [
                'dpd' => $dpd,
                'asset_class' => $classification['asset_class'],
                'is_npa' => $classification['is_npa'],
                'provision_rate_pct' => $classification['provision_rate_pct'],
                'provision_required' => C::percentageOf($closingPrincipal, $classification['provision_rate_pct']),
            ],

            'voucher' => [
                'debits' => [
                    ['ledger' => 'CASH / BANK', 'amount' => $totalPayable, 'narration' => 'Pre-settlement received'],
                    ['ledger' => 'INTEREST WAIVED (EXPENSE)', 'amount' => $waivedInterest, 'narration' => 'Approved waiver of accrued interest'],
                    ['ledger' => 'PENALTY WAIVED (EXPENSE)', 'amount' => $waivedPenalty, 'narration' => 'Penalty waiver'],
                    ['ledger' => 'FORECLOSURE CHARGE WAIVED (EXPENSE)', 'amount' => $waivedCharge, 'narration' => 'Charge waiver'],
                    ['ledger' => 'PRINCIPAL WRITTEN OFF (EXPENSE)', 'amount' => $waivedPrincipal, 'narration' => 'Principal waiver / write-off'],
                ],
                'credits' => [
                    ['ledger' => 'LOAN PORTFOLIO RECEIVABLE', 'amount' => $closingPrincipal, 'narration' => 'Principal closed out'],
                    ['ledger' => 'INTEREST RECEIVABLE', 'amount' => $interestDue, 'narration' => 'Interest accrued'],
                    ['ledger' => 'PENALTY & BOUNCE CHARGE INCOME', 'amount' => $penaltyDue, 'narration' => 'Penalty'],
                    ['ledger' => 'FORECLOSURE CHARGE INCOME', 'amount' => $netCharge, 'narration' => 'Foreclosure fee'],
                    ['ledger' => 'GST OUTPUT LIABILITY', 'amount' => $payableGst, 'narration' => 'GST @ '.$gstPct.'%'],
                ],
                'debit_total' => $debitTotal,
                'credit_total' => $creditTotal,
                'balanced' => true,
            ],

            'waiver_reason' => (string) ($waiver['reason'] ?? ''),
            'explain' => $this->explain($settleDateStr, $brokenPeriodDays, $brokenPeriodInterest,
                $accruedUnpaidScheduled, $futureInterestWaivedOff, $baseCharge, $payableGst, $totalPayable),
        ];
    }

    /** DPD from the oldest unsettled installment that has actually fallen due. */
    public function daysPastDue(array $installments, string $asOfDate): int
    {
        $oldest = null;
        foreach ($installments as $inst) {
            $emiAmt = C::money((string) ($inst['emi_amount']));
            $paid = C::money((string) ($inst['paid_amount'] ?? '0'));
            if (C::comp($paid, $emiAmt) >= 0) {
                continue; // settled
            }
            $dueDate = substr((string) ($inst['due_date'] ?? $asOfDate), 0, 10);
            if ($dueDate > $asOfDate) {
                continue; // not yet due
            }
            if ($oldest === null || $dueDate < $oldest) {
                $oldest = $dueDate;
            }
        }

        if ($oldest === null) {
            return 0;
        }

        $d = (int) (new \DateTimeImmutable($oldest))->diff(new \DateTimeImmutable($asOfDate))->days;

        return max(0, $d);
    }

    /**
     * RBI IRACP classification.
     *
     * Delegates to RbiProvisioningEngine — the single source of truth for the
     * DPD ladder. Previously this method carried its own hand-copied ladder
     * (10/20/30/100%) which disagreed with CollectionsNpaService (15/50%) and
     * with the RBI IRACP table. Three engines, three answers for the same loan
     * is an audit finding waiting to happen.
     *
     * @return array{asset_class:string, is_npa:bool, provision_rate_pct:string}
     */
    public function classify(int $dpd): array
    {
        // Pass a dummy outstanding of 100 so the provision RATE (not the amount)
        // is computed correctly. classify() only needs the rate, not the amount,
        // and passing '0.00' would make every rate come out as 0.00.
        $c = (new \App\Services\RbiProvisioningEngine())->classifyLoan(
            $dpd,
            '100.00',
            '0.00'
        );

        return [
            'asset_class' => $c['asset_class'],
            'is_npa' => $c['is_npa'],
            // RbiProvisioningEngine returns the rate at full BCMath scale
            // (e.g. '20.0000000000000000'). Normalize to 2 dp for display.
            'provision_rate_pct' => \App\Services\BcMathCalculator::normalize(
                $c['provision_rate_pct'],
                \App\Services\BcMathCalculator::LEDGER_SCALE
            ),
        ];
    }

    /** Human-readable working, so a collection officer can defend the number. */
    private function explain(
        string $settleDate,
        int $brokenDays,
        string $brokenInterest,
        string $accruedScheduled,
        string $futureWaived,
        string $baseCharge,
        string $gst,
        string $total
    ): array {
        return [
            'As on '.$settleDate.':',
            "1. {$brokenDays} din ka broken-period interest = ₹{$brokenInterest} (outstanding principal × daily rate × din).",
            "2. Pehle se due tha ₹{$accruedScheduled} interest — wo collect hoga.",
            "3. Baaki ₹{$futureWaived} future interest waive ho gaya (contract ke hisaab se).",
            "4. Foreclosure charge ₹{$baseCharge} + GST ₹{$gst}.",
            "5. TOTAL ₹{$total} — 'principal + interest till date + charge + GST ± penalty'.",
        ];
    }
}
