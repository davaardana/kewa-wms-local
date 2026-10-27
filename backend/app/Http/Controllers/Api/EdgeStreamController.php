<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * #1/#4 Percepatan: Server-Sent Events (SSE) stream dari edge-bridge ke VPS.
 *
 * Flow baru:
 *   Edge buka GET /api/edge/events (long-lived request)
 *   → VPS stream events real-time (config changes, gate decisions, dll)
 *   → Tidak perlu curl dari VPS ke edge lagi (VPS tidak perlu tahu IP edge)
 *
 * Keuntungan vs polling 2s:
 *   - Config change (doc approved) langsung diterima edge < 500ms
 *   - Tidak ada overhead TCP handshake per poll
 *   - Bekerja behind NAT (edge yang initiate koneksi)
 */
class EdgeStreamController extends Controller
{
    /** Max duration satu SSE connection sebelum edge diminta reconnect (detik). */
    private const MAX_STREAM_SECONDS = 55;

    /** Interval heartbeat SSE (detik) — pastikan koneksi tidak di-timeout proxy/load balancer. */
    private const HEARTBEAT_SECONDS = 20;

    /** Cache TTL untuk pending events per device (detik). */
    private const EVENT_TTL = 60;

    /**
     * Open SSE stream for authenticated edge-bridge device.
     * Edge holds this connection open; VPS pushes events as they arrive.
     */
    public function stream(Request $request): StreamedResponse
    {
        $device = $request->attributes->get('gate_device');

        return response()->stream(
            function () use ($device) {
                // Disable output buffering across all layers
                if (ob_get_level() > 0) ob_end_clean();
                @ini_set('output_buffering', 'off');
                @ini_set('zlib.output_compression', 0);
                set_time_limit(0);

                // ── Initial config push ──────────────────────────────────────────────
                $config = $this->buildConfigPayload($device);
                $this->sseEmit('config', $config);

                // ── Event loop ───────────────────────────────────────────────────────
                $startTime     = time();
                $lastHeartbeat = time();

                while (true) {
                    // 1. Check for pending events pushed by BroadcastToEdgeBridgeJob or other triggers
                    $pendingKey = "edge_sse_event:{$device->id}";
                    $event      = Cache::pull($pendingKey);

                    if ($event && isset($event['type'], $event['data'])) {
                        $this->sseEmit($event['type'], $event['data']);
                        $lastHeartbeat = time(); // data sent counts as heartbeat
                    }

                    // 2. Send heartbeat comment every HEARTBEAT_SECONDS
                    if ((time() - $lastHeartbeat) >= self::HEARTBEAT_SECONDS) {
                        $this->sseHeartbeat();
                        $lastHeartbeat = time();
                    }

                    // 3. Check client disconnected
                    if (connection_aborted()) {
                        break;
                    }

                    // 4. Max stream duration — force graceful reconnect
                    if ((time() - $startTime) >= self::MAX_STREAM_SECONDS) {
                        // Send retry hint to client before closing
                        $this->sseEmit('reconnect', ['reason' => 'scheduled_reconnect', 'retry_ms' => 100]);
                        break;
                    }

                    usleep(400_000); // 400ms polling interval — cukup responsif, tidak membebani CPU
                }
            },
            200,
            [
                'Content-Type'      => 'text/event-stream',
                'Cache-Control'     => 'no-cache, no-store',
                'X-Accel-Buffering' => 'no',  // #5: disable Nginx buffering untuk SSE
                'Connection'        => 'keep-alive',
            ]
        );
    }

    /**
     * Push an event to a specific edge device's SSE stream.
     * Called by BroadcastToEdgeBridgeJob or any controller.
     *
     * @param int    $deviceId  gate_devices.id
     * @param string $type      SSE event type ('config', 'broadcast', etc.)
     * @param array  $data      JSON-serializable payload
     */
    public static function pushToDevice(int $deviceId, string $type, array $data): void
    {
        Cache::put(
            "edge_sse_event:{$deviceId}",
            ['type' => $type, 'data' => $data],
            self::EVENT_TTL
        );
    }

    /**
     * Build full config payload (same structure as /devices/config).
     * Used for initial push and config change events.
     *
     * Prioritas dokumen: in_progress > approved > draft (satu aktif per warehouse).
     * Sejajar dengan DeviceTelemetryController::config().
     */
    private function buildConfigPayload($device): array
    {
        $device->load('warehouse');

        $authorizedDocument = null;

        if ($device->warehouse_id && $device->warehouse?->gate_mode === 'SINGLE_ANTENNA_SESSION') {
            // Prioritas: in_progress > approved > draft
            $activeDocs = \App\Models\ShippingDocument::where('warehouse_id', $device->warehouse_id)
                ->whereIn('status', ['draft', 'approved', 'in_progress'])
                ->orderByRaw("CASE status WHEN 'in_progress' THEN 0 WHEN 'approved' THEN 1 WHEN 'draft' THEN 2 END")
                ->orderBy('id')
                ->limit(2)
                ->get(['id', 'document_number', 'type', 'status']);

            $doc = null;
            if ($activeDocs->count() === 1) {
                $doc = $activeDocs->first();
            } elseif ($activeDocs->count() > 1
                && $activeDocs->first()->status !== $activeDocs->last()->status) {
                // Beda status: ambil yang prioritas tertinggi (in_progress > approved > draft)
                $doc = $activeDocs->first();
            }
            // >1 dokumen dengan status sama → ambiguitas → $doc tetap null

            if ($doc) {
                // Muat epc_list dari shipping_document_tags
                $epcList = \App\Models\ShippingDocumentTag::where('shipping_document_id', $doc->id)
                    ->pluck('tag_epc')
                    ->map(fn($e) => strtoupper($e))
                    ->values()
                    ->all();

                $authorizedDocument = [
                    'id'              => $doc->id,
                    'document_number' => $doc->document_number,
                    'type'            => $doc->type,
                    'status'          => $doc->status,
                    'epc_list'        => $epcList,
                ];
            }
        } elseif ($device->warehouse_id) {
            // DUAL_ANTENNA_AUTO atau mode lain: ambil approved/in_progress terbaru
            $doc = \App\Models\ShippingDocument::where('warehouse_id', $device->warehouse_id)
                ->whereIn('status', ['approved', 'in_progress'])
                ->latest('updated_at')
                ->first();

            if ($doc) {
                $epcList = \App\Models\ShippingDocumentTag::where('shipping_document_id', $doc->id)
                    ->pluck('tag_epc')
                    ->map(fn($e) => strtoupper($e))
                    ->values()
                    ->all();

                $authorizedDocument = [
                    'id'       => $doc->id,
                    'type'     => $doc->type,
                    'status'   => $doc->status,
                    'epc_list' => $epcList,
                ];
            }
        }

        return [
            'device'              => $device->toArray(),
            'authorized_document' => $authorizedDocument,
        ];
    }

    /** Emit a named SSE event with JSON data. */
    private function sseEmit(string $event, array $data): void
    {
        echo "event: {$event}\n";
        echo 'data: ' . json_encode($data) . "\n\n";
        if (ob_get_level() > 0) ob_flush();
        flush();
    }

    /** Emit SSE heartbeat comment (keeps connection alive through proxies). */
    private function sseHeartbeat(): void
    {
        echo ': heartbeat ' . time() . "\n\n";
        if (ob_get_level() > 0) ob_flush();
        flush();
    }
}
