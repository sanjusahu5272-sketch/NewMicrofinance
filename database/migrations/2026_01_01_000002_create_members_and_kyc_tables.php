<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mfi_members', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('member_code', 64)->unique();
            $table->string('name');
            $table->string('alias')->default('');
            $table->string('father_name')->default('');
            $table->string('mother_name')->default('');
            $table->string('spouse_name')->default('');
            $table->string('gender', 24)->default('FEMALE');
            $table->date('dob')->nullable();
            $table->string('mobile', 24)->index();
            $table->string('alt_mobile', 24)->default('');
            $table->string('email')->default('');
            $table->string('marital_status', 32)->default('MARRIED');
            $table->string('religion', 64)->default('HINDU');
            $table->string('aadhar_no', 32)->default('')->index();
            $table->text('aadhar_encrypted')->nullable();
            $table->string('pan_no', 32)->default('')->index();
            $table->text('pan_encrypted')->nullable();
            $table->string('voter_id', 64)->default('');
            $table->string('ration_card_no', 64)->default('');
            $table->string('driving_licence_no', 64)->default('');
            $table->string('passport_no', 64)->default('');
            $table->text('address')->nullable();
            $table->string('area')->default('');
            $table->string('city', 120)->default('');
            $table->string('district', 120)->default('');
            $table->string('state', 120)->default('MADHYA PRADESH');
            $table->string('pincode', 16)->default('');
            $table->unsignedBigInteger('branch_id')->default(1);
            $table->string('branch_name')->default('');
            $table->string('center_name')->default('');
            $table->string('agent_name')->default('');
            $table->string('customer_type', 64)->default('INDIVIDUAL');
            // Bank Details Tab
            $table->string('bank_name')->default('');
            $table->string('bank_branch')->default('');
            $table->string('account_holder_name')->default('');
            $table->string('bank_account_no', 64)->default('');
            $table->string('ifsc_code', 32)->default('');
            $table->decimal('family_monthly_expense', 18, 2)->default(0);
            // Income & FOIR Tab
            $table->string('job_type', 64)->default('SELF EMPLOYED');
            $table->string('income_type', 64)->default('MONTHLY');
            $table->string('income_duration', 64)->default('12 MONTHS');
            $table->decimal('monthly_income', 18, 2)->default(25000);
            $table->decimal('monthly_expense', 18, 2)->default(8000);
            $table->decimal('min_amount', 18, 2)->default(10000);
            $table->decimal('max_amount', 18, 2)->default(100000);
            $table->string('business_name')->default('');
            $table->text('business_address')->nullable();
            $table->string('office_phone', 32)->default('');
            $table->string('loan_purpose')->default('BUSINESS EXPANSION');
            // Co-Applicant & Nominee Tab
            $table->string('co_applicant_name')->default('');
            $table->string('co_applicant_mobile', 24)->default('');
            $table->text('co_applicant_address')->nullable();
            $table->string('co_applicant_relation', 64)->default('');
            $table->string('co_applicant_aadhar', 32)->default('');
            $table->string('co_applicant_pan', 32)->default('');
            $table->string('nominee_name')->default('');
            $table->string('nominee_mobile', 24)->default('');
            $table->string('nominee_relation', 64)->default('');
            $table->date('nominee_dob')->nullable();
            $table->string('nominee_aadhar_no', 32)->default('');
            $table->string('nominee_spouse')->default('');
            // KYC Verification State
            $table->integer('cibil_score')->default(750);
            $table->boolean('aadhar_verified')->default(false);
            $table->boolean('pan_verified')->default(false);
            $table->boolean('cust_mobile_verified')->default(false);
            $table->boolean('co_mobile_verified')->default(false);
            $table->string('kyc_status', 32)->default('PENDING');
            $table->string('loan_exist', 8)->default('NO');
            $table->jsonb('documents_json')->nullable();
            $table->string('status', 32)->default('ACTIVE');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mfi_members');
    }
};
