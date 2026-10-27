<?php

namespace App\Jobs;

use App\Http\Controllers\Api\EdgeStreamController;
use App\Models\GateDevice;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * #4 Percepatan: Async Edge Bridge Broadcast (diperbarui)
 *
 * Strategi dual-path:
 *   1. SSE push (PRIMARY): Tulis ke Cache key yang dibaca oleh EdgeStreamController::stream().
 *      Edge-bridge yang sudah terkoneksi via SSE menerima event < 500ms.
 *      Tidak perlu tahu IP edge, bekerja behind NAT.
 *
 *   2. curl fallback (SECONDARY): Jika edge menggunakan edge_ws_url (IP publik),
 *      kirim curl ke endpoint legacy. Dipakai jika SSE belum terhubung / reconnecting.
 *
 * Sebelumnya: curl blocking 0-300ms di SETIAP request gate event.
 * Sekarang: non-blocking, dual-path, bekerja regardless koneksi NAT edge.
 */
class BroadcastToEdgeBridgeJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** @var array<string, mixed> */
    public array $payload;

    /** Gate device ID (nullable — for SSE targeting). */
    public ?int $deviceId;

    public int $tries   = 2;
    public int $timeout = 3;

    public function __construct(array $payload, ?int $deviceId = null)
    {
        $this->payload  = $payload;
        $this->deviceId = $deviceId;
        $this->onQueue('broadcasts'); // dedicated low-priority queue
    }

    public function handle(): void
    {
        // ── PATH 1: SSE push ke edge yang sudah terkoneksi ──────────────────────
        if ($this->deviceId) {
            EdgeStreamController::pushToDevice(
                $this->deviceId,
                'broadcast',
                $this->payload
            );
        } else {
            // Jika device_id tidak diketahui, push ke semua device aktif di warehouse
            $warehouseId = $this->payload['warehouse_id'] ?? null;
            if ($warehouseId) {
                $deviceIds = GateDevice::where('warehouse_id', $warehouseId)
                    ->where('is_active', true)
                    ->pluck('id');

                foreach ($deviceIds as $id) {
                    EdgeStreamController::pushToDevice($id, 'broadcast', $this->payload);
                }
            }
        }

        // ── PATH 2: curl fallback (untuk edge dengan IP publik / edge_ws_url) ───
        // Hanya dijalankan jika ada edge_ws_url yang dikonfigurasi
        $this->tryCurlFallback();
    }

    private function tryCurlFallback(): void
    {
        // Cari device dengan edge_ws_url yang dikonfigurasi
        $query = GateDevice::whereNotNull('edge_ws_url')->where('is_active', true);

        if ($this->deviceId) {
            $query->where('id', $this->deviceId);
        } elseif (!empty($this->payload['warehouse_id'])) {
            $query->where('warehouse_id', $this->payload['warehouse_id']);
        }

        $devices = $query->get(['id', 'edge_ws_url']);

        foreach ($devices as $device) {
            if (empty($device->edge_ws_url)) continue;

            // Konversi ws:// → http:// untuk HTTP broadcast endpoint
            $broadcastUrl = preg_replace('/^wss?:\/\//', 'http://', $device->edge_ws_url);
            $broadcastUrl = rtrim($broadcastUrl, '/') . '/broadcast';

            // Skip curl jika target adalah private/LAN IP — VPS tidak bisa akses LAN gudang.
            // Edge di LAN menerima event via SSE PATH 1 (Cache key edge_sse_event:{id}).
            // Curl fallback hanya berguna jika edge memiliki IP publik (kasus hosting dedicated edge).
            $host = parse_url($broadcastUrl, PHP_URL_HOST);
            if ($host && self::isPrivateIp($host)) {
                \Log::debug("[EdgeBroadcast] skip curl to LAN IP {$host} for device #{$device->id} — SSE path handles this");
                continue;
            }

            $ch = curl_init($broadcastUrl);
            curl_setopt_array($ch, [
                CURLOPT_POST            => true,
                CURLOPT_POSTFIELDS      => json_encode($this->payload),
                CURLOPT_HTTPHEADER      => ['Content-Type: application/json'],
                CURLOPT_TIMEOUT_MS      => 1200,
                CURLOPT_RETURNTRANSFER  => true,
                CURLOPT_CONNECTTIMEOUT  => 1,
            ]);
            curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode === 0) {
                // Edge unreachable via direct curl — SSE path already handled this
                \Log::debug("[EdgeBroadcast] curl fallback unreachable for device #{$device->id} — SSE path active");
            }
        }
    }

    /**
     * Returns true if the given hostname/IP is a private or loopback address
     * that cannot be reached from the VPS (RFC 1918 + RFC 4193 + loopback).
     */
    private static function isPrivateIp(string $host): bool
    {
        // Resolve hostname to IP jika bukan numerik
        $ip = filter_var($host, FILTER_VALIDATE_IP) ? $host : gethostbyname($host);

        if (!filter_var($ip, FILTER_VALIDATE_IP)) {
            return false; // Tidak bisa resolve → biarkan coba
        }

        return !filter_var($ip, FILTER_VALIDATE_IP, [
            'flags' => FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE,
        ]);
    }

    public function failed(\Throwable $exception): void
    {
        \Log::debug('[EdgeBroadcast] Broadcast failed (non-critical): ' . $exception->getMessage());
    }
}
