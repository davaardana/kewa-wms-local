<?php

namespace App\Services;

use App\Models\BoqItem;
use App\Models\GateDevice;
use App\Models\GatePassEvent;
use App\Models\GateTransaction;
use App\Models\RfidTag;
use App\Models\Warehouse;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class GateEngineService
{
    public function __construct(
        protected CustodyService $custodyService,
        protected QuotaValidatorService $quotaService
    ) {}

    /**
     * Process real-time gate pass event from edge bridge reader.
     * Supports both DUAL_ANTENNA_AUTO (physical A->B vs B->A) and SINGLE_ANTENNA_SESSION modes.
     *
     * @param array $payload [
     *   'warehouse_id' => int,
     *   'gate_id' => string,
     *   'antenna_sequence' => 'A_TO_B'|'B_TO_A'|'SINGLE_ANTENNA',
     *   'direction' => 'OUT'|'IN' (optional for single antenna mode),
     *   'epc_list' => array of EPC strings,
     *   'cctv_snapshot_path' => string|null,
     *   'gate_transaction_id' => int|null,
     * ]
     */
    public function processGateEvent(array $payload, ?GateDevice $authenticatedDevice = null): array
    {
        return DB::transaction(function () use ($payload, $authenticatedDevice) {
            if (!$authenticatedDevice) {
                throw new \DomainException('Authenticated gate device is required.');
            }
            $device = GateDevice::whereKey($authenticatedDevice->id)->lockForUpdate()->first();
            $eventId = $payload['event_id'] ?? (string) Str::uuid();
            $payload['observed_at'] = $payload['observed_at'] ?? Carbon::now()->toIso8601String();
            $replayed = GatePassEvent::where('gate_device_id', $device->id)
                ->where('event_id', $eventId)->first();
            if ($replayed) {
                $storedDecision = $replayed->decision_result_json ?? [
                    'unlock_gate' => false,
                    'status' => 'DENIED',
                    'message' => 'Stored decision unavailable; fail closed.',
                    'mismatch' => true,
                ];
                return array_merge($storedDecision, [
                    'unlock_gate' => false,
                    'original_unlock_gate' => (bool) ($storedDecision['unlock_gate'] ?? false),
                    'pass_event_id' => $replayed->id,
                    'idempotent_replay' => true,
                ]);
            }

            $warehouseId = (int) ($payload['warehouse_id'] ?? 0);
            $gateId = $payload['gate_id'] ?? '';
            $warehouse = Warehouse::find($warehouseId);
            $gateMode = $warehouse?->gate_mode ?? 'DUAL_ANTENNA_AUTO';

            $antennaSeq = $payload['antenna_sequence'] ?? 'A_TO_B';
            $epcList = array_values(array_unique(array_filter(array_map('trim', $payload['epc_list'] ?? []))));
            $cctvSnapshot = $payload['cctv_snapshot_path'] ?? null;
            $transactionId = $payload['gate_transaction_id'] ?? null;

            if (!$device || !$device->is_active || (int) $device->warehouse_id !== $warehouseId || $device->device_code !== $gateId) {
                throw new \DomainException('Authenticated device, warehouse, and gate binding mismatch.');
            }

            if (($device && $device->device_role === 'enrollment_desktop') || ($payload['operational_mode'] ?? '') === 'ENROLLMENT') {
                return [
                    'status' => 'ENROLLMENT_STREAM',
                    'unlock_gate' => false,
                    'action_taken' => 'ENROLLMENT_STREAM_MUTED',
                    'message' => 'Tag dibaca pada stasiun/mode pendaftaran (enrollment workstation). Evaluasi insiden gerbang dinonaktifkan.',
                    'detected_tags' => count($epcList),
                    'warehouse_id' => $warehouseId,
                    'gate_id' => $gateId,
                    'mismatch' => false,
                    'pass_event_id' => null,
                ];
            }

            if ($device && !$device->is_active) {
                return [
                    'status' => 'INACTIVE_DEVICE_STREAM',
                    'unlock_gate' => false,
                    'action_taken' => 'INACTIVE_DEVICE_MUTED',
                    'message' => 'Perangkat gerbang dalam status nonaktif di sistem. Evaluasi insiden dinonaktifkan.',
                    'detected_tags' => count($epcList),
                    'warehouse_id' => $warehouseId,
                    'gate_id' => $gateId,
                    'mismatch' => false,
                    'pass_event_id' => null,
                ];
            }

            if (($gateMode === 'DUAL_ANTENNA_AUTO' && !in_array($antennaSeq, ['A_TO_B', 'B_TO_A'], true)) ||
                ($gateMode === 'SINGLE_ANTENNA_SESSION' && $antennaSeq !== 'SINGLE_ANTENNA')) {
                throw new \DomainException('Antenna sequence does not match configured warehouse gate mode.');
            }

            // Transaction identity is mandatory; never guess another active session.
            $transaction = null;
            if ($transactionId) {
                $transaction = GateTransaction::with(['items', 'workOrder.boqItems', 'pic'])
                    ->whereKey($transactionId)->lockForUpdate()->first();
            }
            $direction = $gateMode === 'DUAL_ANTENNA_AUTO'
                ? ($antennaSeq === 'A_TO_B' ? 'OUT' : 'IN')
                : ($transaction?->type === 'OUT_FULFILLMENT' ? 'OUT' : 'IN');
            if ($transaction && ((int) $transaction->warehouse_id !== $warehouseId || (int) $transaction->workOrder?->warehouse_id !== $warehouseId)) {
                $transaction = null;
            }
            $observedAt = Carbon::parse($payload['observed_at']);
            if ($transaction && (($transaction->approved_at !== null && $observedAt->lt($transaction->approved_at)) ||
                ($transaction->valid_until !== null && $observedAt->gt($transaction->valid_until)))) {
                $transaction = null;
            }

            // Map EPCs to Items
            $tags = RfidTag::with('item')->whereIn('epc', $epcList)
                ->orderBy('id')->lockForUpdate()->get()->keyBy('epc');
            $detectedItemCounts = [];
            $unregisteredEpcs = [];

            foreach ($epcList as $epc) {
                if ($tags->has($epc)) {
                    $item = $tags->get($epc)->item;
                    $itemId = $item->id;
                    $detectedItemCounts[$itemId] = ($detectedItemCounts[$itemId] ?? 0) + 1;
                } else {
                    $unregisteredEpcs[] = $epc;
                }
            }

            $mismatch = false;
            $mismatchDetails = [];
            $unlockGate = false;
            $statusMessage = '';
            $isUnderCount = false;

            // Evaluate access decision
            if (!$transaction) {
                $mismatch = true;
                $mismatchDetails[] = "PERINGATAN ANOMALI: Terdeteksi perlintasan {$direction} sebanyak " . count($epcList) . " tag di {$gateId} TANPA ADANYA SESI IZIN APPROVED yang aktif!";
                $unlockGate = false;
                $statusMessage = 'DITOLAK: Tidak ada izin sesi yang aktif.';
            } else {
                // Check if direction matches transaction type
                $expectedDirection = ($transaction->type === 'OUT_FULFILLMENT') ? 'OUT' : 'IN';
                if ($direction !== $expectedDirection) {
                    $mismatch = true;
                    $mismatchDetails[] = "Arah berlawanan: sensor mendeteksi perlintasan {$direction}, padahal izin sesi terdaftar untuk {$transaction->type}.";
                }

                // Check for unregistered tags
                if (!empty($unregisteredEpcs)) {
                    $mismatch = true;
                    $mismatchDetails[] = 'Tag mencurigakan / tidak terdaftar dalam database: ' . implode(', ', $unregisteredEpcs);
                }

                foreach ($tags as $tagEpc => $tagModel) {
                    if (!in_array($tagModel->status, ['active', 'attached'], true)) {
                        $mismatch = true;
                        $mismatchDetails[] = "Tag EPC '{$tagEpc}' berstatus {$tagModel->status} dan tidak boleh melintas.";
                    }
                    if ($direction === 'OUT' && ((int) $tagModel->last_warehouse_id !== $warehouseId || $tagModel->status !== 'active')) {
                        $mismatch = true;
                        $mismatchDetails[] = "Tag EPC '{$tagEpc}' bukan stok tersedia di gudang ini.";
                    }
                    if ($direction === 'IN' && $tagModel->last_warehouse_id !== null) {
                        $mismatch = true;
                        $mismatchDetails[] = "Tag EPC '{$tagEpc}' masih tercatat berada di gudang.";
                    }
                }

                // Check for cross-project tag allocation (Shared Warehouse Defense)
                if ($transaction->workOrder && $transaction->workOrder->project_id) {
                    $woProjectId = $transaction->workOrder->project_id;
                    $woProjectName = $transaction->workOrder->project?->name ?? "Proyek #{$woProjectId}";

                    foreach ($tags as $tagEpc => $tagModel) {
                        if ($tagModel->project_id && $tagModel->project_id != $woProjectId) {
                            $tagProjectName = $tagModel->project?->name ?? "Proyek #{$tagModel->project_id}";
                            $mismatch = true;
                            $mismatchDetails[] = "🚨 KESALAHAN ALOKASI PROYEK: Tag EPC '{$tagEpc}' dialokasikan untuk {$tagProjectName}, dilarang dikeluarkan untuk Work Order {$woProjectName}!";
                        }
                    }
                }

                // === EVALUASI KUMULATIF LINTAS-EVENT (Multi-Pass / Bawa 1-1 / Bertahap) ===
                // Ambil seluruh EPC unik yang pernah terdeteksi pada transaksi ini dari event sebelumnya
                $previousEventsEpcs = GatePassEvent::where('gate_transaction_id', $transaction->id)
                    ->where('is_valid', true)
                    ->pluck('tag_epcs_json')
                    ->flatten()
                    ->filter()
                    ->unique()
                    ->toArray();

                // Gabungkan seluruh EPC kumulatif (event sebelumnya + batch sekarang), di-dedup agar tag yang lewat berkali-kali tidak dihitung dobel
                $allCumulativeEpcs = array_values(array_unique(array_merge($previousEventsEpcs, $epcList)));

                // Ambil model RFID tag untuk semua EPC kumulatif
                $allCumulativeTags = RfidTag::with('item')->whereIn('epc', $allCumulativeEpcs)
                    ->orderBy('id')->lockForUpdate()->get()->keyBy('epc');

                // Hitung jumlah tag per item yang sudah terakumulasi
                $cumulativeItemCounts = [];
                foreach ($allCumulativeEpcs as $epc) {
                    if ($allCumulativeTags->has($epc)) {
                        $itemId = $allCumulativeTags->get($epc)->item_id;
                        $cumulativeItemCounts[$itemId] = ($cumulativeItemCounts[$itemId] ?? 0) + 1;
                    }
                }

                // Cek kelebihan muatan kumulatif
                foreach ($cumulativeItemCounts as $itemId => $totalQty) {
                    $firstTag = $allCumulativeTags->first(fn ($t) => $t->item_id == $itemId);
                    $itemName = $firstTag?->item?->name ?? "Material #{$itemId}";
                    $txItem = $transaction->items->firstWhere('item_id', $itemId);

                    if (!$txItem) {
                        $mismatch = true;
                        $mismatchDetails[] = "🚨 BARANG TIDAK DIMINTA: Material '{$itemName}' ({$totalQty} unit) terdeteksi melintas padahal TIDAK ADA dalam daftar izin muat sesi #{$transaction->transaction_number}!";
                    } elseif ($totalQty > $txItem->requested_qty) {
                        $mismatch = true;
                        $selisih = $totalQty - $txItem->requested_qty;
                        $mismatchDetails[] = "🚨 KELEBIHAN MUATAN '{$itemName}' (+{$selisih} tag): total terbaca {$totalQty} tag, padahal izin sesi #{$transaction->transaction_number} hanya untuk {$txItem->requested_qty} unit.";
                    }
                }

                // Preserve critical failures; undercount must never downgrade them to STANDBY.
                $hasCriticalMismatch = $mismatch;

                // Cek undercount kumulatif (apakah seluruh item dalam sesi sudah lengkap)
                $isUnderCount = false;
                $allItemsFulfilled = true;
                foreach ($transaction->items as $txItem) {
                    $cumulativeQty = $cumulativeItemCounts[$txItem->item_id] ?? 0;
                    if ($cumulativeQty < $txItem->requested_qty) {
                        $allItemsFulfilled = false;
                        $isUnderCount = true;
                        $firstTag = $allCumulativeTags->first(fn ($t) => $t->item_id == $txItem->item_id) ?? $tags->first(fn ($t) => $t->item_id == $txItem->item_id);
                        $itemName = $firstTag?->item?->name ?? "Material #{$txItem->item_id}";
                        $selisih = $txItem->requested_qty - $cumulativeQty;
                        $mismatchDetails[] = "⚠️ MUATAN BELUM LENGKAP '{$itemName}': total terbaca {$cumulativeQty} dari {$txItem->requested_qty} unit (kurang {$selisih} tag). Sesi tetap STANDBY menunggu sisa barang.";
                    }
                }

                $lockedBoqItems = collect();
                if ($direction === 'OUT') {
                    $itemIds = $transaction->items->pluck('item_id')->sort()->values();
                    $lockedBoqItems = BoqItem::where('work_order_id', $transaction->work_order_id)
                        ->whereIn('item_id', $itemIds)->orderBy('item_id')->lockForUpdate()->get()->keyBy('item_id');

                    foreach ($transaction->items as $txItem) {
                        $boq = $lockedBoqItems->get($txItem->item_id);
                        $qty = $cumulativeItemCounts[$txItem->item_id] ?? 0;
                        $remaining = $boq ? max(0, $boq->quota_qty - $boq->withdrawn_qty + $boq->returned_qty) : 0;
                        if (!$boq || $qty > $remaining) {
                            $mismatch = true;
                            $hasCriticalMismatch = true;
                            $mismatchDetails[] = "Kuota BOQ berubah: item #{$txItem->item_id} membutuhkan {$qty}, tersisa {$remaining}.";
                        }
                    }
                }

                if ($allItemsFulfilled && !$hasCriticalMismatch && $transaction->isCurrentlyValid()) {
                    $unlockGate = true;
                    $mismatch = false;
                    $statusMessage = 'APPROVED: Perlintasan terverifikasi valid (Seluruh muatan lengkap).';
                } else {
                    $unlockGate = false;
                    $statusMessage = $isUnderCount && !$hasCriticalMismatch
                        ? 'STANDBY: Muatan bertahap sedang berlangsung, menunggu sisa tag melintas.'
                        : 'FLAGGED: Terdeteksi ketidaksesuaian / pelanggaran sensor gerbang.';
                }
            }

            // Perbarui batas waktu tidak aktif (Rolling 15-Minute Inactivity Window saat aktivitas muat aktif)
            if ($transaction && $transaction->isCurrentlyValid() && !$mismatch) {
                $transaction->update(['valid_until' => Carbon::now()->addMinutes(15)]);
            }

            $decisionResult = [
                'unlock_gate' => $unlockGate,
                'direction' => $direction,
                'status' => $unlockGate ? 'SUCCESS' : ($isUnderCount && !($hasCriticalMismatch ?? false) ? 'STANDBY' : 'DENIED'),
                'message' => $statusMessage,
                'mismatch' => $mismatch,
                'is_undercount' => $isUnderCount ?? false,
                'mismatch_details' => $mismatchDetails,
                'transaction_id' => $transaction?->id,
                'total_tags' => count($epcList),
                'cumulative_tags_count' => count($allCumulativeEpcs ?? $epcList),
                'cumulative_item_counts' => $cumulativeItemCounts ?? [],
                'idempotent_replay' => false,
            ];

            // Create GatePassEvent log
            $passEvent = GatePassEvent::create([
                'gate_device_id' => $device->id,
                'event_id' => $eventId,
                'observed_at' => $payload['observed_at'],
                'gate_transaction_id' => $transaction?->id,
                'warehouse_id' => $warehouseId,
                'gate_id' => $gateId,
                'direction' => $direction,
                'antenna_sequence' => $antennaSeq,
                'tag_epcs_json' => $epcList,
                'total_tags_detected' => count($epcList),
                'cctv_snapshot_path' => $cctvSnapshot,
                'is_valid' => $unlockGate,
                'mismatch_flag' => $mismatch,
                'mismatch_details' => !empty($mismatchDetails) ? implode("\n", $mismatchDetails) : null,
                'raw_payload' => array_merge($payload, [
                    'cumulative_epcs' => $allCumulativeEpcs ?? $epcList,
                    'cumulative_count' => count($allCumulativeEpcs ?? $epcList),
                ]),
                'decision_result_json' => $decisionResult,
            ]);

            // If gate unlocked successfully, apply updates
            if ($unlockGate && $transaction) {
                $holderUserId = $transaction->pic_user_id;

                foreach ($cumulativeItemCounts as $itemId => $qty) {
                    // Update transaction item passed_qty
                    $txItem = $transaction->items->firstWhere('item_id', $itemId);
                    if ($txItem) {
                        $txItem->update(['passed_qty' => $qty]);
                    }

                    // Update BOQ item quantities in WorkOrder
                    $boqItem = $lockedBoqItems->get($itemId);

                    if ($direction === 'OUT') {
                        $boqItem->increment('withdrawn_qty', $qty);
                    }
                }

                // Record custody ledger entries for all unique cumulative tags
                foreach ($allCumulativeEpcs as $epc) {
                    if ($allCumulativeTags->has($epc)) {
                        $item = $allCumulativeTags->get($epc)->item;
                        $action = ($direction === 'OUT') ? 'GATE_OUT' : 'GATE_IN';

                        $this->custodyService->recordEvent(
                            itemId: $item->id,
                            holderUserId: $holderUserId,
                            action: $action,
                            tagEpc: $epc,
                            refType: GateTransaction::class,
                            refId: $transaction->id,
                            warehouseId: $warehouseId,
                            photoUrl: $cctvSnapshot,
                            notes: "Gate {$direction} via {$gateId} (Selesai Kumulatif: {$antennaSeq})"
                        );

                        if ($direction === 'IN') {
                            $allCumulativeTags->get($epc)->update(['status' => 'attached', 'last_warehouse_id' => null]);
                        }
                    }
                }

                // Mark transaction completed
                $transaction->update(['status' => 'completed']);
                $transaction->workOrder->update(['status' => 'in_progress']);
            }

            return array_merge($decisionResult, [
                'pass_event_id' => $passEvent->id,
            ]);
        });
    }
}
