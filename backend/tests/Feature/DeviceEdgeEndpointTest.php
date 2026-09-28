<?php

namespace Tests\Feature;

use App\Models\GateDevice;
use App\Models\Principal;
use App\Models\Project;
use App\Models\User;
use App\Models\Warehouse;
use App\Rules\EdgeWsUrl;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeviceEdgeEndpointTest extends TestCase
{
    use RefreshDatabase;

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