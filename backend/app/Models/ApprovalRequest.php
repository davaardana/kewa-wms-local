<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ApprovalRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'request_number',
        'module',
        'reference_id',
        'reference_code',
        'title',
        'project_id',
        'warehouse_id',
        'requester_user_id',
        'current_step_order',
        'total_steps',
        'current_approver_user_id',
        'status',
        'total_amount',
        'steps_snapshot_json',
        'meta_data_json',
        'final_approved_at',
        'final_approved_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'current_step_order' => 'integer',
            'total_steps' => 'integer',
            'total_amount' => 'decimal:2',
            'steps_snapshot_json' => 'array',
            'meta_data_json' => 'array',
            'final_approved_at' => 'datetime',
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

    public function requesterUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requester_user_id');
    }

    public function currentApproverUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'current_approver_user_id');
    }

    public function finalApprovedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'final_approved_by_user_id');
    }

    public function histories(): HasMany
    {
        return $this->hasMany(ApprovalHistory::class)->orderBy('id');
    }
}
