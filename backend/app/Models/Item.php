<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Item extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'category',
        'is_metal',
        'is_reusable',
        'is_serialized_tag',
        'is_length_based',
        'unit',
        'min_stock',
        'description',
        'epc_prefix',
        'epc_suffix_digits',
        'epc_next_sequence',
    ];

    protected function casts(): array
    {
        return [
            'is_metal'          => 'boolean',
            'is_reusable'       => 'boolean',
            'is_serialized_tag' => 'boolean',
            'is_length_based'   => 'boolean',
            'min_stock'         => 'integer',
            'epc_suffix_digits' => 'integer',
            'epc_next_sequence' => 'integer',
        ];
    }

    public function rfidTags(): HasMany
    {
        return $this->hasMany(RfidTag::class);
    }

    public function custodyLogs(): HasMany
    {
        return $this->hasMany(CustodyLedger::class);
    }
}
