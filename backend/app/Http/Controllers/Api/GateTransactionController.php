<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GateTransaction;
use App\Models\GateTransactionItem;
use App\Models\Warehouse;
use App\Models\WorkOrder;
use App\Services\QuotaValidatorService;
use App\Services\WhatsAppNotificationService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class GateTransactionController extends Controller
{
    public function __construct(
        protected QuotaValidatorService $quotaService,
        protected WhatsAppNotificationService $waService
    ) {}

    public function index(Request $request): JsonResponse
    {
        // Auto-expire sessions that exceeded the 15-minute idle inactivity window
        GateTransaction::where('status', 'approved')
            ->whereNotNull('valid_until')
            ->where('valid_until', '<', Carbon::now())
            ->update([
                'status' => 'expired',
                'notes' => DB::raw("CONCAT(COALESCE(notes, ''), ' | Sesi kedaluwarsa otomatis (15 menit tanpa aktivitas muatan)')")
            ]);

        $query = GateTransaction::with([
            'workOrder.project',
            'warehouse',
            'pic',
            'vehicle',
            'approvedBy',
            'items.item',
            'passEvents',
        ]);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('warehouse_id')) {
            $query->where('warehouse_id', $request->warehouse_id);
        }

        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        // Data Visibility Scoping: PIC, Approver, Storeroom at WH, or SuperAdmin/Management
        $user = $request->user();
        if ($user && !$user->isManagement()) {
            $userId = $user->id;
            $query->where(function ($q) use ($userId, $user) {
                $q->where('pic_user_id', $userId)
                  ->orWhere('approved_by_user_id', $userId);

                if ($user->isStoreroom()) {
                    $assignedWhIds = $user->assignedWarehouses->pluck('id')->toArray();
                    if (!empty($assignedWhIds)) {
                        $q->orWhereIn('warehouse_id', $assignedWhIds);
                    } else {
                        $q->orWhereNotNull('warehouse_id');
                    }
                }
            });
        }

        return response()->json($query->latest()->get());
    }

    /**
     * Request a gate transaction session (PIC or Storeroom).
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'work_order_id' => 'required|exists:work_orders,id',
            'warehouse_id' => 'required|exists:warehouses,id',
            'vehicle_id' => 'nullable|exists:vehicles,id',
            'plate_number_snapshot' => 'nullable|string|max:50',
            'type' => 'required|in:OUT_FULFILLMENT,IN_RETURN',
            'items' => 'required|array|min:1',
            'items.*.item_id' => 'required|distinct|exists:items,id',
            'items.*.requested_qty' => 'required|integer|min:1',
            'items.*.returned_condition' => 'nullable|in:good,damaged,scrap',
            'notes' => 'nullable|string',
        ]);

        $workOrder = WorkOrder::with(['pm', 'boqItems.item'])->findOrFail($validated['work_order_id']);
        $currentUser = $request->user();

        if ((int) $workOrder->warehouse_id !== (int) $validated['warehouse_id']) {
            return response()->json(['message' => 'Warehouse transaksi harus sama dengan warehouse Work Order.'], 422);
        }

        if ($workOrder->status !== 'approved' && $workOrder->status !== 'in_progress') {
            return response()->json([
                'message' => "Work Order {$workOrder->wo_number} belum disetujui (Status: {$workOrder->status}). Izin gerbang tidak dapat diajukan.",
            ], 422);
        }

        // If vehicle_id is provided but plate_number_snapshot is empty, get plate from vehicle
        $plateSnapshot = $validated['plate_number_snapshot'] ?? null;
        if (!empty($validated['vehicle_id']) && empty($plateSnapshot)) {
            $vehicle = \App\Models\Vehicle::find($validated['vehicle_id']);
            $plateSnapshot = $vehicle?->plate_number;
        }

        // Convert items format for quota validation
        $itemsForValidation = array_map(function ($i) {
            return ['item_id' => $i['item_id'], 'quantity' => $i['requested_qty']];
        }, $validated['items']);

        // Check quota if OUT_FULFILLMENT
        if ($validated['type'] === 'OUT_FULFILLMENT') {
            $quotaCheck = $this->quotaService->validateWithdrawalQuota($workOrder, $itemsForValidation);
            if (!$quotaCheck['can_fulfill']) {
                return response()->json([
                    'message' => 'Requested items exceed remaining BOQ quota.',
                    'violations' => $quotaCheck['violations'],
                ], 422);
            }
        }

        // Check if qualifies for auto-approval
        $canAutoApprove = ($validated['type'] === 'OUT_FULFILLMENT')
            ? $this->quotaService->canAutoApprove($workOrder, $itemsForValidation)
            : false; // Returns require PM / storeroom approval

        $status = $canAutoApprove ? 'approved' : 'pending_approval';

        return DB::transaction(function () use ($validated, $workOrder, $currentUser, $canAutoApprove, $status, $plateSnapshot) {
            // One physical gate per warehouse: prevent EPC/session mixing.
            $warehouse = Warehouse::whereKey($validated['warehouse_id'])->lockForUpdate()->firstOrFail();

            $active = GateTransaction::where('warehouse_id', $warehouse->id)
                ->whereIn('status', ['pending_approval', 'approved'])
                ->where(function ($query) {
                    $query->where('status', 'pending_approval')
                        ->orWhereNull('valid_until')
                        ->orWhere('valid_until', '>', Carbon::now());
                })
                ->latest('id')
                ->first();

            if ($active) {
                return response()->json([
                    'message' => 'Masih ada sesi gate aktif di warehouse ini. Selesaikan sesi sebelumnya sebelum membuka sesi baru.',
                    'active_transaction_id' => $active->id,
                    'active_transaction_number' => $active->transaction_number,
                    'active_status' => $active->status,
                ], 409);
            }

            $txNumber = 'GTX-' . strtoupper(Str::random(4)) . '-' . date('ymdHis');

            $tx = GateTransaction::create([
                'transaction_number' => $txNumber,
                'work_order_id' => $workOrder->id,
                'warehouse_id' => $validated['warehouse_id'],
                'pic_user_id' => $currentUser->id,
                'vehicle_id' => $validated['vehicle_id'] ?? null,
                'plate_number_snapshot' => $plateSnapshot,
                'type' => $validated['type'],
                'status' => $status,
                'is_auto_approved' => $canAutoApprove,
                'approved_by_user_id' => $canAutoApprove ? $currentUser->id : null,
                'approved_at' => $canAutoApprove ? Carbon::now() : null,
                'valid_until' => Carbon::now()->addMinutes(15), // Batas waktu idle 15 menit (rolling window saat muat bertahap)
                'notes' => $validated['notes'] ?? null,
            ]);

            foreach ($validated['items'] as $itemData) {
                GateTransactionItem::create([
                    'gate_transaction_id' => $tx->id,
                    'item_id' => $itemData['item_id'],
                    'requested_qty' => $itemData['requested_qty'],
                    'passed_qty' => 0,
                    'returned_condition' => $itemData['returned_condition'] ?? 'good',
                ]);
            }

            // If manual approval needed, notify PM via WhatsApp
            if (!$canAutoApprove && $workOrder->pm) {
                $this->waService->notifyPmApprovalRequest($tx, $workOrder->pm);
            }

            return response()->json([
                'message' => $canAutoApprove
                    ? 'Gate session created and AUTO-APPROVED.'
                    : 'Gate session created. Waiting for PM approval.',
                'auto_approved' => $canAutoApprove,
                'gate_transaction' => $tx->load(['items.item', 'pic', 'warehouse']),
            ], 201);
        });
    }

    /**
     * PM approves a pending gate transaction.
     */
    public function approve(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->isPm()) {
            return response()->json(['message' => 'Only PM can approve gate transactions.'], 403);
        }

        $tx = GateTransaction::findOrFail($id);
        if ($tx->status !== 'pending_approval') {
            return response()->json(['message' => 'Hanya sesi pending_approval yang dapat disetujui.'], 422);
        }
        $tx->update([
            'status' => 'approved',
            'approved_by_user_id' => $request->user()->id,
            'approved_at' => Carbon::now(),
            'valid_until' => Carbon::now()->addMinutes(15), // Batas waktu idle 15 menit
        ]);

        return response()->json([
            'message' => 'Gate transaction approved.',
            'gate_transaction' => $tx->load(['items.item', 'approvedBy']),
        ]);
    }

    /**
     * PM rejects a pending gate transaction.
     */
    public function reject(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->isPm()) {
            return response()->json(['message' => 'Only PM can reject gate transactions.'], 403);
        }

        $validated = $request->validate([
            'rejection_reason' => 'required|string',
        ]);

        $tx = GateTransaction::findOrFail($id);
        $tx->update([
            'status' => 'rejected',
            'approved_by_user_id' => $request->user()->id,
            'rejection_reason' => $validated['rejection_reason'],
        ]);

        return response()->json([
            'message' => 'Gate transaction rejected.',
            'gate_transaction' => $tx,
        ]);
    }

    /**
     * Cancel an active or pending gate transaction (PIC, PM, or Admin).
     */
    public function cancel(Request $request, string|int $id): JsonResponse
    {
        if (!is_numeric($id)) {
            return response()->json(['message' => 'ID sesi transaksi gerbang tidak valid.'], 422);
        }

        $user = $request->user();
        $tx = GateTransaction::findOrFail((int) $id);

        // PIC who created it, or PM, or Management/Admin can cancel
        if ($tx->pic_user_id !== $user->id && !$user->isPm() && !$user->isManagement()) {
            return response()->json(['message' => 'Anda tidak memiliki hak akses untuk membatalkan sesi izin ini.'], 403);
        }

        if ($tx->status === 'completed') {
            return response()->json(['message' => 'Sesi izin yang sudah selesai (completed) tidak dapat dibatalkan.'], 422);
        }

        $reason = $request->input('reason', 'Dibatalkan oleh PIC/Mandor via PWA Lapangan');

        $tx->update([
            'status' => 'cancelled',
            'notes' => trim(($tx->notes ? $tx->notes . " | " : "") . "Dibatalkan: {$reason}"),
        ]);

        return response()->json([
            'message' => 'Sesi izin gerbang berhasil dibatalkan.',
            'gate_transaction' => $tx,
        ]);
    }

    /**
     * Finalize an active approved gate transaction based on actual physical tags detected.
     * Handles non-ideal field conditions (items left behind, incomplete load, reader misses).
     */
    public function finalizePartial(Request $request, string|int $id): JsonResponse
    {
        if (!is_numeric($id)) {
            return response()->json(['message' => 'ID sesi transaksi gerbang tidak valid.'], 422);
        }

        $user = $request->user();
        $tx = GateTransaction::with(['items.item', 'workOrder.boqItems', 'warehouse'])->findOrFail((int) $id);

        if ($tx->pic_user_id !== $user->id && !$user->isPm() && !$user->isManagement() && !$user->isStoreroom()) {
            return response()->json(['message' => 'Anda tidak memiliki hak akses untuk mengesahkan penyelesaian sesi izin ini.'], 403);
        }

        if ($tx->status === 'completed') {
            return response()->json([
                'message' => 'Sesi izin ini sudah berstatus selesai (completed).',
                'gate_transaction' => $tx,
            ]);
        }

        if ($tx->status !== 'approved') {
            return response()->json(['message' => "Hanya sesi berstatus 'approved' yang dapat diselesaikan (Status saat ini: {$tx->status})."], 422);
        }

        return response()->json([
            'message' => 'Finalisasi parsial dinonaktifkan sampai set EPC diterima memenuhi invariant finalisasi gate.',
        ], 422);
    }

    /**
     * Adjust requested quantities for an active approved transaction.
     * Useful when field conditions require taking more or fewer items within BOQ quota.
     */
    public function adjustItems(Request $request, string|int $id): JsonResponse
    {
        if (!is_numeric($id)) {
            return response()->json(['message' => 'ID sesi transaksi gerbang tidak valid.'], 422);
        }

        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.item_id' => 'required|distinct|exists:items,id',
            'items.*.requested_qty' => 'required|integer|min:1',
        ]);

        $user = $request->user();
        $tx = GateTransaction::with(['items.item', 'workOrder.boqItems', 'warehouse'])->findOrFail((int) $id);

        if ($tx->pic_user_id !== $user->id && !$user->isPm() && !$user->isManagement()) {
            return response()->json(['message' => 'Anda tidak memiliki hak akses untuk mengubah kuantiti sesi ini.'], 403);
        }

        if ($tx->status !== 'approved') {
            return response()->json(['message' => "Hanya sesi berstatus 'approved' yang dapat disesuaikan."], 422);
        }

        return DB::transaction(function () use ($tx, $validated, $user) {
            foreach ($validated['items'] as $itemInput) {
                $itemId = $itemInput['item_id'];
                $newQty = $itemInput['requested_qty'];

                // Check BOQ quota
                $boqItem = \App\Models\BoqItem::where('work_order_id', $tx->work_order_id)
                    ->where('item_id', $itemId)
                    ->first();

                if ($boqItem) {
                    $remQuota = max(0, $boqItem->quota_qty - $boqItem->withdrawn_qty + $boqItem->returned_qty);
                    if ($newQty > $remQuota) {
                        $itemName = $boqItem->item?->name ?? "Material #{$itemId}";
                        throw \Illuminate\Validation\ValidationException::withMessages([
                            'items' => ["Penyesuaian '{$itemName}' ({$newQty}) melebihi sisa kuota BOQ ({$remQuota})."],
                        ]);
                    }
                }

                $txItem = $tx->items->firstWhere('item_id', $itemId);
                if ($txItem) {
                    $txItem->update(['requested_qty' => $newQty]);
                } else {
                    $tx->items()->create([
                        'item_id' => $itemId,
                        'requested_qty' => $newQty,
                        'passed_qty' => 0,
                    ]);
                }
            }

            $tx->update([
                'notes' => trim(($tx->notes ? $tx->notes . " | " : "") . "Kuantiti izin disesuaikan oleh {$user->name}"),
            ]);

            return response()->json([
                'message' => 'Kuantiti izin sesi berhasil diperbarui sesuai kondisi muatan.',
                'gate_transaction' => $tx->fresh(['items.item', 'workOrder.boqItems']),
            ]);
        });
    }
}

