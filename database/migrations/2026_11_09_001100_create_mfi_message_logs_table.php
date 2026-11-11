<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * SMS / email gateway message log — Feature 3 of the new-feature batch.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('mfi_message_logs')) {
            Schema::create('mfi_message_logs', function (Blueprint $table): void {
                $table->id();
                $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
                $table->string('channel', 8)->index();          // SMS | EMAIL
                $table->string('message_type', 32)->default('NOTIFICATION')->index();
                $table->string('recipient', 191)->index();
                $table->string('sender', 120)->default('');      // from number / email
                $table->string('subject', 255)->default('');
                $table->text('body');
                $table->string('provider', 32)->default('log'); // log | twilio | sendgrid
                $table->string('provider_msg_id', 191)->default('');
                $table->string('status', 16)->default('QUEUED')->index(); // QUEUED|SENT|FAILED
                $table->integer('attempts')->default(0);
                $table->string('error', 255)->default('');
                $table->timestamp('sent_at')->nullable();
                $table->timestamps();

                $table->index(['channel', 'status'], 'mfi_message_logs_channel_status_index');
                $table->index(['message_type', 'created_at'], 'mfi_message_logs_type_time_index');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('mfi_message_logs')) {
            Schema::drop('mfi_message_logs');
        }
    }
};
