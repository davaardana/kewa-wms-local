<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApprovalHistory;
use App\Models\ApprovalRequest;
use App\Models\Delivery;
use App\Models\DeliveryItem;
use App\Models\RfidTag;
use App\Models\Spk;
use App\Models\SpkItem;
use App\Services\ApprovalService;
use App\Services\CustodyService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DeliveryController extends Controller
{
    public function __construct(
        protected CustodyService $custodyService,
        protected ApprovalService $approvalService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = Delivery::with([
            'spk.principal',
            'spk.approvalRequest.currentApproverUser',
            'warehouse',
            'receivedBy',
            'dispatchedBy',
            'items.item',
            'approvalRequest.requesterUser',
            'approvalRequest.currentApproverUser',
            'approvalRequest.finalApprovedByUser',
        ]);

        if ($request->filled('warehouse_id')) {
            $query->where('warehouse_id', $request->warehouse_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        // Data Visibility Scoping: Dispatcher, Receiver, Approver Chain, Storeroom at WH, or SuperAdmin/Management
        $user = $request->user();
        if ($user && !$user->isManagement()) {
            $userId = $user->id;
            $query->where(function ($q) use ($userId, $user) {
                $q->where('dispatched_by_user_id', $userId)
                  ->orWhere('received_by_user_id', $userId)
                  ->orWhereHas('approvalRequest', function ($aq) use ($userId) {
                      $aq->where('requester_user_id', $userId)
                         ->orWhere('current_approver_user_id', $userId)
                         ->orWhere('final_approved_by_user_id', $userId)
                         ->orWhereHas('histories', function ($hq) use ($userId) {
                             $hq->where('action_by_user_id', $userId)
                                ->orWhere('designated_user_id', $userId);
                         })
                         ->orWhere('steps_snapshot_json', 'like', '%"approver_user_id":' . $userId . '%')
                         ->orWhere('steps_snapshot_json', 'like', '%"approver_user_id": ' . $userId . '%');
                  });

                if ($user->isPm()) {
                    $q->orWhereNotNull('id');
                }

                if ($user->isStoreroom()) {
                    $assignedWhIds = $user->assignedWarehouses->pluck('id')->toArray();
                    if (!empty($assignedWhIds)) {
                        $q->orWhereIn('warehouse_id', $assignedWhIds);
                    }
                }
            });
        }

        $deliveries = $query->latest()->get();
        return response()->json($this->enrichDeliveriesWithTags($deliveries));
    }

    /**
     * Enrich deliveries with RFID tag-to-item mapping for manifest verification
     */
    private function enrichDeliveriesWithTags($deliveries)
    {
        $isSingle = false;
        if ($deliveries instanceof Delivery) {
            $deliveries = collect([$deliveries]);
            $isSingle = true;
        }

        $allEpcs = collect($deliveries)
            ->flatMap(fn($d) => $d->dispatch_epcs_json ?? [])
            ->unique()
            ->filter()
            ->values();

        if ($allEpcs->isNotEmpty()) {
            $tagMap = RfidTag::with('item:id,name,code,unit')
                ->whereIn('epc', $allEpcs)
                ->get()
                ->keyBy('epc');

            foreach ($deliveries as $del) {
                $delEpcs = $del->dispatch_epcs_json ?? [];
                $epcItemMap = [];
                foreach ($delEpcs as $epc) {
                    $tag = $tagMap->get($epc);
                    if ($tag) {
                        $epcItemMap[$epc] = [
                            'epc' => $epc,
                            'item_id' => $tag->item_id,
                            'item_name' => $tag->item?->name ?? "Item #{$tag->item_id}",
                            'code' => $tag->item?->code ?? '-',
                            'item_code' => $tag->item?->code ?? '-',
                            'unit' => $tag->item?->unit ?? 'Unit',
                        ];
                    }
                }
                $del->epc_items_map = $epcItemMap;

                // Enrich each delivery item with assigned dispatched EPCs
                if ($del->relationLoaded('items')) {
                    foreach ($del->items as $dItem) {
                        $itemEpcs = [];
                        foreach ($delEpcs as $epc) {
                            if (isset($epcItemMap[$epc]) && $epcItemMap[$epc]['item_id'] == $dItem->item_id) {
                                $itemEpcs[] = $epc;
                            }
                        }
                        // Fallback: if only 1 item and no tag mapped yet, assign all delEpcs
                        if (empty($itemEpcs) && $del->items->count() === 1) {
                            $itemEpcs = $delEpcs;
                        }
                        $dItem->dispatched_epcs = $itemEpcs;
                    }
                }
            }
        }

        return $isSingle ? $deliveries->first() : $deliveries;
    }

    /**
     * Handheld 1 at Principal Yard: Record Dispatch Manifest & Tagging.
     */
    public function recordDispatchScan(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'spk_id' => 'required|exists:spks,id',
            'warehouse_id' => 'required|exists:warehouses,id',
            'delivery_number' => 'required|string|max:100|unique:deliveries,delivery_number',
            'dispatch_epcs' => 'required|array|min:1',
            'dispatch_epcs.*' => 'required|string',
            'items' => 'required|array|min:1',
            'items.*.item_id' => 'required|exists:items,id',
            'items.*.delivered_qty' => 'required|integer|min:0',
            'items.*.epcs' => 'nullable|array',
            'items.*.epcs.*' => 'nullable|string',
            'proof_photo_url' => 'nullable|string',
            'document_url' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        // Validate that SPK has been approved
        $spk = \App\Models\Spk::with(['approvalRequest', 'createdBy'])->findOrFail($validated['spk_id']);
        if ($spk->approvalRequest && $spk->approvalRequest->status !== 'approved') {
            return response()->json([
                'message' => "SPK {$spk->spk_number} belum disetujui di Pusat Approval (Status saat ini: {$spk->approvalRequest->status}). Truk tidak dapat dimuat.",
            ], 422);
        }

        // Validate that user is superadmin or the creator/originator of this SPK
        $user = $request->user();
        $dispatchEpcs = collect($validated['dispatch_epcs'])->map(fn ($epc) => strtoupper(trim($epc)))->filter()->values();
        if ($dispatchEpcs->unique()->count() !== $dispatchEpcs->count()) {
            return response()->json(['message' => 'Dispatch EPCs must be distinct.'], 422);
        }
        if (collect($validated['items'])->pluck('item_id')->duplicates()->isNotEmpty()) {
            return response()->json(['message' => 'Dispatch items must be unique.'], 422);
        }
        if ((int) collect($validated['items'])->sum('delivered_qty') !== $dispatchEpcs->count()) {
            return response()->json(['message' => 'Manifest quantity must equal distinct dispatch EPC count.'], 422);
        }
        if ($user && !$user->isSuperAdmin()) {
            $creatorId = $spk->created_by_user_id ?? $spk->approvalRequest?->requester_user_id;
            if ($creatorId && (int)$creatorId !== (int)$user->id) {
                $creatorName = $spk->createdBy?->name ?? 'Pembuat SPK';
                return response()->json([
                    'message' => "Akses Ditolak: Hanya pembuat SPK ({$creatorName}) atau Superadmin yang berwenang memuat truk untuk kontrak ini.",
                ], 403);
            }
        }

        // Validate SPK remaining quota: dispatch quantity cannot exceed target quota
        $spk->loadMissing(['items.item', 'deliveries.items']);
        foreach ($validated['items'] as $itemInput) {
            $spkItem = $spk->items->firstWhere('item_id', $itemInput['item_id']);
            if (!$spkItem) {
                $itemName = \App\Models\Item::find($itemInput['item_id'])?->name ?? "Item #{$itemInput['item_id']}";
                return response()->json([
                    'message' => "Material {$itemName} tidak terdaftar dalam kontrak SPK {$spk->spk_number}.",
                ], 422);
            }

            // Total quantity already dispatched in previous deliveries for this item
            $alreadyDispatched = (int) $spk->deliveries->flatMap->items
                ->where('item_id', $itemInput['item_id'])
                ->sum('delivered_qty');

            $remainingQuota = $spkItem->target_qty - $alreadyDispatched;
            if ($itemInput['delivered_qty'] > $remainingQuota) {
                $itemName = $spkItem->item?->name ?? "Item #{$itemInput['item_id']}";
                return response()->json([
                    'message' => "Melebihi Kuota SPK: Sisa kuota untuk {$itemName} adalah {$remainingQuota} unit (Target: {$spkItem->target_qty}, Telah Dimuat: {$alreadyDispatched}). Anda mencoba memuat {$itemInput['delivered_qty']} unit.",
                ], 422);
            }
        }

        return DB::transaction(function () use ($validated, $request, $spk, $dispatchEpcs) {
            $tags = RfidTag::whereIn('epc', $dispatchEpcs)->lockForUpdate()->get()->keyBy('epc');
            if ($tags->count() !== $dispatchEpcs->count()) {
                return response()->json(['message' => 'Every dispatch EPC must already be registered.'], 422);
            }
            foreach ($tags as $tag) {
                if (!in_array($tag->status, ['reserved', 'active', 'attached'], true) || $tag->last_warehouse_id !== null || ($tag->project_id && (int) $tag->project_id !== (int) $spk->project_id)) {
                    return response()->json(['message' => "EPC {$tag->epc} is inactive, already issued, at a warehouse, or assigned to another project."], 422);
                }
            }
            $delivery = Delivery::create([
                'spk_id' => $validated['spk_id'],
                'warehouse_id' => $validated['warehouse_id'],
                'delivery_number' => $validated['delivery_number'],
                'dispatched_by_user_id' => $request->user()->id,
                'dispatched_at' => Carbon::now(),
                'dispatch_epcs_json' => $dispatchEpcs->all(),
                'reconciliation_status' => 'in_transit',
                'status' => 'pending',
                'proof_photo_url' => $validated['proof_photo_url'] ?? null,
                'document_url' => $validated['document_url'] ?? null,
                'notes' => $validated['notes'] ?? 'Dispatched from Principal Yard (Handheld 1)',
            ]);

            foreach ($validated['items'] as $itemInput) {
                DeliveryItem::create([
                    'delivery_id' => $delivery->id,
                    'item_id' => $itemInput['item_id'],
                    'spk_qty' => $itemInput['delivered_qty'],
                    'delivered_qty' => $itemInput['delivered_qty'],
                    'difference_qty' => 0,
                ]);

                // If specific EPCs are supplied for this item, link or enroll RFID tag
                if (!empty($itemInput['epcs']) && is_array($itemInput['epcs'])) {
                    foreach ($itemInput['epcs'] as $epc) {
                        $epc = strtoupper(trim($epc));
                        if (!empty($epc)) {
                            $tag = $tags->get($epc);
                            if (!$tag || (int) $tag->item_id !== (int) $itemInput['item_id']) {
                                throw new \DomainException("EPC {$epc} does not match its manifest item.");
                            }
                            $tag->update(['status' => 'attached', 'project_id' => $spk->project_id, 'last_warehouse_id' => null]);
                        }
                    }
                }
            }

            // Fallback: If only 1 item and no items.*.epcs, associate all dispatch_epcs with that item
            if (count($validated['items']) === 1 && empty($validated['items'][0]['epcs'])) {
                $singleItemId = $validated['items'][0]['item_id'];
                foreach ($validated['dispatch_epcs'] as $epc) {
                    $epc = strtoupper(trim($epc));
                    if (!empty($epc)) {
                        $tag = $tags->get($epc);
                        if (!$tag || (int) $tag->item_id !== (int) $singleItemId) {
                            throw new \DomainException("EPC {$epc} does not match its manifest item.");
                        }
                        $tag->update(['status' => 'attached', 'project_id' => $spk->project_id, 'last_warehouse_id' => null]);
                    }
                }
            }

            return response()->json([
                'message' => 'Dispatch manifest recorded successfully at Principal Yard (Handheld 1).',
                'delivery' => $this->enrichDeliveriesWithTags($delivery->load(['items.item', 'dispatchedBy', 'warehouse'])),
            ], 201);
        });
    }

    /**
     * Handheld 2 at Warehouse Receiving: Scan Arrived Truck & Reconcile In-Transit vs Dispatched.
     */
    public function recordReceivingScan(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'received_epcs' => 'required|array|min:1',
            'received_epcs.*' => 'required|string',
            'proof_photo_url' => 'nullable|string',
            'document_url' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        $user = $request->user();
        if ($user && !in_array($user->role, ['superadmin', 'storeroom'])) {
            return response()->json([
                'message' => 'Akses Ditolak: Hanya Staf Gudang (Storeroom) atau Superadmin yang berwenang melakukan verifikasi bongkar & penerimaan truk (Handheld 2).',
            ], 403);
        }

        return DB::transaction(function () use ($id, $validated, $request) {
            $delivery = Delivery::with(['items.item', 'spk'])->lockForUpdate()->findOrFail($id);
            if ($delivery->status === 'approved' || $delivery->reconciliation_status === 'matched') {
                return response()->json(['message' => "Pengiriman #{$delivery->delivery_number} telah selesai diproses."], 409);
            }
            foreach (['proof_photo_url' => 'receiving_proof_photo_url', 'document_url' => 'receiving_document_url'] as $input => $column) {
                if ($delivery->{$column} !== null && array_key_exists($input, $validated) && $validated[$input] !== null && $validated[$input] !== $delivery->{$column}) {
                    return response()->json(['message' => 'Lampiran receiving yang telah disubmit tidak dapat diganti.'], 409);
                }
            }
            if (!$request->user()->isSuperAdmin() && !$request->user()->assignedWarehouses()->whereKey($delivery->warehouse_id)->exists()) {
                return response()->json(['message' => 'Receiver is not assigned to this warehouse.'], 403);
            }
            $dispatchedEpcs = $delivery->dispatch_epcs_json ?? [];
            $receivedEpcs = collect($validated['received_epcs'])->map(fn ($epc) => trim($epc))->filter()->unique()->values()->all();

            // Perform reconciliation comparison
            $matched = array_values(array_intersect($dispatchedEpcs, $receivedEpcs));
            $missingInTransit = array_values(array_diff($dispatchedEpcs, $receivedEpcs));
            $unexpected = array_values(array_diff($receivedEpcs, $dispatchedEpcs));

            $isFullMatch = empty($missingInTransit) && empty($unexpected);
            $reconciliationStatus = $isFullMatch ? 'matched' : 'mismatch_shortage';
            $deliveryStatus = $isFullMatch ? 'approved' : 'mismatch_flagged';

            $delivery->update([
                'received_by_user_id' => $request->user()->id,
                'received_epcs_json' => $receivedEpcs,
                'reconciliation_status' => $reconciliationStatus,
                'status' => $deliveryStatus,
                'receiving_proof_photo_url' => $delivery->receiving_proof_photo_url ?? ($validated['proof_photo_url'] ?? null),
                'receiving_document_url' => $delivery->receiving_document_url ?? ($validated['document_url'] ?? null),
                'verified_at' => $isFullMatch ? Carbon::now() : null,
                'notes' => $validated['notes'] ?? $delivery->notes,
            ]);

            // If matched / approved, record custody ledger for every received tag
            if ($isFullMatch) {
                // Auto-resolve any active pending approval request for this delivery
                $pendingApprovals = ApprovalRequest::where('module', 'DELIVERY')
                    ->where('reference_id', $delivery->id)
                    ->whereIn('status', ['pending', 'revision_requested'])
                    ->get();

                foreach ($pendingApprovals as $appReq) {
                    $appReq->update([
                        'status' => 'approved',
                        'current_approver_user_id' => null,
                        'final_approved_by_user_id' => $request->user()->id,
                        'final_approved_at' => Carbon::now(),
                        'title' => $appReq->title . ' (Terselesaikan Otomatis: Full Match)',
                    ]);

                    ApprovalHistory::create([
                        'approval_request_id' => $appReq->id,
                        'step_order' => $appReq->current_step_order,
                        'step_name' => 'Auto-Resolved',
                        'designated_user_id' => $appReq->current_approver_user_id ?? $request->user()->id,
                        'action_by_user_id' => $request->user()->id,
                        'action' => 'approved',
                        'comments' => 'Anomali terselesaikan otomatis: Seluruh muatan fisik berhasil diverifikasi lengkap (100% Match) oleh Storeroom.',
                        'action_at' => Carbon::now(),
                    ]);
                }

                $tags = RfidTag::with('item')->whereIn('epc', $receivedEpcs)->get()->keyBy('epc');

                if ($tags->count() !== count($receivedEpcs) || $tags->contains(fn ($tag) => $tag->status !== 'attached' || $tag->last_warehouse_id !== null || ($tag->project_id && (int) $tag->project_id !== (int) $delivery->spk?->project_id))) {
                    throw new \DomainException('Received EPC is inactive, already stocked/issued, unregistered, or assigned to another project.');
                }

                $actualCounts = $tags->countBy('item_id');
                foreach ($delivery->items as $dItem) {
                    if ((int) ($actualCounts[$dItem->item_id] ?? 0) !== (int) $dItem->delivered_qty) {
                        throw new \DomainException('Manifest item quantities do not match distinct received EPCs.');
                    }
                }

                foreach ($receivedEpcs as $epc) {
                    $item = $tags->has($epc) ? $tags->get($epc)->item : $delivery->items->first()?->item;
                    if ($item) {
                        $this->custodyService->recordEvent(
                            itemId: $item->id,
                            holderUserId: $request->user()->id,
                            action: 'STOCK_IN',
                            tagEpc: $epc,
                            refType: Delivery::class,
                            refId: $delivery->id,
                            warehouseId: $delivery->warehouse_id,
                            notes: "Stock-in receiving scan verified (Delivery #{$delivery->delivery_number})"
                        );
                    }
                }

                // Increment SPK received qty
                foreach ($delivery->items as $dItem) {
                    SpkItem::where('spk_id', $delivery->spk_id)
                        ->where('item_id', $dItem->item_id)
                        ->increment('received_qty', $dItem->delivered_qty);
                }
            } else {
                // Item breakdown for detailed audit trail in PM Approval Center
                $itemsBreakdown = $delivery->items->map(function ($dItem) {
                    return [
                        'item_id' => $dItem->item_id,
                        'item_name' => $dItem->item?->name ?? "Item #{$dItem->item_id}",
                        'item_code' => $dItem->item?->code ?? '-',
                        'code' => $dItem->item?->code ?? '-',
                        'delivered_qty' => $dItem->delivered_qty,
                    ];
                })->toArray();

                $metaData = [
                    'missing_in_transit_count' => count($missingInTransit),
                    'missing_epcs' => $missingInTransit,
                    'unexpected_epcs' => $unexpected,
                    'dispatched_count' => count($dispatchedEpcs),
                    'received_count' => count($receivedEpcs),
                    'proof_photo_url' => $delivery->receiving_proof_photo_url,
                    'document_url' => $delivery->receiving_document_url,
                    'notes' => $validated['notes'] ?? $delivery->notes,
                    'items_breakdown' => $itemsBreakdown,
                    'driver_name' => $delivery->driver_name ?? null,
                    'vehicle_plate' => $delivery->vehicle_plate ?? null,
                    'last_scanned_at' => Carbon::now()->toIso8601String(),
                ];

                // Check if an approval request already exists (prevent duplicate tickets on re-scan)
                $existingApproval = ApprovalRequest::where('module', 'DELIVERY')
                    ->where('reference_id', $delivery->id)
                    ->whereIn('status', ['pending', 'revision_requested'])
                    ->first();

                if ($existingApproval) {
                    $existingApproval->update([
                        'meta_data_json' => $metaData,
                    ]);

                    ApprovalHistory::create([
                        'approval_request_id' => $existingApproval->id,
                        'step_order' => $existingApproval->current_step_order,
                        'step_name' => 'Pembaruan Hasil Scan',
                        'designated_user_id' => $existingApproval->current_approver_user_id ?? $request->user()->id,
                        'action_by_user_id' => $request->user()->id,
                        'action' => 'revision_requested',
                        'comments' => 'Hasil verifikasi diperbarui oleh Storeroom: ' . ($validated['notes'] ?? ('Selisih ' . count($missingInTransit) . ' item.')),
                        'action_at' => Carbon::now(),
                    ]);
                } else {
                    $this->approvalService->createApprovalRequest(
                        module: 'DELIVERY',
                        referenceId: $delivery->id,
                        referenceCode: $delivery->delivery_number,
                        title: "Investigasi & Approval Selisih Pengiriman #{$delivery->delivery_number}",
                        requesterUserId: $request->user()->id,
                        projectId: $delivery->spk?->project_id,
                        warehouseId: $delivery->warehouse_id,
                        metaData: $metaData
                    );
                }
            }

            return response()->json([
                'message' => $isFullMatch
                    ? '100% Match! All dispatched items successfully received and restocked.'
                    : 'Mismatch detected between Principal Dispatch and Warehouse Receiving.',
                'reconciliation' => [
                    'status' => $reconciliationStatus,
                    'total_dispatched' => count($dispatchedEpcs),
                    'total_received' => count($receivedEpcs),
                    'matched_count' => count($matched),
                    'missing_in_transit_count' => count($missingInTransit),
                    'missing_epcs' => $missingInTransit,
                    'unexpected_epcs' => $unexpected,
                ],
                'delivery' => $this->enrichDeliveriesWithTags($delivery->fresh(['items.item', 'receivedBy', 'dispatchedBy'])),
            ]);
        });
    }

    /**
     * Standard Delivery Store (Form entry).
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'spk_id' => 'required|exists:spks,id',
            'warehouse_id' => 'required|exists:warehouses,id',
            'delivery_number' => 'required|string|max:100|unique:deliveries,delivery_number',
            'proof_photo_url' => 'nullable|string',
            'notes' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.item_id' => 'required|exists:items,id',
            'items.*.delivered_qty' => 'required|integer|min:0',
            'items.*.notes' => 'nullable|string',
        ]);

        return DB::transaction(function () use ($validated, $request) {
            $spk = Spk::with('items')->findOrFail($validated['spk_id']);
            $spkItemsMap = $spk->items->keyBy('item_id');

            $hasMismatch = false;
            $deliveryItemsData = [];

            foreach ($validated['items'] as $itemInput) {
                $itemId = $itemInput['item_id'];
                $deliveredQty = (int) $itemInput['delivered_qty'];
                $spkQty = $spkItemsMap->has($itemId) ? $spkItemsMap->get($itemId)->target_qty : 0;
                $difference = $deliveredQty - $spkQty;

                if ($difference !== 0) {
                    $hasMismatch = true;
                }

                $deliveryItemsData[] = [
                    'item_id' => $itemId,
                    'spk_qty' => $spkQty,
                    'delivered_qty' => $deliveredQty,
                    'difference_qty' => $difference,
                    'notes' => $itemInput['notes'] ?? null,
                ];
            }

            $status = $hasMismatch ? 'mismatch_flagged' : 'approved';

            $delivery = Delivery::create([
                'spk_id' => $validated['spk_id'],
                'warehouse_id' => $validated['warehouse_id'],
                'delivery_number' => $validated['delivery_number'],
                'received_by_user_id' => $request->user()->id,
                'status' => $status,
                'reconciliation_status' => $hasMismatch ? 'mismatch_shortage' : 'matched',
                'proof_photo_url' => $validated['proof_photo_url'] ?? null,
                'verified_at' => $hasMismatch ? null : Carbon::now(),
                'notes' => $validated['notes'] ?? null,
            ]);

            foreach ($deliveryItemsData as $dItem) {
                $dItem['delivery_id'] = $delivery->id;
                DeliveryItem::create($dItem);

                if ($status === 'approved') {
                    SpkItem::where('spk_id', $spk->id)
                        ->where('item_id', $dItem['item_id'])
                        ->increment('received_qty', $dItem['delivered_qty']);

                    $this->custodyService->recordEvent(
                        itemId: $dItem['item_id'],
                        holderUserId: $request->user()->id,
                        action: 'STOCK_IN',
                        refType: Delivery::class,
                        refId: $delivery->id,
                        warehouseId: $validated['warehouse_id'],
                        photoUrl: $validated['proof_photo_url'] ?? null,
                        notes: "Delivery #{$delivery->delivery_number} ({$dItem['delivered_qty']} pcs)"
                    );
                }
            }

            if ($hasMismatch) {
                $this->approvalService->createApprovalRequest(
                    module: 'DELIVERY',
                    referenceId: $delivery->id,
                    referenceCode: $delivery->delivery_number,
                    title: "Approval Selisih Manual Input Pengiriman #{$delivery->delivery_number}",
                    requesterUserId: $request->user()->id,
                    projectId: $spk->project_id,
                    warehouseId: $delivery->warehouse_id,
                    metaData: ['has_mismatch' => true]
                );
            }

            return response()->json([
                'message' => $hasMismatch
                    ? 'Delivery received with mismatch. Flagged for PM approval.'
                    : 'Delivery received and auto-approved.',
                'status' => $status,
                'delivery' => $delivery->load(['items.item', 'receivedBy', 'warehouse']),
            ], 201);
        });
    }

    /**
     * PM manual approval for flagged delivery.
     */
    public function approve(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->isPm()) {
            return response()->json(['message' => 'Only PM can approve flagged deliveries.'], 403);
        }

        $result = DB::transaction(function () use ($id, $request) {
            $delivery = Delivery::with(['items', 'spk'])->lockForUpdate()->findOrFail($id);
            if ($delivery->status === 'approved') {
                return null;
            }
            $delivery->update([
                'status' => 'approved',
                'verified_at' => Carbon::now(),
            ]);

            $approvalReq = ApprovalRequest::where('module', 'DELIVERY')
                ->where('reference_id', $delivery->id)
                ->whereIn('status', ['pending', 'revision_requested'])
                ->first();

            if ($approvalReq) {
                $approvalReq->update([
                    'status' => 'approved',
                    'current_approver_user_id' => null,
                    'final_approved_by_user_id' => $request->user()->id,
                    'final_approved_at' => Carbon::now(),
                ]);
            }

            foreach ($delivery->items as $dItem) {
                SpkItem::where('spk_id', $delivery->spk_id)
                    ->where('item_id', $dItem->item_id)
                    ->increment('received_qty', $dItem->delivered_qty);

                $this->custodyService->recordEvent(
                    itemId: $dItem->item_id,
                    holderUserId: $request->user()->id,
                    action: 'STOCK_IN',
                    refType: Delivery::class,
                    refId: $delivery->id,
                    warehouseId: $delivery->warehouse_id,
                    notes: "PM Approved delivery mismatch #{$delivery->delivery_number}"
                );
            }
            return $delivery;
        });

        if (!$result) {
            return response()->json(['message' => 'Delivery is already approved.'], 409);
        }

        return response()->json([
            'message' => 'Delivery approved successfully by PM.',
            'delivery' => $result->fresh(['items.item']),
        ]);
    }
}
