<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Delivery extends Model
{
    use HasFactory;

    protected $fillable = [
        'spk_id',
        'warehouse_id',
        'delivery_number',
        'received_by_user_id',
        'dispatched_by_user_id',
        'dispatched_at',
        'dispatch_epcs_json',
        'received_epcs_json',
        'reconciliation_status',
        'status',
        'proof_photo_url',
        'document_url',
        'receiving_proof_photo_url',
        'receiving_document_url',
        'verified_at',
        'notes',
    ];

    protected $appends = [
        'received_at',
    ];

    protected function casts(): array
    {
        return [
            'dispatch_epcs_json' => 'array',
            'received_epcs_json' => 'array',
            'dispatched_at' => 'datetime',
            'verified_at' => 'datetime',
        ];
    }

    public function getReceivedAtAttribute(): ?\Carbon\Carbon
    {
        return $this->verified_at ?? ($this->received_by_user_id ? $this->updated_at : null);
    }

    public function spk(): BelongsTo
    {
        return $this->belongsTo(Spk::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function receivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by_user_id');
    }

    public function dispatchedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dispatched_by_user_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(DeliveryItem::class);
    }

    public function approvalRequest(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(ApprovalRequest::class, 'reference_id')
            ->where('module', 'DELIVERY')
            ->latestOfMany();
    }
}
