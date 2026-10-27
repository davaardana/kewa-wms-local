<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShippingDocumentTag extends Model
{
    protected $fillable = [
        'shipping_document_id',
        'shipping_document_item_id',
        'rfid_tag_id',
        'tag_epc',
        'scanned_at',
        'status',
        'length_dispatched',
    ];

    protected $casts = [
        'scanned_at'        => 'datetime',
        'length_dispatched' => 'decimal:3',
    ];

    // --- Relationships ---

    public function shippingDocument(): BelongsTo
    {
        return $this->belongsTo(ShippingDocument::class);
    }

    public function documentItem(): BelongsTo
    {
        return $this->belongsTo(ShippingDocumentItem::class, 'shipping_document_item_id');
    }

    public function rfidTag(): BelongsTo
    {
        return $this->belongsTo(RfidTag::class);
    }
}
