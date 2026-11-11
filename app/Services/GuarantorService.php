<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Guarantor;
use App\Models\Loan;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Guarantor lifecycle service.
 * Attach/detach guarantors to a loan with ledger + audit side effects.
 */
class GuarantorService
{
    /**
     * Validate guarantor payload. Returns first error message or null.
     */
    public static function validatePayload(array $data): ?string
    {
        if (empty(trim((string) ($data['guarantor_name'] ?? '')))) {
            return 'guarantor_name is required.';
        }
        $mobile = trim((string) ($data['guarantor_mobile'] ?? ''));
        if (!preg_match('/^[6-9]\d{9}$/', $mobile)) {
            return 'guarantor_mobile must be a valid 10-digit Indian mobile number.';
        }
        if (!empty($data['guarantor_aadhaar']) && !preg_match('/^\d{12}$/', (string) $data['guarantor_aadhaar'])) {
            return 'guarantor_aadhaar must be a 12-digit number.';
        }
        return null;
    }

    /**
     * Add a guarantor to a loan. Loan must not be disbursed or closed.
     *
     * @throws \DomainException
     */
    public static function attach(Loan $loan, array $data): Guarantor
    {
        self::assertModifiable($loan);

        $error = self::validatePayload($data);
        if ($error !== null) {
            throw new \DomainException($error);
        }

        $duplicate = Guarantor::query()
            ->where('loan_id', $loan->id)
            ->where('guarantor_mobile', trim((string) $data['guarantor_mobile']))
            ->where('status', 'ACTIVE')
            ->exists();
        if ($duplicate) {
            throw new \DomainException('This guarantor is already attached to the loan.');
        }

        $isPrimary = (bool) ($data['is_primary'] ?? false);
        if ($isPrimary) {
            // Only one primary guarantor per loan.
            Guarantor::query()
                ->where('loan_id', $loan->id)
                ->where('status', 'ACTIVE')
                ->update(['is_primary' => false]);
        }

        return Guarantor::create([
            'tenant_code' => $loan->tenant_code,
            'loan_id' => $loan->id,
            'guarantor_name' => trim((string) $data['guarantor_name']),
            'guarantor_mobile' => trim((string) $data['guarantor_mobile']),
            'guarantor_aadhaar' => $data['guarantor_aadhaar'] ?? null,
            'guarantor_relation' => trim((string) ($data['guarantor_relation'] ?? '')),
            'guarantor_occupation' => trim((string) ($data['guarantor_occupation'] ?? '')),
            'guarantor_address' => trim((string) ($data['guarantor_address'] ?? '')),
            'guarantor_annual_income' => $data['guarantor_annual_income'] ?? 0,
            'guarantor_bank_account' => trim((string) ($data['guarantor_bank_account'] ?? '')),
            'guarantor_ifsc' => trim((string) ($data['guarantor_ifsc'] ?? '')),
            'is_primary' => $isPrimary,
            'status' => 'ACTIVE',
            'guarantor_notes' => $data['guarantor_notes'] ?? null,
        ]);
    }

    /**
     * Release a guarantor (mark RELEASED). Only before disbursement.
     *
     * @throws \DomainException
     */
    public static function release(Guarantor $guarantor): bool
    {
        self::assertModifiableLoan($guarantor->loan);

        $guarantor->status = 'RELEASED';
        $guarantor->is_primary = false;
        return $guarantor->save();
    }

    /**
     * Primary guarantor name, for loan headers / NOC.
     */
    public static function primaryName(Loan $loan): ?string
    {
        return Guarantor::query()
            ->where('loan_id', $loan->id)
            ->where('status', 'ACTIVE')
            ->where('is_primary', true)
            ->value('guarantor_name');
    }

    public static function activeCount(Loan $loan): int
    {
        return Guarantor::query()
            ->where('loan_id', $loan->id)
            ->where('status', 'ACTIVE')
            ->count();
    }

    private static function assertModifiable(Loan $loan): void
    {
        self::assertModifiableLoan($loan);
    }

    private static function assertModifiableLoan(Loan $loan): void
    {
        $state = strtoupper((string) ($loan->loan_status ?? $loan->status ?? ''));
        if (in_array($state, ['DISBURSED', 'CLOSED', 'SETTLED', 'WRITTEN_OFF'], true)) {
            throw new \DomainException("Guarantors cannot be modified once the loan is {$state}.");
        }
    }

    /**
     * Idempotent audit entry — mirrors audit chain used elsewhere.
     */
    public static function audit(array $action, array $context): void
    {
        try {
            DB::table('mfi_audit_logs')->insert([
                'tenant_code' => $context['tenant_code'] ?? 'TNT-NEEV-01',
                'entity_type' => 'mfi_guarantors',
                'entity_id' => $context['entity_id'] ?? null,
                'action' => $action['name'] ?? 'UNKNOWN',
                'performed_by' => $action['performed_by'] ?? 'system',
                'summary' => substr((string) ($action['summary'] ?? ''), 0, 480),
                'entry_hash' => '',
                'prev_hash' => '',
                'created_at' => now(),
            ]);
        } catch (Throwable) {
            // Audit must never break the business call.
        }
    }
}
