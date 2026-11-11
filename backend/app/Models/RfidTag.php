<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RfidTag extends Model
{
    use HasFactory;

    protected $fillable = [
        'epc',
        'item_id',
        'tag_type',
        'status',
        'last_warehouse_id',
        'project_id',
        'last_read_at',
        'notes',
        'total_length_m',
        'remaining_length_m',
    ];

    protected function casts(): array
    {
        return [
            'last_read_at'       => 'datetime',
            'total_length_m'     => 'float',
            'remaining_length_m' => 'float',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function lastWarehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'last_warehouse_id');
    }

    public function isLengthBased(): bool
    {
        return $this->remaining_length_m !== null;
    }

    public function custodyLogs(): HasMany
    {
        return $this->hasMany(CustodyLedger::class, 'tag_epc', 'epc');
    }
}
