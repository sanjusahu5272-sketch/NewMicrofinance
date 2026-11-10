<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use Illuminate\Routing\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Notification Center Controller
 *
 * Polling-based notifications. Each user has a notification queue in Redis.
 * Also supports DB-backed notifications for audit-critical events.
 */
class NotificationController extends \Illuminate\Routing\Controller
{
    public function index(Request $request)
    {
        $user = $request->attributes->get('employee');
        if (!$user) {
            return response()->json(['notifications' => []]);
        }

        $notifications = DB::table('mfi_notifications')
            ->where('employee_id', $user->id)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get();

        $unread = $notifications->where('is_read', false)->count();

        return response()->json([
            'notifications' => $notifications,
            'unread_count' => $unread,
            'total' => $notifications->count(),
        ]);
    }

    public function markRead(Request $request, int $id)
    {
        $user = $request->attributes->get('employee');
        if (!$user) {
            return response()->json(['success' => false], 401);
        }

        DB::table('mfi_notifications')
            ->where('id', $id)
            ->where('employee_id', $user->id)
            ->update(['is_read' => true, 'read_at' => now()]);

        return response()->json(['success' => true]);
    }

    public function unreadCount(Request $request)
    {
        $user = $request->attributes->get('employee');
        if (!$user) {
            return response()->json(['count' => 0]);
        }

        $count = DB::table('mfi_notifications')
            ->where('employee_id', $user->id)
            ->where('is_read', false)
            ->count();

        return response()->json(['count' => $count]);
    }
}
