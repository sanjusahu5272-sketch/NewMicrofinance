<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add kyc_sections_json to mfi_members for per-section KYC verification tracking.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('mfi_members', 'kyc_sections_json')) {
            Schema::table('mfi_members', function (Blueprint $table): void {
                $table->json('kyc_sections_json')->nullable()->default('{}');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('mfi_members', 'kyc_sections_json')) {
            Schema::table('mfi_members', function (Blueprint $table): void {
                $table->dropColumn('kyc_sections_json');
            });
        }
    }
};
