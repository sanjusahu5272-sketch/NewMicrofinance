<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Notifications Table
 *
 * Per-user notifications for: loan approvals, payment receipts,
 * NPA warnings, system alerts, and audit events.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mfi_notifications', function (Blueprint $table): void {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01');
            $table->bigInteger('employee_id')->nullable();
            $table->string('type', 64)->default('info');
            $table->string('title', 255);
            $table->text('message');
            $table->string('link', 255)->nullable();
            $table->json('data')->nullable();
            $table->boolean('is_read')->default(false);
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'is_read'], 'idx_notif_emp_read');
            $table->index('type', 'idx_notif_type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mfi_notifications');
    }
};
