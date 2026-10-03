<?php

namespace App\Services;

use App\Models\GateDevice;
use App\Models\GatePassEvent;
use App\Models\RfidTag;
use App\Models\ShippingDocument;
use App\Models\ShippingDocumentTag;
use App\Models\Warehouse;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class GateEngineService
{
    public function __construct(
        protected CustodyService $custodyService
    ) {}

    /**
     * Process real-time gate pass event from edge bridge reader.
     * Matches scanned EPCs against approved ShippingDocuments at the warehouse.
     *
     * @param array $payload [
     *   'warehouse_id'       => int,
     *   'gate_id'            => string,
     *   'antenna_sequence'   => 'A_TO_B'|'B_TO_A'|'SINGLE_ANTENNA',
     *   'direction'          => 'OUT'|'IN' (optional, inferred from antenna),
     *   'epc_list'           => array of EPC strings,
     *   'cctv_snapshot_path' => string|null,
     *   'shipping_document_id' => int|null,
     * ]
     */
    public function processGateEvent(array $payload, ?GateDevice $authenticatedDevice = null): array
    {
        return DB::transaction(function () use ($payload, $authenticatedDevice) {
            if (!$authenticatedDevice) {
                throw new \DomainException('Authenticated gate device is required.');
            }

            $device = GateDevice::whereKey($authenticatedDevice->id)->lockForUpdate()->first();

            // Idempotency: reject duplicate event IDs
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

            $warehouseId      = (int) ($payload['warehouse_id'] ?? 0);
            $gateId           = $payload['gate_id'] ?? '';
            $warehouse        = Warehouse::find($warehouseId);
            $gateMode         = $warehouse?->gate_mode ?? 'DUAL_ANTENNA_AUTO';
            $antennaSeq       = $payload['antenna_sequence'] ?? 'A_TO_B';
            $epcList          = array_values(array_unique(array_filter(array_map('trim', $payload['epc_list'] ?? []))));
            $cctvSnapshot     = $payload['cctv_snapshot_path'] ?? null;
            $shippingDocId    = $payload['shipping_document_id'] ?? null;

            // Validate device binding
            if (!$device || !$device->is_active
                || (int) $device->warehouse_id !== $warehouseId
                || $device->device_code !== $gateId) {
                throw new \DomainException('Authenticated device, warehouse, and gate binding mismatch.');
            }

            // Enrollment workstation or inactive device: mute gate evaluation
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

            // Determine direction from antenna sequence
            $direction = match ($gateMode) {
                'DUAL_ANTENNA_AUTO'     => ($antennaSeq === 'A_TO_B' ? 'OUT' : 'IN'),
                'SINGLE_ANTENNA_SESSION' => ($payload['direction'] ?? 'OUT'),
                default                 => 'OUT',
            };

            // Resolve ShippingDocument — must be approved, correct warehouse, correct type
            $docTypeForDirection = ($direction === 'OUT') ? 'outbound' : 'inbound';
            $shippingDoc = null;

            if ($shippingDocId) {
                $shippingDoc = ShippingDocument::with(['tags.rfidTag.item', 'items.item'])
                    ->whereKey($shippingDocId)
                    ->lockForUpdate()
                    ->first();

                // Validate document is suitable
                if ($shippingDoc
                    && ((int) $shippingDoc->warehouse_id !== $warehouseId
                        || !in_array($shippingDoc->status, ['approved', 'in_progress'], true)
                        || $shippingDoc->type !== $docTypeForDirection)) {
                    $shippingDoc = null;
                }
            }

            // If no doc provided, search for a matching approved doc at this warehouse
            if (!$shippingDoc) {
                // Find an approved shipping doc at this warehouse that contains any scanned EPC
                $shippingDoc = ShippingDocument::with(['tags.rfidTag.item', 'items.item'])
                    ->where('warehouse_id', $warehouseId)
                    ->where('type', $docTypeForDirection)
                    ->whereIn('status', ['approved', 'in_progress'])
                    ->whereHas('tags', function ($q) use ($epcList) {
                        $q->whereHas('rfidTag', fn ($tq) => $tq->whereIn('epc', $epcList));
                    })
                    ->lockForUpdate()
                    ->first();
            }

            // Map EPCs to RfidTag models
            $tags = RfidTag::with('item')
                ->whereIn('epc', $epcList)
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('epc');

            $detectedItemCounts = [];
            $unregisteredEpcs   = [];

            foreach ($epcList as $epc) {
                if ($tags->has($epc)) {
                    $itemId = $tags->get($epc)->item_id;
                    $detectedItemCounts[$itemId] = ($detectedItemCounts[$itemId] ?? 0) + 1;
                } else {
                    $unregisteredEpcs[] = $epc;
                }
            }

            $mismatch        = false;
            $mismatchDetails = [];
            $unlockGate      = false;
            $statusMessage   = '';
            $isUnderCount    = false;
            $allCumulativeEpcs   = $epcList;
            $cumulativeItemCounts = $detectedItemCounts;

            // ─── EVALUATE ACCESS DECISION ────────────────────────────────
            if (!$shippingDoc) {
                $mismatch        = true;
                $mismatchDetails[] = "PERINGATAN ANOMALI: Terdeteksi perlintasan {$direction} sebanyak "
                    . count($epcList) . " tag di {$gateId} TANPA DOKUMEN SHIPPING yang aktif!";
                $unlockGate    = false;
                $statusMessage = 'DITOLAK: Tidak ada Shipping Document yang aktif untuk perlintasan ini.';
            } else {
                // Unregistered EPCs
                if (!empty($unregisteredEpcs)) {
                    $mismatch        = true;
                    $mismatchDetails[] = 'Tag tidak terdaftar dalam sistem: ' . implode(', ', $unregisteredEpcs);
                }

                // Tag status checks
                foreach ($tags as $epc => $tagModel) {
                    if (!in_array($tagModel->status, ['active', 'attached'], true)) {
                        $mismatch        = true;
                        $mismatchDetails[] = "Tag EPC '{$epc}' berstatus {$tagModel->status} dan tidak boleh melintas.";
                    }
                }

                // Cumulative EPC check (multi-pass: tags scanned in previous valid events for this doc)
                $previousEpcs = GatePassEvent::where('shipping_document_id', $shippingDoc->id)
                    ->where('is_valid', true)
                    ->pluck('tag_epcs_json')
                    ->flatten()
                    ->filter()
                    ->unique()
                    ->toArray();

                $allCumulativeEpcs = array_values(array_unique(array_merge($previousEpcs, $epcList)));

                $allCumulativeTags = RfidTag::with('item')
                    ->whereIn('epc', $allCumulativeEpcs)
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get()
                    ->keyBy('epc');

                $cumulativeItemCounts = [];
                foreach ($allCumulativeEpcs as $epc) {
                    if ($allCumulativeTags->has($epc)) {
                        $itemId = $allCumulativeTags->get($epc)->item_id;
                        $cumulativeItemCounts[$itemId] = ($cumulativeItemCounts[$itemId] ?? 0) + 1;
                    }
                }

                // Build expected item counts from document items
                $expectedItems = $shippingDoc->items->mapWithKeys(fn ($i) => [$i->item_id => $i->quantity]);

                // Check for items not in doc
                foreach ($cumulativeItemCounts as $itemId => $qty) {
                    $firstTag  = $allCumulativeTags->first(fn ($t) => $t->item_id == $itemId);
                    $itemName  = $firstTag?->item?->name ?? "Material #{$itemId}";
                    $docQty    = $expectedItems->get($itemId, 0);

                    if ($docQty === 0) {
                        $mismatch        = true;
                        $mismatchDetails[] = "🚨 BARANG TIDAK ADA DI DOKUMEN: '{$itemName}' ({$qty} unit) tidak tercantum dalam Shipping Document #{$shippingDoc->document_number}!";
                    } elseif ($qty > $docQty) {
                        $mismatch        = true;
                        $selisih = $qty - $docQty;
                        $mismatchDetails[] = "🚨 KELEBIHAN: '{$itemName}' terdeteksi {$qty} unit, izin dokumen hanya {$docQty} unit (+{$selisih}).";
                    }
                }

                $hasCriticalMismatch = $mismatch;

                // Check undercount (not all items fulfilled yet)
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
                    $unlockGate    = false;
                    $statusMessage = $isUnderCount && !$hasCriticalMismatch
                        ? 'STANDBY: Muatan bertahap sedang berlangsung, menunggu sisa tag.'
                        : 'FLAGGED: Terdeteksi ketidaksesuaian dengan Shipping Document.';
                }
            }

            $decisionResult = [
                'unlock_gate'             => $unlockGate,
                'direction'               => $direction,
                'status'                  => $unlockGate ? 'SUCCESS' : ($isUnderCount && !($hasCriticalMismatch ?? false) ? 'STANDBY' : 'DENIED'),
                'message'                 => $statusMessage,
                'mismatch'                => $mismatch,
                'is_undercount'           => $isUnderCount,
                'mismatch_details'        => $mismatchDetails,
                'shipping_document_id'    => $shippingDoc?->id,
                'shipping_document_number'=> $shippingDoc?->document_number,
                'total_tags'              => count($epcList),
                'cumulative_tags_count'   => count($allCumulativeEpcs),
                'cumulative_item_counts'  => $cumulativeItemCounts,
                'idempotent_replay'       => false,
            ];

            // Create GatePassEvent log
            $passEvent = GatePassEvent::create([
                'gate_device_id'      => $device->id,
                'event_id'            => $eventId,
                'observed_at'         => $payload['observed_at'],
                'shipping_document_id'=> $shippingDoc?->id,
                'warehouse_id'        => $warehouseId,
                'gate_id'             => $gateId,
                'direction'           => $direction,
                'antenna_sequence'    => $antennaSeq,
                'tag_epcs_json'       => $epcList,
                'total_tags_detected' => count($epcList),
                'cctv_snapshot_path'  => $cctvSnapshot,
                'is_valid'            => $unlockGate,
                'mismatch_flag'       => $mismatch,
                'mismatch_details'    => !empty($mismatchDetails) ? implode("\n", $mismatchDetails) : null,
                'raw_payload'         => array_merge($payload, [
                    'cumulative_epcs'  => $allCumulativeEpcs,
                    'cumulative_count' => count($allCumulativeEpcs),
                ]),
                'decision_result_json'=> $decisionResult,
            ]);

            // ─── ON APPROVED: record custody & update document status ────
            if ($unlockGate && $shippingDoc) {
                $holderUserId = $shippingDoc->created_by_user_id;

                foreach ($allCumulativeEpcs as $epc) {
                    if ($allCumulativeTags->has($epc)) {
                        $tagModel = $allCumulativeTags->get($epc);
                        $action   = ($direction === 'OUT') ? 'GATE_OUT' : 'GATE_IN';

                        $this->custodyService->recordEvent(
                            itemId:      $tagModel->item_id,
                            holderUserId:$holderUserId,
                            action:      $action,
                            tagEpc:      $epc,
                            refType:     ShippingDocument::class,
                            refId:       $shippingDoc->id,
                            warehouseId: $warehouseId,
                            photoUrl:    $cctvSnapshot,
                            notes:       "Gate {$direction} via {$gateId} — Dokumen #{$shippingDoc->document_number}"
                        );

                        // Update tag warehouse tracking
                        if ($direction === 'IN') {
                            $tagModel->update(['status' => 'attached', 'last_warehouse_id' => $warehouseId]);
                        } elseif ($direction === 'OUT') {
                            $tagModel->update(['last_warehouse_id' => null]);
                        }
                    }
                }

                // Auto-advance document to in_progress if still approved
                if ($shippingDoc->status === 'approved') {
                    $shippingDoc->update(['status' => 'in_progress']);
                }
            }

            return array_merge($decisionResult, [
                'pass_event_id' => $passEvent->id,
            ]);
        });
    }
}
