<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SpkItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'spk_id',
        'item_id',
        'target_qty',
        'price_per_unit',
        'received_qty',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'target_qty' => 'integer',
            'received_qty' => 'integer',
            'price_per_unit' => 'decimal:2',
        ];
    }

    public function spk(): BelongsTo
    {
        return $this->belongsTo(Spk::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
