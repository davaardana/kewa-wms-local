<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * SSE relay stream untuk Enrollment Tag — memungkinkan browser luar LAN
 * menerima live RFID tag scan tanpa harus direct-connect ke edge WS lokal.
 *
 * Flow:
 *   Edge (ENROLLMENT mode) → POST /api/gate/sighting → Cache::put enrollment_last_tag:{wh}
 *   Browser → GET /api/enrollment/stream?warehouse_id=X → SSE push tag setiap ~100ms
 *
 * Auth: mendukung dua cara:
 *   1. Header Authorization: Bearer <token>  (standar Sanctum — dipakai oleh fetch() di edgeWebSocket.js)
 *   2. Query param ?token=<token>            (fallback untuk EventSource native jika fetch tidak tersedia)
 *
 * Browser yang bisa reach ws://LAN-IP:2078/ langsung tetap pakai WS (lebih cepat).
 * SSE ini adalah fallback untuk akses dari luar LAN (remote/VPS browser).
 */
class EnrollmentStreamController extends Controller
{
    /** SSE push cycle dalam microseconds (100ms) */
    private const POLL_US = 100_000;

    /** Max durasi stream sebelum client diminta reconnect (detik) */
    private const MAX_SECONDS = 55;

    /** Heartbeat interval (detik) */
    private const HEARTBEAT_SECONDS = 15;

    public function stream(Request $request): StreamedResponse
    {
        // Support token via query param sebagai fallback (EventSource tidak bisa set header)
        // fetch() di edgeWebSocket.js sudah kirim Authorization header — ini untuk safety net
        if (!$request->bearerToken() && $request->query('token')) {
            $request->headers->set('Authorization', 'Bearer ' . $request->query('token'));
        }

        // Validasi auth: cek via Sanctum terlebih dulu (sudah di-inject header di atas jika perlu)
        $user = $request->user('sanctum');

        // Fallback manual jika middleware bypass (query param path)
        if (!$user && $request->query('token')) {
            $pat = PersonalAccessToken::findToken($request->query('token'));
            $user = $pat?->tokenable;
        }

        if (!$user) {
            return response()->stream(
                static function () {
                    echo "event: error\ndata: {\"error\":\"Unauthenticated\"}\n\n";
                    flush();
                },
                401,
                ['Content-Type' => 'text/event-stream', 'Cache-Control' => 'no-cache']
            );
        }

        $warehouseId = (int) $request->query('warehouse_id', 0);
        abort_if($warehouseId <= 0, 422, 'warehouse_id is required');

        return response()->stream(
            function () use ($warehouseId) {
                if (ob_get_level() > 0) ob_end_clean();
                @ini_set('output_buffering', 'off');
                @ini_set('zlib.output_compression', 0);
                set_time_limit(0);

                $cacheKey       = "enrollment_last_tag:{$warehouseId}";
                $lastTagEpc     = null;
                $lastReceivedAt = null;
                $startTime      = time();
                $lastHeartbeat  = time();

                // Kirim retry hint ke browser
                echo "retry: 3000\n\n";
                if (ob_get_level() > 0) ob_flush();
                flush();

                while (true) {
                    if (connection_aborted()) break;

                    if ((time() - $startTime) >= self::MAX_SECONDS) {
                        echo "event: reconnect\ndata: {\"reason\":\"scheduled\"}\n\n";
                        if (ob_get_level() > 0) ob_flush();
                        flush();
                        break;
                    }

                    // Ambil tag terbaru dari cache (ditulis oleh handleTagSighting)
                    $tag = Cache::get($cacheKey);

                    if ($tag && isset($tag['epc'], $tag['received_at'])) {
                        // Push jika: EPC beda ATAU received_at beda (microsecond precision)
                        // Saat EPC berganti (tag baru), lastReceivedAt di-reset agar pasti push
                        if ($tag['epc'] !== $lastTagEpc) {
                            // Tag baru sama sekali — reset lastReceivedAt supaya langsung push
                            $lastReceivedAt = null;
                        }

                        if ($tag['received_at'] !== $lastReceivedAt) {
                            $lastTagEpc     = $tag['epc'];
                            $lastReceivedAt = $tag['received_at'];
                            $lastHeartbeat  = time();

                            echo "event: tag_read\n";
                            echo 'data: ' . json_encode([
                                'type'         => 'TAG_READ',
                                'epc'          => $tag['epc'],
                                'antenna'      => $tag['antenna'],
                                'rssi'         => $tag['rssi'],
                                'gate_id'      => $tag['gate_id'],
                                'warehouse_id' => $tag['warehouse_id'],
                                'timestamp'    => $tag['timestamp'],
                            ]) . "\n\n";
                            if (ob_get_level() > 0) ob_flush();
                            flush();
                        }
                    }

                    // Heartbeat agar koneksi tidak di-timeout proxy
                    if ((time() - $lastHeartbeat) >= self::HEARTBEAT_SECONDS) {
                        echo ": heartbeat " . time() . "\n\n";
                        if (ob_get_level() > 0) ob_flush();
                        flush();
                        $lastHeartbeat = time();
                    }

                    usleep(self::POLL_US);
                }
            },
            200,
            [
                'Content-Type'      => 'text/event-stream',
                'Cache-Control'     => 'no-cache, no-store',
                'X-Accel-Buffering' => 'no',
                'Connection'        => 'keep-alive',
            ]
        );
    }
}
