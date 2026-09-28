<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Principal extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'code',
        'contact_person',
        'phone',
        'email',
        'address',
    ];

    public function projects(): HasMany
    {
        return $this->hasMany(Project::class);
    }

    public function spks(): HasMany
    {
        return $this->hasMany(Spk::class);
    }
}
