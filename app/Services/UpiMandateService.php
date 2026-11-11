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
