<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\RfidTag;
use App\Models\CustodyLedger;
use App\Services\CustodyService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RfidTagController extends Controller
{
    public function __construct(protected CustodyService $custodyService) {}

    public function index(Request $request): JsonResponse
    {
        $query = RfidTag::with(['item', 'lastWarehouse']);

        if ($request->filled('item_id')) {
            $query->where('item_id', $request->item_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('warehouse_id')) {
            $query->where('last_warehouse_id', $request->warehouse_id);
        }

        return response()->json($query->latest()->paginate(50));
    }

    /**
     * Enroll single or batch RFID tags to an Item.
     */
    public function enroll(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user && !in_array($user->role, ['superadmin', 'pm', 'procurement'])) {
            return response()->json(['message' => 'Akses Ditolak: Hanya Superadmin, PM, atau Tim Pengadaan yang berwenang mendaftarkan tag RFID baru.'], 403);
        }

        $validated = $request->validate([
            'item_id' => 'required|exists:items,id',
            'warehouse_id' => 'nullable|exists:warehouses,id',
            'tag_type' => 'required|in:anti_metal,sticker,bag_batch',
            'epc' => 'nullable|string|max:64|unique:rfid_tags,epc',
            'epc_list' => 'nullable|array',
            'epc_list.*' => 'string|max:64|distinct',
            'notes' => 'nullable|string',
        ]);

        $enrolledTags = [];
        $epcsToEnroll = [];

        if (!empty($validated['epc'])) {
            $epcsToEnroll[] = $validated['epc'];
        }

        if (!empty($validated['epc_list'])) {
            $epcsToEnroll = array_merge($epcsToEnroll, $validated['epc_list']);
        }

        if (empty($epcsToEnroll)) {
            return response()->json(['message' => 'Please provide an EPC or list of EPCs.'], 422);
        }

        $epcsToEnroll = array_values(array_unique(array_map(fn ($epc) => strtoupper(trim($epc)), $epcsToEnroll)));
        $userId = $request->user()->id;

        $enrolledTags = DB::transaction(function () use ($epcsToEnroll, $validated, $userId) {
            $tags = [];
            foreach ($epcsToEnroll as $epc) {
                $tag = RfidTag::create([
                    'epc' => $epc,
                    'item_id' => $validated['item_id'],
                    'tag_type' => $validated['tag_type'],
                    'status' => 'active',
                    'last_warehouse_id' => null,
                    'last_read_at' => Carbon::now(),
                    'notes' => $validated['notes'] ?? 'Enrolled via Desktop/BLE reader',
                ]);

                $this->custodyService->recordEvent(itemId: $validated['item_id'], holderUserId: $userId, action: 'TAG_ENROLLED', tagEpc: $tag->epc, warehouseId: $validated['warehouse_id'] ?? null, notes: 'Tag identity registered; warehouse is reader context, not stock receipt.');
                $tags[] = $tag;
            }
            return $tags;
        });

        return response()->json([
            'message' => 'Enrolled ' . count($enrolledTags) . ' tags successfully.',
            'enrolled_count' => count($enrolledTags),
            'tags' => $enrolledTags,
        ], 201);
    }

    public function reserve(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user && !in_array($user->role, ['superadmin', 'pm', 'procurement'])) {
            return response()->json(['message' => 'Akses Ditolak: Hanya Superadmin, PM, atau Tim Pengadaan yang berwenang membuat EPC.'], 403);
        }

        $validated = $request->validate([
            'item_id' => 'required|exists:items,id',
            'quantity' => 'required|integer|min:1|max:1000',
            'tag_type' => 'required|in:anti_metal,sticker,bag_batch',
            'notes' => 'nullable|string|max:1000',
        ]);

        $tags = DB::transaction(function () use ($validated) {
            $item = Item::whereKey($validated['item_id'])->lockForUpdate()->firstOrFail();
            abort_if(empty($item->epc_prefix), 422, 'Format EPC belum dikonfigurasi untuk jenis barang ini.');

            $first = $item->epc_next_sequence;
            $last = $first + $validated['quantity'] - 1;
            abort_if(strlen((string) $last) > $item->epc_suffix_digits, 422, 'Kapasitas suffix EPC untuk jenis barang ini telah habis.');

            $rows = [];
            $now = now();
            for ($sequence = $first; $sequence <= $last; $sequence++) {
                $rows[] = [
                    'epc' => $item->epc_prefix.str_pad((string) $sequence, $item->epc_suffix_digits, '0', STR_PAD_LEFT),
                    'item_id' => $item->id,
                    'tag_type' => $validated['tag_type'],
                    'status' => 'reserved',
                    'notes' => $validated['notes'] ?? 'Generated for custom EPC vendor',
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            RfidTag::insert($rows);
            $item->update(['epc_next_sequence' => $last + 1]);

            return RfidTag::with('item')->whereIn('epc', array_column($rows, 'epc'))->orderBy('id')->get();
        });

        return response()->json([
            'message' => "{$tags->count()} EPC berhasil dibuat dan direservasi.",
            'reserved_count' => $tags->count(),
            'tags' => $tags,
        ], 201);
    }

    /**
     * Get tag details along with its complete custody history.
     */
    public function show(string $epc): JsonResponse
    {
        $epc = strtoupper(trim($epc));
        $tag = RfidTag::with(['item', 'project', 'lastWarehouse'])->where('epc', $epc)->firstOrFail();
        $history = $this->custodyService->getTagHistory($epc);

        return response()->json([
            'tag' => $tag,
            'custody_history' => $history,
        ]);
    }

    /**
     * Update tag status (e.g. damaged, lost).
     */
    public function updateStatus(Request $request, string $epc): JsonResponse
    {
        $validated = $request->validate([
            'status' => 'required|in:active,attached,defective,lost,decommissioned',
            'notes' => 'nullable|string',
        ]);

        $tag = DB::transaction(function () use ($epc, $validated, $request) {
            $tag = RfidTag::where('epc', strtoupper(trim($epc)))->lockForUpdate()->firstOrFail();
            $tag->update($validated);
            $this->custodyService->recordEvent(itemId: $tag->item_id, holderUserId: $request->user()->id, action: ($validated['status'] === 'defective') ? 'DAMAGED_WRITE_OFF' : 'AUDIT_OPNAME', tagEpc: $tag->epc, warehouseId: $tag->last_warehouse_id, notes: "Tag status updated to {$validated['status']}: " . ($validated['notes'] ?? ''));
            return $tag;
        });

        return response()->json([
            'message' => 'Tag status updated',
            'tag' => $tag,
        ]);
    }

    /**
     * Disable / Decommission a single RFID tag from registry with immutable audit trail.
     * Only Super Administrator is authorized.
     */
    public function destroy(Request $request, string $epc): JsonResponse
    {
        $user = $request->user();
        if ($user && $user->role !== 'superadmin') {
            return response()->json([
                'message' => 'Akses Ditolak: Hanya Super Administrator yang berhak menonaktifkan tag RFID.'
            ], 403);
        }

        $tag = DB::transaction(function () use ($epc, $user) {
            $tag = RfidTag::where('epc', strtoupper(trim($epc)))->lockForUpdate()->firstOrFail();
            abort_if($tag->status === 'decommissioned', 409, 'Tag is already decommissioned.');
            $tag->update(['status' => 'decommissioned', 'notes' => 'Tag dinonaktifkan (disable) oleh Super Admin [' . ($user->name ?? 'Admin') . ']']);
            $this->custodyService->recordEvent(itemId: $tag->item_id, holderUserId: $user?->id ?? 1, action: 'TAG_DECOMMISSIONED', tagEpc: $tag->epc, warehouseId: $tag->last_warehouse_id, notes: 'Tag dinonaktifkan (disabled/decommissioned) oleh Super Administrator.');
            return $tag;
        });

        return response()->json([
            'message' => "Tag RFID {$epc} berhasil dinonaktifkan (disabled) dan dicatat ke Audit Trail.",
            'tag' => $tag
        ]);
    }

    /**
     * Bulk disable / decommission multiple RFID tags with immutable audit trail.
     * Only Super Administrator is authorized.
     */
    public function bulkDestroy(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user && $user->role !== 'superadmin') {
            return response()->json([
                'message' => 'Akses Ditolak: Hanya Super Administrator yang berhak menonaktifkan data tag RFID.'
            ], 403);
        }

        $validated = $request->validate([
            'epcs' => 'required|array|min:1',
            'epcs.*' => 'string'
        ]);

        $epcs = array_values(array_unique(array_map(fn ($epc) => strtoupper(trim($epc)), $validated['epcs'])));
        $count = DB::transaction(function () use ($epcs, $user) {
            $tags = RfidTag::whereIn('epc', $epcs)->orderBy('id')->lockForUpdate()->get();
            abort_if($tags->count() !== count($epcs), 422, 'One or more RFID tags were not found.');
            foreach ($tags as $tag) {
                abort_if($tag->status === 'decommissioned', 409, "Tag {$tag->epc} is already decommissioned.");
                $tag->update(['status' => 'decommissioned', 'notes' => 'Tag dinonaktifkan massal oleh Super Admin [' . ($user->name ?? 'Admin') . ']']);
                $this->custodyService->recordEvent(itemId: $tag->item_id, holderUserId: $user?->id ?? 1, action: 'TAG_DECOMMISSIONED', tagEpc: $tag->epc, warehouseId: $tag->last_warehouse_id, notes: 'Penonaktifan tag massal oleh Super Administrator.');
            }
            return $tags->count();
        });

        return response()->json([
            'message' => "Berhasil menonaktifkan {$count} tag RFID terpilih. Seluruh riwayat audit telah dicatat.",
            'disabled_count' => $count
        ]);
    }

    /**
     * Reactivate a decommissioned RFID tag.
     * Only Super Administrator is authorized.
     */
    public function reactivate(Request $request, string $epc): JsonResponse
    {
        $user = $request->user();
        if ($user && $user->role !== 'superadmin') {
            return response()->json([
                'message' => 'Akses Ditolak: Hanya Super Administrator yang berhak mengaktifkan kembali tag RFID.'
            ], 403);
        }

        $tag = DB::transaction(function () use ($epc, $user) {
            $tag = RfidTag::where('epc', strtoupper(trim($epc)))->lockForUpdate()->firstOrFail();
            abort_unless($tag->status === 'decommissioned', 409, 'Only decommissioned tags can be reactivated.');
            $tag->update(['status' => 'active', 'notes' => 'Tag diaktifkan kembali oleh Super Admin [' . ($user->name ?? 'Admin') . ']']);
            $this->custodyService->recordEvent(itemId: $tag->item_id, holderUserId: $user?->id ?? 1, action: 'TAG_REACTIVATED', tagEpc: $tag->epc, warehouseId: $tag->last_warehouse_id, notes: 'Tag RFID diaktifkan kembali (reactivated) oleh Super Administrator.');
            return $tag;
        });

        return response()->json([
            'message' => "Tag RFID {$epc} berhasil diaktifkan kembali.",
            'tag' => $tag
        ]);
    }
}
