<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ApprovalTemplate extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'code',
        'module',
        'description',
        'is_default',
        'min_amount',
        'max_amount',
    ];

    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
            'min_amount' => 'decimal:2',
            'max_amount' => 'decimal:2',
        ];
    }

    public function steps(): HasMany
    {
        return $this->hasMany(ApprovalTemplateStep::class)->orderBy('step_order');
    }

    public function configs(): HasMany
    {
        return $this->hasMany(ApprovalConfig::class);
    }
}
