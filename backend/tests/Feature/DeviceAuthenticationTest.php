<?php

namespace Tests\Feature;

use App\Models\GateDevice;
use App\Models\Principal;
use App\Models\Project;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class DeviceAuthenticationTest extends TestCase
{
    use RefreshDatabase;

    private Warehouse $warehouse;
    private GateDevice $device;
    private string $token = 'test-device-token-32-characters-long';

    protected function setUp(): void
    {
        parent::setUp();
        $principal = Principal::create(['name' => 'Test', 'code' => 'AUTH']);
        $project = Project::create(['principal_id' => $principal->id, 'code' => 'AUTH', 'name' => 'Auth', 'status' => 'active']);
        $this->warehouse = Warehouse::create(['project_id' => $project->id, 'code' => 'AUTH', 'name' => 'Auth Warehouse']);
        $this->device = GateDevice::create([
            'warehouse_id' => $this->warehouse->id,
            'device_code' => 'EDGE-AUTH-01',
            'device_name' => 'Auth Device',
            'device_model' => 'TEST',
            'api_token_hash' => hash('sha256', $this->token),
            'is_active' => true,
        ]);
    }

    public function test_device_mutations_reject_anonymous_and_wrong_credentials(): void
    {
        $payload = ['warehouse_id' => $this->warehouse->id, 'device_code' => 'EDGE-AUTH-01'];
        $this->postJson('/api/devices/heartbeat', $payload)->assertUnauthorized();
        $this->withToken('wrong-token')->postJson('/api/devices/heartbeat', $payload)->assertUnauthorized();
        $this->postJson('/api/gate/event', [])->assertUnauthorized();
        $this->withToken('wrong-token')->postJson('/api/gate/event', [])->assertUnauthorized();
    }

    public function test_inactive_device_credential_is_rejected(): void
    {
        $this->device->update(['is_active' => false]);

        $this->withToken($this->token)
            ->postJson('/api/devices/heartbeat', [])
            ->assertUnauthorized();
        $this->withToken($this->token)
            ->postJson('/api/gate/event', [])
            ->assertUnauthorized();
    }

    public function test_valid_device_credential_accepts_and_binds_heartbeat_identity(): void
    {
        $other = Warehouse::create([
            'project_id' => $this->warehouse->project_id,
            'code' => 'OTHER',
            'name' => 'Other Warehouse',
        ]);

        $this->withToken($this->token)->postJson('/api/devices/heartbeat', [
            'warehouse_id' => $other->id,
            'device_code' => 'SPOOFED',
            'metrics' => ['ok' => true],
        ])->assertOk()
            ->assertJsonPath('device.id', $this->device->id)
            ->assertJsonPath('device.warehouse_id', $this->warehouse->id)
            ->assertJsonPath('device.device_code', 'EDGE-AUTH-01');
    }

    public function test_device_config_returns_only_authenticated_device(): void
    {
        $this->getJson('/api/devices/config')->assertUnauthorized();
        $this->withToken($this->token)->getJson('/api/devices/config')
            ->assertOk()
            ->assertJsonPath('device.id', $this->device->id)
            ->assertJsonMissingPath('device.api_token_hash');
    }

    public function test_status_and_stream_require_user_sanctum_authentication(): void
    {
        $this->getJson('/api/devices/status')->assertUnauthorized();
        $this->getJson('/api/gate/stream')->assertUnauthorized();

        $user = User::create(['name' => 'PM', 'email' => 'auth@test.id', 'role' => 'pm', 'password' => 'password']);
        $this->actingAs($user, 'sanctum')->getJson('/api/devices/status')->assertOk();
    }

    public function test_heartbeat_age_and_reader_health_are_reported_separately(): void
    {
        Carbon::setTestNow('2026-09-09 12:00:00');
        $this->device->update([
            'last_heartbeat_at' => Carbon::now()->subSeconds(91),
            'internet_downtime_tolerance_seconds' => 90,
            'metrics_json' => ['reader_status' => 'responsive'],
        ]);
        $this->device->refresh();

        $this->assertSame('offline', $this->device->computed_status);
        $user = User::create(['name' => 'PM 2', 'email' => 'status@test.id', 'role' => 'pm', 'password' => 'password']);
        $this->actingAs($user, 'sanctum')->getJson('/api/devices/status')
            ->assertJsonPath('devices.0.seconds_ago', 91)
            ->assertJsonPath('devices.0.reader_status', 'unknown');
        Carbon::setTestNow();
    }

    public function test_health_incident_is_idempotent_and_bound_to_device(): void
    {
        $payload = [
            'event_id' => 'c02fa64f-89e2-4feb-8e1b-a10b9d81ff42',
            'component' => 'reader',
            'status' => 'unresponsive',
            'reason' => 'timeout',
            'observed_at' => '2026-09-09T12:00:00Z',
        ];

        $this->withToken($this->token)->postJson('/api/devices/incidents', $payload)->assertCreated();
        $this->withToken($this->token)->postJson('/api/devices/incidents', $payload)->assertOk();
        $this->assertDatabaseCount('device_health_incidents', 1);
        $this->assertDatabaseHas('device_health_incidents', ['gate_device_id' => $this->device->id, 'status' => 'unresponsive']);
    }
}