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

            // ΓöÇΓöÇ Idempotency: reject duplicate event IDs ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

            // ΓöÇΓöÇ Basic payload extraction ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            $warehouseId   = (int) ($payload['warehouse_id'] ?? 0);
            $gateId        = $payload['gate_id'] ?? '';
            $warehouse     = Warehouse::find($warehouseId);
            $gateMode      = $warehouse?->gate_mode ?? 'DUAL_ANTENNA_AUTO';
            $antennaSeq    = $payload['antenna_sequence'] ?? 'A_TO_B';
            $epcList       = array_values(array_unique(array_filter(array_map('trim', $payload['epc_list'] ?? []))));
            $cctvSnapshot  = $payload['cctv_snapshot_path'] ?? null;
            $shippingDocId = $payload['shipping_document_id'] ?? null;
            $requestedDir  = $payload['direction'] ?? null;

            // ΓöÇΓöÇ Device binding validation ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            if (!$device || !$device->is_active
                || (int) $device->warehouse_id !== $warehouseId
                || $device->device_code !== $gateId) {
                throw new \DomainException('Authenticated device, warehouse, and gate binding mismatch.');
            }

            // ΓöÇΓöÇ Enrollment workstation: mute gate evaluation ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

            // ΓöÇΓöÇ #3a: Determine direction ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            $direction = $this->resolveDirection($gateMode, $antennaSeq, $requestedDir);

            // ΓöÇΓöÇ #3b: Resolve matching ShippingDocument ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            [$shippingDoc, $direction] = $this->resolveShippingDocument(
                $shippingDocId, $warehouseId, $direction, $epcList
            );

            $docTypeForDirection = $direction === 'OUT' ? 'outbound' : ($direction === 'IN' ? 'inbound' : null);

            // ΓöÇΓöÇ #3c: Load and evaluate EPCs ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            $tags = RfidTag::with('item')
                ->whereIn('epc', $epcList)
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('epc');

            // ΓöÇΓöÇ #3d: Evaluate mismatch ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
            [$mismatch, $mismatchDetails, $unlockGate, $statusMessage, $isUnderCount,
             $allCumulativeEpcs, $cumulativeItemCounts, $hasCriticalMismatch, $assignedEpcs]
                = $this->evaluateEpcMismatch($shippingDoc, $epcList, $tags, $direction, $warehouseId);

            // ΓöÇΓöÇ Build decision ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

            // ΓöÇΓöÇ Persist GatePassEvent ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

            // ΓöÇΓöÇ #3e: On approved ΓÇö record custody & update document ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

    // ΓöÇΓöÇ #3a: Direction resolution ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    private function resolveDirection(string $gateMode, string $antennaSeq, ?string $requestedDir): ?string
    {
        return match ($gateMode) {
            'DUAL_ANTENNA_AUTO'      => ($antennaSeq === 'A_TO_B' ? 'OUT' : 'IN'),
            'SINGLE_ANTENNA_SESSION' => $requestedDir ?? null,
            default                  => 'OUT',
        };
    }

    // ΓöÇΓöÇ #3b: Resolve the best matching ShippingDocument ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

        // Draft tidak punya pre-assigned tags -- jangan null berdasarkan tag match
        if ($shippingDoc && $shippingDoc->status !== 'draft'
            && !$shippingDoc->tags->contains(fn ($tag) => in_array($tag->tag_epc, $epcList, true))
        ) {
            $shippingDoc = null;
        }

        if (!$shippingDoc && $epcList) {
            $matchingDocuments = ShippingDocument::with(['tags.rfidTag.item', 'items.item'])
                ->where('warehouse_id', $warehouseId)
                ->whereIn('status', ['draft', 'approved', 'in_progress'])
                ->whereHas('items', fn ($q) => $q->whereHas('item', fn ($qi) => $qi->whereIn(
                    'id', \App\Models\RfidTag::whereIn('epc', $epcList)->pluck('item_id')->unique()->all()
                )))
                ->lockForUpdate()
                ->get();

            $matchingDocuments = $matchingDocuments->filter(function ($doc) use ($direction, $docTypeForDirection) {
                if ($direction !== null && $doc->type !== $docTypeForDirection) return false;
                return true;
            });

            if ($matchingDocuments->count() === 1) {
                $shippingDoc = $matchingDocuments->first();
            } elseif ($matchingDocuments->count() > 1) {
                // Ambiguitas: >1 dokumen cocok berdasarkan item_id.
                // Cek apakah setiap EPC hanya cocok ke SATU dokumen (bukan tersebar).
                // Jika setiap EPC punya satu dokumen unik → pilih dokumen dengan overlap terbanyak.
                // Jika EPC tersebar ke dokumen berbeda (tiap dok punya EPC eksklusif sendiri)
                // → benar-benar ambiguous, kembalikan null agar gate fail-closed.
                $docPerEpc = [];
                foreach ($epcList as $epc) {
                    foreach ($matchingDocuments as $doc) {
                        if ($doc->tags->contains(fn ($t) => $t->tag_epc === $epc)) {
                            $docPerEpc[$epc][] = $doc->id;
                        }
                    }
                }
                // Kumpulkan dokumen yang punya setidaknya 1 EPC eksklusif (tidak ada di dok lain)
                $docsWithExclusiveEpc = collect();
                foreach ($matchingDocuments as $doc) {
                    foreach ($epcList as $epc) {
                        $matchingDocIds = $docPerEpc[$epc] ?? [];
                        if (in_array($doc->id, $matchingDocIds, true) && count($matchingDocIds) === 1) {
                            $docsWithExclusiveEpc[$doc->id] = $doc;
                            break;
                        }
                    }
                }
                if ($docsWithExclusiveEpc->count() === 1) {
                    // Hanya satu dokumen yang punya EPC eksklusif → pilih itu
                    $shippingDoc = $docsWithExclusiveEpc->first();
                } elseif ($docsWithExclusiveEpc->count() > 1) {
                    // EPC tersebar ke beberapa dokumen berbeda → benar-benar ambiguous → null
                    $shippingDoc = null;
                } else {
                    // Semua EPC dibagi bersama → pilih yang overlap terbanyak
                    $shippingDoc = $matchingDocuments->sortByDesc(function ($doc) use ($epcList) {
                        $docEpcs  = $doc->tags->pluck('tag_epc')->all();
                        $overlap  = count(array_intersect($epcList, $docEpcs));
                        $priority = $doc->status === 'in_progress' ? 1 : 0;
                        return $overlap * 10 + $priority;
                    })->first();
                }
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

    // ΓöÇΓöÇ #3c: Full EPC mismatch evaluation ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

        // v2: draft tidak punya pre-assigned tags
        $isDraft = $shippingDoc->status === 'draft';

        $assignedTags  = $shippingDoc->tags->keyBy('tag_epc');
        $assignedEpcs  = $assignedTags->keys()->all();
        $expectedItems = $shippingDoc->items->mapWithKeys(fn ($i) => [$i->item_id => (int) $i->expected_qty]);

        if (!$isDraft) {
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
        }

        foreach ($epcList as $epc) {
            if (!$isDraft && !$assignedTags->has($epc)) {
                $mismatch = true;
                $mismatchDetails[] = "Tag EPC '{$epc}' tidak di-assign ke dokumen #{$shippingDoc->document_number}.";
                continue;
            }
            $tagModel = $tags->get($epc);
            if ($tagModel && $direction === 'OUT') {
                // Partial drum (length-based): tag boleh exit selama is_length_based=true
                // dan remaining_length_m > 0, meskipun status masih 'attached' di gudang.
                $isLengthBasedTag = $tagModel->item?->is_length_based
                    && $tagModel->remaining_length_m !== null
                    && (float) $tagModel->remaining_length_m > 0.0;
                $tagInCorrectWarehouse = $tagModel->status === 'attached'
                    && (int) $tagModel->last_warehouse_id === $warehouseId;
                if (!$tagInCorrectWarehouse && !$isLengthBasedTag) {
                    $mismatch = true;
                    $mismatchDetails[] = "Tag EPC '{$epc}' tidak berstatus stok aktif di gudang asal dokumen.";
                } elseif ($isLengthBasedTag && (int) $tagModel->last_warehouse_id !== $warehouseId) {
                    $mismatch = true;
                    $mismatchDetails[] = "Tag EPC '{$epc}' (drum kabel) tercatat di gudang berbeda.";
                }
            }
            // Untuk INBOUND: tag harus active.
            // Pada draft (auto-assign), last_warehouse_id tidak divalidasi ketat karena
            // tag bisa re-enter gudang dari sumber lain (vendor, transfer, retur).
            if ($tagModel && $direction === 'IN' && $tagModel->status !== 'active') {
                $mismatch = true;
                $mismatchDetails[] = "Tag EPC '{$epc}' tidak berstatus aktif, tidak dapat diproses masuk.";
            }
            if ($tagModel && $direction === 'IN' && !$isDraft && $tagModel->last_warehouse_id !== null) {
                $mismatch = true;
                $mismatchDetails[] = "Tag EPC '{$epc}' bukan tag aktif yang belum tercatat sebagai stok gudang.";
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

        // Draft: scan bertahap diizinkan, hanya block non-draft yang sudah selesai
        $alreadyScannedEpcs = $shippingDoc->tags->where('status', 'scanned')->pluck('tag_epc')->all();
        // Hanya tolak jika ada EPC dari batch SEKARANG yang sudah pernah di-scan di lintasan sebelumnya
        // (mencegah double-scan per EPC). Jangan block scan bertahap untuk EPC yang belum pernah masuk.
        if (!$isDraft && $alreadyScannedEpcs) {
            $duplicateEpcs = array_intersect($epcList, $alreadyScannedEpcs);
            if (!empty($duplicateEpcs)) {
                $mismatch = true;
                $mismatchDetails[] = 'EPC sudah disahkan di lintasan sebelumnya (double-scan dicegah): ' . implode(', ', $duplicateEpcs);
            }
        }

        $allCumulativeTags = RfidTag::with('item')
            ->whereIn('epc', $allCumulativeEpcs)
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->keyBy('epc');

        // Draft: auto-assign tag yang terbaca ke document items berdasarkan item_id
        if ($isDraft) {
            $docItems = $shippingDoc->items->keyBy('item_id');
            $autoAssignedEpcs = $shippingDoc->tags->pluck('tag_epc')->flip();
            foreach ($allCumulativeEpcs as $epc) {
                if ($autoAssignedEpcs->has($epc)) continue;
                $rfidTag = $allCumulativeTags->get($epc);
                if (!$rfidTag) continue;
                $docItem = $docItems->get($rfidTag->item_id);
                if (!$docItem) continue;
                $alreadyQty = $shippingDoc->tags->where('shipping_document_item_id', $docItem->id)->count();
                if ($alreadyQty >= $docItem->expected_qty) continue;
                \App\Models\ShippingDocumentTag::firstOrCreate(
                    ['shipping_document_id' => $shippingDoc->id, 'tag_epc' => $epc],
                    ['shipping_document_item_id' => $docItem->id, 'rfid_tag_id' => $rfidTag->id, 'status' => 'expected']
                );
                $autoAssignedEpcs->put($epc, true);
            }
            $shippingDoc->unsetRelation('tags')->load('tags');
            $assignedTags = $shippingDoc->tags->keyBy('tag_epc');
            $assignedEpcs = $assignedTags->keys()->all();
        }

        foreach ($allCumulativeEpcs as $epc) {
            $cumulativeTag = $allCumulativeTags->get($epc);
            if (!$assignedTags->has($epc) || !$cumulativeTag) {
                if ($isDraft) { $mismatchDetails[] = "Tag '{$epc}' tidak cocok item dokumen."; }
                else { $mismatch = true; $mismatchDetails[] = "EPC kumulatif '{$epc}' bukan assignment valid dokumen."; }
                continue;
            }
            // Untuk INBOUND draft: hanya cek status=active, last_warehouse_id boleh apa saja
            // (barang bisa re-enter gudang dari sumber lain — vendor, retur, transfer)
            if ($direction === 'OUT') {
                // OUTBOUND: barang harus berstatus 'attached' (ada di gudang) dan di warehouse yang sama
                $expectedLocation = $cumulativeTag->status === 'attached'
                    && (int) $cumulativeTag->last_warehouse_id === $warehouseId;
            } else {
                // IN: untuk non-draft, last_warehouse_id harus null (barang belum masuk gudang manapun)
                // Untuk draft (auto-assign), cukup tag harus active
                $expectedLocation = $cumulativeTag->status === 'active'
                    && ($isDraft || $cumulativeTag->last_warehouse_id === null);
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
                $mismatchDetails[] = "≡ƒÜ¿ BARANG TIDAK ADA DI DOKUMEN: '{$itemName}' ({$qty} unit) tidak tercantum dalam Shipping Document #{$shippingDoc->document_number}!";
            } elseif ($qty > $docQty) {
                $mismatch = true;
                $hasCriticalMismatch = true;
                $selisih = $qty - $docQty;
                $mismatchDetails[] = "≡ƒÜ¿ KELEBIHAN: '{$itemName}' terdeteksi {$qty} unit, izin dokumen hanya {$docQty} unit (+{$selisih}).";
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
                $mismatchDetails[] = "ΓÜá∩╕Å BELUM LENGKAP '{$itemName}': terbaca {$cumulativeQty}/{$requiredQty} (kurang {$selisih} tag). Menunggu sisa.";
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

    // ΓöÇΓöÇ #3d: Record custody events & update document/tag state ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

            $tagModel = $allCumulativeTags->get($epc);

            // Deteksi partial drum (length-based): is_length_based=true AND remaining_length_m set
            $isLengthBased = $tagModel->item?->is_length_based
                && $tagModel->remaining_length_m !== null;

            if ($direction === 'OUT' && $isLengthBased) {
                $docTag     = $shippingDoc->tags->firstWhere('tag_epc', $epc);
                $dispatched = (float) ($docTag?->length_dispatched ?? 0);
                if ($dispatched <= 0) continue;

                $currentRemaining = (float) $tagModel->remaining_length_m;
                $newRemaining     = max(0.0, $currentRemaining - $dispatched);
                $isLastPull       = $newRemaining <= 0.0;

                $tagModel->update(['remaining_length_m' => $newRemaining]);

                $custodyAction = $isLastPull ? 'GATE_OUT' : 'PARTIAL_OUT';
                $this->custodyService->recordEvent(
                    itemId:        $tagModel->item_id,
                    holderUserId:  $holderUserId,
                    action:        $custodyAction,
                    tagEpc:        $epc,
                    refType:       ShippingDocument::class,
                    refId:         $shippingDoc->id,
                    warehouseId:   $warehouseId,
                    photoUrl:      $cctvSnapshot,
                    notes:         "Gate OUT via {$gateId} - Dokumen #{$shippingDoc->document_number}"
                        . " - Dispatched:{$dispatched}m Remaining:{$newRemaining}m",
                    quantityValue: $dispatched,
                );
                if ($docTag && $docTag->status === 'expected') {
                    $docTag->update(['status' => 'scanned', 'scanned_at' => now()]);
                    $docTag->documentItem?->increment('scanned_qty');
                }
                if ($isLastPull) {
                    $tagModel->update(['status' => 'active', 'last_warehouse_id' => null]);
                }
                continue; // partial: tag tetap attached di warehouse
            }

            // Flow normal (non-length-based)
            $action = ($direction === 'OUT') ? 'GATE_OUT' : 'GATE_IN';
            $this->custodyService->recordEvent(
                itemId:       $tagModel->item_id,
                holderUserId: $holderUserId,
                action:       $action,
                tagEpc:       $epc,
                refType:      ShippingDocument::class,
                refId:        $shippingDoc->id,
                warehouseId:  $warehouseId,
                photoUrl:     $cctvSnapshot,
                notes:        "Gate {$direction} via {$gateId} - Dokumen #{$shippingDoc->document_number}"
            );

            $documentTag = $shippingDoc->tags->firstWhere('tag_epc', $epc);
            if ($documentTag && $documentTag->status === 'expected') {
                $documentTag->update(['status' => 'scanned', 'scanned_at' => now()]);
                $documentTag->documentItem?->increment('scanned_qty');
            }

            if ($direction === 'IN') {
                $tagModel->update(['status' => 'attached', 'last_warehouse_id' => $warehouseId]);
            } elseif ($direction === 'OUT') {
                $tagModel->update(['status' => 'active', 'last_warehouse_id' => null]);
            }
        }

        // v2: auto-assign tags ke shipping_document_tags untuk dokumen draft
        if ($shippingDoc->status === 'draft') {
            $docItems = $shippingDoc->items->keyBy('item_id');
            foreach ($allCumulativeEpcs as $epc) {
                if (!$allCumulativeTags->has($epc)) continue;
                $tagModel = $allCumulativeTags->get($epc);
                $itemId   = $tagModel->item_id;
                if (!$docItems->has($itemId)) continue;
                $docItem = $docItems->get($itemId);
                $alreadyAssigned = \App\Models\ShippingDocumentTag::where('shipping_document_id', $shippingDoc->id)
                    ->where('tag_epc', $epc)->exists();
                if ($alreadyAssigned) continue;
                \App\Models\ShippingDocumentTag::create([
                    'shipping_document_id'      => $shippingDoc->id,
                    'shipping_document_item_id' => $docItem->id,
                    'rfid_tag_id'               => $tagModel->id,
                    'tag_epc'                   => $epc,
                    'status'                    => 'scanned',
                    'scanned_at'                => now(),
                ]);
                $docItem->increment('scanned_qty');
            }
        }

        if (in_array($shippingDoc->status, ['draft', 'approved'], true)) {
            $shippingDoc->update(['status' => 'in_progress']);
        }
    }
}
