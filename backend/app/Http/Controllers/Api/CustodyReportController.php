<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CustodyLedger;
use App\Models\ShippingDocument;
use App\Models\GatePassEvent;
use App\Models\Item;
use App\Models\RfidTag;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class CustodyReportController extends Controller
{
    /**
     * Current warehouse stock, based on active RFID tags.
     */
    public function stockSummary(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'warehouse_id' => 'nullable|integer|exists:warehouses,id',
            'item_id' => 'nullable|integer|exists:items,id',
        ]);

        $query = RfidTag::query()
            ->join('items', 'items.id', '=', 'rfid_tags.item_id')
            ->join('warehouses', 'warehouses.id', '=', 'rfid_tags.last_warehouse_id')
            ->where('rfid_tags.status', 'active')
            ->select([
                'warehouses.id as warehouse_id',
                'warehouses.code as warehouse_code',
                'warehouses.name as warehouse_name',
                'items.id as item_id',
                'items.code as item_code',
                'items.name as item_name',
                'items.category',
                'items.unit',
                'items.is_serialized_tag',
                'items.min_stock',
                DB::raw('COUNT(rfid_tags.id) as active_tag_count'),
            ])
            ->groupBy([
                'warehouses.id', 'warehouses.code', 'warehouses.name',
                'items.id', 'items.code', 'items.name', 'items.category',
                'items.unit', 'items.is_serialized_tag', 'items.min_stock',
            ])
            ->orderBy('warehouses.name')
            ->orderBy('items.name');

        if (isset($validated['warehouse_id'])) {
            $query->where('rfid_tags.last_warehouse_id', $validated['warehouse_id']);
        }
        if (isset($validated['item_id'])) {
            $query->where('rfid_tags.item_id', $validated['item_id']);
        }

        $stocks = $query->get()->map(function ($row) {
            $serialized = (bool) $row->is_serialized_tag;

            return [
                'warehouse' => ['id' => $row->warehouse_id, 'code' => $row->warehouse_code, 'name' => $row->warehouse_name],
                'item' => [
                    'id' => $row->item_id,
                    'code' => $row->item_code,
                    'name' => $row->item_name,
                    'category' => $row->category,
                    'unit' => $row->unit,
                    'is_serialized_tag' => $serialized,
                    'min_stock' => $row->min_stock,
                ],
                'active_tag_count' => (int) $row->active_tag_count,
                'stock_qty' => $serialized ? (int) $row->active_tag_count : null,
                'quantity_basis' => $serialized ? 'SERIALIZED_TAG_COUNT' : 'UNAVAILABLE',
            ];
        });

        return response()->json(['data' => $stocks]);
    }

    /**
    * Serialized-item warehouse movements. STOCK_IN adds stock; GATE_OUT and STOCK_WRITE_OFF remove it.
     */
    public function stockCard(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'warehouse_id' => 'required|integer|exists:warehouses,id',
            'item_id' => 'required|integer|exists:items,id',
            'date_from' => 'required|date',
            'date_to' => 'required|date|after_or_equal:date_from',
            'per_page' => 'nullable|integer|min:1|max:100',
            'page' => 'nullable|integer|min:1',
        ]);

        $item = Item::findOrFail($validated['item_id']);
        if (! $item->is_serialized_tag) {
            return response()->json([
                'message' => 'Kartu stok kuantitas hanya tersedia untuk material serialized (1 tag = 1 unit).',
                'balance_supported' => false,
            ], 422);
        }

        $movementQuery = CustodyLedger::with(['holder:id,name,role'])
            ->where('warehouse_id', $validated['warehouse_id'])
            ->where('item_id', $validated['item_id'])
            ->whereNotNull('tag_epc')
            ->whereIn('action', ['STOCK_IN', 'GATE_OUT', 'STOCK_WRITE_OFF']);

        $openingBalance = (clone $movementQuery)
            ->where('created_at', '<', $validated['date_from'].' 00:00:00')
            ->selectRaw("COALESCE(SUM(CASE WHEN action = 'STOCK_IN' THEN 1 ELSE -1 END), 0) as balance")
            ->value('balance');

        $periodQuery = (clone $movementQuery)
            ->whereBetween('created_at', [
                $validated['date_from'].' 00:00:00',
                $validated['date_to'].' 23:59:59',
            ])
            ->orderBy('created_at')
            ->orderBy('id');

        $perPage = $validated['per_page'] ?? 50;
        $page = $validated['page'] ?? 1;
        $beforePageBalance = 0;
        if ($page > 1) {
            $beforePageBalance = (clone $periodQuery)
                ->limit(($page - 1) * $perPage)
                ->get(['action'])
                ->sum(fn ($movement) => $movement->action === 'STOCK_IN' ? 1 : -1);
        }

        $movements = $periodQuery->paginate($perPage);
        $runningBalance = (int) $openingBalance + $beforePageBalance;
        $movements->getCollection()->transform(function ($movement) use (&$runningBalance) {
            $isInbound = $movement->action === 'STOCK_IN';
            $isWriteOff = $movement->action === 'STOCK_WRITE_OFF';
            $runningBalance += $isInbound ? 1 : -1;

            return [
                'id' => $movement->id,
                'created_at' => $movement->created_at,
                'action' => $movement->action,
                'direction' => $isWriteOff ? 'WRITE_OFF' : ($isInbound ? 'IN' : 'OUT'),
                'tag_epc' => $movement->tag_epc,
                'qty_in' => $isInbound ? 1 : 0,
                'qty_out' => $isInbound ? 0 : 1,
                'running_balance' => $runningBalance,
                'holder' => $movement->holder,
                'notes' => $movement->notes,
            ];
        });

        return response()->json([
            'balance_supported' => true,
            'opening_balance' => (int) $openingBalance,
            'movements' => $movements,
        ]);
    }

    /**
     * Complete Chain of Custody Audit Trail.
     * #5 Percepatan: pagination configurable via per_page (default 50, max 100).
     */
    public function auditTrail(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tag_epc'        => 'nullable|string|max:64',
            'item_id'        => 'nullable|integer|exists:items,id',
            'holder_user_id' => 'nullable|integer|exists:users,id',
            'action'         => 'nullable|string|in:GATE_IN,GATE_OUT,STOCK_IN,STOCK_WRITE_OFF,TRANSFER',
            'warehouse_id'   => 'nullable|integer|exists:warehouses,id',
            'per_page'       => 'nullable|integer|min:1|max:100',
        ]);

        $query = CustodyLedger::with(['item', 'holder', 'warehouse', 'rfidTag']);

        if (!empty($validated['tag_epc'])) {
            $query->where('tag_epc', $validated['tag_epc']);
        }
        if (!empty($validated['item_id'])) {
            $query->where('item_id', $validated['item_id']);
        }
        if (!empty($validated['holder_user_id'])) {
            $query->where('holder_user_id', $validated['holder_user_id']);
        }
        if (!empty($validated['action'])) {
            $query->where('action', $validated['action']);
        }
        if (!empty($validated['warehouse_id'])) {
            $query->where('warehouse_id', $validated['warehouse_id']);
        }

        $perPage = (int) ($validated['per_page'] ?? 50);
        $logs    = $query->orderBy('created_at', 'desc')->paginate($perPage);

        return response()->json($logs);
    }

    /**
     * Dashboard Statistics & Live Overview KPIs.
     * #2 Percepatan: hasil di-cache 60 detik — 6 COUNT query tidak jalan tiap 30 detik polling FE.
     */
    public function dashboardKpis(Request $request): JsonResponse
    {
        // Metrics: satu raw query menggantikan 6 query terpisah
        $metrics = Cache::remember('dashboard-kpis-metrics', 60, function () {
            $row = DB::selectOne("
                SELECT
                    (SELECT COUNT(*) FROM rfid_tags)                                           AS total_tags,
                    (SELECT COUNT(*) FROM rfid_tags WHERE status = 'active')                  AS active_tags,
                    (SELECT COUNT(*) FROM items)                                               AS total_items,
                    (SELECT COUNT(*) FROM shipping_documents WHERE status IN ('approved','in_progress') AND archived_at IS NULL) AS active_shipping_docs,
                    (SELECT COUNT(*) FROM shipping_documents WHERE status = 'draft' AND archived_at IS NULL)           AS draft_docs,
                    (SELECT COUNT(*) FROM shipping_documents WHERE status = 'completed' AND DATE(updated_at) = CURRENT_DATE) AS completed_today
            ");

            return [
                'total_tags'           => (int) $row->total_tags,
                'active_tags'          => (int) $row->active_tags,
                'total_items'          => (int) $row->total_items,
                'active_shipping_docs' => (int) $row->active_shipping_docs,
                'draft_docs'           => (int) $row->draft_docs,
                'completed_today'      => (int) $row->completed_today,
            ];
        });

        // Recent events: live (tidak di-cache karena perlu real-time)
        $recentPassEvents = GatePassEvent::with([
                'warehouse:id,name,code',
                'shippingDocument:id,document_number,type,status',
            ])
            ->latest()
            ->limit(10)
            ->get();

        $recentMismatches = GatePassEvent::where('mismatch_flag', true)
            ->with([
                'warehouse:id,name,code',
                'shippingDocument:id,document_number,type,status',
            ])
            ->latest()
            ->limit(5)
            ->get();

        return response()->json([
            'metrics'            => $metrics,
            'recent_gate_events' => $recentPassEvents,
            'recent_mismatches'  => $recentMismatches,
        ]);
    }

    /**
     * Stock Opname Bulk Scan reconciliation.
     */
    public function reconcileStockOpname(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'warehouse_id' => 'required|exists:warehouses,id',
            'scanned_epcs' => 'required|array',
            'scanned_epcs.*' => 'string',
        ]);

        $scannedEpcs = collect($validated['scanned_epcs'])
            ->map(fn ($epc) => strtoupper(trim($epc)))
            ->filter()
            ->unique()
            ->values()
            ->all();
        $systemTags = RfidTag::where('last_warehouse_id', $validated['warehouse_id'])
            ->where('status', 'active')
            ->pluck('epc')
            ->map(fn ($epc) => strtoupper(trim($epc)))
            ->unique()
            ->values()
            ->toArray();

        $matched = array_values(array_intersect($scannedEpcs, $systemTags));
        $missingInPhysical = array_values(array_diff($systemTags, $scannedEpcs));
        $unexpectedInPhysical = array_values(array_diff($scannedEpcs, $systemTags));

        return response()->json([
            'total_system_expected' => count($systemTags),
            'total_physically_scanned' => count($scannedEpcs),
            'matched_count' => count($matched),
            'missing_count' => count($missingInPhysical),
            'unexpected_count' => count($unexpectedInPhysical),
            'missing_epcs' => $missingInPhysical,
            'unexpected_epcs' => $unexpectedInPhysical,
        ]);
    }
}