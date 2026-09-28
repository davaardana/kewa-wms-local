<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BoqItem;
use App\Models\GateTransaction;
use App\Models\GateTransactionItem;
use App\Models\GatePassEvent;
use App\Models\RfidTag;
use App\Models\WorkOrder;
use App\Services\CustodyService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ReturnController extends Controller
{
    public function __construct(protected CustodyService $custodyService) {}

    /**
     * PIC Lapangan initiates return of unused materials.
     */
    public function createReturnRequest(Request $request): JsonResponse
    {
        if (!$request->user()->isPic()) {
            return response()->json(['message' => 'Only field PIC may create a return request.'], 403);
        }

        $validated = $request->validate([
            'work_order_id' => 'required|exists:work_orders,id',
            'warehouse_id' => 'required|exists:warehouses,id',
            'items' => 'required|array|min:1',
            'items.*.item_id' => 'required|exists:items,id',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.condition' => 'required|in:good,damaged,scrap',
            'notes' => 'nullable|string',
        ]);

        $wo = WorkOrder::with('boqItems')->findOrFail($validated['work_order_id']);
        if ((int) $wo->warehouse_id !== (int) $validated['warehouse_id'] || !in_array($wo->status, ['approved', 'in_progress'], true)) {
            return response()->json(['message' => 'Return warehouse or work-order state is invalid.'], 422);
        }
        if (collect($validated['items'])->pluck('item_id')->duplicates()->isNotEmpty()) {
            return response()->json(['message' => 'Return items must be unique.'], 422);
        }

        // Check that returned qty doesn't exceed withdrawn qty
        foreach ($validated['items'] as $itemInput) {
            $boq = $wo->boqItems->firstWhere('item_id', $itemInput['item_id']);
            if (!$boq) {
                return response()->json(['message' => "Item #{$itemInput['item_id']} is not in this Work Order."], 422);
            }
            $outstanding = max(0, $boq->withdrawn_qty - $boq->returned_qty - $boq->installed_qty);
            if ($itemInput['quantity'] > $outstanding) {
                return response()->json([
                    'message' => "Returned quantity for item #{$itemInput['item_id']} exceeds current withdrawn balance.",
                ], 422);
            }
        }

        return DB::transaction(function () use ($validated, $wo, $request) {
            $txNumber = 'RET-' . strtoupper(Str::random(4)) . '-' . date('ymdHis');

            $tx = GateTransaction::create([
                'transaction_number' => $txNumber,
                'work_order_id' => $wo->id,
                'warehouse_id' => $validated['warehouse_id'],
                'pic_user_id' => $request->user()->id,
                'type' => 'IN_RETURN',
                'status' => 'approved', // Return transactions auto-authorized for gate inbound entry
                'is_auto_approved' => true,
                'approved_by_user_id' => $request->user()->id,
                'approved_at' => Carbon::now(),
                'valid_until' => Carbon::now()->addHours(4),
                'notes' => $validated['notes'] ?? null,
            ]);

            foreach ($validated['items'] as $itemData) {
                GateTransactionItem::create([
                    'gate_transaction_id' => $tx->id,
                    'item_id' => $itemData['item_id'],
                    'requested_qty' => $itemData['quantity'],
                    'passed_qty' => 0,
                    'returned_condition' => $itemData['condition'],
                ]);

                // Record custody ledger for field return initiation
                $this->custodyService->recordEvent(
                    itemId: $itemData['item_id'],
                    holderUserId: $request->user()->id,
                    action: 'FIELD_RETURN',
                    refType: GateTransaction::class,
                    refId: $tx->id,
                    warehouseId: $validated['warehouse_id'],
                    notes: "PIC initiated return of {$itemData['quantity']} pcs (condition: {$itemData['condition']})"
                );
            }

            return response()->json([
                'message' => 'Return request created and approved for gate entry.',
                'transaction' => $tx->load(['items.item', 'pic']),
            ], 201);
        });
    }

    /**
     * Storeroom physical verification of returned goods vs gate count.
     */
    public function verifyReturn(Request $request, int $transactionId): JsonResponse
    {
        $validated = $request->validate([
            'verified_items' => 'required|array|min:1',
            'verified_items.*.item_id' => 'required|exists:items,id',
            'verified_items.*.physical_qty' => 'required|integer|min:0',
            'notes' => 'nullable|string',
        ]);

        if (!$request->user()->isStoreroom()) {
            return response()->json(['message' => 'Only storeroom may verify returns.'], 403);
        }
        if (collect($validated['verified_items'])->pluck('item_id')->duplicates()->isNotEmpty()) {
            return response()->json(['message' => 'Verified items must be unique.'], 422);
        }

        return DB::transaction(function () use ($validated, $transactionId, $request) {
            $tx = GateTransaction::with(['items.item', 'workOrder.boqItems'])->lockForUpdate()->findOrFail($transactionId);
            if ($tx->type !== 'IN_RETURN' || $tx->status !== 'completed' || (int) $tx->pic_user_id === (int) $request->user()->id) {
                return response()->json(['message' => 'Return transaction type, state, or verifier is invalid.'], 422);
            }
            if (!$request->user()->isSuperAdmin() && !$request->user()->assignedWarehouses()->whereKey($tx->warehouse_id)->exists()) {
                return response()->json(['message' => 'Verifier is not assigned to this warehouse.'], 403);
            }

            $expected = $tx->items->mapWithKeys(fn ($item) => [(int) $item->item_id => (int) $item->passed_qty])->all();
            $physical = collect($validated['verified_items'])->mapWithKeys(fn ($item) => [(int) $item['item_id'] => (int) $item['physical_qty']])->all();
            $isMatched = $expected === $physical;

            foreach ($validated['verified_items'] as $vItem) {
                $txItem = $tx->items->firstWhere('item_id', $vItem['item_id']);
                if ($txItem) {
                    $physQty = (int) $vItem['physical_qty'];

                    // Update BOQ item return counts
                    $boq = BoqItem::where('work_order_id', $tx->work_order_id)
                        ->where('item_id', $vItem['item_id'])
                        ->lockForUpdate()
                        ->first();

                    $outstanding = $boq ? max(0, $boq->withdrawn_qty - $boq->returned_qty - $boq->installed_qty) : 0;
                    if ($isMatched && $physQty > $outstanding) {
                        throw new \DomainException("Return quantity exceeds outstanding custody for item {$vItem['item_id']}.");
                    }
                    if ($isMatched) {
                        if (!$boq) {
                            throw new \DomainException("Return item {$vItem['item_id']} is not part of the Work Order BOQ.");
                        }
                        $boq->increment('returned_qty', $physQty);
                    }
                }
            }

            if ($isMatched) {
                $epcs = GatePassEvent::where('gate_transaction_id', $tx->id)->where('is_valid', true)
                    ->pluck('tag_epcs_json')->flatten()->filter()->unique()->values();
                $tags = RfidTag::whereIn('epc', $epcs)->orderBy('id')->lockForUpdate()->get();
                $tagCounts = $tags->countBy(fn ($tag) => (int) $tag->item_id)->all();

                if ($tags->count() !== $epcs->count() || $tagCounts !== $physical
                    || $tags->contains(fn ($tag) => $tag->status !== 'attached')) {
                    throw new \DomainException('Verified return EPCs do not match physical items or tag state.');
                }

                foreach ($tags as $tag) {
                    $this->custodyService->recordEvent(
                        itemId: $tag->item_id,
                        holderUserId: $request->user()->id,
                        action: 'STOCK_IN',
                        tagEpc: $tag->epc,
                        refType: GateTransaction::class,
                        refId: $tx->id,
                        warehouseId: $tx->warehouse_id,
                        notes: 'Storeroom physical return verified: MATCH'
                    );
                }
            }

            $tx->update([
                'status' => $isMatched ? 'return_verified' : 'return_mismatch',
                'notes' => ($tx->notes ? $tx->notes . ' | ' : '') . ($isMatched ? 'Physical verified: MATCH' : 'Physical verified: MISMATCH FLAG'),
            ]);

            return response()->json([
                'message' => $isMatched ? 'Physical return verified and stock updated.' : 'Return verification flagged for mismatch.',
                'is_matched' => $isMatched,
                'transaction' => $tx->fresh(['items.item']),
            ]);
        });
    }
}
