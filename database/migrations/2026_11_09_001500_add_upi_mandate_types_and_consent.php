<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * AutoPay / eNACH mandate types & consent lifecycle on mfi_upi_mandates.
 * Adds mandate_type, mandate_status, bank_ref, consent_ref, next_debit_date.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('mfi_upi_mandates')) {
            return;
        }

        Schema::table('mfi_upi_mandates', function (Blueprint $table): void {
            if (!Schema::hasColumn('mfi_upi_mandates', 'mandate_type')) {
                $table->string('mandate_type', 16)->default('AUTOPAY')->after('status'); // AUTOPAY | ENACH
            }
            if (!Schema::hasColumn('mfi_upi_mandates', 'mandate_status')) {
                $table->string('mandate_status', 16)->default('PENDING')->after('mandate_type'); // PENDING|ACTIVE|CANCELLED|FAILED
            }
            if (!Schema::hasColumn('mfi_upi_mandates', 'bank_ref')) {
                $table->string('bank_ref', 120)->default('')->after('mandate_status'); // bank mandate reference
            }
            if (!Schema::hasColumn('mfi_upi_mandates', 'consent_ref')) {
                $table->string('consent_ref', 120)->default('')->after('bank_ref');
            }
            if (!Schema::hasColumn('mfi_upi_mandates', 'next_debit_date')) {
                $table->date('next_debit_date')->nullable()->after('consent_ref');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mfi_upi_mandates', function (Blueprint $table): void {
            $table->dropColumn(['mandate_type', 'mandate_status', 'bank_ref', 'consent_ref', 'next_debit_date']);
        });
    }
};
