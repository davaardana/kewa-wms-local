<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GatePassEvent extends Model
{
    use HasFactory;

    protected static function booted(): void
    {
        static::deleting(fn () => throw new \LogicException('Gate events are immutable audit evidence.'));
    }

    protected $fillable = [
        'gate_device_id',
        'event_id',
        'observed_at',
        'gate_transaction_id',
        'warehouse_id',
        'gate_id',
        'direction',
        'antenna_sequence',
        'tag_epcs_json',
        'total_tags_detected',
        'cctv_snapshot_path',
        'is_valid',
        'mismatch_flag',
        'mismatch_details',
        'raw_payload',
        'decision_result_json',
    ];

    protected function casts(): array
    {
        return [
            'tag_epcs_json' => 'array',
            'raw_payload' => 'array',
            'decision_result_json' => 'array',
            'observed_at' => 'datetime',
            'is_valid' => 'boolean',
            'mismatch_flag' => 'boolean',
            'total_tags_detected' => 'integer',
        ];
    }

    public function gateTransaction(): BelongsTo
    {
        return $this->belongsTo(GateTransaction::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }
}
