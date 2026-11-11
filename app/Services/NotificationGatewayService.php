<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\MessageLog;
use App\Models\Scopes\TenantScope;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * SMS / Email gateway with pluggable providers — Feature 3.
 *
 * Drivers (config/mfi.php `notification.driver`):
 *  - log      : default; persists the message and marks it SENT (simulated).
 *              Use for dev / demo without external credentials.
 *  - twilio   : real SMS via Twilio REST API (TWILIO_SID/TWILIO_TOKEN env).
 *  - sendgrid : real email via SendGrid API (SENDGRID_KEY env).
 *
 * Every send is logged to mfi_message_logs — the log IS the audit trail.
 */
class NotificationGatewayService
{
    public const OTP_TTL_MINUTES = 10;
    public const OTP_MAX_ATTEMPTS = 5;

    /**
     * Send a message through the configured driver and persist the log row.
     */
    public static function send(
        string $channel,
        string $recipient,
        string $body,
        string $messageType = 'NOTIFICATION',
        string $subject = '',
        string $sender = ''
    ): MessageLog {
        $driver = self::driver();
        $log = MessageLog::create([
            'tenant_code' => self::tenantCode(),
            'channel' => $channel,
            'message_type' => $messageType,
            'recipient' => $recipient,
            'sender' => $sender,
            'subject' => $subject,
            'body' => $body,
            'provider' => $driver,
            'status' => 'QUEUED',
            'attempts' => 0,
        ]);

        try {
            $result = self::dispatch($driver, $channel, $recipient, $subject, $body, $sender);
            $log->provider_msg_id = (string) ($result['provider_msg_id'] ?? '');
            $log->status = 'SENT';
            $log->sent_at = now();
            $log->attempts = 1;
        } catch (Throwable $e) {
            $log->status = 'FAILED';
            $log->error = substr($e->getMessage(), 0, 250);
            $log->attempts = 1;
        }

        $log->save();
        return $log;
    }

    /**
     * Generate + dispatch an OTP. Stored in cache with TTL.
     */
    public static function sendOtp(string $mobile): array
    {
        $code = (string) random_int(100000, 999999);
        Cache::put(self::otpKey($mobile), [
            'code' => $code,
            'expires_at' => now()->addMinutes(self::OTP_TTL_MINUTES)->getTimestamp(),
            'attempts' => 0,
        ], self::OTP_TTL_MINUTES * 60);

        $log = self::send('SMS', $mobile, "Your NEEV MFI OTP is {$code}. Valid for 10 minutes. Do not share it.", 'OTP');

        return ['mobile' => $mobile, 'otp' => $code, 'expires_in_minutes' => self::OTP_TTL_MINUTES, 'message_log_id' => $log->id];
    }

    /**
     * Verify an OTP against the cache entry.
     */
    public static function verifyOtp(string $mobile, string $code): array
    {
        $entry = Cache::get(self::otpKey($mobile));
        if ($entry === null) {
            return ['valid' => false, 'error' => 'OTP expired or not requested. Please request a new OTP.'];
        }

        $data = is_array($entry) ? $entry : json_decode((string) $entry, true);
        if (!is_array($data) || !isset($data['code'])) {
            return ['valid' => false, 'error' => 'OTP session invalid.'];
        }

        if ((int) ($data['attempts'] ?? 0) >= self::OTP_MAX_ATTEMPTS) {
            Cache::forget(self::otpKey($mobile));
            return ['valid' => false, 'error' => 'OTP verification attempts exhausted. Please request a new OTP.'];
        }

        if (!hash_equals((string) $data['code'], $code)) {
            $data['attempts'] = (int) ($data['attempts'] ?? 0) + 1;
            Cache::put(self::otpKey($mobile), $data, self::OTP_TTL_MINUTES * 60);
            return ['valid' => false, 'error' => 'Incorrect OTP. Attempts left: ' . (self::OTP_MAX_ATTEMPTS - $data['attempts'])];
        }

        Cache::forget(self::otpKey($mobile));
        return ['valid' => true];
    }

    // ── Template helpers ──────────────────────────────────────────────────

    public static function sendLoanReminder(array $loan, array $installment): MessageLog
    {
        $body = sprintf(
            'Dear %s, your EMI of Rs.%s for loan %s (due %s) is due. Pay before due date to avoid penalty. - NEEV MFI',
            $loan['member_name'] ?? 'Member',
            $installment['emi_amount'] ?? '0',
            $loan['loan_id'] ?? $loan['application_no'] ?? '-',
            $installment['due_date'] ?? '-'
        );

        return self::send('SMS', (string) ($loan['mobile'] ?? ''), $body, 'REMINDER');
    }

    public static function sendLoanApproved(array $loan): MessageLog
    {
        $body = sprintf(
            'Dear %s, your loan %s (Rs.%s, {$emi} EMI) has been approved. Collect disbursement from your branch. - NEEV MFI',
            $loan['member_name'] ?? 'Member',
            $loan['loan_id'] ?? $loan['application_no'] ?? '-',
            $loan['plan_amount'] ?? '0'
        );

        return self::send('SMS', (string) ($loan['mobile'] ?? ''), $body, 'ALERT');
    }

    public static function sendDisbursement(array $loan): MessageLog
    {
        $body = sprintf(
            'Dear %s, loan %s disbursed successfully. EMI %s starts from %s. First EMI due %s. - NEEV MFI',
            $loan['member_name'] ?? 'Member',
            $loan['loan_id'] ?? $loan['application_no'] ?? '-',
            $loan['emi_amount'] ?? '0',
            $loan['emi_start_date'] ?? '-',
            $loan['emi_start_date'] ?? '-'
        );

        return self::send('SMS', (string) ($loan['mobile'] ?? ''), $body, 'ALERT');
    }

    // ── Drivers ──────────────────────────────────────────────────────────

    private static function driver(): string
    {
        return (string) config('mfi.notification.driver', 'log');
    }

    private static function tenantCode(): string
    {
        return (string) (TenantScope::currentTenantCode() ?: config('mfi.default_tenant', 'TNT-NEEV-01'));
    }

    private static function otpKey(string $mobile): string
    {
        return 'otp:' . preg_replace('/\D/', '', $mobile);
    }

    /**
     * @return array{provider_msg_id?: string}
     * @throws \RuntimeException
     */
    private static function dispatch(string $driver, string $channel, string $recipient, string $subject, string $body, string $sender): array
    {
        return match ($driver) {
            'twilio' => self::dispatchTwilio($channel, $recipient, $body, $sender),
            'sendgrid' => self::dispatchSendgrid($recipient, $subject, $body),
            default => ['provider_msg_id' => 'sim-' . bin2hex(random_bytes(6))],
        };
    }

    private static function dispatchTwilio(string $channel, string $recipient, string $body, string $sender): array
    {
        if ($channel !== 'SMS') {
            throw new \RuntimeException('Twilio driver only supports SMS.');
        }
        $sid = (string) config('services.twilio.sid');
        $token = (string) config('services.twilio.token');
        if ($sid === '' || $token === '') {
            throw new \RuntimeException('Twilio credentials not configured.');
        }
        $from = (string) config('services.twilio.from', $sender);

        $res = Http::withBasicAuth($sid, $token)
            ->post('https://api.twilio.com/2010-04-01/Accounts/' . $sid . '/Messages.json', [
                'From' => $from,
                'To' => $recipient,
                'Body' => $body,
            ])
            ->throw();

        return ['provider_msg_id' => (string) ($res->json('sid') ?? '')];
    }

    private static function dispatchSendgrid(string $recipient, string $subject, string $body): array
    {
        $key = (string) config('services.sendgrid.key');
        if ($key === '') {
            throw new \RuntimeException('SendGrid credentials not configured.');
        }
        $from = (string) config('services.sendgrid.from');

        $res = Http::withToken($key)
            ->post('https://api.sendgrid.com/v3/mail/send', [
                'personalizations' => [[
                    'to' => [['email' => $recipient]],
                    'subject' => $subject,
                ]],
                'from' => ['email' => $from],
                'content' => [['type' => 'text/plain', 'value' => $body]],
            ])
            ->throw();

        return ['provider_msg_id' => 'sg-' . ($res->status() ?? 'ok')];
    }
}
