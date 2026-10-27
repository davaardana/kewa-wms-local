<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CustodyLedger;
use App\Models\Item;
use App\Models\RfidTag;
use App\Services\CustodyService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class RfidTagController extends Controller
{
    public function __construct(protected CustodyService $custodyService) {}

    /**
     * List RFID tags with search & filters.
     * #4 Percepatan: orWhereHas (correlated subquery) → LEFT JOIN untuk search.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'per_page'   => 'nullable|integer|min:1|max:100',
            'search'     => 'nullable|string|max:100',
            'status_not' => 'nullable|string|in:decommissioned',
        ]);

        // Base query dengan LEFT JOIN agar search tidak pakai correlated subquery
        $query = RfidTag::select('rfid_tags.*')
            ->leftJoin('items as search_item', 'search_item.id', '=', 'rfid_tags.item_id')
            ->leftJoin('warehouses as search_wh', 'search_wh.id', '=', 'rfid_tags.last_warehouse_id')
            ->with(['item', 'lastWarehouse']);

        if ($request->filled('item_id')) {
            $query->where('rfid_tags.item_id', $request->item_id);
        }

        if ($request->filled('status')) {
            $query->where('rfid_tags.status', $request->status);
        }

        if (!empty($validated['status_not'])) {
            $query->where('rfid_tags.status', '!=', $validated['status_not']);
        }

        if (!empty($validated['search'])) {
            // #4: JOIN-based search — satu pass, tidak ada correlated subquery per baris
            $pattern = '%' . mb_strtolower(trim($validated['search'])) . '%';
            $query->where(function ($q) use ($pattern) {
                $q->whereRaw('LOWER(rfid_tags.epc) LIKE ?', [$pattern])
                  ->orWhereRaw('LOWER(search_item.name) LIKE ?', [$pattern])
                  ->orWhereRaw('LOWER(search_item.code) LIKE ?', [$pattern])
                  ->orWhereRaw('LOWER(search_wh.name) LIKE ?', [$pattern])
                  ->orWhereRaw('LOWER(search_wh.code) LIKE ?', [$pattern]);
            });
        }

        if ($request->filled('warehouse_id')) {
            $query->where('rfid_tags.last_warehouse_id', $request->warehouse_id);
        }

        return response()->json(
            $query->latest('rfid_tags.id')->paginate($validated['per_page'] ?? 50)
        );
    }

    /**
     * Enroll single or batch RFID tags to an Item.
     * #2 Percepatan: N individual inserts → 1 bulk insert + 1 bulk custody insert.
     */
    public function enroll(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user && !in_array($user->role, ['superadmin', 'pm'])) {
            return response()->json([
                'message' => 'Akses Ditolak: Hanya Superadmin, PM, atau Tim Pengadaan yang berwenang mendaftarkan tag RFID baru.',
            ], 403);
        }

        $request->merge([
            'epc'      => $request->filled('epc') ? strtoupper(trim($request->input('epc'))) : null,
            'epc_list' => collect($request->input('epc_list', []))
                ->map(fn ($epc) => strtoupper(trim($epc)))
                ->values()
                ->all(),
        ]);

        $validated = $request->validate([
            'item_id'      => 'required|exists:items,id',
            'warehouse_id' => 'nullable|exists:warehouses,id',
            'tag_type'     => 'required|in:anti_metal,sticker,bag_batch',
            'epc'          => ['nullable', 'string', 'min:8', 'max:64', 'regex:/^[0-9A-Fa-f]+$/', 'unique:rfid_tags,epc'],
            'epc_list'     => 'nullable|array',
            'epc_list.*'   => ['string', 'min:8', 'max:64', 'regex:/^[0-9A-Fa-f]+$/', 'distinct', 'unique:rfid_tags,epc'],
            'notes'        => 'nullable|string',
        ]);

        $epcsToEnroll = array_values(array_unique(array_filter([
            ...($validated['epc'] ? [$validated['epc']] : []),
            ...($validated['epc_list'] ?? []),
        ])));

        if (empty($epcsToEnroll)) {
            return response()->json(['message' => 'Please provide an EPC or list of EPCs.'], 422);
        }

        $userId    = $user->id;
        $now       = Carbon::now();
        $itemId    = (int) $validated['item_id'];
        $warehouseId = isset($validated['warehouse_id']) ? (int) $validated['warehouse_id'] : null;
        $tagType   = $validated['tag_type'];
        $notes     = $validated['notes'] ?? 'Enrolled via Desktop/BLE reader';

        $enrolledTags = DB::transaction(function () use (
            $epcsToEnroll, $itemId, $tagType, $notes, $userId, $warehouseId, $now
        ) {
            // #2a: Bulk insert semua tag sekaligus
            $tagRows = array_map(fn ($epc) => [
                'epc'               => $epc,
                'item_id'           => $itemId,
                'tag_type'          => $tagType,
                'status'            => 'active',
                'last_warehouse_id' => null,
                'last_read_at'      => $now,
                'notes'             => $notes,
                'created_at'        => $now,
                'updated_at'        => $now,
            ], $epcsToEnroll);

            RfidTag::insert($tagRows);

            // #2b: Bulk insert custody records sekaligus
            $custodyRows = array_map(fn ($epc) => [
                'tag_epc'        => $epc,
                'item_id'        => $itemId,
                'holder_user_id' => $userId,
                'action'         => 'TAG_ENROLLED',
                'ref_type'       => null,
                'ref_id'         => null,
                'warehouse_id'   => $warehouseId,
                'notes'          => 'Tag identity registered; warehouse is reader context, not stock receipt.',
                'created_at'     => $now,
            ], $epcsToEnroll);

            CustodyLedger::insert($custodyRows);

            // Return enrolled tags (bukan N queries — satu batch fetch)
            return RfidTag::whereIn('epc', $epcsToEnroll)->orderBy('id')->get();
        });

        // Hapus cache enrollment agar SSE segera siap terima tag berikutnya tanpa tunggu TTL 30s
        if ($warehouseId) {
            Cache::forget("enrollment_last_tag:{$warehouseId}");
        }

        return response()->json([
            'message'        => 'Enrolled ' . $enrolledTags->count() . ' tags successfully.',
            'enrolled_count' => $enrolledTags->count(),
            'tags'           => $enrolledTags,
        ], 201);
    }

    public function reserve(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user && !in_array($user->role, ['superadmin', 'pm'])) {
            return response()->json(['message' => 'Akses Ditolak: Hanya Superadmin, PM, atau Tim Pengadaan yang berwenang membuat EPC.'], 403);
        }

        $validated = $request->validate([
            'item_id'  => 'required|exists:items,id',
            'quantity' => 'required|integer|min:1|max:1000',
            'tag_type' => 'required|in:anti_metal,sticker,bag_batch',
            'notes'    => 'nullable|string|max:1000',
        ]);

        $tags = DB::transaction(function () use ($validated) {
            $item = Item::whereKey($validated['item_id'])->lockForUpdate()->firstOrFail();
            abort_if(empty($item->epc_prefix), 422, 'Format EPC belum dikonfigurasi untuk jenis barang ini.');

            $first = $item->epc_next_sequence;
            $last  = $first + $validated['quantity'] - 1;
            abort_if(strlen((string) $last) > $item->epc_suffix_digits, 422, 'Kapasitas suffix EPC untuk jenis barang ini telah habis.');

            $rows = [];
            $now  = now();
            for ($seq = $first; $seq <= $last; $seq++) {
                $rows[] = [
                    'epc'        => $item->epc_prefix . str_pad((string) $seq, $item->epc_suffix_digits, '0', STR_PAD_LEFT),
                    'item_id'    => $item->id,
                    'tag_type'   => $validated['tag_type'],
                    'status'     => 'reserved',
                    'notes'      => $validated['notes'] ?? 'Generated for custom EPC vendor',
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            RfidTag::insert($rows);
            $item->update(['epc_next_sequence' => $last + 1]);

            return RfidTag::with('item')
                ->whereIn('epc', array_column($rows, 'epc'))
                ->orderBy('id')
                ->get();
        });

        return response()->json([
            'message'        => "{$tags->count()} EPC berhasil dibuat dan direservasi.",
            'reserved_count' => $tags->count(),
            'tags'           => $tags,
        ], 201);
    }

    /**
     * Get tag details with full custody history.
     */
    public function show(string $epc): JsonResponse
    {
        $epc     = strtoupper(trim($epc));
        $tag     = RfidTag::with(['item', 'project', 'lastWarehouse'])->where('epc', $epc)->firstOrFail();
        $history = $this->custodyService->getTagHistory($epc);

        return response()->json([
            'tag'             => $tag,
            'custody_history' => $history,
        ]);
    }

    /**
     * Update tag status (e.g. damaged, lost).
     */
    public function updateStatus(Request $request, string $epc): JsonResponse
    {
        $user = $request->user();
        if (!$user || !in_array($user->role, ['superadmin', 'pm', 'pic_lapangan'], true)) {
            return response()->json([
                'message' => 'Akses Ditolak: Hanya Superadmin, PM, atau PIC Lapangan yang dapat mengubah status tag RFID.',
            ], 403);
        }

        $validated = $request->validate([
            'status' => 'required|in:active,attached,defective,lost',
            'notes'  => 'nullable|string',
        ]);

        $tag = DB::transaction(function () use ($epc, $validated, $request) {
            $tag = RfidTag::where('epc', strtoupper(trim($epc)))->lockForUpdate()->firstOrFail();
            $tag->update($validated);
            $this->custodyService->recordEvent(
                itemId:       $tag->item_id,
                holderUserId: $request->user()->id,
                action:       ($validated['status'] === 'defective') ? 'DAMAGED_WRITE_OFF' : 'AUDIT_OPNAME',
                tagEpc:       $tag->epc,
                warehouseId:  $tag->last_warehouse_id,
                notes:        "Tag status updated to {$validated['status']}: " . ($validated['notes'] ?? ''),
            );
            return $tag;
        });

        return response()->json([
            'message' => 'Tag status updated',
            'tag'     => $tag,
        ]);
    }

    /** Remove a decommissioned registry entry while preserving historical references. */
    public function hardDestroy(Request $request, string $epc): JsonResponse
    {
        abort_unless($request->user()?->role === 'superadmin', 403,
            'Hanya Superadmin yang dapat menghapus permanen tag RFID.');

        $deletedEpc = DB::transaction(function () use ($epc) {
            $tag = RfidTag::where('epc', strtoupper(trim($epc)))->lockForUpdate()->firstOrFail();

            $hasActiveDocumentAssignment = DB::table('shipping_document_tags')
                ->join('shipping_documents', 'shipping_documents.id', '=', 'shipping_document_tags.shipping_document_id')
                ->where('shipping_document_tags.rfid_tag_id', $tag->id)
                ->whereIn('shipping_documents.status', ['draft', 'approved', 'in_progress'])
                ->whereNull('shipping_documents.archived_at')
                ->exists();

            abort_if($tag->status !== 'decommissioned', 409,
                'Nonaktifkan tag terlebih dahulu sebelum Hard Delete.');
            abort_if($hasActiveDocumentAssignment, 409,
                'Tag masih dipakai dokumen aktif; histori operasional tidak dapat dihapus.');

            if ($tag->last_warehouse_id !== null) {
                $this->custodyService->recordEvent(
                    itemId:       $tag->item_id,
                    holderUserId: request()->user()->id,
                    action:       'STOCK_WRITE_OFF',
                    tagEpc:       $tag->epc,
                    warehouseId:  $tag->last_warehouse_id,
                    notes:        'Stok dihapus dari registri oleh Superadmin setelah tag dinonaktifkan.',
                );
            }

            $tag->delete();
            return $tag->epc;
        });

        return response()->json([
            'message' => "Tag RFID {$deletedEpc} berhasil dihapus permanen dari registri.",
            'epc'     => $deletedEpc,
        ]);
    }

    /**
     * Disable / Decommission a single RFID tag.
     */
    public function destroy(Request $request, string $epc): JsonResponse
    {
        $user = $request->user();
        if ($user && $user->role !== 'superadmin') {
            return response()->json([
                'message' => 'Akses Ditolak: Hanya Super Administrator yang berhak menonaktifkan tag RFID.',
            ], 403);
        }

        $tag = DB::transaction(function () use ($epc, $user) {
            $tag = RfidTag::where('epc', strtoupper(trim($epc)))->lockForUpdate()->firstOrFail();
            abort_if($tag->status === 'decommissioned', 409, 'Tag is already decommissioned.');
            $tag->update([
                'status' => 'decommissioned',
                'notes'  => 'Tag dinonaktifkan (disable) oleh Super Admin [' . ($user->name ?? 'Admin') . ']',
            ]);
            $this->custodyService->recordEvent(
                itemId:       $tag->item_id,
                holderUserId: $user?->id ?? 1,
                action:       'TAG_DECOMMISSIONED',
                tagEpc:       $tag->epc,
                warehouseId:  $tag->last_warehouse_id,
                notes:        'Tag dinonaktifkan (disabled/decommissioned) oleh Super Administrator.',
            );
            return $tag;
        });

        return response()->json([
            'message' => "Tag RFID {$epc} berhasil dinonaktifkan (disabled) dan dicatat ke Audit Trail.",
            'tag'     => $tag,
        ]);
    }

    /**
     * Bulk disable / decommission multiple RFID tags.
     * #3 Percepatan: N individual update+custody → 1 bulk update + 1 bulk custody insert.
     */
    public function bulkDestroy(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user && $user->role !== 'superadmin') {
            return response()->json([
                'message' => 'Akses Ditolak: Hanya Super Administrator yang berhak menonaktifkan data tag RFID.',
            ], 403);
        }

        $validated = $request->validate([
            'epcs'   => 'required|array|min:1',
            'epcs.*' => 'string',
        ]);

        $epcs  = array_values(array_unique(array_map(fn ($epc) => strtoupper(trim($epc)), $validated['epcs'])));
        $count = DB::transaction(function () use ($epcs, $user) {
            // #3a: Lock semua tag sekaligus
            $tags = RfidTag::whereIn('epc', $epcs)->orderBy('id')->lockForUpdate()->get();
            abort_if($tags->count() !== count($epcs), 422, 'One or more RFID tags were not found.');

            foreach ($tags as $tag) {
                abort_if($tag->status === 'decommissioned', 409, "Tag {$tag->epc} is already decommissioned.");
            }

            $now       = now();
            $adminNote = 'Tag dinonaktifkan massal oleh Super Admin [' . ($user->name ?? 'Admin') . ']';

            // #3b: Bulk update status sekaligus
            RfidTag::whereIn('epc', $epcs)->update([
                'status'     => 'decommissioned',
                'notes'      => $adminNote,
                'updated_at' => $now,
            ]);

            // #3c: Bulk insert custody records sekaligus
            $custodyRows = $tags->map(fn ($tag) => [
                'tag_epc'        => $tag->epc,
                'item_id'        => $tag->item_id,
                'holder_user_id' => $user?->id ?? 1,
                'action'         => 'TAG_DECOMMISSIONED',
                'ref_type'       => null,
                'ref_id'         => null,
                'warehouse_id'   => $tag->last_warehouse_id,
                'notes'          => 'Penonaktifan tag massal oleh Super Administrator.',
                'created_at'     => $now,
            ])->all();

            CustodyLedger::insert($custodyRows);

            return $tags->count();
        });

        return response()->json([
            'message'        => "Berhasil menonaktifkan {$count} tag RFID terpilih. Seluruh riwayat audit telah dicatat.",
            'disabled_count' => $count,
        ]);
    }

    /**
     * Reactivate a decommissioned RFID tag.
     */
    public function reactivate(Request $request, string $epc): JsonResponse
    {
        $user = $request->user();
        if ($user && $user->role !== 'superadmin') {
            return response()->json([
                'message' => 'Akses Ditolak: Hanya Super Administrator yang berhak mengaktifkan kembali tag RFID.',
            ], 403);
        }

        $tag = DB::transaction(function () use ($epc, $user) {
            $tag = RfidTag::where('epc', strtoupper(trim($epc)))->lockForUpdate()->firstOrFail();
            abort_unless($tag->status === 'decommissioned', 409, 'Only decommissioned tags can be reactivated.');
            $tag->update([
                'status' => 'active',
                'notes'  => 'Tag diaktifkan kembali oleh Super Admin [' . ($user->name ?? 'Admin') . ']',
            ]);
            $this->custodyService->recordEvent(
                itemId:       $tag->item_id,
                holderUserId: $user?->id ?? 1,
                action:       'TAG_REACTIVATED',
                tagEpc:       $tag->epc,
                warehouseId:  $tag->last_warehouse_id,
                notes:        'Tag RFID diaktifkan kembali (reactivated) oleh Super Administrator.',
            );
            return $tag;
        });

        return response()->json([
            'message' => "Tag RFID {$epc} berhasil diaktifkan kembali.",
            'tag'     => $tag,
        ]);
    }
}
