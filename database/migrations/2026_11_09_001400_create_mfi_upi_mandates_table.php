<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * UPI auto-collection mandates (NACH-style) — Feature 6 of the new-feature batch.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('mfi_upi_mandates')) {
            Schema::create('mfi_upi_mandates', function (Blueprint $table): void {
                $table->id();
                $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
                $table->unsignedBigInteger('member_id')->index();
                $table->string('member_code', 64)->default('');
                $table->string('member_name', 120)->default('');
                $table->string('mobile', 32)->default('');
                $table->unsignedBigInteger('loan_id')->nullable()->index();
                $table->string('mandate_ref', 120)->unique();          // bank/UPI mandate reference
                $table->string('bank_name', 120)->default('');
                $table->string('account_last4', 8)->default('');
                $table->string('upi_id', 120)->default('');
                $table->string('frequency', 16)->default('MONTHLY');  // WEEKLY|MONTHLY
                $table->decimal('mandate_amount', 18, 2)->default(0.00); // per-debit cap
                $table->date('start_date')->nullable();
                $table->date('end_date')->nullable();
                $table->string('status', 16)->default('ACTIVE')->index(); // ACTIVE|PAUSED|CANCELLED|EXPIRED
                $table->unsignedInteger('debit_count')->default(0);
                $table->timestamp('last_debit_at')->nullable();
                $table->string('remark', 255)->default('');
                $table->timestamps();

                $table->index(['member_id', 'status'], 'mfi_upi_mandates_member_status_index');
                $table->index(['loan_id', 'status'], 'mfi_upi_mandates_loan_status_index');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('mfi_upi_mandates')) {
            Schema::drop('mfi_upi_mandates');
        }
    }
};
