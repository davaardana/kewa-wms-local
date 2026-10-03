<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ShippingDocument extends Model
{
    protected $fillable = [
        'document_number',
        'type',
        'status',
        'created_by_user_id',
        'approved_by_user_id',
        'approved_at',
        'warehouse_id',
        'notes',
        'attachments',
    ];

    protected $casts = [
        'approved_at' => 'datetime',
        'attachments' => 'array',
    ];

    // --- Relationships ---

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(ShippingDocumentItem::class);
    }

    public function tags(): HasMany
    {
        return $this->hasMany(ShippingDocumentTag::class);
    }

    // --- Helpers ---

    /**
     * Check if all expected tags have been scanned.
     */
    public function isFullyScanned(): bool
    {
        return $this->tags()->where('status', '!=', 'scanned')->doesntExist()
            && $this->tags()->exists();
    }

    /**
     * Get scan progress as percentage.
     */
    public function getScanProgressAttribute(): float
    {
        $total = $this->tags()->count();
        if ($total === 0) return 0;
        $scanned = $this->tags()->where('status', 'scanned')->count();
        return round(($scanned / $total) * 100, 1);
    }

    /**
     * Generate next document number.
     */
    public static function generateDocumentNumber(string $type): string
    {
        $prefix = $type === 'inbound' ? 'IN' : 'OUT';
        $date = now()->format('Ymd');

        // Lock the last row to prevent race condition on concurrent creates
        $lastDoc = static::where('document_number', 'like', "DOC-{$prefix}-{$date}-%")
            ->orderByDesc('document_number')
            ->lockForUpdate()
            ->first();

        $seq = 1;
        if ($lastDoc) {
            $parts = explode('-', $lastDoc->document_number);
            $lastSeq = (int) end($parts);
            $seq = $lastSeq + 1;
        }

        return sprintf('DOC-%s-%s-%03d', $prefix, $date, $seq);
    }
}
