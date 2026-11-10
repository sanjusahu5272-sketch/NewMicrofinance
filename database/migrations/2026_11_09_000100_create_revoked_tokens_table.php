<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Durable token revocation list.
 *
 * "Logout" must actually end the session. An in-memory or file cache cannot
 * guarantee that across PHP-FPM workers or a deploy restart, and silently
 * downgrades logout to a cosmetic no-op.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mfi_revoked_tokens', function (Blueprint $table): void {
            $table->id();
            $table->string('jti', 64)->unique();
            $table->string('user_code', 64)->index();
            $table->timestamp('expires_at')->index();
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mfi_revoked_tokens');
    }
};
