<?php

namespace App\Services;

use App\Models\BoqItem;
use App\Models\WorkOrder;
use Carbon\Carbon;

class QuotaValidatorService
{
    /**
     * Check if requested items for a WorkOrder exceed remaining BOQ quota.
     *
     * @param WorkOrder $workOrder
     * @param array $requestedItems Array of ['item_id' => int, 'quantity' => int]
     * @return array ['can_fulfill' => bool, 'violations' => array, 'summary' => array]
     */
    public function validateWithdrawalQuota(WorkOrder $workOrder, array $requestedItems): array
    {
        $boqItems = $workOrder->boqItems()->with('item')->get()->keyBy('item_id');
        $violations = [];
        $summary = [];

        foreach ($requestedItems as $req) {
            $itemId = $req['item_id'];
            $reqQty = (int) $req['quantity'];

            if (!$boqItems->has($itemId)) {
                $violations[] = [
                    'item_id' => $itemId,
                    'reason' => 'Item not found in approved Work Order BOQ',
                    'requested_qty' => $reqQty,
                    'remaining_quota' => 0,
                ];
                continue;
            }

            /** @var BoqItem $boq */
            $boq = $boqItems->get($itemId);
            $remaining = $boq->remaining_quota;

            if ($reqQty > $remaining) {
                $violations[] = [
                    'item_id' => $itemId,
                    'item_name' => $boq->item->name ?? "Item #{$itemId}",
                    'reason' => 'Requested quantity exceeds remaining BOQ quota',
                    'requested_qty' => $reqQty,
                    'remaining_quota' => $remaining,
                    'shortage' => $reqQty - $remaining,
                ];
            }

            $summary[] = [
                'item_id' => $itemId,
                'item_name' => $boq->item->name ?? "Item #{$itemId}",
                'quota_qty' => $boq->quota_qty,
                'withdrawn_qty' => $boq->withdrawn_qty,
                'returned_qty' => $boq->returned_qty,
                'remaining_quota' => $remaining,
                'requested_qty' => $reqQty,
            ];
        }

        return [
            'can_fulfill' => empty($violations),
            'violations' => $violations,
            'summary' => $summary,
        ];
    }

    /**
     * Check if a gate transaction meets criteria for auto-approval.
     * Normal case: within quota, work order is approved, valid active PIC, normal operating hours (07:00 - 18:00).
     */
    public function canAutoApprove(WorkOrder $workOrder, array $requestedItems, ?Carbon $time = null): bool
    {
        $time = $time ?? Carbon::now();

        // 1. Work Order must be approved
        if ($workOrder->status !== 'approved' && $workOrder->status !== 'in_progress') {
            return false;
        }

        // 2. Must be within normal operating hours (07:00 to 18:00)
        $hour = (int) $time->format('H');
        if ($hour < 7 || $hour >= 18) {
            return false;
        }

        // 3. Must not exceed quota
        $quotaValidation = $this->validateWithdrawalQuota($workOrder, $requestedItems);
        if (!$quotaValidation['can_fulfill']) {
            return false;
        }

        // 4. Storeroom must have prepared the physical items (prepared_qty >= requested_qty)
        $boqItems = $workOrder->boqItems()->get()->keyBy('item_id');
        foreach ($requestedItems as $req) {
            $itemId = $req['item_id'];
            $reqQty = (int) $req['quantity'];
            $boq = $boqItems->get($itemId);
            if (!$boq || $boq->prepared_qty < $reqQty) {
                return false;
            }
        }

        return true;
    }
}
