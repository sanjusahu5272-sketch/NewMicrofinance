<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('mfi_cash_handovers')) {
            Schema::create('mfi_cash_handovers', function (Blueprint $table): void {
                $table->id();
                $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
                $table->string('handover_no', 64)->unique();
                $table->string('agent_code', 64)->index();
                $table->string('agent_name', 160)->default('');
                $table->string('branch_name', 120)->default('KATNI MAIN BRANCH')->index();
                $table->date('handover_date')->index();
                $table->decimal('amount', 18, 2);
                $table->string('status', 32)->default('APPROVED')->index();
                $table->text('remark')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('mfi_loan_topups')) {
            Schema::create('mfi_loan_topups', function (Blueprint $table): void {
                $table->id();
                $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
                $table->string('topup_no', 64)->unique();
                $table->string('branch_name', 120)->index();
                $table->unsignedBigInteger('member_id')->default(0)->index();
                $table->string('member_code', 64)->index();
                $table->string('member_name', 160)->default('');
                $table->string('mobile', 24)->default('');
                $table->string('pre_loan_id', 64)->default('');
                $table->decimal('pre_loan_amt', 18, 2)->default(0.00);
                $table->decimal('pre_loan_due', 18, 2)->default(0.00);
                $table->decimal('apply_loan_amt', 18, 2)->default(0.00);
                $table->string('apply_date', 32)->default('');
                $table->string('status', 32)->default('PENDING')->index();
                $table->text('remark')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('mfi_dynamic_resources')) {
            Schema::create('mfi_dynamic_resources', function (Blueprint $table): void {
                $table->id();
                $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
                $table->string('resource_name', 80)->index();
                $table->string('branch_name', 120)->default('')->index();
                $table->string('status', 64)->default('ACTIVE')->index();
                $table->jsonb('payload_json');
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mfi_dynamic_resources');
        Schema::dropIfExists('mfi_loan_topups');
        Schema::dropIfExists('mfi_cash_handovers');
    }
};
