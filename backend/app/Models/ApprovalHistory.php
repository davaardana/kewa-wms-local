<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApprovalHistory extends Model
{
    use HasFactory;

    protected $fillable = [
        'approval_request_id',
        'step_order',
        'step_name',
        'designated_user_id',
        'action_by_user_id',
        'action',
        'comments',
        'action_at',
        'meta_json',
    ];

    protected function casts(): array
    {
        return [
            'step_order' => 'integer',
            'action_at' => 'datetime',
            'meta_json' => 'array',
        ];
    }

    public function approvalRequest(): BelongsTo
    {
        return $this->belongsTo(ApprovalRequest::class);
    }

    public function designatedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'designated_user_id');
    }

    public function actionByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'action_by_user_id');
    }
}
