<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BoqItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'work_order_id',
        'item_id',
        'quota_qty',
        'prepared_qty',
        'withdrawn_qty',
        'returned_qty',
        'installed_qty',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'quota_qty' => 'integer',
            'prepared_qty' => 'integer',
            'withdrawn_qty' => 'integer',
            'returned_qty' => 'integer',
            'installed_qty' => 'integer',
        ];
    }

    public function workOrder(): BelongsTo
    {
        return $this->belongsTo(WorkOrder::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    // Helper: Remaining quota available for withdrawal
    public function getRemainingQuotaAttribute(): int
    {
        return max(0, $this->quota_qty - $this->withdrawn_qty + $this->returned_qty);
    }

    // Helper: Shortage between quota and prepared quantity
    public function getShortageQtyAttribute(): int
    {
        return max(0, $this->quota_qty - $this->prepared_qty);
    }
}
