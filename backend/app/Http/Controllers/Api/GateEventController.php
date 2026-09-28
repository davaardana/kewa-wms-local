<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GatePassEvent;
use App\Services\GateEngineService;
use App\Services\WhatsAppNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GateEventController extends Controller
{
    public function __construct(
        protected GateEngineService $gateEngine,
        protected WhatsAppNotificationService $waService
    ) {}

    /**
     * Ingest endpoint for Edge Bridge RFID Gate Reader.
     */
    public function handleGateEvent(Request $request): JsonResponse
    {
        $device = $request->attributes->get('gate_device');
        $request->merge([
            'warehouse_id' => $device->warehouse_id,
            'gate_id' => $device->device_code,
            'raw_payload' => [
                ...$request->input('raw_payload', []),
                'device' => $device->device_code,
            ],
        ]);

        $validated = $request->validate([
            'event_id' => 'required|uuid',
            'observed_at' => 'required|date|before_or_equal:now',
            'warehouse_id' => 'required|exists:warehouses,id',
            'gate_id' => 'nullable|string|max:50',
            'antenna_sequence' => 'required|in:A_TO_B,B_TO_A,SINGLE_ANTENNA',
            'direction' => 'nullable|in:OUT,IN',
            'epc_list' => 'required|array|min:1|max:100',
            'epc_list.*' => 'string|max:255',
            'cctv_snapshot_path' => 'nullable|string',
            'gate_transaction_id' => 'nullable|exists:gate_transactions,id',
            'raw_payload' => 'nullable|array',
        ]);

        $result = $this->gateEngine->processGateEvent($validated, $device);

        // If security mismatch occurred, notify PM immediately
        if (!empty($result['mismatch']) && !empty($result['pass_event_id'])) {
            $passEvent = GatePassEvent::with('warehouse')->find($result['pass_event_id']);
            if ($passEvent) {
                $this->waService->notifySecurityMismatch($passEvent);
            }
        }

        return response()->json($result);
    }

    /**
     * Get live gate activity feed for monitoring screen.
     */
    public function liveFeed(Request $request): JsonResponse
    {
        $warehouseId = $request->query('warehouse_id');

        $query = GatePassEvent::with(['warehouse', 'gateTransaction.pic', 'gateTransaction.workOrder']);

        if ($warehouseId && $warehouseId !== 'ALL') {
            $query->where('warehouse_id', $warehouseId);
        }

        $events = $query->latest()->limit(50)->get();

        return response()->json($events);
    }

    /**
     * Real-time Server-Sent Events (SSE) Push Stream for Gate Portal & Web UI
     */
    public function stream(Request $request)
    {
        $warehouseId = $request->query('warehouse_id');

        return response()->stream(function () use ($warehouseId) {
            $lastId = null;
            $start = time();

            // Advise SSE clients to wait 10s before reconnecting
            echo "retry: 10000\n\n";
            if (ob_get_level() > 0) ob_flush();
            flush();

            // Initial burst of recent events
            $initQuery = GatePassEvent::with(['warehouse', 'gateTransaction.pic', 'gateTransaction.workOrder']);
            if ($warehouseId && $warehouseId !== 'ALL') {
                $initQuery->where('warehouse_id', $warehouseId);
            }
            $initEvents = $initQuery->latest()->limit(20)->get();
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

                $query = GatePassEvent::with(['warehouse', 'gateTransaction.pic', 'gateTransaction.workOrder']);
                if ($warehouseId && $warehouseId !== 'ALL') {
                    $query->where('warehouse_id', $warehouseId);
                }
                if ($lastId) {
                    $query->where('id', '>', $lastId);
                }

                $newEvents = $query->latest('id')->limit(10)->get();

                if ($newEvents->isNotEmpty()) {
                    $lastId = $newEvents->first()->id;
                    echo "event: gate_event\n";
                    echo 'data: ' . json_encode($newEvents) . "\n\n";
                    if (ob_get_level() > 0) ob_flush();
                    flush();
                }

                echo "event: ping\n";
                echo 'data: {"time": ' . time() . "}\n\n";
                if (ob_get_level() > 0) ob_flush();
                flush();

                usleep(1500000); // 1.5s push cycle (friendly to DB & worker pool)

                // Auto-close after 10s to release worker promptly
                if (time() - $start >= 10) {
                    break;
                }
            }
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache, no-transform',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    /**
     * Gate events are immutable operational evidence.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Event gerbang adalah bukti audit dan tidak dapat dihapus.',
        ], 405);
    }

    /**
     * Clear / bulk delete gate pass event logs (optionally filtered by warehouse).
     */
    public function clearHistory(Request $request): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Riwayat gerbang adalah bukti audit dan tidak dapat dibersihkan.',
            'deleted_count' => 0,
        ], 405);
    }
}
