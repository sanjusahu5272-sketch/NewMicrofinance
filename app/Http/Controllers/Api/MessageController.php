<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\MessageLog;
use App\Services\NotificationGatewayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * SMS / Email gateway API — Feature 3.
 *
 * POST /api/messages/send              send message (SMS|EMAIL)
 * POST /api/messages/otp/send          send OTP to mobile
 * POST /api/messages/otp/verify        verify OTP
 * GET  /api/messages/logs              message log (filterable)
 */
class MessageController extends Controller
{
    public function send(Request $request): JsonResponse
    {
        $channel = strtoupper((string) $request->input('channel', ''));
        if (!in_array($channel, ['SMS', 'EMAIL'], true)) {
            return response()->json(['error' => 'channel must be SMS or EMAIL.'], 422);
        }

        $recipient = trim((string) $request->input('recipient', ''));
        if ($recipient === '') {
            return response()->json(['error' => 'recipient is required.'], 422);
        }
        if ($channel === 'SMS' && !preg_match('/^[6-9]\d{9}$/', $recipient)) {
            return response()->json(['error' => 'recipient must be a valid 10-digit Indian mobile number.'], 422);
        }
        if ($channel === 'EMAIL' && !filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            return response()->json(['error' => 'recipient must be a valid email address.'], 422);
        }

        $body = (string) $request->input('body', '');
        if ($body === '') {
            return response()->json(['error' => 'body is required.'], 422);
        }

        $log = NotificationGatewayService::send(
            $channel,
            $recipient,
            $body,
            (string) $request->input('message_type', 'NOTIFICATION'),
            (string) $request->input('subject', ''),
            (string) $request->input('sender', '')
        );

        return response()->json([
            'message' => 'Message dispatched.',
            'message_log' => $log,
        ], $log->status === 'SENT' ? 201 : 502);
    }

    public function sendOtp(Request $request): JsonResponse
    {
        $mobile = preg_replace('/\D/', '', (string) $request->input('mobile', ''));
        if (strlen($mobile) !== 10 || $mobile[0] < '6') {
            return response()->json(['error' => 'mobile must be a valid 10-digit Indian number.'], 422);
        }

        $result = NotificationGatewayService::sendOtp($mobile);

        return response()->json(['message' => 'OTP sent.', 'otp' => $result], 201);
    }

    public function verifyOtp(Request $request): JsonResponse
    {
        $mobile = preg_replace('/\D/', '', (string) $request->input('mobile', ''));
        $code = (string) $request->input('code', '');

        if (strlen($mobile) !== 10 || strlen($code) !== 6) {
            return response()->json(['error' => 'mobile (10 digits) and code (6 digits) are required.'], 422);
        }

        $result = NotificationGatewayService::verifyOtp($mobile, $code);

        if (!($result['valid'] ?? false)) {
            return response()->json(['valid' => false, 'error' => $result['error'] ?? 'Invalid OTP.'], 421);
        }

        return response()->json(['valid' => true, 'message' => 'OTP verified.']);
    }

    public function logs(Request $request): JsonResponse
    {
        $query = MessageLog::query()
            ->when($request->input('channel'), fn ($q, $v) => $q->where('channel', strtoupper((string) $v)))
            ->when($request->input('status'), fn ($q, $v) => $q->where('status', strtoupper((string) $v)))
            ->when($request->input('message_type'), fn ($q, $v) => $q->where('message_type', (string) $v))
            ->when($request->input('recipient'), fn ($q, $v) => $q->where('recipient', 'like', '%' . (string) $v . '%'))
            ->orderByDesc('id')
            ->limit(min((int) $request->input('limit', 25), 100));

        return response()->json(['messages' => $query->get()]);
    }
}
