<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Installment;
use App\Models\Loan;
use App\Models\Scopes\TenantScope;
use App\Models\UpiMandate;
use DomainException;
use Illuminate\Support\Facades\DB;

/**
 * UPI mandate lifecycle + auto-debit settlement — Feature 6.
 */
class UpiMandateService
{
    /**
     * Create a mandate at loan disbursement time (AutoPay / eNACH).
     *
     * Flow:
     *   1. Create mandate row (status PENDING, bank_ref generated)
     *   2. Send consent OTP to the member's mobile (SMS gateway)
     *   3. Consent verified via verifyConsent() → mandate ACTIVE
     *
     * @return array{mandate: UpiMandate, otp?: string}
     */
    public static function createAtDisbursement(Loan $loan, array $data): array
    {
        $type = strtoupper((string) ($data['mandate_type'] ?? 'AUTOPAY'));
        if (!in_array($type, ['AUTOPAY', 'ENACH'], true)) {
            throw new DomainException('mandate_type must be AUTOPAY or ENACH.');
        }
        if (!in_array($type, ['AUTOPAY', 'ENACH'], true)) {
            throw new DomainException('Invalid mandate type.');
        }

        $memberMobile = (string) ($data['mobile'] ?? $loan->mobile ?? '');
        if (!preg_match('/^[6-9]\d{9}$/', $memberMobile)) {
            throw new DomainException('Member mobile is required for consent OTP.');
        }

        $frequency = strtoupper((string) ($data['frequency'] ?? 'MONTHLY'));
        if (!in_array($frequency, ['WEEKLY', 'MONTHLY'], true)) {
            throw new DomainException('frequency must be WEEKLY or MONTHLY.');
        }

        $ref = self::generateRef((string) ($data['mandate_ref'] ?? ''));
        $bankRef = $type === 'ENACH'
            ? 'ENACH-' . strtoupper(substr(hash('sha256', $ref), 0, 8))
            : 'AUTOPAY-' . strtoupper(substr(hash('sha256', $ref), 0, 8));

        $mandate = UpiMandate::create([
            'tenant_code' => $loan->tenant_code,
            'member_id' => (int) ($data['member_id'] ?? $loan->member_id),
            'member_code' => (string) ($data['member_code'] ?? $loan->member_code),
            'member_name' => (string) ($data['member_name'] ?? $loan->member_name),
            'mobile' => preg_replace('/\D/', '', $memberMobile),
            'loan_id' => $loan->id,
            'mandate_ref' => $ref,
            'mandate_type' => $type,
            'mandate_status' => 'PENDING',
            'bank_ref' => $bankRef,
            'consent_ref' => 'CONSENT-' . strtoupper(substr(hash('sha256', $ref . 'consent'), 0, 10)),
            'bank_name' => (string) ($data['bank_name'] ?? ''),
            'account_last4' => substr((string) preg_replace('/\D/', '', (string) ($data['account_no'] ?? '')), -4),
            'upi_id' => (string) ($data['upi_id'] ?? ''),
            'frequency' => $frequency,
            'mandate_amount' => (float) ($data['mandate_amount'] ?? 0),
            'start_date' => $data['start_date'] ?? now()->toDateString(),
            'end_date' => $data['end_date'] ?? null,
            'next_debit_date' => self::nextDebitDate($frequency),
            'status' => 'ACTIVE', // mandate record active; bank consent pending
            'remark' => 'Created at disbursement',
        ]);

        // 2. Send consent OTP
        $otpResult = NotificationGatewayService::sendOtp($mandate->mobile);

        // Local dev: expose the OTP so the consent flow can be tested end to end.
        // Production (non-local driver) never returns the OTP.
        $otp = config('app.env') === 'local' ? (string) ($otpResult['otp'] ?? '') : '';

        return ['mandate' => $mandate, 'otp' => $otp];
    }

    /**
     * Send a fresh consent OTP for a mandate.
     */
    public static function sendConsentOtp(UpiMandate $mandate): array
    {
        if ($mandate->mandate_status === 'ACTIVE') {
            throw new DomainException('Mandate is already active.');
        }
        $otpResult = NotificationGatewayService::sendOtp($mandate->mobile);
        $otp = config('app.env') === 'local' ? (string) ($otpResult['otp'] ?? '') : '';

        return ['otp' => $otp, 'expires_in_minutes' => NotificationGatewayService::OTP_TTL_MINUTES];
    }

    /**
     * Verify consent OTP and activate the mandate.
     */
    public static function verifyConsent(UpiMandate $mandate, string $otp): UpiMandate
    {
        if ($mandate->mandate_status === 'ACTIVE') {
            throw new DomainException('Mandate is already active.');
        }
        if ($mandate->mandate_status === 'FAILED') {
            throw new DomainException('Mandate consent failed. Create a new mandate.');
        }

        $result = NotificationGatewayService::verifyOtp($mandate->mobile, $otp);
        if (!($result['valid'] ?? false)) {
            throw new DomainException((string) ($result['error'] ?? 'Invalid OTP.'));
        }

        $mandate->mandate_status = 'ACTIVE';
        $mandate->next_debit_date = $mandate->next_debit_date ?? self::nextDebitDate((string) $mandate->frequency);
        $mandate->save();

        return $mandate;
    }

    /**
     * Simulate bank-side mandate approval (sandbox/demo).
     */
    public static function approveByBank(UpiMandate $mandate): UpiMandate
    {
        if ($mandate->mandate_status !== 'PENDING') {
            throw new DomainException('Only PENDING mandates can be approved.');
        }
        $mandate->mandate_status = 'ACTIVE';
        $mandate->next_debit_date = $mandate->next_debit_date ?? self::nextDebitDate((string) $mandate->frequency);
        $mandate->save();

        return $mandate;
    }

    /**
     * Process a bank webhook event for a mandate.
     *
     * Events:
     *   mandate.status_updated   -> mandate_status ACTIVE/CANCELLED/FAILED
     *   mandate.debit_success    -> books collection, marks installment paid
     *   mandate.debit_failed     -> bounce handling (bounce_count, penalty)
     *
     * @return array result
     */
    public static function processWebhookEvent(string $event, array $payload): array
    {
        $mandateRef = (string) ($payload['mandate_ref'] ?? $payload['mandate_id'] ?? '');
        if ($mandateRef === '') {
            throw new DomainException('mandate_ref is required in webhook payload.');
        }

        $mandate = UpiMandate::query()
            ->where('mandate_ref', $mandateRef)
            ->orWhere('bank_ref', $mandateRef)
            ->first();
        if ($mandate === null) {
            throw new DomainException("Mandate '{$mandateRef}' not found.");
        }

        return match ($event) {
            'mandate.status_updated' => self::webhookStatusUpdated($mandate, $payload),
            'mandate.debit_success' => self::webhookDebitSuccess($mandate, $payload),
            'mandate.debit_failed' => self::webhookDebitFailed($mandate, $payload),
            default => throw new DomainException("Unknown webhook event '{$event}'."),
        };
    }

    private static function webhookStatusUpdated(UpiMandate $mandate, array $payload): array
    {
        $status = strtoupper((string) ($payload['status'] ?? ''));
        $map = [
            'ACTIVE' => 'ACTIVE',
            'CANCELLED' => 'CANCELLED',
            'FAILED' => 'FAILED',
        ];
        if (!isset($map[$status])) {
            throw new DomainException("Unsupported mandate status '{$status}' in webhook.");
        }

        $mandate->mandate_status = $map[$status];
        $mandate->save();

        return ['event' => 'mandate.status_updated', 'mandate_ref' => $mandate->mandate_ref, 'mandate_status' => $mandate->mandate_status];
    }

    private static function webhookDebitSuccess(UpiMandate $mandate, array $payload): array
    {
        return self::debit($mandate);
    }

    private static function webhookDebitFailed(UpiMandate $mandate, array $payload): array
    {
        $loan = Loan::query()->whereKey($mandate->loan_id)->first();
        if ($loan === null) {
            throw new DomainException('Mandate has no linked loan.');
        }

        DB::table('mfi_loans')
            ->where('id', $loan->id)
            ->increment('bounce_count');

        DB::table('mfi_emi_collections')->insert([
            'tenant_code' => $loan->tenant_code,
            'receipt_no' => 'RC-BOUNCE-WB-' . strtoupper(substr(hash('sha256', $mandate->mandate_ref . 'wb'), 0, 6)),
            'loan_pk' => $loan->id,
            'loan_id' => $loan->loan_id,
            'member_code' => $loan->member_code,
            'member_name' => $loan->member_name,
            'branch_name' => $loan->branch_name,
            'emi_no' => (int) ($payload['emi_no'] ?? 0),
            'amount' => (float) ($payload['amount'] ?? 0),
            'payment_date' => date('Y-m-d'),
            'payment_mode' => 'ENACH_DEBIT',
            'status' => 'BOUNCED',
            'bounced_at' => now()->toDateTimeString(),
            'bounce_reason' => (string) ($payload['reason'] ?? 'Debit failed via eNACH'),
            'remark' => 'Webhook mandate.debit_failed',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [
            'event' => 'mandate.debit_failed',
            'mandate_ref' => $mandate->mandate_ref,
            'loan_bounce_count' => (int) $loan->bounce_count + 1,
        ];
    }

    private static function nextDebitDate(string $frequency): string
    {
        return $frequency === 'WEEKLY'
            ? now()->addWeek()->toDateString()
            : now()->addMonth()->toDateString();
    }

    /**
     * Create a mandate. mandate_ref auto-generated if not provided.
     */
    public static function create(array $data): UpiMandate
    {
        if (empty(trim((string) ($data['member_id'] ?? '0'))) || (int) $data['member_id'] <= 0) {
            throw new DomainException('member_id is required.');
        }
        $mobile = preg_replace('/\D/', '', (string) ($data['mobile'] ?? ''));
        if (strlen($mobile) !== 10) {
            throw new DomainException('mobile must be a valid 10-digit Indian number.');
        }
        if (!in_array((string) ($data['frequency'] ?? 'MONTHLY'), ['WEEKLY', 'MONTHLY'], true)) {
            throw new DomainException('frequency must be WEEKLY or MONTHLY.');
        }

        $mandate = UpiMandate::create([
            'tenant_code' => (string) ($data['tenant_code'] ?? TenantScope::currentTenantCode()),
            'member_id' => (int) $data['member_id'],
            'member_code' => (string) ($data['member_code'] ?? ''),
            'member_name' => (string) ($data['member_name'] ?? ''),
            'mobile' => $mobile,
            'loan_id' => $data['loan_id'] ?? null,
            'mandate_ref' => self::generateRef((string) ($data['mandate_ref'] ?? '')),
            'bank_name' => (string) ($data['bank_name'] ?? ''),
            'account_last4' => substr((string) preg_replace('/\D/', '', (string) ($data['account_no'] ?? '')), -4),
            'upi_id' => (string) ($data['upi_id'] ?? ''),
            'frequency' => (string) $data['frequency'],
            'mandate_amount' => (float) ($data['mandate_amount'] ?? 0),
            'start_date' => $data['start_date'] ?? null,
            'end_date' => $data['end_date'] ?? null,
            'status' => 'ACTIVE',
            'remark' => (string) ($data['remark'] ?? ''),
        ]);

        return $mandate;
    }

    public static function transition(UpiMandate $mandate, string $target): UpiMandate
    {
        $valid = ['PAUSED', 'ACTIVE', 'CANCELLED', 'EXPIRED'];
        if (!in_array($target, $valid, true)) {
            throw new DomainException('Invalid status transition.');
        }
        $mandate->status = $target;
        $mandate->save();
        return $mandate;
    }

    /**
     * Execute one auto-debit against the mandate's loan.
     * Sets the installment paid and books a collection record.
     */
    public static function debit(UpiMandate $mandate): array
    {
        self::assertDebitable($mandate);

        $loan = Loan::query()->whereKey($mandate->loan_id)->first();
        if ($loan === null) {
            throw new DomainException('Mandate has no linked loan.');
        }

        $installment = Installment::query()
            ->where('loan_pk', $loan->id)
            ->whereIn('status', ['DUE', 'PENDING'])
            ->orderBy('emi_no')
            ->first();
        if ($installment === null) {
            throw new DomainException('No pending EMI to debit for this loan.');
        }

        $amount = (float) $installment->emi_amount;
        if ($mandate->mandate_amount > 0 && $amount > (float) $mandate->mandate_amount) {
            throw new DomainException('Installment amount exceeds mandate cap. Increase mandate_amount.');
        }

        // Book collection
        $receiptNo = 'RC-UPI-' . strtoupper(bin2hex(random_bytes(4)));
        DB::table('mfi_emi_collections')->insert([
            'tenant_code' => $loan->tenant_code,
            'receipt_no' => $receiptNo,
            'loan_pk' => $loan->id,
            'loan_id' => $loan->loan_id,
            'member_code' => $loan->member_code,
            'member_name' => $loan->member_name,
            'branch_name' => $loan->branch_name,
            'emi_no' => $installment->emi_no,
            'amount' => $amount,
            'principal_allocated' => $installment->principal_component ?? 0,
            'interest_allocated' => $installment->interest_component ?? 0,
            'payment_date' => now()->toDateString(),
            'payment_mode' => 'UPI_AUTO_DEBIT',
            'status' => 'SUCCESS',
            'remark' => 'UPI mandate auto-debit ' . $mandate->mandate_ref,
            'collected_by' => 'UPI-MANDATE',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Mark installment paid
        $installment->paid_date = now()->toDateString();
        $installment->paid_amount = $amount;
        $installment->status = 'PAID';
        $installment->dpd_days = 0;
        $installment->save();

        // Update loan totals
        $loan->total_collected = (float) $loan->total_collected + $amount;
        $loan->principal_outstanding = max(0, (float) $loan->principal_outstanding - (float) ($installment->principal_component ?? 0));
        $loan->save();

        // Mandate counters
        $mandate->debit_count = (int) $mandate->debit_count + 1;
        $mandate->last_debit_at = now();
        $mandate->save();

        // Auto-expire
        if ($mandate->end_date !== null && now()->greaterThanOrEqualTo($mandate->end_date)) {
            $mandate->status = 'EXPIRED';
            $mandate->save();
        }

        return [
            'receipt_no' => $receiptNo,
            'loan_id' => $loan->loan_id,
            'emi_no' => $installment->emi_no,
            'amount' => $amount,
            'mandate_ref' => $mandate->mandate_ref,
            'mandate_status' => $mandate->status,
        ];
    }

    private static function assertDebitable(UpiMandate $mandate): void
    {
        if ($mandate->status !== 'ACTIVE') {
            throw new DomainException("Mandate is {$mandate->status}. Only ACTIVE mandates can debit.");
        }
        if ($mandate->end_date !== null && now()->greaterThan($mandate->end_date)) {
            throw new DomainException('Mandate end date has passed.');
        }
        if ($mandate->loan_id === null) {
            throw new DomainException('Mandate must be linked to a loan to debit.');
        }
    }

    private static function generateRef(string $provided): string
    {
        if ($provided !== '') {
            return $provided;
        }
        return 'UM-' . strtoupper(bin2hex(random_bytes(6)));
    }
}
