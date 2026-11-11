<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mfi_loans', function (Blueprint $table): void {
            if (!Schema::hasColumn('mfi_loans', 'custom_days')) {
                $table->unsignedSmallInteger('custom_days')->default(0)->after('recovery_type');
            }
            if (!Schema::hasColumn('mfi_loans', 'custom_emi_amount')) {
                $table->string('custom_emi_amount', 20)->default('')->after('custom_days');
            }
        });
    }

    public function down(): void
    {
        Schema::table('mfi_loans', function (Blueprint $table): void {
            if (Schema::hasColumn('mfi_loans', 'custom_emi_amount')) {
                $table->dropColumn('custom_emi_amount');
            }
            if (Schema::hasColumn('mfi_loans', 'custom_days')) {
                $table->dropColumn('custom_days');
            }
        });
    }
};
