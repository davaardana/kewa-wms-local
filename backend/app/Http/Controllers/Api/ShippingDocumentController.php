<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CustodyLedger;
use App\Models\GatePassEvent;
use App\Models\RfidTag;
use App\Models\ShippingDocument;
use App\Models\ShippingDocumentAudit;
use App\Models\ShippingDocumentItem;
use App\Models\ShippingDocumentTag;
use App\Services\CustodyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ShippingDocumentController extends Controller
{
    /**
     * List shipping documents with filters.
     */
    public function index(Request $request): JsonResponse
    {
        $query = ShippingDocument::with(['creator:id,name,role', 'approver:id,name,role', 'warehouse:id,name,code'])
            ->withCount('items')
            ->withCount(['tags as total_tags'])
            ->withCount(['tags as scanned_tags' => fn ($q) => $q->where('status', 'scanned')]);

        if ($request->boolean('archived')) {
            abort_unless($request->user()?->role === 'superadmin', 403, 'Arsip dokumen hanya dapat dilihat Superadmin.');
            $query->whereNotNull('archived_at');
        } else {
            $query->whereNull('archived_at');
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }
        if ($request->filled('warehouse_id')) {
            $query->where('warehouse_id', $request->warehouse_id);
        }
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('document_number', 'ilike', "%{$search}%")
                  ->orWhere('notes', 'ilike', "%{$search}%");
            });
        }

        $docs = $query->orderByDesc('created_at')->paginate($request->get('per_page', 20));

        return response()->json($docs);
    }

    /**
     * Create a new shipping document (PM or Superadmin).
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!in_array($user->role, ['pm', 'superadmin'])) {
            return response()->json(['message' => 'Hanya PM atau Superadmin yang bisa membuat dokumen.'], 403);
        }

        $validated = $request->validate([
            'type' => ['required', Rule::in(['inbound', 'outbound'])],
            'warehouse_id' => ['required', 'exists:warehouses,id'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.item_id' => ['required', 'distinct', 'exists:items,id'],
            'items.*.expected_qty' => ['required', 'integer', 'min:1'],
            'attachments' => ['nullable', 'array', 'max:5'],
            'attachments.*.url' => ['required', 'string'],
            'attachments.*.original_name' => ['required', 'string', 'max:255'],
            'attachments.*.size' => ['nullable', 'integer'],
            'attachments.*.mime_type' => ['nullable', 'string', 'max:100'],
        ]);

        $doc = DB::transaction(function () use ($validated, $user) {
            $doc = ShippingDocument::create([
                'document_number' => ShippingDocument::generateDocumentNumber($validated['type']),
                'type' => $validated['type'],
                'status' => 'draft',
                'created_by_user_id' => $user->id,
                'warehouse_id' => $validated['warehouse_id'],
                'notes' => $validated['notes'] ?? null,
                'attachments' => $validated['attachments'] ?? null,
            ]);

            foreach ($validated['items'] as $item) {
                ShippingDocumentItem::create([
                    'shipping_document_id' => $doc->id,
                    'item_id' => $item['item_id'],
                    'expected_qty' => $item['expected_qty'],
                ]);
            }

            return $doc;
        });

        return response()->json([
            'message' => 'Dokumen berhasil dibuat.',
            'document' => $doc->load(['items.item:id,code,name,category,unit', 'creator:id,name', 'warehouse:id,name,code']),
        ], 201);
    }

    /** Update a draft shipping document. */
    public function update(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        abort_unless(in_array($user->role, ['pm', 'superadmin'], true), 403, 'Hanya PM atau Superadmin yang bisa mengubah dokumen.');
        $doc = DB::transaction(function () use ($request, $id, $user) {
            $doc = ShippingDocument::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_if($doc->archived_at, 422, 'Dokumen arsip tidak dapat diedit.');
            $before = $this->documentAuditSnapshot($doc);

            if ($doc->status === 'draft') {
                $validated = $request->validate([
                    'type' => ['required', Rule::in(['inbound', 'outbound'])],
                    'warehouse_id' => ['required', 'exists:warehouses,id'],
                    'notes' => ['nullable', 'string', 'max:1000'],
                    'items' => ['required', 'array', 'min:1'],
                    'items.*.item_id' => ['required', 'distinct', 'exists:items,id'],
                    'items.*.expected_qty' => ['required', 'integer', 'min:1'],
                    'attachments' => ['nullable', 'array', 'max:5'],
                    'attachments.*.url' => ['required', 'string'],
                    'attachments.*.original_name' => ['required', 'string', 'max:255'],
                    'attachments.*.size' => ['nullable', 'integer'],
                    'attachments.*.mime_type' => ['nullable', 'string', 'max:100'],
                ]);
                $doc->update([
                    'type' => $validated['type'],
                    'warehouse_id' => $validated['warehouse_id'],
                    'notes' => $validated['notes'] ?? null,
                    'attachments' => $validated['attachments'] ?? null,
                ]);
                $doc->items()->delete();
                foreach ($validated['items'] as $item) {
                    ShippingDocumentItem::create([
                        'shipping_document_id' => $doc->id,
                        'item_id' => $item['item_id'],
                        'expected_qty' => $item['expected_qty'],
                    ]);
                }
                $action = 'DRAFT_UPDATED';
            } else {
                abort_if($request->hasAny(['type', 'warehouse_id', 'items']), 422,
                    'Dokumen non-draft hanya dapat mengubah catatan/lampiran; item, kuantitas, arah, dan gudang adalah bukti operasional.');
                $validated = $request->validate([
                    'notes' => ['sometimes', 'nullable', 'string', 'max:1000'],
                    'attachments' => ['sometimes', 'nullable', 'array', 'max:5'],
                    'attachments.*.url' => ['required', 'string'],
                    'attachments.*.original_name' => ['required', 'string', 'max:255'],
                    'attachments.*.size' => ['nullable', 'integer'],
                    'attachments.*.mime_type' => ['nullable', 'string', 'max:100'],
                ]);
                abort_if(empty($validated), 422, 'Kirim catatan atau lampiran yang ingin diperbarui.');
                $doc->update($validated);
                $action = 'METADATA_UPDATED';
            }

            $doc->refresh();
            ShippingDocumentAudit::create([
                'shipping_document_id' => $doc->id,
                'actor_user_id' => $user->id,
                'action' => $action,
                'before_json' => $before,
                'after_json' => $this->documentAuditSnapshot($doc),
                'created_at' => now(),
            ]);

            return $doc;
        });
        return response()->json([
            'message' => 'Dokumen berhasil diperbarui.',
            'document' => $doc->fresh(['items.item:id,code,name,category,unit', 'creator:id,name', 'warehouse:id,name,code']),
        ]);
    }

    /** Delete a draft document only; operational evidence is preserved. */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->role === 'superadmin', 403, 'Hanya Superadmin yang dapat mengarsipkan dokumen.');

        $doc = DB::transaction(function () use ($id, $user) {
            $doc = ShippingDocument::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_if($doc->archived_at, 409, 'Dokumen sudah diarsipkan.');
            $before = $this->documentAuditSnapshot($doc);
            if (in_array($doc->status, ['approved', 'in_progress'], true)) {
                abort_if(GatePassEvent::where('shipping_document_id', $doc->id)->exists()
                    || $doc->tags()->where('status', 'scanned')->exists(), 422,
                    'Dokumen aktif dengan pembacaan gate tidak dapat diarsipkan; selesaikan atau gunakan alur koreksi.');
                $doc->status = 'cancelled';
            }

            $doc->archived_at = now();
            $doc->archived_by_user_id = $user->id;
            $doc->save();
            ShippingDocumentAudit::create([
                'shipping_document_id' => $doc->id,
                'actor_user_id' => $user->id,
                'action' => 'ARCHIVED',
                'before_json' => $before,
                'after_json' => $this->documentAuditSnapshot($doc),
                'created_at' => now(),
            ]);

            return $doc;
        });

        return response()->json([
            'message' => 'Dokumen diarsipkan dari daftar aktif; record dan bukti operasional tetap tersimpan.',
            'document' => $doc,
        ]);
    }


    /** @return array<string, mixed> */
    private function documentAuditSnapshot(ShippingDocument $doc): array
    {
        $doc->loadMissing(['items.item:id,code,name', 'tags:id,shipping_document_id,tag_epc,status,scanned_at']);
        return [
            'document_number' => $doc->document_number,
            'type' => $doc->type,
            'status' => $doc->status,
            'warehouse_id' => $doc->warehouse_id,
            'notes' => $doc->notes,
            'attachments' => $doc->attachments,
            'items' => $doc->items->map(fn ($item) => [
                'item_id' => $item->item_id,
                'item_code' => $item->item?->code,
                'expected_qty' => $item->expected_qty,
            ])->values()->all(),
            'tags' => $doc->tags->map(fn ($tag) => [
                'epc' => $tag->tag_epc,
                'status' => $tag->status,
                'scanned_at' => $tag->scanned_at?->toISOString(),
            ])->values()->all(),
            'archived_at' => $doc->archived_at?->toISOString(),
        ];
    }

    /**
     * Show document detail with full progress.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $doc = ShippingDocument::with([
            'creator:id,name,role',
            'approver:id,name,role',
            'warehouse:id,name,code',
            'items.item:id,code,name,category,unit',
            'items.tags.rfidTag:id,epc,status',
            'tags',
        ])->findOrFail($id);
        abort_unless(!$doc->archived_at || $request->user()?->role === 'superadmin', 403,
            'Arsip dokumen hanya dapat dilihat Superadmin.');

        // Add computed progress
        $totalTags = $doc->tags->count();
        $scannedTags = $doc->tags->where('status', 'scanned')->count();

        return response()->json([
            'document' => $doc,
            'progress' => [
                'total_tags' => $totalTags,
                'scanned_tags' => $scannedTags,
                'missing_tags' => $totalTags - $scannedTags,
                'percentage' => $totalTags > 0 ? round(($scannedTags / $totalTags) * 100, 1) : 0,
                'is_complete' => $totalTags > 0 && $scannedTags === $totalTags,
            ],
        ]);
    }

    /**
     * Approve document in_progress (PM or Superadmin).
     * Hanya bisa dari status 'in_progress' — artinya minimal 1 tag sudah di-assign
     * dan dokumen sudah bergerak dari draft setelah tag di-assign.
     */
    public function approve(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if (!in_array($user->role, ['pm', 'superadmin'])) {
            return response()->json(['message' => 'Hanya PM atau Superadmin yang bisa approve.'], 403);
        }

        $doc = ShippingDocument::findOrFail($id);

        if (!in_array($doc->status, ['in_progress'], true)) {
            return response()->json(['message' => 'Dokumen hanya bisa di-approve dari status in_progress. Pastikan tag sudah di-assign dan barang sudah melewati gate.'], 422);
        }

        $doc->update([
            'status' => 'completed',
            'approved_by_user_id' => $user->id,
            'approved_at' => now(),
        ]);

        return response()->json([
            'message' => 'Dokumen berhasil di-approve.',
            'document' => $doc->fresh(['creator:id,name', 'approver:id,name', 'warehouse:id,name,code']),
        ]);
    }

    /**
     * Assign RFID tags to document items (PIC Lapangan or Superadmin).
     * #6 Percepatan: Batch fetch semua data sebelum loop validasi.
     * Sebelumnya: N*5 queries (1 per tag x 5 check). Sekarang: 4 queries + N in-memory.
     */
    public function assignTags(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if (!in_array($user->role, ['pic_lapangan', 'pm', 'superadmin'])) {
            return response()->json(['message' => 'Tidak memiliki akses untuk assign tag.'], 403);
        }

        $doc = ShippingDocument::findOrFail($id);
        if (!in_array($doc->status, ['draft', 'approved', 'in_progress'])) {
            return response()->json(['message' => 'Dokumen tidak dapat di-assign tag pada status ini.'], 422);
        }

        $request->merge([
            'tags' => collect($request->input('tags', []))
                ->map(fn ($tag) => [...$tag, 'epc' => strtoupper(trim((string) ($tag['epc'] ?? '')))])
                ->values()
                ->all(),
        ]);
        $validated = $request->validate([
            'tags'                          => ['required', 'array', 'min:1'],
            'tags.*.epc'                    => ['required', 'string', 'min:8', 'max:64', 'distinct', 'regex:/^[0-9A-Fa-f]+$/'],
            'tags.*.document_item_id'       => ['required', 'exists:shipping_document_items,id'],
            'tags.*.length_dispatched'      => ['sometimes', 'nullable', 'numeric', 'min:0.001'],
        ]);

        $assigned = [];
        $errors   = [];

        DB::transaction(function () use ($validated, &$doc, &$assigned, &$errors) {
            $doc = ShippingDocument::whereKey($doc->id)->lockForUpdate()->firstOrFail();
            if (!in_array($doc->status, ['draft', 'approved', 'in_progress'], true)) {
                throw new \Symfony\Component\HttpKernel\Exception\HttpException(422, 'Dokumen tidak lagi terbuka untuk assignment tag.');
            }

            $incomingEpcs    = collect($validated['tags'])->pluck('epc')->all();
            $incomingItemIds = collect($validated['tags'])->pluck('document_item_id')->unique()->all();

            // ΓöÇΓöÇ Batch #1: semua RfidTag sekaligus (lock untuk cegah race) ΓöÇΓöÇ
            $rfidTagsByEpc = RfidTag::whereIn('epc', $incomingEpcs)
                ->lockForUpdate()
                ->get()
                ->keyBy('epc');

            $allRfidTagIds = $rfidTagsByEpc->pluck('id')->all();

            // ΓöÇΓöÇ Batch #2: tag yang sudah ada di dokumen ini ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            $alreadyInDoc = ShippingDocumentTag::where('shipping_document_id', $doc->id)
                ->whereIn('rfid_tag_id', $allRfidTagIds)
                ->pluck('rfid_tag_id')
                ->flip();

            // ΓöÇΓöÇ Batch #3: tag aktif di dokumen LAIN ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            $activeInOtherDoc = ShippingDocumentTag::whereIn('rfid_tag_id', $allRfidTagIds)
                ->where('shipping_document_id', '!=', $doc->id)
                ->whereHas('shippingDocument', fn ($q) => $q->whereIn('status', ['approved', 'in_progress']))
                ->pluck('rfid_tag_id')
                ->flip();

            // ΓöÇΓöÇ Batch #4: doc items + jumlah tag yang sudah di-assign ΓöÇΓöÇΓöÇΓöÇ
            $docItems = ShippingDocumentItem::whereIn('id', $incomingItemIds)
                ->where('shipping_document_id', $doc->id)
                ->get()
                ->keyBy('id');

            $assignedCountPerItem = ShippingDocumentTag::whereIn('shipping_document_item_id', $incomingItemIds)
                ->selectRaw('shipping_document_item_id, COUNT(*) as cnt')
                ->groupBy('shipping_document_item_id')
                ->pluck('cnt', 'shipping_document_item_id');

            // ΓöÇΓöÇ In-memory validation loop ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            $toCreate = [];
            foreach ($validated['tags'] as $tagData) {
                $epc    = $tagData['epc'];
                $itemId = $tagData['document_item_id'];

                $rfidTag = $rfidTagsByEpc->get($epc);
                if (!$rfidTag) {
                    $errors[] = "Tag EPC {$epc} tidak ditemukan di sistem.";
                    continue;
                }
                if ($alreadyInDoc->has($rfidTag->id)) {
                    $errors[] = "Tag EPC {$epc} sudah di-assign ke dokumen ini.";
                    continue;
                }
                if ($activeInOtherDoc->has($rfidTag->id)) {
                    $errors[] = "Tag EPC {$epc} sudah digunakan di dokumen aktif lain.";
                    continue;
                }

                $docItem = $docItems->get($itemId);
                if (!$docItem) {
                    $errors[] = "Document item ID {$itemId} tidak valid.";
                    continue;
                }
                if ($rfidTag->item_id !== $docItem->item_id) {
                    $errors[] = "Tag EPC {$epc} terdaftar untuk item berbeda.";
                    continue;
                }

                // Tag tersedia untuk di-assign ke dokumen jika:
                //   OUTBOUND: status 'attached' DAN ada di warehouse dokumen ini
                //             ATAU is_length_based=true DAN remaining_length_m > 0 (partial drum)
                //   INBOUND:  status 'active' DAN belum ada di warehouse manapun (baru dari vendor)
                $tagInThisWarehouse  = (int) $rfidTag->last_warehouse_id === (int) $doc->warehouse_id;
                $isPartialDrum       = $rfidTag->item?->is_length_based
                    && $rfidTag->remaining_length_m !== null
                    && (float) $rfidTag->remaining_length_m > 0.0
                    && $tagInThisWarehouse;
                $availableForDocument = $doc->type === 'outbound'
                    ? (($rfidTag->status === 'attached' && $tagInThisWarehouse) || $isPartialDrum)
                    : ($rfidTag->status === 'active' && $rfidTag->last_warehouse_id === null);

                // Validasi length_dispatched untuk partial drum OUTBOUND
                $lengthDispatched = isset($tagData['length_dispatched'])
                    ? (float) $tagData['length_dispatched']
                    : null;
                if ($doc->type === 'outbound' && $isPartialDrum && $availableForDocument) {
                    if ($lengthDispatched === null) {
                        $errors[] = "Tag EPC {$epc} adalah drum kabel. Wajib isi length_dispatched (meter yang akan diambil).";
                        continue;
                    }
                    if ($lengthDispatched > (float) $rfidTag->remaining_length_m) {
                        $errors[] = "Tag EPC {$epc}: length_dispatched ({$lengthDispatched}m) melebihi sisa drum ({$rfidTag->remaining_length_m}m).";
                        continue;
                    }
                }
                if (!$availableForDocument) {
                    // Cek apakah tag sudah tercatat sebagai stok di gudang ini
                    // (attached/active di warehouse yang sama untuk dokumen inbound)
                    $isAlreadyStock = $doc->type === 'inbound'
                        && ($rfidTag->status === 'attached' || $rfidTag->status === 'active')
                        && $tagInThisWarehouse;
                    $errors[] = $isAlreadyStock
                        ? "Tag EPC {$epc} sudah tercatat sebagai stok di gudang ini. Gunakan dokumen Barang Keluar; mengarsipkan dokumen lama tidak mengubah lokasi stok."
                        : ($doc->type === 'inbound'
                            ? "Tag EPC {$epc} bukan tag baru yang tersedia untuk penerimaan."
                            : "Tag EPC {$epc} tidak aktif sebagai stok di gudang dokumen.");
                    continue;
                }

                // Quota: gabung DB count + tag dalam batch ini
                $currentAssigned = ($assignedCountPerItem->get($docItem->id, 0))
                    + collect($toCreate)->where('shipping_document_item_id', $docItem->id)->count();
                if ($currentAssigned >= $docItem->expected_qty) {
                    $errors[] = "Jumlah tag untuk item {$docItem->item_id} sudah mencapai target {$docItem->expected_qty}.";
                    continue;
                }

                $toCreate[] = [
                    'shipping_document_id'      => $doc->id,
                    'shipping_document_item_id' => $docItem->id,
                    'rfid_tag_id'               => $rfidTag->id,
                    'tag_epc'                   => $rfidTag->epc,
                    'status'                    => 'expected',
                    'length_dispatched'         => $lengthDispatched ?? null,
                ];
                $assigned[] = $rfidTag->epc;
            }

            // ΓöÇΓöÇ Bulk insert semua yang lolos validasi ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            if (!empty($toCreate)) {
                ShippingDocumentTag::insert($toCreate);
            }

            if (in_array($doc->status, ['draft', 'approved'], true) && count($assigned) > 0) {
                $doc->update(['status' => 'in_progress']);
            }
        });

        return response()->json([
            'message'  => count($assigned) . ' tag berhasil di-assign.',
            'assigned' => $assigned,
            'errors'   => $errors,
        ]);
    }

    /**
     * Record a tag scan from the gate (called by edge-bridge or system).
     *
     * Scan manual dinonaktifkan by design: satu-satunya sumber kebenaran progress
     * dokumen adalah event gate fisik yang diproses GateEngineService. Ini menjaga
     * audit trail tidak bisa dimanipulasi dari UI tanpa bukti lintasan reader nyata.
     *
     * Caller sebaiknya memantau progress lewat GET /shipping-documents/{id} atau
     * SSE /gate/stream, bukan endpoint ini.
     */
    public function scanTag(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if (!in_array($user->role, ['pic_lapangan', 'pm', 'superadmin'])) {
            return response()->json(['message' => 'Tidak memiliki akses untuk scan tag dokumen.'], 403);
        }

        $request->merge(['epc' => strtoupper(trim((string) $request->input('epc')))]);
        $validated = $request->validate([
            'epc' => ['required', 'string', 'min:8', 'max:64', 'regex:/^[0-9A-Fa-f]+$/'],
        ]);

        $doc = ShippingDocument::findOrFail($id);

        if ($doc->status !== 'in_progress') {
            return response()->json(['message' => 'Dokumen tidak dalam status in_progress.'], 422);
        }

        return response()->json([
            'message'       => 'Scan manual tidak diizinkan. Progress dokumen hanya berubah dari event gate fisik yang disetujui. Pantau perkembangan lewat halaman dokumen ΓÇö data diperbarui otomatis saat tag melintas gate.',
            'matched'       => false,
            'epc'           => $validated['epc'],
            'locked_reason' => 'gate_only',
        ], 422);
    }

    /**
     * Batch scan multiple tags at once (from gate event).
     *
     * Dinonaktifkan by design ΓÇö lihat komentar scanTag().
     */
    public function batchScanTags(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if (!in_array($user->role, ['pic_lapangan', 'pm', 'superadmin'])) {
            return response()->json(['message' => 'Tidak memiliki akses untuk batch scan tag.'], 403);
        }

        $request->merge([
            'epcs' => collect($request->input('epcs', []))
                ->map(fn ($epc) => strtoupper(trim($epc)))
                ->values()
                ->all(),
        ]);
        $validated = $request->validate([
            'epcs' => ['required', 'array', 'min:1'],
            'epcs.*' => ['required', 'string', 'min:8', 'max:64', 'regex:/^[0-9A-Fa-f]+$/'],
        ]);

        $doc = ShippingDocument::findOrFail($id);

        if ($doc->status !== 'in_progress') {
            return response()->json(['message' => 'Dokumen tidak dalam status in_progress.'], 422);
        }

        return response()->json([
            'message'       => 'Batch scan manual tidak diizinkan. Progress dokumen hanya berubah dari event gate fisik yang disetujui. Pantau perkembangan lewat halaman dokumen ΓÇö data diperbarui otomatis saat tag melintas gate.',
            'matched'       => [],
            'unmatched'     => $validated['epcs'],
            'locked_reason' => 'gate_only',
        ], 422);
    }

    /**
     * Complete document (PIC Lapangan or Superadmin).
     * Only allowed when all tags have been scanned (100% match).
     */
    public function complete(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if (!in_array($user->role, ['pic_lapangan', 'superadmin'])) {
            return response()->json(['message' => 'Hanya PIC Lapangan atau Superadmin yang bisa menyelesaikan dokumen.'], 403);
        }

        $doc = DB::transaction(function () use ($id, $user) {
            $doc = ShippingDocument::whereKey($id)->lockForUpdate()->firstOrFail();
            if ($doc->status !== 'in_progress') {
                throw new \Symfony\Component\HttpKernel\Exception\HttpException(422, 'Dokumen harus dalam status in_progress.');
            }

            $items = $doc->items()->lockForUpdate()->get();
            if ($items->isEmpty()) {
                throw new \Symfony\Component\HttpKernel\Exception\HttpException(422, 'Dokumen tidak memiliki item.');
            }
            // v2: tag di-assign otomatis oleh gate ΓÇö skip cek pre-assignment manual

            $totalTags = $doc->tags()->count();
            $scannedTags = $doc->tags()->where('status', 'scanned')->count();
            if ($totalTags === 0 || $scannedTags !== $totalTags) {
                throw new \Symfony\Component\HttpKernel\Exception\HttpException(422, 'Tidak bisa menyelesaikan dokumen: semua tag harus disetujui dari lintasan gate yang valid.');
            }

            $expectedDirection = $doc->type === 'inbound' ? 'IN' : 'OUT';
            $latestValidPass = GatePassEvent::where('shipping_document_id', $doc->id)
                ->where('warehouse_id', $doc->warehouse_id)
                ->where('direction', $expectedDirection)
                ->where('is_valid', true)
                ->latest('id')
                ->first();
            $verifiedEpcs = collect($latestValidPass?->raw_payload['cumulative_epcs'] ?? $latestValidPass?->tag_epcs_json ?? [])
                ->map(fn ($epc) => strtoupper((string) $epc))
                ->unique()
                ->sort()
                ->values()
                ->all();
            $assignedEpcs = $doc->tags()->pluck('tag_epc')
                ->map(fn ($epc) => strtoupper((string) $epc))
                ->unique()
                ->sort()
                ->values()
                ->all();
            // Set-comparison: gate evidence harus mencakup semua assigned EPC (subset check).
            // Strict equality ditolak karena gate bisa membaca EPC ekstra (antena noise),
            // sedangkan yang penting semua EPC assignment ada dalam bukti gate.
            $missingFromGate = array_values(array_diff($assignedEpcs, $verifiedEpcs));
            if (!$latestValidPass || !empty($missingFromGate)) {
                $missingStr = implode(', ', array_slice($missingFromGate, 0, 5));
                $suffix = count($missingFromGate) > 5 ? ' ΓÇªdan ' . (count($missingFromGate) - 5) . ' lainnya' : '';
                throw new \Symfony\Component\HttpKernel\Exception\HttpException(422, 'Tidak bisa menyelesaikan dokumen: belum ada bukti gate valid untuk seluruh EPC assignment pada arah dan gudang yang sesuai.' . ($missingStr ? " EPC belum tercakup: {$missingStr}{$suffix}." : ''));
            }

            if ($doc->type === 'inbound') {
                foreach ($doc->tags()->with('rfidTag')->get() as $documentTag) {
                    $alreadyPosted = CustodyLedger::where('action', 'STOCK_IN')
                        ->where('ref_type', ShippingDocument::class)
                        ->where('ref_id', $doc->id)
                        ->where('tag_epc', $documentTag->tag_epc)
                        ->exists();
                    if (!$alreadyPosted) {
                        app(CustodyService::class)->recordEvent(
                            itemId: (int) $documentTag->rfidTag->item_id,
                            holderUserId: (int) $user->id,
                            action: 'STOCK_IN',
                            tagEpc: $documentTag->tag_epc,
                            refType: ShippingDocument::class,
                            refId: $doc->id,
                            warehouseId: (int) $doc->warehouse_id,
                            notes: "Penerimaan diselesaikan ΓÇö Dokumen #{$doc->document_number}"
                        );
                    }
                }
            }

            if ($doc->type === 'outbound') {
                foreach ($doc->tags()->with('rfidTag')->get() as $documentTag) {
                    $alreadyPosted = CustodyLedger::where('action', 'STOCK_OUT')
                        ->where('ref_type', ShippingDocument::class)
                        ->where('ref_id', $doc->id)
                        ->where('tag_epc', $documentTag->tag_epc)
                        ->exists();
                    if (!$alreadyPosted) {
                        app(CustodyService::class)->recordEvent(
                            itemId: (int) $documentTag->rfidTag->item_id,
                            holderUserId: (int) $user->id,
                            action: 'STOCK_OUT',
                            tagEpc: $documentTag->tag_epc,
                            refType: ShippingDocument::class,
                            refId: $doc->id,
                            warehouseId: (int) $doc->warehouse_id,
                            notes: "Pengiriman diselesaikan -- Dokumen #{$doc->document_number}"
                        );
                    }
                }
            }



            $doc->update(['status' => 'completed']);
            return $doc;
        });

        return response()->json([
            'message' => 'Dokumen berhasil di-approve. Semua tag cocok Γ£ô',
            'document' => $doc->fresh(['creator:id,name', 'approver:id,name', 'warehouse:id,name,code']),
        ]);
    }

    /** Preview stock reconciliation eligibility for a legacy inbound document. */
    public function stockReconciliationPreview(Request $request, int $id): JsonResponse
    {
        abort_unless(in_array($request->user()?->role, ['pm', 'superadmin'], true), 403, 'Pencatatan STOCK_IN lama hanya dapat dilakukan PM atau Superadmin.');

        $doc = ShippingDocument::with(['items.item:id,name,code', 'tags'])->findOrFail($id);
        return response()->json($this->buildStockReconciliationPreview($doc));
    }

    /** Append missing STOCK_IN events after a Superadmin verifies legacy physical receipt evidence. */
    public function reconcileInboundStock(Request $request, int $id): JsonResponse
    {
        abort_unless(in_array($request->user()?->role, ['pm', 'superadmin'], true), 403, 'Pencatatan STOCK_IN lama hanya dapat dilakukan PM atau Superadmin.');
        $validated = $request->validate([
            'evidence_reference' => ['required', 'string', 'min:5', 'max:255'],
            'physical_confirmation' => ['required', 'accepted'],
        ]);
        $actorId = (int) $request->user()->id;

        $result = DB::transaction(function () use ($id, $validated, $actorId) {
            $doc = ShippingDocument::whereKey($id)->lockForUpdate()->firstOrFail();
            $preview = $this->buildStockReconciliationPreview($doc);
            if (!$preview['gate_evidence_valid'] && !$preview['legacy_reconciliation_available']) {
                throw new \Symfony\Component\HttpKernel\Exception\HttpException(422, $preview['blocked_reason'] ?? 'Bukti gate tidak memenuhi syarat rekonsiliasi.');
            }
            if ($preview['eligible_count'] === 0) {
                return ['reconciled_count' => 0, 'epcs' => [], 'preview' => $preview];
            }

            $reconciled = [];
            foreach ($preview['eligible_tags'] as $eligible) {
                $documentTag = ShippingDocumentTag::where('shipping_document_id', $doc->id)
                    ->where('tag_epc', $eligible['epc'])
                    ->lockForUpdate()
                    ->firstOrFail();
                $tag = RfidTag::whereKey($documentTag->rfid_tag_id)->lockForUpdate()->firstOrFail();

                // Recheck idempotency and state under lock. Never rewrite prior ledger history.
                $alreadyPosted = CustodyLedger::where('action', 'STOCK_IN')
                    ->where('ref_type', ShippingDocument::class)
                    ->where('ref_id', $doc->id)
                    ->where('tag_epc', $documentTag->tag_epc)
                    ->exists();
                if ($alreadyPosted) {
                    continue;
                }
                if ($doc->status !== 'completed' || $doc->type !== 'inbound'
                    || $documentTag->status !== 'scanned'
                    || !$this->isReconcilableLegacyTag($tag, (int) $doc->warehouse_id)) {
                    throw new \Symfony\Component\HttpKernel\Exception\HttpException(409, "Status EPC {$documentTag->tag_epc} berubah; refresh preview sebelum melanjutkan.");
                }

                app(CustodyService::class)->recordEvent(
                    itemId: (int) $tag->item_id,
                    holderUserId: $actorId,
                    action: 'STOCK_IN',
                    tagEpc: $documentTag->tag_epc,
                    refType: ShippingDocument::class,
                    refId: $doc->id,
                    warehouseId: (int) $doc->warehouse_id,
                    notes: 'Legacy STOCK_IN ['.$preview['reconciliation_mode'].'] ΓÇö Fisik dikonfirmasi oleh user #'.$actorId.' ΓÇö Ref: '.$validated['evidence_reference'].' ΓÇö Dokumen #'.$doc->document_number
                );
                $reconciled[] = $documentTag->tag_epc;
            }

            return [
                'reconciled_count' => count($reconciled),
                'epcs' => $reconciled,
                'preview' => $this->buildStockReconciliationPreview($doc->fresh()),
            ];
        });

        return response()->json([
            'message' => $result['reconciled_count'] > 0
                ? "{$result['reconciled_count']} tag berhasil dicatat sebagai stok masuk."
                : 'Tidak ada tag baru untuk dicatat; stok dokumen ini sudah diperbarui.',
            ...$result,
        ]);
    }

    /** @return array<string, mixed> */
    private function buildStockReconciliationPreview(ShippingDocument $doc): array
    {
        $base = [
            'document_id' => $doc->id,
            'document_number' => $doc->document_number,
            'eligible_count' => 0,
            'already_stocked_count' => 0,
            'eligible_tags' => [],
            'gate_evidence_valid' => false,
            'legacy_reconciliation_available' => false,
            'reconciliation_mode' => null,
            'gate_warning' => null,
            'blocked_reason' => null,
        ];

        if ($doc->type !== 'inbound' || $doc->status !== 'completed') {
            return [...$base, 'blocked_reason' => 'Hanya dokumen Barang Masuk berstatus Selesai yang dapat direkonsiliasi.'];
        }

        $items = $doc->items()->get();
        $documentTags = $doc->tags()->with('rfidTag.item')->get();
        if ($items->isEmpty() || $documentTags->isEmpty()) {
            return [...$base, 'blocked_reason' => 'Dokumen tidak memiliki item atau EPC assignment.'];
        }

        foreach ($items as $item) {
            $assignedCount = $documentTags->where('shipping_document_item_id', $item->id)->count();
            if ($assignedCount !== (int) $item->expected_qty) {
                return [...$base, 'blocked_reason' => "Assignment item {$item->item_id} tidak lengkap ({$assignedCount}/{$item->expected_qty})."];
            }
        }

        if ($documentTags->contains(fn ($tag) => $tag->status !== 'scanned')) {
            return [...$base, 'blocked_reason' => 'Belum semua EPC dokumen tercatat terbaca.'];
        }

        $assignedEpcs = $documentTags->pluck('tag_epc')
            ->map(fn ($epc) => strtoupper((string) $epc))->unique()->sort()->values()->all();
        $gatePass = GatePassEvent::where('shipping_document_id', $doc->id)
            ->where('warehouse_id', $doc->warehouse_id)
            ->where('direction', 'IN')
            ->where('is_valid', true)
            ->latest('id')
            ->first();
        $verifiedEpcs = collect($gatePass?->raw_payload['cumulative_epcs'] ?? $gatePass?->tag_epcs_json ?? [])
            ->map(fn ($epc) => strtoupper((string) $epc))->unique()->sort()->values()->all();
        $gateEvidenceValid = $gatePass && $verifiedEpcs === $assignedEpcs;

        $eligibleTags = [];
        $alreadyStocked = 0;
        foreach ($documentTags as $documentTag) {
            $stockInExists = CustodyLedger::where('action', 'STOCK_IN')
                ->where('ref_type', ShippingDocument::class)
                ->where('ref_id', $doc->id)
                ->where('tag_epc', $documentTag->tag_epc)
                ->exists();
            if ($stockInExists) {
                $alreadyStocked++;
                continue;
            }

            $tag = $documentTag->rfidTag;
            if (!$tag || !$this->isReconcilableLegacyTag($tag, (int) $doc->warehouse_id)) {
                return [...$base, 'already_stocked_count' => $alreadyStocked,
                    'blocked_reason' => "EPC {$documentTag->tag_epc} sudah berpindah gudang atau statusnya tidak cocok; perlu investigasi manual."];
            }

            $eligibleTags[] = [
                'epc' => $documentTag->tag_epc,
                'item_name' => $tag->item?->name,
                'item_code' => $tag->item?->code,
            ];
        }

        return [
            ...$base,
            'gate_evidence_valid' => (bool) $gateEvidenceValid,
            'legacy_reconciliation_available' => !$gateEvidenceValid,
            'reconciliation_mode' => $gateEvidenceValid ? 'gate_evidence' : 'legacy_superadmin_attestation',
            'gate_warning' => $gateEvidenceValid ? null : 'Riwayat gate lama tidak membuktikan satu lintasan valid untuk seluruh EPC. Mode ini adalah pengecualian audit Superadmin; wajib cocokkan bukti penerimaan fisik dan referensi berita acara.',
            'eligible_count' => count($eligibleTags),
            'already_stocked_count' => $alreadyStocked,
            'eligible_tags' => $eligibleTags,
            'physical_confirmation_required' => true,
            'reason_required' => true,
        ];
    }

    private function isReconcilableLegacyTag(RfidTag $tag, int $warehouseId): bool
    {
        return ($tag->status === 'attached' && (int) $tag->last_warehouse_id === $warehouseId)
            || ($tag->status === 'active' && $tag->last_warehouse_id === null);
    }

    /**
     * Cancel a document (PM or Superadmin).
     */
    public function cancel(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if (!in_array($user->role, ['pm', 'superadmin'])) {
            return response()->json(['message' => 'Hanya PM atau Superadmin yang bisa membatalkan dokumen.'], 403);
        }

        $doc = DB::transaction(function () use ($id) {
            $doc = ShippingDocument::whereKey($id)->lockForUpdate()->firstOrFail();
            if ($doc->status === 'completed') {
                throw new \Symfony\Component\HttpKernel\Exception\HttpException(422, 'Dokumen yang sudah selesai tidak bisa dibatalkan.');
            }
            if (GatePassEvent::where('shipping_document_id', $doc->id)->where('is_valid', true)->exists()) {
                throw new \Symfony\Component\HttpKernel\Exception\HttpException(422, 'Dokumen tidak bisa dibatalkan setelah gate menyetujui lintasan fisik; buat dokumen koreksi baru bila diperlukan.');
            }

            $doc->update(['status' => 'cancelled']);
            return $doc;
        });

        return response()->json([
            'message' => 'Dokumen berhasil dibatalkan.',
            'document' => $doc->fresh(),
        ]);
    }

}
