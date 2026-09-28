<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeliveryItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'delivery_id',
        'item_id',
        'spk_qty',
        'delivered_qty',
        'difference_qty',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'spk_qty' => 'integer',
            'delivered_qty' => 'integer',
            'difference_qty' => 'integer',
        ];
    }

    public function delivery(): BelongsTo
    {
        return $this->belongsTo(Delivery::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
