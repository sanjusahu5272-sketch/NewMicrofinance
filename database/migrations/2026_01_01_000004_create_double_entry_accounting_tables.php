<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mfi_ledgers', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('name')->unique();
            $table->string('alias', 64)->default('');
            $table->string('group_name', 120);
            $table->string('nature', 32); // ASSET, LIABILITY, INCOME, EXPENSE, EQUITY
            $table->string('branch_name')->default('INDORE HEAD OFFICE');
            $table->decimal('opening_balance', 18, 2)->default(0);
            $table->decimal('current_debit', 18, 2)->default(0);
            $table->decimal('current_credit', 18, 2)->default(0);
            $table->decimal('closing_balance', 18, 2)->default(0);
            $table->string('status', 32)->default('ACTIVE');
            $table->timestamps();
        });

        Schema::create('mfi_vouchers', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('voucher_no', 64)->unique();
            $table->date('voucher_date')->index();
            $table->string('voucher_type', 32)->index(); // RECEIPT, PAYMENT, CONTRA, JOURNAL
            $table->string('branch_name')->index();
            $table->string('loan_id', 64)->default('')->index();
            $table->string('particular');
            $table->string('debit_ledger')->index();
            $table->string('credit_ledger')->index();
            $table->decimal('amount_dr', 18, 2);
            $table->decimal('amount_cr', 18, 2);
            $table->text('narration')->nullable();
            $table->string('created_by', 64)->default('ADM01');
            $table->boolean('is_reversed')->default(false);
            $table->string('reversal_of', 64)->default('');
            $table->string('idempotency_key', 128)->nullable()->unique();
            $table->timestamps();
        });

        Schema::create('mfi_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('user_code', 64)->index();
            $table->string('action', 64)->index();
            $table->string('module', 64)->index();
            $table->string('record_id', 64)->default('');
            $table->text('details')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mfi_audit_logs');
        Schema::dropIfExists('mfi_vouchers');
        Schema::dropIfExists('mfi_ledgers');
    }
};
