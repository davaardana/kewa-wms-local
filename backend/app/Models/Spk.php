<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Spk extends Model
{
    use HasFactory;

    protected $fillable = [
        'principal_id',
        'project_id',
        'created_by_user_id',
        'spk_number',
        'title',
        'total_amount',
        'payment_status',
        'payment_terms_json',
        'document_url',
        'start_date',
        'end_date',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'total_amount' => 'decimal:2',
            'payment_terms_json' => 'array',
            'start_date' => 'date',
            'end_date' => 'date',
        ];
    }

    public function principal(): BelongsTo
    {
        return $this->belongsTo(Principal::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(SpkItem::class);
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(Delivery::class);
    }

    public function approvalRequest(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(ApprovalRequest::class, 'reference_id')
            ->where('module', 'SPK')
            ->latestOfMany();
    }
}
