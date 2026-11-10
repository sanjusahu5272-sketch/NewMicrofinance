<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mfi_loan_plans', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('plan_name')->unique();
            $table->string('plan_type', 64)->default('NORMAL PLAN');
            $table->string('recovery_type', 64)->default('MONTHLY');
            $table->integer('tenure_emis')->default(12);
            $table->decimal('interest_rate_pa', 8, 2)->default(24.00);
            $table->string('interest_type', 64)->default('REDUCING');
            $table->string('roi_unit', 32)->default('YEARLY');
            $table->integer('custom_days')->default(5);
            $table->string('custom_emi_amount')->default('');
            $table->decimal('plan_amount', 18, 2);
            $table->decimal('disbursement_amount', 18, 2);
            $table->decimal('collection_amount', 18, 2);
            $table->decimal('emi_amount', 18, 2);
            $table->decimal('effective_apr_pct', 8, 2)->default(24.00);
            $table->string('holiday_exclude', 8)->default('YES');
            $table->string('gst_include', 8)->default('YES');
            $table->decimal('file_charge', 18, 2)->default(200.00);
            $table->decimal('pf_percentage', 8, 2)->default(1.00);
            $table->decimal('pf_amount', 18, 2)->default(300.00);
            $table->decimal('insurance_amount', 18, 2)->default(150.00);
            $table->decimal('pre_closure_charge_pct', 8, 2)->default(3.00);
            $table->decimal('bounce_charge_amount', 18, 2)->default(250.00);
            $table->string('penalty_scheme_name')->default('STANDARD PENALTY 50');
            $table->integer('plan_version')->default(1);
            $table->string('status', 32)->default('ACTIVE');
            $table->timestamps();
        });

        Schema::create('mfi_loans', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('application_no', 64)->unique();
            $table->string('loan_id', 64)->unique();
            $table->unsignedBigInteger('member_id')->index();
            $table->string('member_code', 64)->index();
            $table->string('member_name');
            $table->string('mobile', 24)->default('');
            $table->string('branch_name')->index();
            $table->string('center_name')->default('');
            $table->string('staff_name')->default('');
            $table->unsignedBigInteger('plan_id')->nullable();
            $table->string('plan_name');
            $table->string('application_type', 64)->default('INDIVIDUAL LOAN')->index();
            $table->string('product_name')->default('');
            $table->string('product_serial_no')->default('');
            $table->date('application_date');
            $table->date('approval_date')->nullable();
            $table->date('disbursement_date')->nullable();
            $table->date('emi_start_date')->nullable();
            $table->date('emi_end_date')->nullable();
            $table->decimal('plan_amount', 18, 2);
            $table->decimal('deductions_total', 18, 2)->default(0);
            $table->decimal('gst_amount', 18, 2)->default(0);
            $table->decimal('disbursement_amount', 18, 2);
            $table->decimal('total_interest', 18, 2);
            $table->decimal('total_repayable', 18, 2);
            $table->decimal('emi_amount', 18, 2);
            $table->integer('tenure_emis')->default(12);
            $table->string('recovery_type', 64)->default('MONTHLY');
            $table->string('interest_type', 64)->default('REDUCING');
            $table->decimal('interest_rate_pa', 8, 2)->default(24.00);
            $table->decimal('effective_apr_pct', 8, 2)->default(24.00);
            $table->decimal('principal_outstanding', 18, 2);
            $table->decimal('interest_outstanding', 18, 2);
            $table->decimal('penalty_due', 18, 2)->default(0);
            $table->decimal('total_outstanding', 18, 2);
            $table->decimal('total_collected', 18, 2)->default(0);
            $table->string('pay_mode', 32)->default('BANK TRANSFER');
            $table->string('utr_no', 64)->default('');
            $table->string('purpose')->default('INCOME GENERATION');
            $table->string('guarantor_name')->default('');
            $table->string('description')->default('');
            $table->string('penalty_scheme', 64)->default('FLAT 500');
            $table->string('loan_type', 32)->default('single Ledger');
            $table->string('amount_type', 32)->default('STATIC');
            $table->string('hide_interest_rate', 8)->default('NO');
            $table->string('status', 32)->default('PENDING_APPROVAL')->index();
            $table->timestamps();
        });

        Schema::create('mfi_installments', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->foreignId('loan_pk')->constrained('mfi_loans')->cascadeOnDelete();
            $table->string('loan_id', 64)->index();
            $table->string('member_code', 64)->index();
            $table->string('member_name');
            $table->string('branch_name')->index();
            $table->string('center_name')->default('');
            $table->string('staff_name')->default('');
            $table->integer('emi_no');
            $table->date('due_date')->index();
            $table->decimal('opening_principal', 18, 2)->default(0);
            $table->decimal('principal_component', 18, 2);
            $table->decimal('interest_component', 18, 2);
            $table->decimal('emi_amount', 18, 2);
            $table->decimal('closing_principal', 18, 2)->default(0);
            $table->decimal('paid_amount', 18, 2)->default(0);
            $table->decimal('penalty_amount', 18, 2)->default(0);
            $table->decimal('penalty_paid', 18, 2)->default(0);
            $table->date('paid_date')->nullable();
            $table->string('status', 32)->default('DUE')->index();
            $table->timestamps();
        });

        Schema::create('mfi_emi_collections', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('receipt_no', 64)->unique();
            $table->unsignedBigInteger('loan_pk')->index();
            $table->string('loan_id', 64)->index();
            $table->string('member_code', 64);
            $table->string('member_name');
            $table->string('branch_name')->index();
            $table->integer('emi_no')->default(1);
            $table->decimal('amount', 18, 2);
            $table->decimal('principal_allocated', 18, 2)->default(0);
            $table->decimal('interest_allocated', 18, 2)->default(0);
            $table->decimal('penalty_allocated', 18, 2)->default(0);
            $table->date('payment_date')->index();
            $table->string('payment_mode', 32)->default('CASH');
            $table->string('utr_no', 64)->default('');
            $table->string('collected_by', 64)->default('ADM01');
            $table->string('status', 32)->default('APPROVED');
            $table->text('remark')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mfi_emi_collections');
        Schema::dropIfExists('mfi_installments');
        Schema::dropIfExists('mfi_loans');
        Schema::dropIfExists('mfi_loan_plans');
    }
};
