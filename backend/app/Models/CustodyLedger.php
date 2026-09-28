<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class CustodyLedger extends Model
{
    use HasFactory;

    protected static function booted(): void
    {
        static::updating(fn () => throw new \LogicException('Custody ledger is append-only.'));
        static::deleting(fn () => throw new \LogicException('Custody ledger is append-only.'));
    }

    public $timestamps = false; // Append-only immutable ledger, only created_at used
    protected $table = 'custody_ledger';

    protected $fillable = [
        'tag_epc',
        'item_id',
        'holder_user_id',
        'action',
        'ref_type',
        'ref_id',
        'warehouse_id',
        'latitude',
        'longitude',
        'photo_url',
        'notes',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'latitude' => 'float',
            'longitude' => 'float',
            'created_at' => 'datetime',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function holder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'holder_user_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function rfidTag(): BelongsTo
    {
        return $this->belongsTo(RfidTag::class, 'tag_epc', 'epc');
    }

    public function reference(): MorphTo
    {
        return $this->morphTo('ref');
    }
}
