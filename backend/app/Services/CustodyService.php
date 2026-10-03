<?php

namespace App\Services;

use App\Models\CustodyLedger;
use App\Models\RfidTag;
use App\Models\ShippingDocument;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class CustodyService
{
    private const EVENT_CONTRACTS = [
        'TAG_ENROLLED'       => ['tag' => 'required', 'refs' => [null]],
        'STOCK_IN'           => ['tag' => 'optional', 'refs' => [null, ShippingDocument::class]],
        'GATE_OUT'           => ['tag' => 'required', 'refs' => [ShippingDocument::class]],
        'GATE_IN'            => ['tag' => 'required', 'refs' => [ShippingDocument::class]],
        'AUDIT_OPNAME'       => ['tag' => 'required', 'refs' => [null]],
        'DAMAGED_WRITE_OFF'  => ['tag' => 'required', 'refs' => [null]],
        'TAG_DECOMMISSIONED' => ['tag' => 'required', 'refs' => [null]],
        'TAG_REACTIVATED'    => ['tag' => 'required', 'refs' => [null]],
    ];

    /**
     * Record an immutable custody event in the ledger.
     */
    public function recordEvent(
        int $itemId,
        int $holderUserId,
        string $action,
        ?string $tagEpc = null,
        ?string $refType = null,
        ?int $refId = null,
        ?int $warehouseId = null,
        ?float $latitude = null,
        ?float $longitude = null,
        ?string $photoUrl = null,
        ?string $notes = null
    ): CustodyLedger {
        return DB::transaction(function () use ($itemId, $holderUserId, $action, $tagEpc, $refType, $refId, $warehouseId, $latitude, $longitude, $photoUrl, $notes) {
            $contract = self::EVENT_CONTRACTS[$action] ?? throw new \DomainException("Unsupported custody action: {$action}.");
            if (($refType === null) !== ($refId === null)) {
                throw new \DomainException('Custody reference type and ID must both be present or both be null.');
            }
            if (!in_array($refType, $contract['refs'], true)) {
                throw new \DomainException("Invalid reference type for custody action {$action}.");
            }
            if ($refType !== null && !$refType::query()->whereKey($refId)->exists()) {
                throw new \DomainException('Custody reference does not exist.');
            }

            $tagEpc = $tagEpc !== null ? strtoupper(trim($tagEpc)) : null;
            if (($contract['tag'] === 'required' && $tagEpc === null) || ($contract['tag'] === 'forbidden' && $tagEpc !== null)) {
                throw new \DomainException("Invalid RFID tag usage for custody action {$action}.");
            }

            $tag = null;
            if ($tagEpc !== null) {
                $tag = RfidTag::where('epc', $tagEpc)->lockForUpdate()->first();
                if (!$tag || (int) $tag->item_id !== $itemId) {
                    throw new \DomainException('Custody EPC is unregistered or belongs to another item.');
                }

                $tagUpdate = ['last_read_at' => Carbon::now()];
                if ($action === 'GATE_OUT') {
                    $tagUpdate['last_warehouse_id'] = null;
                } elseif ($action === 'STOCK_IN') {
                    $tagUpdate['last_warehouse_id'] = $warehouseId;
                    $tagUpdate['status'] = 'active';
                }
                $tag->update($tagUpdate);
            }

            return CustodyLedger::create([
                'tag_epc' => $tagEpc, 'item_id' => $itemId, 'holder_user_id' => $holderUserId,
                'action' => $action, 'ref_type' => $refType, 'ref_id' => $refId,
                'warehouse_id' => $warehouseId, 'latitude' => $latitude, 'longitude' => $longitude,
                'photo_url' => $photoUrl, 'notes' => $notes, 'created_at' => Carbon::now(),
            ]);
        });
    }

    /**
     * Get full chronological custody history for a specific RFID EPC tag.
     */
    public function getTagHistory(string $tagEpc): Collection
    {
        return CustodyLedger::with(['holder', 'warehouse', 'item'])
            ->where('tag_epc', $tagEpc)
            ->orderBy('created_at', 'asc')
            ->get();
    }

    /**
     * Get audit trail for a specific Work Order or Transaction reference.
     */
    public function getReferenceHistory(string $refType, int $refId): Collection
    {
        return CustodyLedger::with(['holder', 'warehouse', 'item', 'rfidTag'])
            ->where('ref_type', $refType)
            ->where('ref_id', $refId)
            ->orderBy('created_at', 'asc')
            ->get();
    }
}
