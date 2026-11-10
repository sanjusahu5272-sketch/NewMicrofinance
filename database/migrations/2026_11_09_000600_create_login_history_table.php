<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Login History Table
 *
 * Tracks every login attempt (success, failure, 2FA) with IP and device info.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mfi_login_history', function (Blueprint $table): void {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01');
            $table->string('employee_id', 64)->nullable();
            $table->string('employee_code', 64)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->string('device_name', 128)->nullable();
            $table->boolean('was_successful')->default(false);
            $table->string('status', 32)->default('FAILED');
            $table->string('failure_reason', 128)->nullable();
            $table->timestamp('login_at')->nullable();
            $table->timestamp('logout_at')->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'login_at'], 'idx_login_emp_time');
            $table->index(['ip_address', 'login_at'], 'idx_login_ip_time');
            $table->index('was_successful', 'idx_login_success');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mfi_login_history');
    }
};
