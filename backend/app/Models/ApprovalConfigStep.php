<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApprovalConfigStep extends Model
{
    use HasFactory;

    protected $fillable = [
        'approval_config_id',
        'step_order',
        'step_name',
        'approver_user_id',
        'sla_hours',
        'can_reject',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'step_order' => 'integer',
            'sla_hours' => 'integer',
            'can_reject' => 'boolean',
        ];
    }

    public function config(): BelongsTo
    {
        return $this->belongsTo(ApprovalConfig::class, 'approval_config_id');
    }

    public function approverUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approver_user_id');
    }
}
