<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ApprovalConfig extends Model
{
    use HasFactory;

    protected $fillable = [
        'scope_type',
        'project_id',
        'warehouse_id',
        'module',
        'use_template',
        'approval_template_id',
        'description',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'use_template' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(ApprovalTemplate::class, 'approval_template_id');
    }

    public function customSteps(): HasMany
    {
        return $this->hasMany(ApprovalConfigStep::class)->orderBy('step_order');
    }
}
