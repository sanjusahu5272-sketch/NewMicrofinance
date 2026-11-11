<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Model;

class MessageLog extends Model
{
    protected $table = 'mfi_message_logs';

    protected $fillable = [
        'tenant_code',
        'channel',
        'message_type',
        'recipient',
        'sender',
        'subject',
        'body',
        'provider',
        'provider_msg_id',
        'status',
        'attempts',
        'error',
        'sent_at',
    ];

    protected function casts(): array
    {
        return [
            'sent_at' => 'datetime',
            'attempts' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::addGlobalScope(new TenantScope());
    }
}
