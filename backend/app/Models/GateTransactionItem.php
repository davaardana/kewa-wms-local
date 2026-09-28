<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GateTransactionItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'gate_transaction_id',
        'item_id',
        'requested_qty',
        'passed_qty',
        'returned_condition',
    ];

    protected function casts(): array
    {
        return [
            'requested_qty' => 'integer',
            'passed_qty' => 'integer',
        ];
    }

    public function gateTransaction(): BelongsTo
    {
        return $this->belongsTo(GateTransaction::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
