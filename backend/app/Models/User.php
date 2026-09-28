<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'phone',
        'is_active',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
        ];
    }

    public function isSuperAdmin(): bool
    {
        return $this->role === 'superadmin';
    }

    public function isManagement(): bool
    {
        return in_array($this->role, ['management', 'superadmin']);
    }

    public function isPm(): bool
    {
        return in_array($this->role, ['pm', 'superadmin']);
    }

    public function isProcurement(): bool
    {
        return in_array($this->role, ['procurement', 'superadmin']);
    }

    public function isStoreroom(): bool
    {
        return in_array($this->role, ['storeroom', 'superadmin']);
    }

    public function isPic(): bool
    {
        return in_array($this->role, ['pic_lapangan', 'superadmin']);
    }

    public function assignedWarehouses(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(Warehouse::class, 'warehouse_staff')
            ->withPivot('role_in_warehouse')
            ->withTimestamps();
    }
}
