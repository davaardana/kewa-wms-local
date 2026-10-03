<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ShippingDocumentItem extends Model
{
    protected $fillable = [
        'shipping_document_id',
        'item_id',
        'expected_qty',
        'scanned_qty',
    ];

    // --- Relationships ---

    public function shippingDocument(): BelongsTo
    {
        return $this->belongsTo(ShippingDocument::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function tags(): HasMany
    {
        return $this->hasMany(ShippingDocumentTag::class);
    }

    // --- Helpers ---

    /**
     * Check if scanned qty matches expected qty.
     */
    public function isComplete(): bool
    {
        return $this->scanned_qty >= $this->expected_qty;
    }
}
