<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\BroadcastToEdgeBridgeJob;
use App\Models\GatePassEvent;
use App\Services\GateEngineService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GateEventController extends Controller
{
    public function __construct(
        protected GateEngineService $gateEngine
    ) {}

    /**
     * Ingest endpoint for Edge Bridge RFID Gate Reader.
     */
    public function handleGateEvent(Request $request): JsonResponse
    {
        try {
            $device = $request->attributes->get('gate_device');
            $request->merge([
                'warehouse_id' => $device->warehouse_id,
                'gate_id'      => $device->device_code,
                'epc_list'     => collect($request->input('epc_list', []))
                    ->map(fn ($item) => strtoupper(trim(is_array($item) ? ($item['epc'] ?? '') : (string) $item)))
                    ->filter()
                    ->values()
                    ->all(),
                'raw_payload'  => [
                    ...$request->input('raw_payload', []),
                    'device' => $device->device_code,
                ],
            ]);

            $validated = $request->validate([
                'event_id'             => 'required|uuid',
                'observed_at'          => 'required|date',
                'warehouse_id'         => 'required|exists:warehouses,id',
                'gate_id'              => 'nullable|string|max:50',
                'antenna_sequence'     => 'required|in:A_TO_B,B_TO_A,SINGLE_ANTENNA',
                'direction'            => 'nullable|in:OUT,IN',
                'epc_list'             => 'required|array|min:1|max:100',
                'epc_list.*'           => ['string', 'min:8', 'max:64', 'regex:/^[0-9A-Fa-f]+$/'],
                'cctv_snapshot_path'   => 'nullable|string',
                'shipping_document_id' => 'nullable|exists:shipping_documents,id',
                'raw_payload'          => 'nullable|array',
            ]);

            // Primary gate processing via GateEngineService
            $result = $this->gateEngine->processGateEvent($validated, $device);
            $direction = $result['direction'] ?? ($validated['direction'] ?? 'OUT');
            $shippingMatch = $result['shipping_match'] ?? ['matched' => 0, 'unmatched' => count($validated['epc_list'])];

            // Real-time broadcast to Edge Bridge WebSocket clients (Dashboard)
            self::notifyEdgeBridge([
                'type' => 'GATE_EVENT',
                'event_id' => $validated['event_id'],
                'warehouse_id' => $validated['warehouse_id'],
                'gate_id' => $validated['gate_id'],
                'direction' => $direction,
                'status' => $result['status'] ?? 'PROCESSED',
                'unlock_gate' => $result['unlock_gate'] ?? false,
                'epc_list' => $validated['epc_list'],
                'shipping_match' => $shippingMatch,
                'timestamp' => $validated['observed_at'],
            ]);

            foreach ($validated['epc_list'] as $epc) {
                self::notifyEdgeBridge([
                    'type' => 'TAG_READ',
                    'epc' => $epc,
                    'antenna' => $validated['antenna_sequence'] === 'B_TO_A' ? 2 : 1,
                    'direction' => $direction,
                    'timestamp' => $validated['observed_at'],
                ]);
            }

            return response()->json($result);
        } catch (\Throwable $e) {
            \Log::error('GATE EVENT ERROR: ' . $e->getMessage() . "\n" . $e->getTraceAsString());
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * Ingest lightweight tag sighting for instant live detection on frontend (<100ms).
     *
     * Rec-3: TAG_READ sighting tidak lewat queue sama sekali.
     * Dua jalur cache langsung ditulis di HTTP request handler ini:
     *   1. enrollment_last_tag:{wh}  → dibaca EnrollmentStreamController::stream() (browser luar LAN)
     *   2. edge_sse_event:{deviceId} → dibaca EdgeStreamController::stream() (edge bridge via SSE)
     * Browser LAN sudah dapat TAG_READ langsung dari edge WS — tidak perlu VPS roundtrip.
     * Queue broadcasts hanya untuk GATE_EVENT yang butuh retry & async processing.
     */
    public function handleTagSighting(Request $request): JsonResponse
    {
        $device = $request->attributes->get('gate_device');
        $epc = strtoupper(trim((string) $request->input('epc', '')));
        if (!$epc) {
            return response()->json(['error' => 'EPC required'], 422);
        }

        $warehouseId = $device->warehouse_id ?? 0;
        $sightingPayload = [
            'type'         => 'TAG_READ',
            'epc'          => $epc,
            'antenna'      => $request->input('antenna', 1),
            'rssi'         => $request->input('rssi', -60),
            'gate_id'      => $device->device_code ?? 'GATE-01',
            'warehouse_id' => $warehouseId ?: 1,
            'timestamp'    => $request->input('observed_at', now()->toIso8601String()),
        ];

        // PATH 1: SSE ke edge bridge (edge → WS clients LAN)
        // Langsung push ke cache tanpa queue — latensi < 5ms vs 0-3 detik lewat queue
        if ($warehouseId) {
            $deviceIds = \App\Models\GateDevice::where('warehouse_id', $warehouseId)
                ->where('is_active', true)
                ->pluck('id');

            foreach ($deviceIds as $id) {
                \App\Http\Controllers\Api\EdgeStreamController::pushToDevice(
                    $id,
                    'broadcast',
                    $sightingPayload
                );
            }
        }

        // PATH 2: Enrollment SSE relay (browser luar LAN via EnrollmentStreamController)
        // Cache key enrollment_last_tag:{wh} — poll 100ms oleh SSE stream
        if ($warehouseId) {
            \Cache::put("enrollment_last_tag:{$warehouseId}", [
                'epc'          => $epc,
                'antenna'      => $request->input('antenna', 1),
                'rssi'         => $request->input('rssi', -60),
                'gate_id'      => $device->device_code ?? 'GATE-01',
                'warehouse_id' => $warehouseId,
                'timestamp'    => $request->input('observed_at', now()->toIso8601String()),
                'received_at'  => now()->format('Y-m-d H:i:s.u'), // microsecond precision — SSE dedup butuh ini
            ], 30); // 30s TTL — tag lama otomatis expire
        }

        return response()->json(['ok' => true]);
    }

    /**
     * #4 Percepatan: Async fire-and-forget broadcast ke Edge Bridge WebSocket server.
     * Digunakan HANYA untuk GATE_EVENT dan TAG_READ yang berasal dari gate event (bukan sighting).
     *
     * handleTagSighting() tidak lagi memanggil fungsi ini — sighting langsung push ke cache
     * tanpa queue untuk meminimalkan latensi dan mencegah queue flooding.
     */
    public static function notifyEdgeBridge(array $payload): void
    {
        try {
            BroadcastToEdgeBridgeJob::dispatch($payload);
        } catch (\Throwable $e) {
            // Best effort — jika queue tidak tersedia, fallback ke synchronous
            try {
                $ch = curl_init('http://edge-bridge:2078/broadcast');
                curl_setopt_array($ch, [
                    CURLOPT_POST           => true,
                    CURLOPT_POSTFIELDS     => json_encode($payload),
                    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
                    CURLOPT_TIMEOUT_MS     => 300,
                    CURLOPT_RETURNTRANSFER => true,
                ]);
                curl_exec($ch);
                curl_close($ch);
            } catch (\Throwable) {
                // Completely silent — broadcast is non-critical
            }
        }
    }

    /**
     * Get live gate activity feed for monitoring screen.
     */
    public function liveFeed(Request $request): JsonResponse
    {
        $warehouseId = $request->query('warehouse_id');
        $sinceId = $request->integer('since_id');

        $query = GatePassEvent::query()->select([
            'id',
            'event_id',
            'warehouse_id',
            'gate_id',
            'direction',
            'total_tags_detected',
            'is_valid',
            'mismatch_flag',
            'mismatch_details',
            'shipping_document_id',
            'created_at',
        ])->with([
            'warehouse:id,name,code',
            'shippingDocument:id,document_number,type,status',
        ]);

        if ($warehouseId && $warehouseId !== 'ALL') {
            $query->where('warehouse_id', $warehouseId);
        }

        if ($sinceId > 0) {
            $query->where('id', '>', $sinceId);
        }

        $events = $query->latest('id')->limit(50)->get();

        return response()->json($events);
    }

    /**
     * Real-time Server-Sent Events (SSE) Push Stream for Gate Portal & Web UI.
     */
    public function stream(Request $request)
    {
        $warehouseId = $request->query('warehouse_id');
        $sinceId = $request->integer('since_id');

        return response()->stream(function () use ($warehouseId, $sinceId) {
            $eventColumns = [
                'id',
                'event_id',
                'warehouse_id',
                'gate_id',
                'direction',
                'total_tags_detected',
                'is_valid',
                'mismatch_flag',
                'mismatch_details',
                'shipping_document_id',
                'created_at',
            ];
            $lastId = $sinceId > 0 ? $sinceId : null;
            $start  = time();

            echo "retry: 10000\n\n";
            if (ob_get_level() > 0) ob_flush();
            flush();

            // Initial burst of recent events
            $initQuery = GatePassEvent::query()->select($eventColumns)->with([
                'warehouse:id,name,code',
                'shippingDocument:id,document_number,type,status',
            ]);
            if ($warehouseId && $warehouseId !== 'ALL') {
                $initQuery->where('warehouse_id', $warehouseId);
            }
            if ($sinceId > 0) {
                $initQuery->where('id', '>', $sinceId);
            }
            $initEvents = $initQuery->latest('id')->limit($sinceId > 0 ? 50 : 20)->get();
            if ($initEvents->isNotEmpty()) {
                $lastId = $initEvents->first()->id;
                echo "event: initial\n";
                echo 'data: ' . json_encode($initEvents) . "\n\n";
                if (ob_get_level() > 0) ob_flush();
                flush();
            }

            while (true) {
                if (connection_aborted()) {
                    break;
                }

                $query = GatePassEvent::query()->select($eventColumns)->with([
                    'warehouse:id,name,code',
                    'shippingDocument:id,document_number,type,status',
                ]);
                if ($warehouseId && $warehouseId !== 'ALL') {
                    $query->where('warehouse_id', $warehouseId);
                }
                if ($lastId) {
                    $query->where('id', '>', $lastId);
                }

                $newEvents = $query->orderBy('id')->limit(50)->get();

                if ($newEvents->isNotEmpty()) {
                    $lastId = $newEvents->last()->id;
                    echo "event: gate_event\n";
                    echo 'data: ' . json_encode($newEvents) . "\n\n";
                    if (ob_get_level() > 0) ob_flush();
                    flush();
                }

                echo "event: ping\n";
                echo 'data: {"time": ' . time() . "}\n\n";
                if (ob_get_level() > 0) ob_flush();
                flush();

                usleep(1500000); // 1.5s push cycle

                if (time() - $start >= 55) {
                    break;
                }
            }
        }, 200, [
            'Content-Type'      => 'text/event-stream',
            'Cache-Control'     => 'no-cache, no-transform',
            'Connection'        => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    /**
     * Retired: simulated data must not be recorded as operational gate evidence.
     */
    public function simulateGateEvent(Request $request): JsonResponse
    {
        return response()->json([
            'message' => 'Simulasi gate dinonaktifkan. Gunakan pratinjau lokal; endpoint ini tidak membuat event operasional.',
        ], 410);
    }

    /**
     * Gate events are immutable operational evidence — not deletable.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Event gerbang adalah bukti audit dan tidak dapat dihapus.',
        ], 405);
    }

    /**
     * Gate history is immutable — clearing not allowed.
     */
    public function clearHistory(Request $request): JsonResponse
    {
        return response()->json([
            'success'       => false,
            'message'       => 'Riwayat gerbang adalah bukti audit dan tidak dapat dibersihkan.',
            'deleted_count' => 0,
        ], 405);
    }
}

