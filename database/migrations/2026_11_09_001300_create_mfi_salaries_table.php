<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Employee salary / payroll — Feature 5 of the new-feature batch.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('mfi_salaries')) {
            Schema::create('mfi_salaries', function (Blueprint $table): void {
                $table->id();
                $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
                $table->unsignedBigInteger('employee_id')->index();
                $table->string('user_code', 64)->default('');
                $table->string('branch_name', 120)->default('');
                $table->string('month', 7)->index();                    // YYYY-MM
                $table->decimal('basic_salary', 18, 2)->default(0.00);
                $table->decimal('allowances', 18, 2)->default(0.00);
                $table->decimal('gross_salary', 18, 2)->default(0.00);
                $table->decimal('pf_employee', 18, 2)->default(0.00);    // 8% of basic
                $table->decimal('pf_employer', 18, 2)->default(0.00);    // 12% of basic
                $table->decimal('professional_tax', 18, 2)->default(0.00);
                $table->decimal('income_tax', 18, 2)->default(0.00);
                $table->decimal('net_salary', 18, 2)->default(0.00);
                $table->string('status', 16)->default('DRAFT')->index(); // DRAFT|PAID
                $table->timestamp('paid_at')->nullable();
                $table->string('remark', 255)->default('');
                $table->timestamps();

                $table->unique(['employee_id', 'month'], 'mfi_salaries_emp_month_unique');
                $table->index(['month', 'status'], 'mfi_salaries_month_status_index');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('mfi_salaries')) {
            Schema::drop('mfi_salaries');
        }
    }
};
