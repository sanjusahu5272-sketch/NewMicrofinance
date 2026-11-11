<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Member credit score / risk rating history.
 * Feature 2 of the new-feature batch (option 1).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('mfi_credit_scores')) {
            Schema::create('mfi_credit_scores', function (Blueprint $table): void {
                $table->id();
                $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
                $table->unsignedBigInteger('member_id')->index();
                $table->string('member_code', 64)->default('');
                $table->string('member_name', 120)->default('');
                $table->integer('score')->index();           // 300..900
                $table->string('rating_band', 32)->index();   // LOW | MEDIUM | HIGH | PREMIUM
                $table->string('source', 16)->default('AUTO'); // AUTO | MANUAL
                $table->json('breakdown')->nullable();         // scoring inputs + weights
                $table->timestamp('computed_at')->nullable();
                $table->timestamps();

                $table->index(['member_id', 'computed_at'], 'mfi_credit_scores_member_time_index');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('mfi_credit_scores')) {
            Schema::drop('mfi_credit_scores');
        }
    }
};
