<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApprovalRequest;
use App\Models\BoqItem;
use App\Models\WorkOrder;
use App\Services\ApprovalService;
use App\Services\CustodyService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WorkOrderController extends Controller
{
    public function __construct(
        protected CustodyService $custodyService,
        protected ApprovalService $approvalService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = WorkOrder::with([
            'project',
            'spk',
            'warehouse',
            'pm',
            'approvedBy',
            'boqItems.item',
            'approvalRequest.requesterUser',
            'approvalRequest.currentApproverUser',
            'approvalRequest.finalApprovedByUser',
            'approvalRequest.histories.actionByUser',
        ]);

        if ($request->filled('project_id')) {
            $query->where('project_id', $request->project_id);
        }

        if ($request->filled('spk_id')) {
            $query->where('spk_id', $request->spk_id);
        }

        if ($request->filled('warehouse_id')) {
            $query->where('warehouse_id', $request->warehouse_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        // Data Visibility Scoping: PM Creator, Approver Chain, Storeroom/Mandor (for approved WOs), or SuperAdmin/Management
        $user = $request->user();
        if ($user && !$user->isManagement()) {
            $userId = $user->id;
            if ($user->isPic()) {
                $query->whereHas('gateTransactions', fn ($gq) => $gq->where('pic_user_id', $userId));
            }
            $query->where(function ($q) use ($userId, $user) {
                $q->where('pm_user_id', $userId)
                  ->orWhereNull('pm_user_id')
                  ->orDoesntHave('approvalRequest')
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

                // PM operational visibility for all approved WOs or in_progress WOs
                if ($user->isPm()) {
                    $q->orWhereIn('status', ['approved', 'in_progress']);
                }

                // Storeroom operational visibility for approved/in_progress WOs at their warehouse
                if ($user->isStoreroom()) {
                    $q->orWhere(function ($sq) use ($user) {
                        $sq->whereIn('status', ['approved', 'in_progress']);
                        $assignedWhIds = $user->assignedWarehouses->pluck('id')->toArray();
                        if (!empty($assignedWhIds)) {
                            $sq->whereIn('warehouse_id', $assignedWhIds);
                        }
                    });
                }

                // Mandor / PIC Lapangan operational visibility for approved/in_progress WOs
                if ($user->isPic()) {
                    $q->orWhere(function ($pq) {
                        $pq->whereIn('status', ['approved', 'in_progress']);
                    });
                }
            });
        }

        return response()->json($query->latest()->get());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'project_id' => 'required|exists:projects,id',
            'spk_id' => 'nullable|exists:spks,id',
            'warehouse_id' => 'required|exists:warehouses,id',
            'wo_number' => 'required|string|max:100|unique:work_orders,wo_number',
            'title' => 'required|string|max:191',
            'target_completion_date' => 'nullable|date',
            'notes' => 'nullable|string',
            'boq_items' => 'required|array|min:1',
            'boq_items.*.item_id' => 'required|exists:items,id',
            'boq_items.*.quota_qty' => 'required|integer|min:1',
            'boq_items.*.notes' => 'nullable|string',
        ]);

        $user = $request->user();
        $isAutoApproved = $user && $user->isPm();

        return DB::transaction(function () use ($validated, $user, $isAutoApproved) {
            $wo = WorkOrder::create([
                'project_id' => $validated['project_id'],
                'spk_id' => $validated['spk_id'] ?? null,
                'warehouse_id' => $validated['warehouse_id'],
                'pm_user_id' => $user->id,
                'wo_number' => $validated['wo_number'],
                'title' => $validated['title'],
                'status' => $isAutoApproved ? 'approved' : 'draft',
                'approved_by_user_id' => $isAutoApproved ? $user->id : null,
                'approved_at' => $isAutoApproved ? Carbon::now() : null,
                'target_completion_date' => $validated['target_completion_date'] ?? null,
                'notes' => $validated['notes'] ?? null,
            ]);

            foreach ($validated['boq_items'] as $itemData) {
                BoqItem::create([
                    'work_order_id' => $wo->id,
                    'item_id' => $itemData['item_id'],
                    'quota_qty' => $itemData['quota_qty'],
                    'prepared_qty' => 0,
                    'withdrawn_qty' => 0,
                    'returned_qty' => 0,
                    'installed_qty' => 0,
                    'notes' => $itemData['notes'] ?? null,
                ]);
            }

            // Only generate Approval Request if created by a non-PM user (e.g. Field Staff / Project Admin drafting a WO)
            if (!$isAutoApproved) {
                $this->approvalService->createApprovalRequest(
                    module: 'WORK_ORDER',
                    referenceId: $wo->id,
                    referenceCode: $wo->wo_number,
                    title: "Approval Work Order & Kuota BOQ: {$wo->title}",
                    requesterUserId: $user->id,
                    projectId: $wo->project_id,
                    warehouseId: $wo->warehouse_id,
                    metaData: ['items_count' => count($validated['boq_items'])]
                );
            }

            return response()->json($wo->load(['project', 'spk', 'warehouse', 'boqItems.item', 'approvedBy']), 201);
        });
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $wo = WorkOrder::with([
            'project.principal',
            'spk',
            'warehouse',
            'pm',
            'approvedBy',
            'boqItems.item',
            'gateTransactions.items.item',
            'approvalRequest.requesterUser',
            'approvalRequest.currentApproverUser',
            'approvalRequest.finalApprovedByUser',
            'approvalRequest.histories.actionByUser',
        ])->findOrFail($id);

        $user = $request->user();
        if ($user && !$user->isManagement()) {
            $userId = $user->id;
            if ($user->isPic() && !$wo->gateTransactions->contains('pic_user_id', $userId)) {
                return response()->json(['message' => 'PIC tidak ditugaskan pada Work Order ini.'], 403);
            }
            $appReq = $wo->approvalRequest;
            $isAuthorized = (
                $wo->pm_user_id === $userId ||
                is_null($wo->pm_user_id) ||
                is_null($appReq) ||
                ($appReq && (
                    $appReq->requester_user_id === $userId ||
                    $appReq->current_approver_user_id === $userId ||
                    $appReq->final_approved_by_user_id === $userId ||
                    $appReq->histories->contains(fn ($h) => $h->action_by_user_id === $userId || $h->designated_user_id === $userId) ||
                    (is_array($appReq->steps_snapshot_json) && collect($appReq->steps_snapshot_json)->contains(fn ($s) => ($s['approver_user_id'] ?? null) == $userId))
                )) ||
                (($user->isPm() || $user->isStoreroom() || $user->isPic()) && in_array($wo->status, ['approved', 'in_progress']))
            );

            if (!$isAuthorized) {
                return response()->json(['message' => 'Anda tidak memiliki hak akses untuk melihat Work Order ini.'], 403);
            }
        }

        return response()->json($wo);
    }

    /**
     * PM approves Work Order and locks the BOQ quota.
     */
    public function approve(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->isPm()) {
            return response()->json(['message' => 'Only PM can approve Work Orders.'], 403);
        }

        $wo = WorkOrder::findOrFail($id);
        $wo->update([
            'status' => 'approved',
            'approved_by_user_id' => $request->user()->id,
            'approved_at' => Carbon::now(),
        ]);

        // If there is an active approval request, update it to approved
        $approvalReq = ApprovalRequest::where('module', 'WORK_ORDER')
            ->where('reference_id', $wo->id)
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

        return response()->json([
            'message' => 'Work Order approved and quota established successfully.',
            'work_order' => $wo->load(['boqItems.item', 'approvedBy']),
        ]);
    }

    /**
     * Storeroom reports prepared quantities against approved BOQ.
     * (Storeroom CANNOT edit the quota_qty, only report prepared_qty).
     */
    public function reportPrepared(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->isStoreroom()) {
            return response()->json(['message' => 'Only storeroom can report prepared materials.'], 403);
        }

        $validated = $request->validate([
            'prepared_items' => 'required|array|min:1',
            'prepared_items.*.item_id' => 'required|distinct|exists:items,id',
            'prepared_items.*.prepared_qty' => 'required|integer|min:0',
            'notes' => 'nullable|string',
        ]);

        $wo = WorkOrder::with('boqItems.item')->findOrFail($id);

        if ($request->user()->role !== 'superadmin'
            && !$request->user()->assignedWarehouses()->whereKey($wo->warehouse_id)->exists()) {
            return response()->json(['message' => 'Storeroom is not assigned to this warehouse.'], 403);
        }

        if ($wo->status === 'draft') {
            return response()->json(['message' => 'Work order must be approved before preparing items.'], 400);
        }

        $shortages = [];

        DB::transaction(function () use ($validated, $wo, $request, &$shortages) {
            foreach ($validated['prepared_items'] as $prep) {
                $boq = BoqItem::with('item')
                    ->where('work_order_id', $wo->id)
                    ->where('item_id', $prep['item_id'])
                    ->lockForUpdate()
                    ->first();

                if (!$boq) {
                    abort(422, 'Item is not part of this work order BOQ.');
                }

                $prepQty = (int) $prep['prepared_qty'];
                $boq->update(['prepared_qty' => $prepQty]);

                if ($prepQty < $boq->quota_qty) {
                    $shortages[] = [
                        'item_id' => $boq->item_id,
                        'item_name' => $boq->item->name ?? "Item #{$boq->item_id}",
                        'quota_qty' => $boq->quota_qty,
                        'prepared_qty' => $prepQty,
                        'shortage' => $boq->quota_qty - $prepQty,
                    ];
                }

                $this->custodyService->recordEvent(
                    itemId: $boq->item_id,
                    holderUserId: $request->user()->id,
                    action: 'PREPARED',
                    refType: WorkOrder::class,
                    refId: $wo->id,
                    warehouseId: $wo->warehouse_id,
                    notes: "Storeroom prepared {$prepQty} pcs for WO #{$wo->wo_number}"
                );
            }
        });

        return response()->json([
            'message' => 'Prepared quantities recorded.',
            'has_shortage' => !empty($shortages),
            'shortages' => $shortages,
            'work_order' => $wo->fresh(['boqItems.item']),
        ]);
    }

    /**
     * PIC Lapangan / Mandor reports installed quantities on the rollout field.
     */
    public function reportInstalled(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->isPic()) {
            return response()->json(['message' => 'Only PIC can report installed materials.'], 403);
        }

        $validated = $request->validate([
            'installed_items' => 'required|array|min:1',
            'installed_items.*.item_id' => 'required|distinct|exists:items,id',
            'installed_items.*.installed_qty' => 'required|integer|min:1',
            'location_notes' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        $wo = WorkOrder::with('boqItems.item')->findOrFail($id);

        if (!$wo->gateTransactions()->where('pic_user_id', $request->user()->id)->exists()) {
            return response()->json(['message' => 'PIC tidak ditugaskan pada Work Order ini.'], 403);
        }

        if (!in_array($wo->status, ['approved', 'in_progress'])) {
            return response()->json(['message' => 'Work order must be approved or in progress to report installation.'], 400);
        }

        DB::transaction(function () use ($validated, $wo, $request) {
            foreach ($validated['installed_items'] as $inst) {
                $boq = BoqItem::where('work_order_id', $wo->id)
                    ->where('item_id', $inst['item_id'])
                    ->lockForUpdate()
                    ->first();

                if (!$boq) {
                    abort(422, 'Item is not part of this work order BOQ.');
                }

                $qty = (int) $inst['installed_qty'];
                $availableQty = max(0, $boq->withdrawn_qty - $boq->returned_qty - $boq->installed_qty);
                if ($qty > $availableQty) {
                    abort(422, 'Installed quantity exceeds withdrawn material available on site.');
                }

                $boq->increment('installed_qty', $qty);

                // Record custody log for field installation
                $loc = $validated['location_notes'] ?? '';
                $notes = "Mandor ({$request->user()->name}) reported {$qty} pcs installed on site." . ($loc ? " Lokasi: {$loc}" : '');

                $this->custodyService->recordEvent(
                    itemId: $boq->item_id,
                    holderUserId: $request->user()->id,
                    action: 'INSTALLED',
                    refType: WorkOrder::class,
                    refId: $wo->id,
                    warehouseId: $wo->warehouse_id,
                    notes: $notes
                );
            }

            // If status was approved, move to in_progress
            if ($wo->status === 'approved') {
                $wo->update(['status' => 'in_progress']);
            }
        });

        return response()->json([
            'message' => 'Laporan pemasangan tiang/material berhasil dicatat!',
            'work_order' => $wo->fresh(['boqItems.item']),
        ]);
    }
}
