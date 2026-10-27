<?php

namespace Tests\Feature;

use App\Models\GateDevice;
use App\Models\GatePassEvent;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Rules\EdgeWsUrl;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DeviceEdgeEndpointTest extends TestCase
{
    use RefreshDatabase;

    public function test_gate_controller_is_listed_for_enrollment_but_ticket_still_requires_permission(): void
    {
        config(['services.ws_control.secret' => str_repeat('s', 32)]);
        $now = now();
        $principalId = DB::table('principals')->insertGetId(['name' => 'Test', 'code' => 'ENROLL', 'created_at' => $now, 'updated_at' => $now]);
        $projectId = DB::table('projects')->insertGetId(['principal_id' => $principalId, 'code' => 'ENROLL', 'name' => 'Enroll', 'status' => 'active', 'created_at' => $now, 'updated_at' => $now]);
        $warehouseId = DB::table('warehouses')->insertGetId(['project_id' => $projectId, 'code' => 'ENROLL', 'name' => 'Enroll', 'created_at' => $now, 'updated_at' => $now]);
        $role = Role::create(['name' => 'Tag Operator', 'code' => 'tag-operator']);
        RolePermission::create(['role_id' => $role->id, 'module_key' => 'tag_enrollment', 'is_allowed' => true]);
        $user = User::create(['name' => 'Operator', 'email' => 'tag-operator@test.id', 'role' => $role->code, 'password' => 'password', 'is_active' => true]);
        $user->assignedWarehouses()->attach($warehouseId);
        $device = GateDevice::create([
            'warehouse_id' => $warehouseId,
            'device_code' => 'GATE-ENROLL',
            'device_name' => 'Gate Reader',
            'device_role' => 'gate_controller',
            'edge_ws_url' => 'wss://edge.example.test/ws',
        ]);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/devices?warehouse_id=' . $warehouseId . '&handheld_eligible=1')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', $device->id)
            ->assertJsonPath('0.device_role', 'gate_controller');

        $this->postJson('/api/ws-control-ticket', [
            'warehouse_id' => $warehouseId,
            'device_id' => $device->id,
            'requested_commands' => ['SET_MODE:ENROLLMENT'],
        ])->assertOk()->assertJsonPath('device_id', $device->id);

        $unauthorizedRole = Role::create(['name' => 'Read Only', 'code' => 'read-only']);
        $unauthorizedUser = User::create(['name' => 'Read Only', 'email' => 'read-only@test.id', 'role' => $unauthorizedRole->code, 'password' => 'password', 'is_active' => true]);
        $unauthorizedUser->assignedWarehouses()->attach($warehouseId);
        $this->actingAs($unauthorizedUser, 'sanctum')->postJson('/api/ws-control-ticket', [
            'warehouse_id' => $warehouseId,
            'device_id' => $device->id,
            'requested_commands' => ['SET_MODE:ENROLLMENT'],
        ])->assertForbidden();
    }

    public function test_gate_live_feed_supports_incremental_cursor_and_returns_compact_events(): void
    {
        $now = now();
        $principalId = DB::table('principals')->insertGetId(['name' => 'Test', 'code' => 'FEED', 'created_at' => $now, 'updated_at' => $now]);
        $projectId = DB::table('projects')->insertGetId(['principal_id' => $principalId, 'code' => 'FEED', 'name' => 'Feed', 'status' => 'active', 'created_at' => $now, 'updated_at' => $now]);
        $warehouseId = DB::table('warehouses')->insertGetId(['project_id' => $projectId, 'code' => 'FEED', 'name' => 'Feed', 'created_at' => $now, 'updated_at' => $now]);
        $user = User::create(['name' => 'PM', 'email' => 'pm-feed@test.id', 'role' => 'pm', 'password' => 'password', 'is_active' => true]);

        $first = GatePassEvent::create([
            'event_id' => (string) \Illuminate\Support\Str::uuid(),
            'warehouse_id' => $warehouseId,
            'gate_id' => 'GATE-FEED',
            'antenna_sequence' => 'A_TO_B',
            'direction' => 'OUT',
            'total_tags_detected' => 1,
            'tag_epcs_json' => ['E28011606000020410000001'],
            'raw_payload' => ['large' => 'payload'],
            'is_valid' => true,
            'mismatch_flag' => false,
        ]);
        $second = GatePassEvent::create([
            'event_id' => (string) \Illuminate\Support\Str::uuid(),
            'warehouse_id' => $warehouseId,
            'gate_id' => 'GATE-FEED',
            'antenna_sequence' => 'A_TO_B',
            'direction' => 'OUT',
            'total_tags_detected' => 1,
            'tag_epcs_json' => ['E28011606000020410000002'],
            'raw_payload' => ['large' => 'payload'],
            'is_valid' => true,
            'mismatch_flag' => false,
        ]);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/gate/live-feed?warehouse_id=' . $warehouseId . '&since_id=' . $first->id)
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', $second->id)
            ->assertJsonPath('0.event_id', $second->event_id)
            ->assertJsonMissingPath('0.tag_epcs_json')
            ->assertJsonMissingPath('0.raw_payload');
    }

    public function test_legacy_gate_simulation_endpoint_cannot_create_operational_events(): void
    {
        $eventCountBefore = GatePassEvent::count();
        $user = User::create([
            'name' => 'PM',
            'email' => 'pm-simulation@test.id',
            'role' => 'pm',
            'password' => 'password',
            'is_active' => true,
        ]);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/gate/simulate', [
                'warehouse_id' => 1,
                'antenna_sequence' => 'A_TO_B',
                'epc_list' => ['E28011606000020410000001'],
            ])
            ->assertStatus(410);

        $this->assertSame($eventCountBefore, GatePassEvent::count());
    }

    public function test_endpoint_validation_and_configuration_authorization(): void
    {
        $principal = Principal::create(['name' => 'Test', 'code' => 'EDGE']);
        $project = Project::create(['principal_id' => $principal->id, 'code' => 'EDGE', 'name' => 'Edge', 'status' => 'active']);
        $warehouse = Warehouse::create(['project_id' => $project->id, 'code' => 'EDGE', 'name' => 'Edge']);
        $other = Warehouse::create(['project_id' => $project->id, 'code' => 'OTHER', 'name' => 'Other']);
        $user = User::create(['name' => 'PM', 'email' => 'pm-edge@test.id', 'role' => 'pm', 'password' => 'password', 'is_active' => true]);
        $payload = ['warehouse_id' => $warehouse->id, 'device_code' => 'EDGE-1', 'device_name' => 'Edge',
            'device_model' => 'TEST', 'ip_address' => '127.0.0.1', 'tcp_port' => 1, 'edge_ws_url' => 'wss://branch.example.test/ws'];
        $this->actingAs($user, 'sanctum')->postJson('/api/devices', $payload)->assertForbidden();
        $user->assignedWarehouses()->attach($warehouse->id);
        foreach (['ws://branch.test', 'https://branch.test', '//branch.test', 'wss://user:pass@branch.test',
            'wss://@branch.test', 'wss://branch.test/#', 'wss://branch.test/?x=1', 'wss://branch.test:0',
            'wss://branch.test:65536', 'wss://branch.test/%2f', "wss://branch.test/\npath", 'wss://branch.test\\@evil.test'] as $url) {
            $this->assertFalse(EdgeWsUrl::isValid($url), $url);
            $this->postJson('/api/devices', [...$payload, 'edge_ws_url' => $url])->assertUnprocessable()->assertJsonValidationErrors('edge_ws_url');
        }
        $response = $this->postJson('/api/devices', $payload)->assertCreated()->assertJsonPath('device.ip_address', '127.0.0.1');
        $id = $response->json('device.id');
        $this->assertDatabaseHas('gate_devices', ['id' => $id, 'edge_ws_url' => $payload['edge_ws_url']]);
        $this->putJson("/api/devices/$id", [...$payload, 'warehouse_id' => $other->id])->assertForbidden();
        $this->putJson("/api/devices/$id", [...$payload, 'edge_ws_url' => 'wss://updated.example.test:443/ws'])->assertOk();
        $this->putJson("/api/devices/$id", [...$payload, 'edge_ws_url' => null])->assertOk()->assertJsonPath('device.edge_ws_url', null);
        $otherDevice = GateDevice::create(['warehouse_id' => $other->id, 'device_code' => 'EDGE-2', 'device_name' => 'Other']);
        $this->putJson('/api/devices/'.$otherDevice->id, $payload)->assertForbidden();
        $this->deleteJson('/api/devices/'.$otherDevice->id)->assertForbidden();
        $this->postJson('/api/ws-control-ticket', ['warehouse_id' => $warehouse->id, 'device_id' => $otherDevice->id,
            'requested_commands' => ['PING']])->assertForbidden();
        $user->update(['is_active' => false]);
        $this->putJson("/api/devices/$id", $payload)->assertForbidden();
        $this->deleteJson("/api/devices/$id")->assertForbidden();
    }
}