<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GateDevice;
use App\Models\ShippingDocument;
use App\Models\DeviceHealthIncident;
use App\Models\Warehouse;
use App\Rules\EdgeWsUrl;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeviceTelemetryController extends Controller
{
    private function authorizeConfiguration(Request $request, int $warehouseId): void
    {
        $user = $request->user();
        abort_unless($user?->is_active && ($user->isSuperAdmin()
            || ($user->role === 'pm' && $user->assignedWarehouses()->whereKey($warehouseId)->exists())), 403);
    }

    public function storeIncident(Request $request): JsonResponse
    {
        $device = $request->attributes->get('gate_device');
        $validated = $request->validate([
            'event_id' => 'required|uuid',
            'component' => 'required|string|in:reader,edge,backend',
            'status' => 'required|string|max:30',
            'reason' => 'nullable|string|max:500',
            'observed_at' => 'required|date',
        ]);

        $incident = DeviceHealthIncident::firstOrCreate(
            ['event_id' => $validated['event_id']],
            [...$validated, 'gate_device_id' => $device->id, 'received_at' => Carbon::now()],
        );

        return response()->json(['incident' => $incident], $incident->wasRecentlyCreated ? 201 : 200);
    }

    public function incidents(Request $request): JsonResponse
    {
        $validated = $request->validate(['device_id' => 'nullable|integer|exists:gate_devices,id', 'limit' => 'nullable|integer|min:1|max:200']);
        $query = DeviceHealthIncident::with('device:id,device_code,device_name');
        if (!empty($validated['device_id'])) $query->where('gate_device_id', $validated['device_id']);

        return response()->json($query->orderByDesc('observed_at')->limit($validated['limit'] ?? 50)->get());
    }

    /**
     * Get list of all registered & paired RFID reader devices.
     */
    public function index(Request $request): JsonResponse
    {
        $warehouseId = $request->query('warehouse_id');
        $query = GateDevice::with('warehouse');

        if ($warehouseId && $warehouseId !== 'ALL') {
            $query->where('warehouse_id', $warehouseId);
        }

        if ($request->boolean('handheld_eligible')) {
            $roles = ['enrollment_desktop'];
            if (config('services.ws_control.allow_hybrid_device')) $roles[] = 'hybrid_workstation';
            $query->where('is_active', true)->whereIn('device_role', $roles);
        }

        return response()->json($query->orderByDesc('id')->get());
    }

    /**
     * Pair / register a new RFID device to a warehouse.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user && !in_array($user->role, ['superadmin', 'pm'])) {
            return response()->json(['message' => 'Akses Ditolak: Hanya Superadmin atau PM yang berwenang memasangkan perangkat RFID reader gerbang.'], 403);
        }

        $validated = $request->validate([
            'warehouse_id' => 'required|exists:warehouses,id',
            'device_code' => 'required|string|max:50|unique:gate_devices,device_code',
            'device_name' => 'required|string|max:100',
            'device_model' => 'required|string|max:100',
            'device_role' => 'nullable|string|in:gate_controller,enrollment_desktop,hybrid_workstation',
            'ip_address' => 'required|string|max:50',
            'tcp_port' => 'required|integer|min:1|max:65535',
            'is_active' => 'boolean',
            'internet_downtime_tolerance_seconds' => 'nullable|integer|min:30|max:3600',
            'device_token' => 'nullable|string|min:32|max:255',
            'edge_ws_url' => ['nullable', 'string', 'max:2048', new EdgeWsUrl],
        ]);

        abort_if(($validated['device_role'] ?? 'gate_controller') === 'hybrid_workstation'
            && !config('services.ws_control.allow_hybrid_device'), 422, 'Hybrid workstation hanya tersedia untuk development/presentasi.');

        $this->authorizeConfiguration($request, (int) $validated['warehouse_id']);

        // Auto test connection
        $connection = @fsockopen($validated['ip_address'], (int) $validated['tcp_port'], $errno, $errstr, 1);
        $isOnline = is_resource($connection);
        if ($isOnline) {
            fclose($connection);
        }

        $deviceToken = $validated['device_token'] ?? null;
        unset($validated['device_token']);

        $device = GateDevice::create([
            ...$validated,
            'api_token_hash' => $deviceToken ? hash('sha256', $deviceToken) : null,
            'device_role' => $validated['device_role'] ?? 'gate_controller',
            'status' => $isOnline ? 'online' : 'offline',
            'last_heartbeat_at' => null,
            'internet_downtime_tolerance_seconds' => $validated['internet_downtime_tolerance_seconds'] ?? 90,
            'is_active' => $validated['is_active'] ?? true,
        ]);

        return response()->json([
            'message' => 'Perangkat RFID Reader berhasil dipasangkan!',
            'device' => $device->load('warehouse'),
        ], 201);
    }

    /**
     * Update device pairing & IP configuration.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if ($user && !in_array($user->role, ['superadmin', 'pm'])) {
            return response()->json(['message' => 'Akses Ditolak: Hanya Superadmin atau PM yang berwenang mengedit konfigurasi RFID reader gerbang.'], 403);
        }

        $device = GateDevice::findOrFail($id);
        $this->authorizeConfiguration($request, $device->warehouse_id);
        $validated = $request->validate([
            'warehouse_id' => 'required|exists:warehouses,id',
            'device_code' => 'required|string|max:50|unique:gate_devices,device_code,' . $id,
            'device_name' => 'required|string|max:100',
            'device_model' => 'required|string|max:100',
            'device_role' => 'nullable|string|in:gate_controller,enrollment_desktop,hybrid_workstation',
            'ip_address' => 'required|string|max:50',
            'tcp_port' => 'required|integer|min:1|max:65535',
            'is_active' => 'boolean',
            'internet_downtime_tolerance_seconds' => 'nullable|integer|min:30|max:3600',
            'device_token' => 'nullable|string|min:32|max:255',
            'edge_ws_url' => ['nullable', 'string', 'max:2048', new EdgeWsUrl],
        ]);

        abort_if(($validated['device_role'] ?? $device->device_role) === 'hybrid_workstation'
            && !config('services.ws_control.allow_hybrid_device'), 422, 'Hybrid workstation hanya tersedia untuk development/presentasi.');

        $this->authorizeConfiguration($request, (int) $validated['warehouse_id']);

        if (isset($validated['device_token'])) {
            $validated['api_token_hash'] = hash('sha256', $validated['device_token']);
        }
        unset($validated['device_token']);

        // Auto test connection
        $connection = @fsockopen($validated['ip_address'], (int) $validated['tcp_port'], $errno, $errstr, 1);
        $isOnline = is_resource($connection);
        if ($isOnline) fclose($connection);

        $device->update($validated);

        return response()->json([
            'message' => 'Konfigurasi perangkat RFID berhasil diperbarui!',
            'device' => $device->load('warehouse'),
        ]);
    }

    /**
     * Delete / unpair a device.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if ($user && !in_array($user->role, ['superadmin', 'pm'])) {
            return response()->json(['message' => 'Akses Ditolak: Hanya Superadmin atau PM yang berwenang menghapus perangkat RFID reader.'], 403);
        }

        $device = GateDevice::findOrFail($id);
        $this->authorizeConfiguration($request, $device->warehouse_id);
        $device->delete();

        return response()->json([
            'message' => 'Perangkat RFID berhasil dihapus/unpair.',
        ]);
    }

    /**
     * Test socket ping / TCP connection to physical reader IP.
     */
    public function testConnection(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ip_address' => 'required|string',
            'tcp_port' => 'required|integer',
            'timeout' => 'nullable|integer',
        ]);

        $ip = $validated['ip_address'];
        $port = (int) $validated['tcp_port'];
        $timeout = $validated['timeout'] ?? 2;

        $startTime = microtime(true);
        $connection = @fsockopen($ip, $port, $errno, $errstr, $timeout);
        $durationMs = round((microtime(true) - $startTime) * 1000, 1);

        if (is_resource($connection)) {
            fclose($connection);

            return response()->json([
                'success' => true,
                'status' => 'CONNECTED',
                'latency_ms' => $durationMs,
                'message' => "Koneksi ke {$ip}:{$port} BERHASIL (Latency: {$durationMs}ms)",
            ]);
        }

        return response()->json([
            'success' => false,
            'status' => 'UNREACHABLE',
            'latency_ms' => $durationMs,
            'error_code' => $errno,
            'message' => "Gagal terhubung ke {$ip}:{$port} ({$errstr})",
        ], 422);
    }

    /**
     * Ingest heartbeat ping from Edge Bridge client running at warehouse gate.
     */
    public function heartbeat(Request $request): JsonResponse
    {
        $device = $request->attributes->get('gate_device');
        $request->merge([
            'warehouse_id' => $device->warehouse_id,
            'device_code' => $device->device_code,
        ]);

        $validated = $request->validate([
            'warehouse_id' => 'required|exists:warehouses,id',
            'device_code' => 'required|string|max:50',
            'device_name' => 'nullable|string|max:100',
            'device_model' => 'nullable|string|max:100',
            'ip_address' => 'nullable|string|max:50',
            'tcp_port' => 'nullable|integer',
            'metrics' => 'nullable|array',
            'metrics.reader_status' => 'nullable|string|in:connecting,responsive,unresponsive,disconnected,disabled,unknown',
            'metrics.reader_last_response_at' => 'nullable|date',
            'metrics.reader_status_changed_at' => 'nullable|date',
            'metrics.reader_error' => 'nullable|string|max:500',
        ]);

        $device->update([
            'status' => 'online',
            'last_heartbeat_at' => Carbon::now(),
            'metrics_json' => $validated['metrics'] ?? $device->metrics_json,
        ]);

        return response()->json([
            'message' => 'Heartbeat acknowledged successfully',
            'device' => $device,
            'computed_status' => $device->computed_status,
            'server_time' => Carbon::now()->toIso8601String(),
        ]);
    }

    /**
     * Get central telemetry status of all gate devices across all warehouses.
     */
    public function getStatus(): JsonResponse
    {
        $devices = GateDevice::with('warehouse.project')
            ->orderBy('warehouse_id')
            ->get();

        $stats = [
            'total' => $devices->count(),
            'online' => 0,
            'offline' => 0,
            'warning' => 0,
            'inactive' => 0,
        ];

        $devicesWithStatus = $devices->map(function ($device) use (&$stats) {
            $computed = $device->computed_status;
            if (isset($stats[$computed])) {
                $stats[$computed]++;
            }

            return [
                'id' => $device->id,
                'device_code' => $device->device_code,
                'device_name' => $device->device_name,
                'device_model' => $device->device_model,
                'warehouse' => [
                    'id' => $device->warehouse->id,
                    'code' => $device->warehouse->code,
                    'name' => $device->warehouse->name,
                    'gate_mode' => $device->warehouse->gate_mode,
                    'project' => $device->warehouse->project?->name,
                ],
                'ip_address' => $device->ip_address,
                'tcp_port' => $device->tcp_port,
                'status' => $computed,
                'last_heartbeat_at' => $device->last_heartbeat_at?->toIso8601String(),
                'seconds_ago' => $device->last_heartbeat_at ? Carbon::now()->diffInSeconds($device->last_heartbeat_at, true) : null,
                'internet_downtime_tolerance_seconds' => $device->internet_downtime_tolerance_seconds,
                'reader_status' => $computed === 'offline' ? 'unknown' : ($device->metrics_json['reader_status'] ?? 'unknown'),
                'metrics' => $device->metrics_json,
            ];
        });

        return response()->json([
            'summary' => $stats,
            'devices' => $devicesWithStatus,
            'timestamp' => Carbon::now()->toIso8601String(),
        ]);
    }

    public function config(Request $request): JsonResponse
    {
        $device = $request->attributes->get('gate_device')->load('warehouse');
        // Find approved shipping document at this warehouse (at most 1 active)
        $activeDoc = ShippingDocument::where('warehouse_id', $device->warehouse_id)
            ->whereIn('status', ['approved', 'in_progress'])
            ->orderBy('id')
            ->first(['id', 'document_number', 'type', 'status']);

        return response()->json([
            'device'               => $device,
            'authorized_document'  => $activeDoc,
        ]);
    }
}
