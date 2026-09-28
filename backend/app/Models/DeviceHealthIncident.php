<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeviceHealthIncident extends Model
{
    protected $fillable = ['gate_device_id', 'event_id', 'component', 'status', 'reason', 'observed_at', 'received_at'];

    protected function casts(): array
    {
        return ['observed_at' => 'datetime', 'received_at' => 'datetime'];
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(GateDevice::class, 'gate_device_id');
    }
}