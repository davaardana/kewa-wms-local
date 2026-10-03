<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\Project;
use App\Models\RfidTag;
use App\Models\Warehouse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MasterDataController extends Controller
{

    // Projects
    public function getProjects(): JsonResponse
    {
        return response()->json(Project::with(['principal', 'warehouses'])->withCount('workOrders')->get());
    }

    public function createProject(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user && !in_array($user->role, ['superadmin', 'pm'])) {
            return response()->json(['message' => 'Akses Ditolak: Hanya Superadmin atau PM yang berwenang membuat Proyek Rollout.'], 403);
        }

        $validated = $request->validate([
            'principal_id' => 'nullable|exists:principals,id',
            'code' => 'required|string|max:50|unique:projects,code',
            'name' => 'required|string|max:150',
            'client_name' => 'nullable|string|max:100',
            'location' => 'nullable|string|max:150',
            'status' => 'required|in:active,on_hold,completed',
            'warehouse_ids' => 'nullable|array',
            'warehouse_ids.*' => 'exists:warehouses,id',
        ]);

        $projectData = collect($validated)->except('warehouse_ids')->toArray();
        $project = Project::create($projectData);

        if (!empty($validated['warehouse_ids'])) {
            $project->warehouses()->sync($validated['warehouse_ids']);
        }

        return response()->json($project->load(['principal', 'warehouses']), 201);
    }

    // Warehouses (Transient / Mobile Project Warehouses & Shared Hubs)
    public function getWarehouses(): JsonResponse
    {
        return response()->json(Warehouse::with(['project', 'projects', 'pic', 'staff'])->get());
    }

    public function createWarehouse(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user && !in_array($user->role, ['superadmin', 'pm'])) {
            return response()->json(['message' => 'Akses Ditolak: Hanya Superadmin atau PM yang berwenang membuat Gudang Transit.'], 403);
        }

        $validated = $request->validate([
            'project_id' => 'nullable|exists:projects,id',
            'code' => 'required|string|max:50|unique:warehouses,code',
            'name' => 'required|string|max:150',
            'gate_mode' => 'nullable|in:DUAL_ANTENNA_AUTO,SINGLE_ANTENNA_SESSION',
            'address' => 'nullable|string',
            'latitude' => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
            'pic_user_id' => 'nullable|exists:users,id',
            'phone' => 'nullable|string|max:30',
            'capacity' => 'nullable|integer|min:0',
            'is_active' => 'boolean',
            'staff_user_ids' => 'nullable|array',
            'staff_user_ids.*' => 'exists:users,id',
            'project_ids' => 'nullable|array',
            'project_ids.*' => 'exists:projects,id',
        ]);

        $warehouseData = collect($validated)->except(['staff_user_ids', 'project_ids'])->toArray();
        if (!isset($warehouseData['gate_mode'])) {
            $warehouseData['gate_mode'] = 'SINGLE_ANTENNA_SESSION';
        }

        $warehouse = Warehouse::create($warehouseData);

        if (!empty($validated['staff_user_ids'])) {
            $warehouse->staff()->sync($validated['staff_user_ids']);
        }

        $projectIdsToSync = $validated['project_ids'] ?? [];
        if (empty($projectIdsToSync) && !empty($validated['project_id'])) {
            $projectIdsToSync = [$validated['project_id']];
        }
        if (!empty($projectIdsToSync)) {
            $warehouse->projects()->sync($projectIdsToSync);
        }

        return response()->json($warehouse->load(['project', 'projects', 'pic', 'staff']), 201);
    }

    public function updateWarehouse(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if ($user && !in_array($user->role, ['superadmin', 'pm'])) {
            return response()->json(['message' => 'Akses Ditolak: Hanya Superadmin atau PM yang berwenang mengedit Gudang Transit.'], 403);
        }

        $warehouse = Warehouse::findOrFail($id);

        $validated = $request->validate([
            'project_id' => 'nullable|exists:projects,id',
            'code' => 'required|string|max:50|unique:warehouses,code,' . $warehouse->id,
            'name' => 'required|string|max:150',
            'gate_mode' => 'nullable|in:DUAL_ANTENNA_AUTO,SINGLE_ANTENNA_SESSION',
            'address' => 'nullable|string',
            'latitude' => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
            'pic_user_id' => 'nullable|exists:users,id',
            'phone' => 'nullable|string|max:30',
            'capacity' => 'nullable|integer|min:0',
            'is_active' => 'boolean',
            'staff_user_ids' => 'nullable|array',
            'staff_user_ids.*' => 'exists:users,id',
            'project_ids' => 'nullable|array',
            'project_ids.*' => 'exists:projects,id',
        ]);

        $warehouseData = collect($validated)->except(['staff_user_ids', 'project_ids'])->toArray();
        $warehouse->update($warehouseData);

        if (isset($validated['staff_user_ids'])) {
            $warehouse->staff()->sync($validated['staff_user_ids']);
        }

        if (isset($validated['project_ids'])) {
            $warehouse->projects()->sync($validated['project_ids']);
        } elseif (!empty($validated['project_id']) && $warehouse->projects()->count() === 0) {
            $warehouse->projects()->sync([$validated['project_id']]);
        }

        return response()->json($warehouse->load(['project', 'projects', 'pic', 'staff']));
    }

    // Items (Material Catalog with Real-Time Warehouse Stock Counts)
    public function getItems(Request $request): JsonResponse
    {
        $items = Item::withCount(['rfidTags'])->get();

        // Calculate active stock counts grouped by item_id and last_warehouse_id
        $stockCounts = RfidTag::where('status', 'active')
            ->whereNotNull('last_warehouse_id')
            ->select('item_id', 'last_warehouse_id', DB::raw('count(*) as total'))
            ->groupBy('item_id', 'last_warehouse_id')
            ->get();

        $items->each(function ($item) use ($stockCounts) {
            $item->warehouse_stocks = $stockCounts->where('item_id', $item->id)
                ->pluck('total', 'last_warehouse_id');
        });

        return response()->json($items);
    }

    public function createItem(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user && !in_array($user->role, ['superadmin', 'pm'])) {
            return response()->json(['message' => 'Akses Ditolak: Hanya Superadmin, PM, atau Tim Pengadaan yang berwenang menambahkan Material ke Katalog.'], 403);
        }

        $validated = $request->validate([
            'code' => 'required|string|max:50|unique:items,code',
            'name' => 'required|string|max:150',
            'category' => 'required|in:pole,cable,hardware,tools,accessories',
            'is_metal' => 'boolean',
            'is_reusable' => 'boolean',
            'is_serialized_tag' => 'boolean',
            'unit' => 'required|string|max:30',
            'min_stock' => 'integer|min:0',
            'description' => 'nullable|string',
            'epc_prefix' => ['nullable', 'string', 'max:32', 'regex:/^[A-Za-z0-9]+$/', 'unique:items,epc_prefix'],
            'epc_suffix_digits' => 'required_with:epc_prefix|integer|min:1|max:18',
        ]);

        if (!empty($validated['epc_prefix'])) {
            $validated['epc_prefix'] = strtoupper($validated['epc_prefix']);
            abort_if(strlen($validated['epc_prefix']) + $validated['epc_suffix_digits'] > 64, 422, 'Total panjang EPC maksimal 64 karakter.');
        }

        $item = Item::create($validated);
        return response()->json($item, 201);
    }


}
