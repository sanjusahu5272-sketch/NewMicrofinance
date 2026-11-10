<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mfi_tenants', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_code', 64)->unique();
            $table->string('company_name');
            $table->string('deployment_model', 64)->default('SHARED_SAAS_POSTGRES');
            $table->string('vps_node_id', 64)->default('PG-PRIMARY-01');
            $table->string('plan_tier', 64)->default('ENTERPRISE_NBFC_MFI');
            $table->integer('max_branches')->default(50);
            $table->integer('max_active_loans')->default(100000);
            $table->string('lifecycle_state', 32)->default('ACTIVE');
            $table->jsonb('feature_flags_json')->nullable();
            $table->timestamps();
        });

        Schema::create('mfi_saas_licenses', function (Blueprint $table) {
            $table->id();
            $table->string('license_key', 128)->unique();
            $table->string('tenant_code', 64)->index();
            $table->string('client_company_name');
            $table->string('plan_tier', 64)->default('ENTERPRISE');
            $table->date('issue_date');
            $table->date('expiry_date');
            $table->string('status', 32)->default('ACTIVE');
            $table->timestamps();
        });

        Schema::create('mfi_branches', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('name');
            $table->string('code', 64)->unique();
            $table->string('manager_name')->default('');
            $table->text('password_hash')->default('');
            $table->date('opening_date');
            $table->text('address')->nullable();
            $table->string('city', 120);
            $table->string('state', 120);
            $table->string('country', 80)->default('India');
            $table->string('pincode', 16);
            $table->string('contact_email');
            $table->string('phone', 24);
            $table->string('landline_number', 32)->default('');
            $table->string('gstin_number', 32)->default('');
            $table->string('status', 32)->default('ACTIVE');
            $table->timestamps();
        });

        Schema::create('mfi_branch_centers', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('code', 64)->unique();
            $table->string('name');
            $table->string('city_village');
            $table->foreignId('branch_id')->constrained('mfi_branches')->cascadeOnDelete();
            $table->string('branch_name')->default('');
            $table->string('center_leader')->default('');
            $table->string('collection_day', 32)->default('MONDAY');
            $table->string('status', 32)->default('ACTIVE');
            $table->timestamps();
        });

        Schema::create('mfi_roles', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('name', 120)->unique();
            $table->string('status', 32)->default('ACTIVE');
            $table->timestamps();
        });

        Schema::create('mfi_employees', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('user_code', 64)->unique();
            $table->string('name');
            $table->string('alias')->default('');
            $table->string('email');
            $table->string('mobile', 24);
            $table->string('gender', 24)->default('MALE');
            $table->string('designation', 120)->default('BRANCH MANAGER');
            $table->unsignedBigInteger('role_id')->default(2);
            $table->string('role_name', 120)->default('BRANCH MANAGER');
            $table->unsignedBigInteger('branch_id')->default(1);
            $table->string('branch_name')->default('INDORE HEAD OFFICE');
            $table->text('password_hash');
            $table->string('kyc_status', 32)->default('VERIFIED');
            $table->string('login_status', 32)->default('ACTIVE');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mfi_employees');
        Schema::dropIfExists('mfi_roles');
        Schema::dropIfExists('mfi_branch_centers');
        Schema::dropIfExists('mfi_branches');
        Schema::dropIfExists('mfi_saas_licenses');
        Schema::dropIfExists('mfi_tenants');
    }
};
