<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkOrder extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'spk_id',
        'warehouse_id',
        'pm_user_id',
        'wo_number',
        'title',
        'status',
        'approved_by_user_id',
        'approved_at',
        'target_completion_date',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'approved_at' => 'datetime',
            'target_completion_date' => 'date',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function spk(): BelongsTo
    {
        return $this->belongsTo(Spk::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function pm(): BelongsTo
    {
        return $this->belongsTo(User::class, 'pm_user_id');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }

    public function boqItems(): HasMany
    {
        return $this->hasMany(BoqItem::class);
    }

    public function gateTransactions(): HasMany
    {
        return $this->hasMany(GateTransaction::class);
    }

    public function approvalRequest(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(ApprovalRequest::class, 'reference_id')
            ->where('module', 'WORK_ORDER')
            ->latestOfMany();
    }
}
