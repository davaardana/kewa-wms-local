<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShippingDocumentAudit extends Model
{
    protected static function booted(): void
    {
        static::updating(fn () => throw new \LogicException('Shipping document audit is append-only.'));
        static::deleting(fn () => throw new \LogicException('Shipping document audit is append-only.'));
    }

    public $timestamps = false;

    protected $fillable = [
        'shipping_document_id',
        'actor_user_id',
        'action',
        'before_json',
        'after_json',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'before_json' => 'array',
            'after_json' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function shippingDocument(): BelongsTo
    {
        return $this->belongsTo(ShippingDocument::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
