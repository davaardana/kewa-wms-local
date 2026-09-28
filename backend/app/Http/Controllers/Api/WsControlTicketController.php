<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\GateDevice;
use App\Rules\EdgeWsUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class WsControlTicketController extends Controller
{
    private const COMMAND_PERMISSIONS = [
        'PING' => ['gate_monitor', 'tag_enrollment', 'audit_trail'],
        'GET_MODE' => ['gate_monitor', 'tag_enrollment'],
        'SET_MODE:GATE_SECURITY' => ['gate_monitor'],
        'SET_MODE:ENROLLMENT' => ['tag_enrollment', 'dispatch_scan', 'receiving_scan'],
    ];

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'device_id' => ['nullable', 'integer', 'min:1'],
            'edge_ws_url' => ['prohibited'],
            'endpoint' => ['prohibited'],
            'purpose' => ['nullable', 'string', Rule::in(['HANDHELD_DISPATCH', 'HANDHELD_RECEIVING'])],
            'requested_commands' => ['required', 'array', 'max:4'],
            'requested_commands.*' => ['required', 'string', Rule::in(array_keys(self::COMMAND_PERMISSIONS))],
        ]);
        $user = $request->user();
        abort_unless($user->is_active, 403, 'User account is inactive.');
        $role = Role::where('code', $user->role)->first();
        $allowedModules = $role?->permissions()->where('is_allowed', true)->pluck('module_key')->all() ?? [];
        $isDispatch = ($validated['purpose'] ?? null) === 'HANDHELD_DISPATCH';
        abort_unless(
            $user->isSuperAdmin()
                || ($isDispatch && in_array('dispatch_scan', $allowedModules, true))
                || $user->assignedWarehouses()->whereKey($validated['warehouse_id'])->exists(),
            403,
            'User is not assigned to this warehouse.'
        );

        if (!$user->isSuperAdmin()) {
            foreach ($validated['requested_commands'] as $command) {
                abort_unless(array_intersect(self::COMMAND_PERMISSIONS[$command], $allowedModules), 403, 'Command is not permitted.');
            }
        }

        $devices = GateDevice::where('warehouse_id', $validated['warehouse_id'])->where('is_active', true);
        if (isset($validated['device_id'])) {
            $devices->whereKey($validated['device_id']);
        }
        $matches = $devices->limit(2)->get();
        abort_if($matches->isEmpty(), 404, 'No active device in this warehouse.');
        abort_if($matches->count() !== 1, 409, 'Multiple active devices; device_id is required.');
        $device = $matches->first();
        if (in_array('SET_MODE:ENROLLMENT', $validated['requested_commands'], true)) {
            abort_unless(in_array($device->device_role, ['enrollment_desktop', 'hybrid_workstation'], true), 403, 'Device tidak mendukung scan handheld.');
            abort_if($device->device_role === 'hybrid_workstation'
                && !config('services.ws_control.allow_hybrid_device'), 403, 'Hybrid workstation tidak tersedia pada environment ini.');
        }
        $endpoint = $device->edge_ws_url;
        if (!$endpoint && (int) config('services.ws_control.pilot_warehouse_id') === $device->warehouse_id
            && GateDevice::where('warehouse_id', $device->warehouse_id)->where('is_active', true)->count() === 1) {
            $endpoint = config('services.ws_control.pilot_url');
        }
        abort_unless(is_string($endpoint) && EdgeWsUrl::isValid($endpoint), 503, 'Device Edge WSS endpoint is not configured.');

        $secret = (string) config('services.ws_control.secret');
        abort_unless(strlen($secret) >= 32, 503, 'WS control ticket service is not configured.');
        $now = time();
        $ttl = min(max((int) config('services.ws_control.ttl_seconds', 45), 10), 60);
        $claims = [
            'v' => 2,
            'sub' => $user->id,
            'device_code' => $device->device_code,
            'warehouse_id' => (int) $validated['warehouse_id'],
            'commands' => array_values(array_unique($validated['requested_commands'])),
            'iat' => $now,
            'exp' => $now + $ttl,
            'jti' => (string) Str::uuid(),
        ];
        $payload = rtrim(strtr(base64_encode(json_encode($claims, JSON_THROW_ON_ERROR)), '+/', '-_'), '=');
        $signature = rtrim(strtr(base64_encode(hash_hmac('sha256', $payload, $secret, true)), '+/', '-_'), '=');

        return response()->json([
            'ticket' => "$payload.$signature", 'expires_at' => $claims['exp'],
            'edge_ws_url' => $endpoint, 'device_id' => $device->id,
            'warehouse_id' => $device->warehouse_id,
        ])->header('Cache-Control', 'no-store');
    }
}