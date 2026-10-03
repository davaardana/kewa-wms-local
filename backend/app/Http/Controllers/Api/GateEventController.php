<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\ShippingDocumentController;
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
        $device = $request->attributes->get('gate_device');
        $request->merge([
            'warehouse_id' => $device->warehouse_id,
            'gate_id'      => $device->device_code,
            'epc_list'     => collect($request->input('epc_list', []))
                ->map(fn ($epc) => strtoupper(trim($epc)))
                ->values()
                ->all(),
            'raw_payload'  => [
                ...$request->input('raw_payload', []),
                'device' => $device->device_code,
            ],
        ]);

        $validated = $request->validate([
            'event_id'             => 'required|uuid',
            'observed_at'          => 'required|date|before_or_equal:now',
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

        // Also update ShippingDocumentTag.status='scanned' for doc progress tracking
        $direction = $validated['direction']
            ?? ($validated['antenna_sequence'] === 'A_TO_B' ? 'OUT' : 'IN');

        $shippingMatch = ShippingDocumentController::matchGateEpcs(
            $validated['warehouse_id'],
            $validated['epc_list'],
            $direction
        );
        $result['shipping_match'] = $shippingMatch;

        return response()->json($result);
    }

    /**
     * Get live gate activity feed for monitoring screen.
     */
    public function liveFeed(Request $request): JsonResponse
    {
        $warehouseId = $request->query('warehouse_id');

        $query = GatePassEvent::with([
            'warehouse:id,name,code',
            'shippingDocument:id,document_number,type,status',
        ]);

        if ($warehouseId && $warehouseId !== 'ALL') {
            $query->where('warehouse_id', $warehouseId);
        }

        $events = $query->latest()->limit(50)->get();

        return response()->json($events);
    }

    /**
     * Real-time Server-Sent Events (SSE) Push Stream for Gate Portal & Web UI.
     */
    public function stream(Request $request)
    {
        $warehouseId = $request->query('warehouse_id');

        return response()->stream(function () use ($warehouseId) {
            $lastId = null;
            $start  = time();

            echo "retry: 10000\n\n";
            if (ob_get_level() > 0) ob_flush();
            flush();

            // Initial burst of recent events
            $initQuery = GatePassEvent::with([
                'warehouse:id,name,code',
                'shippingDocument:id,document_number,type,status',
            ]);
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

                $query = GatePassEvent::with([
                    'warehouse:id,name,code',
                    'shippingDocument:id,document_number,type,status',
                ]);
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

                usleep(1500000); // 1.5s push cycle

                if (time() - $start >= 10) {
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

