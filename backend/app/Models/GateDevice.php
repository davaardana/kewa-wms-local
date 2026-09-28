<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GateDevice extends Model
{
    use HasFactory;

    protected $fillable = [
        'warehouse_id',
        'device_code',
        'api_token_hash',
        'device_name',
        'device_model',
        'device_role',
        'ip_address',
        'edge_ws_url',
        'tcp_port',
        'status',
        'last_heartbeat_at',
        'metrics_json',
        'internet_downtime_tolerance_seconds',
        'is_active',
    ];

    protected $appends = [
        'computed_status',
    ];

    protected $hidden = [
        'api_token_hash',
    ];

    protected function casts(): array
    {
        return [
            'tcp_port' => 'integer',
            'last_heartbeat_at' => 'datetime',
            'metrics_json' => 'array',
            'internet_downtime_tolerance_seconds' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function getComputedStatusAttribute(): string
    {
        if (!$this->is_active) {
            return 'inactive';
        }

        if (!$this->last_heartbeat_at) {
            return 'offline';
        }

        $secondsSinceLastPing = Carbon::now()->diffInSeconds($this->last_heartbeat_at, true);
        $tolerance = $this->internet_downtime_tolerance_seconds ?: 90;
        if ($secondsSinceLastPing <= 20) {
            return 'online';
        } elseif ($secondsSinceLastPing <= $tolerance) {
            return 'warning';
        }

        return 'offline';
    }
}
