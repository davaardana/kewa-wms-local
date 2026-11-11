<?php

namespace App\Services;

use App\Models\GateDevice;
use App\Models\GatePassEvent;
use App\Models\RfidTag;
use App\Models\ShippingDocument;
use App\Models\ShippingDocumentTag;
use App\Models\Warehouse;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class GateEngineService
{
    public function __construct(
        protected CustodyService $custodyService
    ) {}

    /**
     * Process real-time gate pass event from edge bridge reader.
     *
     * @param array $payload
     * @param GateDevice|null $authenticatedDevice
     */
    public function processGateEvent(array $payload, ?GateDevice $authenticatedDevice = null): array
    {
        return DB::transaction(function () use ($payload, $authenticatedDevice) {
            if (!$authenticatedDevice) {
                throw new \DomainException('Authenticated gate device is required.');
            }

            $device = GateDevice::whereKey($authenticatedDevice->id)->lockForUpdate()->first();

            // ── Idempotency: reject duplicate event IDs ────────────────────────
            $eventId = $payload['event_id'] ?? (string) Str::uuid();
            $payload['observed_at'] = $payload['observed_at'] ?? Carbon::now()->toIso8601String();

            $replayed = GatePassEvent::where('gate_device_id', $device->id)
                ->where('event_id', $eventId)->first();
            if ($replayed) {
                $storedDecision = $replayed->decision_result_json ?? [
                    'unlock_gate' => false,
                    'status'      => 'DENIED',
                    'message'     => 'Stored decision unavailable; fail closed.',
                    'mismatch'    => true,
                ];
                return array_merge($storedDecision, [
                    'unlock_gate'           => false,
                    'original_unlock_gate'  => (bool) ($storedDecision['unlock_gate'] ?? false),
                    'pass_event_id'         => $replayed->id,
                    'idempotent_replay'     => true,
                ]);
            }

            // ── Basic payload extraction ───────────────────────────────────────
            $warehouseId   = (int) ($payload['warehouse_id'] ?? 0);
            $gateId        = $payload['gate_id'] ?? '';
            $warehouse     = Warehouse::find($warehouseId);
            $gateMode      = $warehouse?->gate_mode ?? 'DUAL_ANTENNA_AUTO';
            $antennaSeq    = $payload['antenna_sequence'] ?? 'A_TO_B';
            $epcList       = array_values(array_unique(array_filter(array_map('trim', $payload['epc_list'] ?? []))));
            $cctvSnapshot  = $payload['cctv_snapshot_path'] ?? null;
            $shippingDocId = $payload['shipping_document_id'] ?? null;
            $requestedDir  = $payload['direction'] ?? null;

            // ── Device binding validation ──────────────────────────────────────
            if (!$device || !$device->is_active
                || (int) $device->warehouse_id !== $warehouseId
                || $device->device_code !== $gateId) {
                throw new \DomainException('Authenticated device, warehouse, and gate binding mismatch.');
            }

            // ── Enrollment workstation: mute gate evaluation ───────────────────
            if ($device->device_role === 'enrollment_desktop'
                || ($payload['operational_mode'] ?? '') === 'ENROLLMENT') {
                return [
                    'status'        => 'ENROLLMENT_STREAM',
                    'unlock_gate'   => false,
                    'action_taken'  => 'ENROLLMENT_STREAM_MUTED',
                    'message'       => 'Tag dibaca pada stasiun enrollment. Evaluasi gerbang dinonaktifkan.',
                    'detected_tags' => count($epcList),
                    'warehouse_id'  => $warehouseId,
                    'gate_id'       => $gateId,
                    'mismatch'      => false,
                    'pass_event_id' => null,
                ];
            }

            // ── #3a: Determine direction ───────────────────────────────────────
            $direction = $this->resolveDirection($gateMode, $antennaSeq, $requestedDir);

            // ── #3b: Resolve matching ShippingDocument ─────────────────────────
            [$shippingDoc, $direction] = $this->resolveShippingDocument(
                $shippingDocId, $warehouseId, $direction, $epcList
            );

            $docTypeForDirection = $direction === 'OUT' ? 'outbound' : ($direction === 'IN' ? 'inbound' : null);

            // ── #3c: Load and evaluate EPCs ────────────────────────────────────
            $tags = RfidTag::with('item')
                ->whereIn('epc', $epcList)
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('epc');

            // ── #3d: Evaluate mismatch ─────────────────────────────────────────
            [$mismatch, $mismatchDetails, $unlockGate, $statusMessage, $isUnderCount,
             $allCumulativeEpcs, $cumulativeItemCounts, $hasCriticalMismatch, $assignedEpcs]
                = $this->evaluateEpcMismatch($shippingDoc, $epcList, $tags, $direction, $warehouseId);

            // ── Build decision ────────────────────────────────────────────────
            $decisionResult = [
                'unlock_gate'              => $unlockGate,
                'direction'                => $direction,
                'status'                   => $unlockGate ? 'SUCCESS' : ($isUnderCount && !($hasCriticalMismatch ?? false) ? 'STANDBY' : 'DENIED'),
                'message'                  => $statusMessage,
                'mismatch'                 => $mismatch,
                'is_undercount'            => $isUnderCount,
                'mismatch_details'         => $mismatchDetails,
                'shipping_document_id'     => $shippingDoc?->id,
                'shipping_document_number' => $shippingDoc?->document_number,
                'total_tags'               => count($epcList),
                'cumulative_tags_count'    => count($allCumulativeEpcs),
                'cumulative_item_counts'   => $cumulativeItemCounts,
                'idempotent_replay'        => false,
                'shipping_match'           => [
                    'matched'   => count(array_intersect($allCumulativeEpcs, $assignedEpcs ?? [])),
                    'unmatched' => count(array_diff($epcList, $assignedEpcs ?? [])),
                ],
            ];

            // ── Persist GatePassEvent ─────────────────────────────────────────
            $passEvent = GatePassEvent::create([
                'gate_device_id'       => $device->id,
                'event_id'             => $eventId,
                'observed_at'          => $payload['observed_at'],
                'shipping_document_id' => $shippingDoc?->id,
                'warehouse_id'         => $warehouseId,
                'gate_id'              => $gateId,
                'direction'            => $direction,
                'antenna_sequence'     => $antennaSeq,
                'tag_epcs_json'        => $epcList,
                'total_tags_detected'  => count($epcList),
                'cctv_snapshot_path'   => $cctvSnapshot,
                'is_valid'             => $unlockGate,
                'mismatch_flag'        => $mismatch,
                'mismatch_details'     => !empty($mismatchDetails) ? implode("\n", $mismatchDetails) : null,
                'raw_payload'          => array_merge($payload, [
                    'cumulative_epcs'  => $allCumulativeEpcs,
                    'cumulative_count' => count($allCumulativeEpcs),
                ]),
                'decision_result_json' => $decisionResult,
            ]);

            // ── #3e: On approved — record custody & update document ───────────
            if ($unlockGate && $shippingDoc) {
                $allCumulativeTags = RfidTag::with('item')
                    ->whereIn('epc', $allCumulativeEpcs)
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get()
                    ->keyBy('epc');

                $this->recordGateCustody($shippingDoc, $allCumulativeEpcs, $allCumulativeTags, $direction, $warehouseId, $gateId, $cctvSnapshot);
            }

            return array_merge($decisionResult, ['pass_event_id' => $passEvent->id]);
        });
    }

    // ── #3a: Direction resolution ──────────────────────────────────────────────
    private function resolveDirection(string $gateMode, string $antennaSeq, ?string $requestedDir): ?string
    {
        return match ($gateMode) {
            'DUAL_ANTENNA_AUTO'      => ($antennaSeq === 'A_TO_B' ? 'OUT' : 'IN'),
            'SINGLE_ANTENNA_SESSION' => $requestedDir ?? null,
            default                  => 'OUT',
        };
    }

    // ── #3b: Resolve the best matching ShippingDocument ───────────────────────
    /**
     * @return array{ShippingDocument|null, string|null} [$shippingDoc, $direction]
     */
    private function resolveShippingDocument(
        ?int $shippingDocId, int $warehouseId, ?string $direction, array $epcList
    ): array {
        $docTypeForDirection = $direction === 'OUT' ? 'outbound' : ($direction === 'IN' ? 'inbound' : null);

        $shippingDoc = null;

        if ($shippingDocId) {
            $shippingDoc = ShippingDocument::with(['tags.rfidTag.item', 'items.item'])
                ->whereKey($shippingDocId)
                ->lockForUpdate()
                ->first();

            if ($shippingDoc
                && ((int) $shippingDoc->warehouse_id !== $warehouseId
                    || !in_array($shippingDoc->status, ['draft', 'approved', 'in_progress'], true)
                    || ($docTypeForDirection !== null && $shippingDoc->type !== $docTypeForDirection))) {
                $shippingDoc = null;
            }
        }

        $edgeSelectedDocument = $shippingDoc;

        // Edge config may be stale — re-resolve by scanned EPCs if needed
        if ($shippingDoc && !$shippingDoc->tags->contains(
            fn ($tag) => in_array($tag->tag_epc, $epcList, true)
        )) {
            $shippingDoc = null;
        }

        if (!$shippingDoc && $epcList) {
            $matchingDocuments = ShippingDocument::with(['tags.rfidTag.item', 'items.item'])
                ->where('warehouse_id', $warehouseId)
                ->whereIn('status', ['draft', 'approved', 'in_progress'])
                ->whereHas('tags', fn ($q) => $q->whereIn('tag_epc', $epcList))
                ->lockForUpdate()
                ->get();

            $matchingDocuments = $matchingDocuments->filter(function ($doc) use ($direction, $docTypeForDirection) {
                if ($direction !== null && $doc->type !== $docTypeForDirection) return false;
                return true;
            });

            if ($matchingDocuments->count() === 1) {
                $shippingDoc = $matchingDocuments->first();
            }
        }

        if (!$shippingDoc && $edgeSelectedDocument) {
            $shippingDoc = $edgeSelectedDocument;
        }

        // Infer direction from resolved document when edge omitted it
        if ($shippingDoc && ($direction === null || $direction === '')) {
            $direction = $shippingDoc->type === 'outbound' ? 'OUT' : 'IN';
        }

        return [$shippingDoc, $direction];
    }

    // ── #3c: Full EPC mismatch evaluation ────────────────────────────────────
    /**
     * Returns [mismatch, mismatchDetails[], unlockGate, statusMessage,
     *          isUnderCount, allCumulativeEpcs[], cumulativeItemCounts[],
     *          hasCriticalMismatch, assignedEpcs[]]
     */
    private function evaluateEpcMismatch(
        ?ShippingDocument $shippingDoc,
        array $epcList,
        Collection $tags,
        ?string $direction,
        int $warehouseId
    ): array {
        $mismatch        = false;
        $mismatchDetails = [];
        $unlockGate      = false;
        $statusMessage   = '';
        $isUnderCount    = false;
        $hasCriticalMismatch = false;
        $allCumulativeEpcs   = $epcList;
        $cumulativeItemCounts = [];
        $assignedEpcs    = [];

        // Unregistered EPCs
        $unregisteredEpcs = [];
        foreach ($epcList as $epc) {
            if (!$tags->has($epc)) $unregisteredEpcs[] = $epc;
        }

        if (!$shippingDoc) {
            $mismatch        = true;
            $mismatchDetails[] = "PERINGATAN ANOMALI: Terdeteksi perlintasan {$direction} sebanyak "
                . count($epcList) . " tag di gerbang TANPA DOKUMEN SHIPPING yang aktif!";
            $statusMessage = 'DITOLAK: Tidak ada Shipping Document yang aktif untuk perlintasan ini.';

            return [$mismatch, $mismatchDetails, $unlockGate, $statusMessage,
                    $isUnderCount, $allCumulativeEpcs, $cumulativeItemCounts,
                    $hasCriticalMismatch, $assignedEpcs];
        }

        if (!empty($unregisteredEpcs)) {
            $mismatch        = true;
            $mismatchDetails[] = 'Tag tidak terdaftar dalam sistem: ' . implode(', ', $unregisteredEpcs);
        }

        foreach ($tags as $epc => $tagModel) {
            if (!in_array($tagModel->status, ['active', 'attached'], true)) {
                $mismatch        = true;
                $mismatchDetails[] = "Tag EPC '{$epc}' berstatus {$tagModel->status} dan tidak boleh melintas.";
            }
        }

        $assignedTags  = $shippingDoc->tags->keyBy('tag_epc');
        $assignedEpcs  = $assignedTags->keys()->all();
        $expectedItems = $shippingDoc->items->mapWithKeys(fn ($i) => [$i->item_id => (int) $i->expected_qty]);
        $assignedItemCounts = $shippingDoc->items->mapWithKeys(fn ($item) => [
            $item->item_id => $assignedTags->filter(fn ($tag) => (int) $tag->shipping_document_item_id === (int) $item->id)->count(),
        ]);

        foreach ($expectedItems as $itemId => $requiredQty) {
            $assignedQty = $assignedItemCounts->get($itemId, 0);
            if ($assignedQty !== $requiredQty) {
                $mismatch = true;
                $mismatchDetails[] = "Jumlah tag ter-assign untuk item #{$itemId} adalah {$assignedQty}/{$requiredQty}; lengkapi assignment sebelum gate.";
            }
        }

        foreach ($epcList as $epc) {
            if (!$assignedTags->has($epc)) {
                $mismatch = true;
                $mismatchDetails[] = "Tag EPC '{$epc}' tidak di-assign ke dokumen #{$shippingDoc->document_number}.";
                continue;
            }
            $tagModel = $tags->get($epc);
            if ($tagModel && $direction === 'OUT') {
                $ilb = $tagModel->item?->is_length_based ?? false;
                $icw = (int) $tagModel->last_warehouse_id === $warehouseId;
                if ($ilb) {
                    if ($tagModel->status !== 'attached' || !$icw) { $mismatch=true; $mismatchDetails[]="Tag '{$epc}' drum tidak di gudang ini (status:{$tagModel->status})."; }
                    elseif (($tagModel->remaining_length_m ?? 0) <= 0) { $mismatch=true; $mismatchDetails[]="Tag '{$epc}' drum habis (remaining=0)."; }
                } else {
                    if ($tagModel->status !== 'attached' || !$icw) { $mismatch=true; $mismatchDetails[]="Tag EPC '{$epc}' tidak berstatus stok di gudang asal dokumen (status: {$tagModel->status})."; }
                }
            }
            if ($tagModel && $direction === 'IN'
                && ($tagModel->status !== 'active' || $tagModel->last_warehouse_id !== null)) {
                $mismatch = true;
                $mismatchDetails[] = "Tag EPC '{$epc}' tidak valid untuk penerimaan (status: {$tagModel->status}, warehouse: {$tagModel->last_warehouse_id}).";
            }
        }

        // Cumulative EPCs from prior valid/standby passes
        $previousEpcs = GatePassEvent::where('shipping_document_id', $shippingDoc->id)
            ->where('mismatch_flag', false)
            ->where(function ($query) {
                $query->where('is_valid', true)
                      ->orWhere('decision_result_json->status', 'STANDBY');
            })
            ->pluck('tag_epcs_json')
            ->flatten()
            ->filter()
            ->unique()
            ->toArray();

        $allCumulativeEpcs = array_values(array_unique(array_merge($previousEpcs, $epcList)));

        $alreadyScannedEpcs = $shippingDoc->tags->where('status', 'scanned')->pluck('tag_epc')->all();
        if ($alreadyScannedEpcs) {
            $mismatch = true;
            $mismatchDetails[] = 'Dokumen sudah memiliki tag yang disahkan gate; lintasan ulang ditolak untuk mencegah pencatatan ganda.';
        }

        $allCumulativeTags = RfidTag::with('item')
            ->whereIn('epc', $allCumulativeEpcs)
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->keyBy('epc');

        foreach ($allCumulativeEpcs as $epc) {
            $cumulativeTag = $allCumulativeTags->get($epc);
            if (!$assignedTags->has($epc) || !$cumulativeTag) {
                $mismatch = true;
                $mismatchDetails[] = "EPC kumulatif '{$epc}' bukan assignment valid dokumen.";
                continue;
            }
            $ilbc = $cumulativeTag->item?->is_length_based ?? false;
            if ($direction === 'OUT') {
                $expectedLocation = $ilbc
                    ? ($cumulativeTag->status==='attached' && (int)$cumulativeTag->last_warehouse_id===$warehouseId && ($cumulativeTag->remaining_length_m??0)>0)
                    : ($cumulativeTag->status==='attached' && (int)$cumulativeTag->last_warehouse_id===$warehouseId);
            } else {
                $expectedLocation = $cumulativeTag->status==='active' && $cumulativeTag->last_warehouse_id===null;
            }
            if (!$expectedLocation) {
                $mismatch = true;
                $mismatchDetails[] = "EPC kumulatif '{$epc}' status/lokasinya berubah dan tidak lagi tersedia untuk lintasan ini.";
            }
        }

        foreach ($allCumulativeEpcs as $epc) {
            if ($allCumulativeTags->has($epc)) {
                $itemId = $allCumulativeTags->get($epc)->item_id;
                $cumulativeItemCounts[$itemId] = ($cumulativeItemCounts[$itemId] ?? 0) + 1;
            }
        }

        $hasCriticalMismatch = $mismatch;

        foreach ($cumulativeItemCounts as $itemId => $qty) {
            $firstTag = $allCumulativeTags->first(fn ($t) => $t->item_id == $itemId);
            $itemName = $firstTag?->item?->name ?? "Material #{$itemId}";
            $docQty   = $expectedItems->get($itemId, 0);

            if ($docQty === 0) {
                $mismatch = true;
                $hasCriticalMismatch = true;
                $mismatchDetails[] = "🚨 BARANG TIDAK ADA DI DOKUMEN: '{$itemName}' ({$qty} unit) tidak tercantum dalam Shipping Document #{$shippingDoc->document_number}!";
            } elseif ($qty > $docQty) {
                $mismatch = true;
                $hasCriticalMismatch = true;
                $selisih = $qty - $docQty;
                $mismatchDetails[] = "🚨 KELEBIHAN: '{$itemName}' terdeteksi {$qty} unit, izin dokumen hanya {$docQty} unit (+{$selisih}).";
            }
        }

        $allItemsFulfilled = true;
        foreach ($expectedItems as $itemId => $requiredQty) {
            $cumulativeQty = $cumulativeItemCounts[$itemId] ?? 0;
            if ($cumulativeQty < $requiredQty) {
                $allItemsFulfilled = false;
                $isUnderCount      = true;
                $firstTag  = $allCumulativeTags->first(fn ($t) => $t->item_id == $itemId);
                $itemName  = $firstTag?->item?->name ?? "Material #{$itemId}";
                $selisih   = $requiredQty - $cumulativeQty;
                $mismatchDetails[] = "⚠️ BELUM LENGKAP '{$itemName}': terbaca {$cumulativeQty}/{$requiredQty} (kurang {$selisih} tag). Menunggu sisa.";
            }
        }

        if ($allItemsFulfilled && !$hasCriticalMismatch) {
            $unlockGate    = true;
            $mismatch      = false;
            $statusMessage = 'APPROVED: Seluruh muatan sesuai Shipping Document. Gerbang dibuka.';
        } else {
            $statusMessage = $isUnderCount && !$hasCriticalMismatch
                ? 'STANDBY: Muatan bertahap sedang berlangsung, menunggu sisa tag.'
                : 'FLAGGED: Terdeteksi ketidaksesuaian dengan Shipping Document.';
        }

        return [$mismatch, $mismatchDetails, $unlockGate, $statusMessage,
                $isUnderCount, $allCumulativeEpcs, $cumulativeItemCounts,
                $hasCriticalMismatch, $assignedEpcs];
    }

    // ── #3d: Record custody events & update document/tag state ────────────────
    private function recordGateCustody(
        ShippingDocument $shippingDoc,
        array $allCumulativeEpcs,
        Collection $allCumulativeTags,
        string $direction,
        int $warehouseId,
        string $gateId,
        ?string $cctvSnapshot
    ): void {
        $holderUserId = $shippingDoc->created_by_user_id;

        foreach ($allCumulativeEpcs as $epc) {
            if (!$allCumulativeTags->has($epc)) continue;

            $tagModel    = $allCumulativeTags->get($epc);
            $documentTag = $shippingDoc->tags->firstWhere('tag_epc', $epc);

            // Drum/kabel partial OUT: cek sebelum custody umum
            if ($direction === 'OUT' && ($tagModel->item?->is_length_based ?? false) && $documentTag) {
                $dispatched   = (float) ($documentTag->length_dispatched ?? 0);
                $remainingNow = (float) ($tagModel->remaining_length_m ?? 0);

                $remainingNew = max(0.0, $remainingNow - $dispatched);
                if ($remainingNew > 0) {
                    $tagModel->update(['remaining_length_m' => $remainingNew]);
                    $pa = 'PARTIAL_OUT';
                } else {
                    $tagModel->update(['status' => 'active', 'last_warehouse_id' => null, 'remaining_length_m' => 0]);
                    $pa = 'GATE_OUT';
                }
                $this->custodyService->recordEvent(
                    itemId: $tagModel->item_id, holderUserId: $holderUserId,
                    action: $pa, tagEpc: $epc,
                    refType: ShippingDocument::class, refId: $shippingDoc->id,
                    warehouseId: $warehouseId, photoUrl: $cctvSnapshot,
                    notes: "[{$dispatched}m] Gate OUT via {$gateId} - Dok #{$shippingDoc->document_number}",
                    quantityValue: $dispatched
                );
                if ($documentTag->status === 'expected') {
                    $documentTag->update(['status' => 'scanned', 'scanned_at' => now()]);
                    $documentTag->documentItem->increment('scanned_qty');
                }
                continue;
            }

            // Alur umum IN/OUT
            $action = ($direction === 'OUT') ? 'GATE_OUT' : 'GATE_IN';
            $this->custodyService->recordEvent(
                itemId: $tagModel->item_id, holderUserId: $holderUserId,
                action: $action, tagEpc: $epc,
                refType: ShippingDocument::class, refId: $shippingDoc->id,
                warehouseId: $warehouseId, photoUrl: $cctvSnapshot,
                notes: "Gate {$direction} via {$gateId} - Dok #{$shippingDoc->document_number}"
            );
            if ($documentTag && $documentTag->status === 'expected') {
                $documentTag->update(['status' => 'scanned', 'scanned_at' => now()]);
                $documentTag->documentItem->increment('scanned_qty');
            }
            if ($direction === 'IN') {
                $tagModel->update(['status' => 'attached', 'last_warehouse_id' => $warehouseId]);
            } elseif ($direction === 'OUT') {
                $tagModel->update(['status' => 'active', 'last_warehouse_id' => null]);
            }
        }

        if (in_array($shippingDoc->status, ['draft', 'approved'])) {
            $shippingDoc->update(['status' => 'in_progress']);
        }
    }
}
