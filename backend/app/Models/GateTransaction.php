<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GateTransaction extends Model
{
    use HasFactory;

    protected $fillable = [
        'transaction_number',
        'work_order_id',
        'warehouse_id',
        'pic_user_id',
        'vehicle_id',
        'plate_number_snapshot',
        'type',
        'status',
        'is_auto_approved',
        'approved_by_user_id',
        'approved_at',
        'rejection_reason',
        'valid_until',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'is_auto_approved' => 'boolean',
            'approved_at' => 'datetime',
            'valid_until' => 'datetime',
        ];
    }

    public function workOrder(): BelongsTo
    {
        return $this->belongsTo(WorkOrder::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function pic(): BelongsTo
    {
        return $this->belongsTo(User::class, 'pic_user_id');
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(GateTransactionItem::class);
    }

    public function passEvents(): HasMany
    {
        return $this->hasMany(GatePassEvent::class);
    }

    public function isCurrentlyValid(): bool
    {
        return $this->status === 'approved' &&
               ($this->valid_until === null || $this->valid_until->isFuture());
    }
}
