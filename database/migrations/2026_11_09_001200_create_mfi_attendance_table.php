<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Employee attendance — Feature 4 of the new-feature batch.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('mfi_attendance')) {
            Schema::create('mfi_attendance', function (Blueprint $table): void {
                $table->id();
                $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
                $table->unsignedBigInteger('employee_id')->index();
                $table->string('user_code', 64)->default('');
                $table->string('branch_name', 120)->default('');
                $table->date('attendance_date')->index();
                $table->time('check_in_time')->nullable();
                $table->time('check_out_time')->nullable();
                $table->string('status', 16)->default('PRESENT')->index(); // PRESENT|ABSENT|HALF_DAY|LEAVE
                $table->integer('late_minutes')->default(0);
                $table->integer('early_exit_minutes')->default(0);
                $table->integer('overtime_minutes')->default(0);
                $table->string('location', 191)->default('');
                $table->string('remark', 255)->default('');
                $table->timestamps();

                $table->unique(['employee_id', 'attendance_date'], 'mfi_attendance_emp_date_unique');
                $table->index(['attendance_date', 'branch_name'], 'mfi_attendance_date_branch_index');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('mfi_attendance')) {
            Schema::drop('mfi_attendance');
        }
    }
};
