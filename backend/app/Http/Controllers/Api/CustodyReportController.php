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
     * Serialized-item warehouse movements. Only STOCK_IN and GATE_OUT change balance.
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
            ->whereIn('action', ['STOCK_IN', 'GATE_OUT']);

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
            $runningBalance += $isInbound ? 1 : -1;

            return [
                'id' => $movement->id,
                'created_at' => $movement->created_at,
                'action' => $movement->action,
                'direction' => $isInbound ? 'IN' : 'OUT',
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
     */
    public function auditTrail(Request $request): JsonResponse
    {
        $query = CustodyLedger::with(['item', 'holder', 'warehouse', 'rfidTag']);

        if ($request->filled('tag_epc')) {
            $query->where('tag_epc', $request->tag_epc);
        }

        if ($request->filled('item_id')) {
            $query->where('item_id', $request->item_id);
        }

        if ($request->filled('holder_user_id')) {
            $query->where('holder_user_id', $request->holder_user_id);
        }

        if ($request->filled('action')) {
            $query->where('action', $request->action);
        }

        if ($request->filled('warehouse_id')) {
            $query->where('warehouse_id', $request->warehouse_id);
        }

        $logs = $query->orderBy('created_at', 'desc')->paginate(50);

        return response()->json($logs);
    }

    /**
     * Dashboard Statistics & Live Overview KPIs.
     */
    public function dashboardKpis(Request $request): JsonResponse
    {
        $totalTags         = RfidTag::count();
        $activeTags        = RfidTag::where('status', 'active')->count();
        $totalItems        = Item::count();
        $activeShippingDocs = ShippingDocument::whereIn('status', ['approved', 'in_progress'])->count();
        $draftDocs         = ShippingDocument::where('status', 'draft')->count();
        $completedToday    = ShippingDocument::where('status', 'completed')
            ->whereDate('updated_at', today())
            ->count();

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
            'metrics' => [
                'total_tags'          => $totalTags,
                'active_tags'         => $activeTags,
                'total_items'         => $totalItems,
                'active_shipping_docs'=> $activeShippingDocs,
                'draft_docs'          => $draftDocs,
                'completed_today'     => $completedToday,
            ],
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

        $scannedEpcs = array_unique($validated['scanned_epcs']);
        $systemTags = RfidTag::where('last_warehouse_id', $validated['warehouse_id'])
            ->where('status', 'active')
            ->pluck('epc')
            ->toArray();

        $matched = array_intersect($scannedEpcs, $systemTags);
        $missingInPhysical = array_diff($systemTags, $scannedEpcs);
        $unexpectedInPhysical = array_diff($scannedEpcs, $systemTags);

        return response()->json([
            'total_system_expected' => count($systemTags),
            'total_physically_scanned' => count($scannedEpcs),
            'matched_count' => count($matched),
            'missing_count' => count($missingInPhysical),
            'unexpected_count' => count($unexpectedInPhysical),
            'missing_epcs' => array_values($missingInPhysical),
            'unexpected_epcs' => array_values($unexpectedInPhysical),
        ]);
    }
}