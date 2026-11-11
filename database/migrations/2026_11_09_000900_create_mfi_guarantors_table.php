<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Guarantor management for loans.
 * Feature 1 of the new-feature batch (option 1).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('mfi_guarantors')) {
            Schema::create('mfi_guarantors', function (Blueprint $table): void {
                $table->id();
                $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
                $table->unsignedBigInteger('loan_id')->index();
                $table->string('guarantor_name', 120);
                $table->string('guarantor_mobile', 32)->index();
                $table->string('guarantor_aadhaar', 64)->nullable();
                $table->string('guarantor_relation', 64)->default('');
                $table->string('guarantor_occupation', 64)->default('');
                $table->string('guarantor_address', 255)->default('');
                $table->decimal('guarantor_annual_income', 18, 2)->default(0.00);
                $table->string('guarantor_bank_account', 64)->default('');
                $table->string('guarantor_ifsc', 32)->default('');
                $table->boolean('is_primary')->default(false);
                $table->string('status', 32)->default('ACTIVE')->index(); // ACTIVE | RELEASED
                $table->text('guarantor_notes')->nullable();
                $table->timestamps();

                $table->unique(['tenant_code', 'loan_id', 'guarantor_mobile'], 'mfi_guarantors_tenant_loan_mobile_unique');
                $table->index(['loan_id', 'status'], 'mfi_guarantors_loan_status_index');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('mfi_guarantors')) {
            Schema::drop('mfi_guarantors');
        }
    }
};
