<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 2FA enrolment state + password lifecycle columns on mfi_employees.
 *
 * Notes on the design:
 *  - totp_secret_encrypted is stored with Laravel's `encrypted` cast, which uses
 *    AES-256-GCM with the APP_KEY. A TOTP seed in plaintext is equivalent to a
 *    plaintext password: anyone with a DB dump can mint valid codes forever.
 *  - last_totp_step blocks REPLAY. Without it a code stays valid for its whole
 *    30 s window and, worse, an attacker who shoulder-surfs one code can reuse
 *    it. We store the highest accepted time step and refuse anything ≤ that.
 *  - failed_login_attempts + locked_until implement per-account lockout, which
 *    rate limiting per IP alone does not stop (distributed guessing).
 *  - must_change_password drives force-change-on-first-login, which is how the
 *    shipped Admin@123 / Branch@123 defaults get eliminated without a flag day.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mfi_employees', function (Blueprint $table): void {
            $table->text('totp_secret_encrypted')->nullable();
            $table->boolean('totp_enabled')->default(false);
            $table->bigInteger('last_totp_step')->nullable();
            $table->json('totp_recovery_codes')->nullable();
            $table->timestamp('totp_confirmed_at')->nullable();

            $table->boolean('must_change_password')->default(true);
            $table->timestamp('password_changed_at')->nullable();
            $table->unsignedSmallInteger('failed_login_attempts')->default(0);
            $table->timestamp('locked_until')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->string('last_login_ip', 45)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('mfi_employees', function (Blueprint $table): void {
            $table->dropColumn([
                'totp_secret_encrypted', 'totp_enabled', 'last_totp_step', 'totp_recovery_codes',
                'totp_confirmed_at', 'must_change_password', 'password_changed_at',
                'failed_login_attempts', 'locked_until', 'last_login_at', 'last_login_ip',
            ]);
        });
    }
};
