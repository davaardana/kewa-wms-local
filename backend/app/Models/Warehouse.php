<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Warehouse extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'code',
        'name',
        'gate_mode',
        'address',
        'latitude',
        'longitude',
        'is_active',
        'pic_user_id',
        'phone',
        'capacity',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'latitude' => 'float',
            'longitude' => 'float',
            'capacity' => 'integer',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function projects(): BelongsToMany
    {
        return $this->belongsToMany(Project::class, 'project_warehouses')
            ->withPivot('is_primary')
            ->withTimestamps();
    }

    public function pic(): BelongsTo
    {
        return $this->belongsTo(User::class, 'pic_user_id');
    }

    public function staff(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(User::class, 'warehouse_staff')
            ->withPivot('role_in_warehouse')
            ->withTimestamps();
    }

    public function rfidTags(): HasMany
    {
        return $this->hasMany(RfidTag::class, 'last_warehouse_id');
    }

    public function devices(): HasMany
    {
        return $this->hasMany(GateDevice::class);
    }
}
