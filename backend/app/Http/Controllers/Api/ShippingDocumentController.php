<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RfidTag;
use App\Models\ShippingDocument;
use App\Models\ShippingDocumentItem;
use App\Models\ShippingDocumentTag;
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
            'items.*.item_id' => ['required', 'exists:items,id'],
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

    /**
     * Show document detail with full progress.
     */
    public function show(int $id): JsonResponse
    {
        $doc = ShippingDocument::with([
            'creator:id,name,role',
            'approver:id,name,role',
            'warehouse:id,name,code',
            'items.item:id,code,name,category,unit',
            'items.tags.rfidTag:id,epc,status',
            'tags',
        ])->findOrFail($id);

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
     * Approve a draft document (PM or Superadmin).
     */
    public function approve(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if (!in_array($user->role, ['pm', 'superadmin'])) {
            return response()->json(['message' => 'Hanya PM atau Superadmin yang bisa approve.'], 403);
        }

        $doc = ShippingDocument::findOrFail($id);

        if ($doc->status !== 'draft') {
            return response()->json(['message' => 'Dokumen hanya bisa di-approve dari status draft.'], 422);
        }

        $doc->update([
            'status' => 'approved',
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
     * This links specific RFID tags to specific items within the document.
     */
    public function assignTags(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if (!in_array($user->role, ['pic_lapangan', 'pm', 'superadmin'])) {
            return response()->json(['message' => 'Tidak memiliki akses untuk assign tag.'], 403);
        }

        $doc = ShippingDocument::findOrFail($id);

        if (!in_array($doc->status, ['approved', 'in_progress'])) {
            return response()->json(['message' => 'Dokumen harus sudah di-approve sebelum assign tag.'], 422);
        }

        $request->merge([
            'tags' => collect($request->input('tags', []))
                ->map(fn ($tag) => [...$tag, 'epc' => strtoupper(trim((string) ($tag['epc'] ?? '')))])
                ->values()
                ->all(),
        ]);
        $validated = $request->validate([
            'tags' => ['required', 'array', 'min:1'],
            'tags.*.epc' => ['required', 'string', 'min:8', 'max:64', 'regex:/^[0-9A-Fa-f]+$/'],
            'tags.*.document_item_id' => ['required', 'exists:shipping_document_items,id'],
        ]);

        $assigned = [];
        $errors = [];

        DB::transaction(function () use ($validated, $doc, &$assigned, &$errors) {
            foreach ($validated['tags'] as $tagData) {
                $rfidTag = RfidTag::where('epc', $tagData['epc'])->first();
                if (!$rfidTag) {
                    $errors[] = "Tag EPC {$tagData['epc']} tidak ditemukan di sistem.";
                    continue;
                }

                // Check if tag is already assigned to THIS document
                $existingInDoc = ShippingDocumentTag::where('shipping_document_id', $doc->id)
                    ->where('rfid_tag_id', $rfidTag->id)
                    ->exists();

                if ($existingInDoc) {
                    $errors[] = "Tag EPC {$tagData['epc']} sudah di-assign ke dokumen ini.";
                    continue;
                }

                // Cross-doc check: tag must not be assigned to ANY other active document
                $existingInOtherDoc = ShippingDocumentTag::where('rfid_tag_id', $rfidTag->id)
                    ->where('shipping_document_id', '!=', $doc->id)
                    ->whereHas('shippingDocument', function ($q) {
                        $q->whereIn('status', ['approved', 'in_progress']);
                    })
                    ->exists();

                if ($existingInOtherDoc) {
                    $errors[] = "Tag EPC {$tagData['epc']} sudah digunakan di dokumen aktif lain.";
                    continue;
                }

                // Verify document item belongs to this document
                $docItem = ShippingDocumentItem::where('id', $tagData['document_item_id'])
                    ->where('shipping_document_id', $doc->id)
                    ->first();

                if (!$docItem) {
                    $errors[] = "Document item ID {$tagData['document_item_id']} tidak valid.";
                    continue;
                }

                // Verify tag's item matches document item's item
                if ($rfidTag->item_id !== $docItem->item_id) {
                    $errors[] = "Tag EPC {$tagData['epc']} terdaftar untuk item berbeda.";
                    continue;
                }

                ShippingDocumentTag::create([
                    'shipping_document_id' => $doc->id,
                    'shipping_document_item_id' => $docItem->id,
                    'rfid_tag_id' => $rfidTag->id,
                    'tag_epc' => $rfidTag->epc,
                    'status' => 'expected',
                ]);

                $assigned[] = $rfidTag->epc;
            }

            // Update document status to in_progress if it was approved
            if ($doc->status === 'approved' && count($assigned) > 0) {
                $doc->update(['status' => 'in_progress']);
            }
        });

        return response()->json([
            'message' => count($assigned) . ' tag berhasil di-assign.',
            'assigned' => $assigned,
            'errors' => $errors,
        ]);
    }

    /**
     * Record a tag scan from the gate (called by edge-bridge or system).
     * Matches scanned EPC against active documents.
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

        $docTag = ShippingDocumentTag::where('shipping_document_id', $doc->id)
            ->where('tag_epc', $validated['epc'])
            ->where('status', 'expected')
            ->first();

        if (!$docTag) {
            return response()->json([
                'message' => 'Tag tidak ditemukan dalam dokumen ini atau sudah ter-scan.',
                'matched' => false,
            ], 404);
        }

        // Mark tag as scanned
        $docTag->update([
            'status' => 'scanned',
            'scanned_at' => now(),
        ]);

        // Update scanned_qty on the document item
        $docItem = $docTag->documentItem;
        $docItem->increment('scanned_qty');

        // Check overall progress
        $totalTags = $doc->tags()->count();
        $scannedTags = $doc->tags()->where('status', 'scanned')->count();

        return response()->json([
            'message' => 'Tag berhasil di-scan.',
            'matched' => true,
            'epc' => $validated['epc'],
            'progress' => [
                'total_tags' => $totalTags,
                'scanned_tags' => $scannedTags,
                'missing_tags' => $totalTags - $scannedTags,
                'percentage' => $totalTags > 0 ? round(($scannedTags / $totalTags) * 100, 1) : 0,
                'is_complete' => $scannedTags === $totalTags,
            ],
        ]);
    }

    /**
     * Batch scan multiple tags at once (from gate event).
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

        $matched = [];
        $unmatched = [];

        DB::transaction(function () use ($validated, $doc, &$matched, &$unmatched) {
            foreach ($validated['epcs'] as $epc) {
                $docTag = ShippingDocumentTag::where('shipping_document_id', $doc->id)
                    ->where('tag_epc', $epc)
                    ->where('status', 'expected')
                    ->first();

                if ($docTag) {
                    $docTag->update([
                        'status' => 'scanned',
                        'scanned_at' => now(),
                    ]);
                    $docTag->documentItem->increment('scanned_qty');
                    $matched[] = $epc;
                } else {
                    $unmatched[] = $epc;
                }
            }
        });

        $totalTags = $doc->tags()->count();
        $scannedTags = $doc->tags()->where('status', 'scanned')->count();

        return response()->json([
            'message' => count($matched) . ' tag cocok, ' . count($unmatched) . ' tidak cocok.',
            'matched' => $matched,
            'unmatched' => $unmatched,
            'progress' => [
                'total_tags' => $totalTags,
                'scanned_tags' => $scannedTags,
                'missing_tags' => $totalTags - $scannedTags,
                'percentage' => $totalTags > 0 ? round(($scannedTags / $totalTags) * 100, 1) : 0,
                'is_complete' => $scannedTags === $totalTags,
            ],
        ]);
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

        $doc = ShippingDocument::findOrFail($id);

        if ($doc->status !== 'in_progress') {
            return response()->json(['message' => 'Dokumen harus dalam status in_progress.'], 422);
        }

        // Enforce 100% scan match
        $totalTags = $doc->tags()->count();
        $scannedTags = $doc->tags()->where('status', 'scanned')->count();

        if ($totalTags === 0) {
            return response()->json(['message' => 'Belum ada tag yang di-assign ke dokumen.'], 422);
        }

        if ($scannedTags < $totalTags) {
            $missing = $totalTags - $scannedTags;
            return response()->json([
                'message' => "Tidak bisa ACC. Masih ada {$missing} tag yang belum terbaca. Pastikan semua barang sudah lewat gate.",
                'missing_tags' => $doc->tags()->where('status', '!=', 'scanned')->with('rfidTag:id,epc')->get(),
            ], 422);
        }

        $doc->update(['status' => 'completed']);

        return response()->json([
            'message' => 'Dokumen berhasil diselesaikan. Semua tag cocok ✓',
            'document' => $doc->fresh(['creator:id,name', 'approver:id,name', 'warehouse:id,name,code']),
        ]);
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

        $doc = ShippingDocument::findOrFail($id);

        if ($doc->status === 'completed') {
            return response()->json(['message' => 'Dokumen yang sudah selesai tidak bisa dibatalkan.'], 422);
        }

        $doc->update(['status' => 'cancelled']);

        return response()->json([
            'message' => 'Dokumen berhasil dibatalkan.',
            'document' => $doc->fresh(),
        ]);
    }

    /**
     * Auto-match scanned EPCs from gate event against all active documents for a warehouse.
     * Called internally by GateEventController when tags pass through the gate.
     */
    public static function matchGateEpcs(int $warehouseId, array $epcs, string $direction): array
    {
        $type = $direction === 'IN' ? 'inbound' : 'outbound';

        // Find active documents for this warehouse and direction
        $activeDocs = ShippingDocument::where('warehouse_id', $warehouseId)
            ->where('type', $type)
            ->where('status', 'in_progress')
            ->pluck('id');

        if ($activeDocs->isEmpty()) {
            return ['matched' => 0, 'unmatched' => count($epcs)];
        }

        $matched = 0;

        DB::transaction(function () use ($activeDocs, $epcs, &$matched) {
            foreach ($epcs as $epc) {
                $docTag = ShippingDocumentTag::whereIn('shipping_document_id', $activeDocs)
                    ->where('tag_epc', $epc)
                    ->where('status', 'expected')
                    ->first();

                if ($docTag) {
                    $docTag->update([
                        'status' => 'scanned',
                        'scanned_at' => now(),
                    ]);
                    $docTag->documentItem->increment('scanned_qty');
                    $matched++;
                }
            }
        });

        return [
            'matched' => $matched,
            'unmatched' => count($epcs) - $matched,
        ];
    }
}
