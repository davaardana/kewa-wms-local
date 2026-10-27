<?php

namespace Tests\Feature;

use App\Models\Principal;
use App\Models\GateDevice;
use App\Models\Project;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WsControlTicketTest extends TestCase
{
    use RefreshDatabase;

    public function test_ticket_is_scoped_signed_and_authorized(): void
    {
        config(['services.ws_control.secret' => str_repeat('s', 32), 'services.ws_control.ttl_seconds' => 45]);
        $principal = Principal::create(['name' => 'Test', 'code' => 'WS']);
        $project = Project::create(['principal_id' => $principal->id, 'code' => 'WS', 'name' => 'WS', 'status' => 'active']);
        $warehouse = Warehouse::create(['project_id' => $project->id, 'code' => 'WS', 'name' => 'WS']);
        $role = Role::create(['name' => 'Storeroom', 'code' => 'storeroom']);
        RolePermission::create(['role_id' => $role->id, 'module_key' => 'tag_enrollment', 'is_allowed' => true]);
        $user = User::create(['name' => 'User', 'email' => 'ws@test.id', 'role' => 'storeroom', 'password' => 'password', 'is_active' => true]);
        $user->assignedWarehouses()->attach($warehouse->id);

        $device = GateDevice::create(['warehouse_id' => $warehouse->id, 'device_code' => 'EDGE-TEST',
            'device_name' => 'Edge', 'device_role' => 'enrollment_desktop', 'edge_ws_url' => 'wss://branch.example.test/edge']);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/ws-control-ticket', [
            'warehouse_id' => $warehouse->id,
            'requested_commands' => ['PING', 'GET_MODE', 'SET_MODE:ENROLLMENT'],
        ])->assertOk();

        [$payload, $signature] = explode('.', $response->json('ticket'));
        $expected = rtrim(strtr(base64_encode(hash_hmac('sha256', $payload, str_repeat('s', 32), true)), '+/', '-_'), '=');
        $claims = json_decode(base64_decode(strtr($payload, '-_', '+/')), true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame($expected, $signature);
        $this->assertSame($user->id, $claims['sub']);
        $this->assertSame($warehouse->id, $claims['warehouse_id']);
        $this->assertSame(45, $claims['exp'] - $claims['iat']);
        $this->assertSame(2, $claims['v']);
        $this->assertSame($device->device_code, $claims['device_code']);
        $response->assertJsonPath('edge_ws_url', $device->edge_ws_url)->assertJsonPath('device_id', $device->id);

        $payload = ['warehouse_id' => $warehouse->id, 'requested_commands' => ['PING']];
        $second = GateDevice::create(['warehouse_id' => $warehouse->id, 'device_code' => 'EDGE-SECOND', 'device_name' => 'Second']);
        $this->postJson('/api/ws-control-ticket', $payload)->assertConflict();
        $this->postJson('/api/ws-control-ticket', [...$payload, 'device_id' => $device->id])->assertOk();
        $this->postJson('/api/ws-control-ticket', [...$payload, 'device_id' => $second->id])->assertStatus(503);
        $this->postJson('/api/ws-control-ticket', [...$payload, 'device_id' => 999999])->assertNotFound();
        $otherWarehouse = Warehouse::create(['project_id' => $project->id, 'code' => 'OTHER', 'name' => 'Other']);
        $foreignDevice = GateDevice::create(['warehouse_id' => $otherWarehouse->id, 'device_code' => 'FOREIGN', 'device_name' => 'Foreign']);
        $this->postJson('/api/ws-control-ticket', [...$payload, 'device_id' => $foreignDevice->id])->assertNotFound();
        $this->postJson('/api/ws-control-ticket', [...$payload, 'edge_ws_url' => 'wss://evil.test'])->assertUnprocessable();
        $second->update(['is_active' => false]);
        $this->postJson('/api/ws-control-ticket', [...$payload, 'device_id' => $second->id])->assertNotFound();
        $device->update(['edge_ws_url' => null]);
        $this->postJson('/api/ws-control-ticket', $payload)->assertStatus(503);
        config(['services.ws_control.pilot_url' => 'wss://pilot.example.test', 'services.ws_control.pilot_warehouse_id' => $warehouse->id]);
        $this->postJson('/api/ws-control-ticket', $payload)->assertOk()->assertJsonPath('edge_ws_url', 'wss://pilot.example.test');
        config(['services.ws_control.pilot_warehouse_id' => $warehouse->id + 1]);
        $this->postJson('/api/ws-control-ticket', $payload)->assertStatus(503);
    }

    public function test_ticket_rejects_anonymous_unassigned_and_unauthorized_users(): void
    {
        config(['services.ws_control.secret' => str_repeat('s', 32)]);
        $principal = Principal::create(['name' => 'Test', 'code' => 'WS']);
        $project = Project::create(['principal_id' => $principal->id, 'code' => 'WS', 'name' => 'WS', 'status' => 'active']);
        $warehouse = Warehouse::create(['project_id' => $project->id, 'code' => 'WS', 'name' => 'WS']);
        $payload = ['warehouse_id' => $warehouse->id, 'requested_commands' => ['SET_MODE:GATE_SECURITY']];
        $this->postJson('/api/ws-control-ticket', $payload)->assertUnauthorized();

        $role = Role::create(['name' => 'User', 'code' => 'storeroom']);
        $user = User::create(['name' => 'User', 'email' => 'ws2@test.id', 'role' => 'storeroom', 'password' => 'password', 'is_active' => true]);
        $this->actingAs($user, 'sanctum')->postJson('/api/ws-control-ticket', $payload)->assertForbidden();
        $user->assignedWarehouses()->attach($warehouse->id);
        RolePermission::create(['role_id' => $role->id, 'module_key' => 'tag_enrollment', 'is_allowed' => true]);
        $this->actingAs($user, 'sanctum')->postJson('/api/ws-control-ticket', $payload)->assertForbidden();
        $this->actingAs($user, 'sanctum')->postJson('/api/ws-control-ticket', [
            'warehouse_id' => $warehouse->id,
            'requested_commands' => ['SIMULATE_TAG'],
        ])->assertUnprocessable();
    }

    public function test_handheld_mode_accepts_gate_and_still_rejects_disabled_hybrid_devices(): void
    {
        config(['services.ws_control.secret' => str_repeat('s', 32), 'services.ws_control.allow_hybrid_device' => false]);
        $principal = Principal::create(['name' => 'Test', 'code' => 'HH']);
        $project = Project::create(['principal_id' => $principal->id, 'code' => 'HH', 'name' => 'HH', 'status' => 'active']);
        $warehouse = Warehouse::create(['project_id' => $project->id, 'code' => 'HH', 'name' => 'HH']);
        $user = User::create(['name' => 'Admin', 'email' => 'hh@test.id', 'role' => 'superadmin', 'password' => 'password', 'is_active' => true]);
        $payload = ['warehouse_id' => $warehouse->id, 'requested_commands' => ['SET_MODE:ENROLLMENT']];

        $gate = GateDevice::create(['warehouse_id' => $warehouse->id, 'device_code' => 'HH-GATE', 'device_name' => 'Gate', 'device_role' => 'gate_controller', 'edge_ws_url' => 'wss://gate.example.test']);
        $this->actingAs($user, 'sanctum')->postJson('/api/ws-control-ticket', [...$payload, 'device_id' => $gate->id])->assertOk();

        $hybrid = GateDevice::create(['warehouse_id' => $warehouse->id, 'device_code' => 'HH-HYBRID', 'device_name' => 'Hybrid', 'device_role' => 'hybrid_workstation', 'edge_ws_url' => 'wss://hybrid.example.test']);
        $this->postJson('/api/ws-control-ticket', [...$payload, 'device_id' => $hybrid->id])->assertForbidden();

        config(['services.ws_control.allow_hybrid_device' => true]);
        $this->postJson('/api/ws-control-ticket', [...$payload, 'device_id' => $hybrid->id])->assertOk();
    }
}