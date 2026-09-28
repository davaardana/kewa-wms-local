<?php

namespace Tests\Feature;

use App\Models\ApprovalTemplate;
use App\Models\CustodyLedger;
use App\Models\Item;
use App\Models\Principal;
use App\Models\Project;
use App\Models\Role;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserAndMasterManagementTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;
    protected User $pm;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = User::factory()->create([
            'name' => 'Super Administrator',
            'email' => 'superadmin@mosa.id',
            'role' => 'superadmin',
            'is_active' => true,
        ]);

        $this->pm = User::factory()->create([
            'name' => 'Budi PM',
            'email' => 'pm.budi@mosa.id',
            'role' => 'pm',
            'is_active' => true,
        ]);
    }

    public function test_can_list_users_with_role_filter(): void
    {
        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/users?role=pm');

        $response->assertStatus(200);
        $data = $response->json();
        $this->assertCount(1, $data);
        $this->assertEquals('pm.budi@mosa.id', $data[0]['email']);
    }

    public function test_can_create_new_user(): void
    {
        $warehouses = Warehouse::factory()->count(2)->create();
        $payload = [
            'name' => 'New Storeroom Staff',
            'email' => 'storeroom.new@mosa.id',
            'password' => 'password123',
            'role' => 'storeroom',
            'phone' => '081299998888',
            'is_active' => true,
            'warehouse_ids' => $warehouses->modelKeys(),
        ];

        $response = $this->actingAs($this->superAdmin)
            ->postJson('/api/users', $payload);

        $response->assertStatus(201);
        $this->assertDatabaseHas('users', [
            'email' => 'storeroom.new@mosa.id',
            'role' => 'storeroom',
        ]);
        $user = User::where('email', 'storeroom.new@mosa.id')->firstOrFail();
        $this->assertEqualsCanonicalizing($warehouses->modelKeys(), $user->assignedWarehouses()->pluck('warehouses.id')->all());
        $response->assertJsonCount(2, 'data.assigned_warehouses');
    }

    public function test_superadmin_can_replace_or_clear_user_warehouse_access(): void
    {
        $user = User::factory()->create(['role' => 'procurement']);
        $warehouses = Warehouse::factory()->count(2)->create();
        $user->assignedWarehouses()->attach($warehouses->modelKeys());
        $payload = ['name' => $user->name, 'email' => $user->email, 'role' => $user->role, 'warehouse_ids' => [$warehouses[0]->id]];

        $this->actingAs($this->superAdmin)->putJson("/api/users/{$user->id}", $payload)->assertOk();
        $this->assertSame([$warehouses[0]->id], $user->assignedWarehouses()->pluck('warehouses.id')->all());

        $payload['warehouse_ids'] = [];
        $this->actingAs($this->superAdmin)->putJson("/api/users/{$user->id}", $payload)->assertOk();
        $this->assertCount(0, $user->assignedWarehouses()->get());
    }

    public function test_nonadmin_cannot_mutate_users_or_roles(): void
    {
        $target = User::factory()->create(['role' => 'storeroom']);
        $deleteTarget = User::factory()->create(['role' => 'storeroom']);
        $role = Role::create([
            'name' => 'Protected Role',
            'code' => 'protected_role',
            'is_system' => false,
        ]);

        $this->actingAs($this->pm)
            ->postJson('/api/users', [
                'name' => 'Unauthorized User',
                'email' => 'unauthorized@mosa.id',
                'password' => 'password123',
                'role' => 'storeroom',
            ])->assertForbidden();

        $this->actingAs($this->pm)
            ->putJson("/api/users/{$target->id}", [
                'name' => 'Unauthorized Rename',
                'email' => $target->email,
                'role' => 'pm',
            ])->assertForbidden();

        $this->actingAs($this->pm)
            ->deleteJson("/api/users/{$deleteTarget->id}")
            ->assertForbidden();

        $this->actingAs($this->pm)
            ->patchJson("/api/users/{$target->id}/toggle-status")
            ->assertForbidden();

        $this->actingAs($this->pm)
            ->postJson('/api/roles', [
                'name' => 'Unauthorized Role',
                'code' => 'unauthorized_role',
            ])->assertForbidden();

        $this->actingAs($this->pm)
            ->putJson("/api/roles/{$role->id}", [
                'name' => 'Unauthorized Rename',
            ])->assertForbidden();

        $this->actingAs($this->pm)
            ->patchJson("/api/roles/{$role->id}/toggle-permission", [
                'module_key' => 'user_management',
                'is_allowed' => true,
            ])->assertForbidden();

        $this->actingAs($this->pm)
            ->deleteJson("/api/roles/{$role->id}")
            ->assertForbidden();

        $this->assertDatabaseMissing('users', ['email' => 'unauthorized@mosa.id']);
        $this->assertDatabaseHas('users', ['id' => $target->id, 'name' => $target->name, 'role' => 'storeroom']);
        $this->assertDatabaseHas('users', ['id' => $deleteTarget->id]);
        $this->assertTrue($target->fresh()->is_active);
        $this->assertDatabaseMissing('roles', ['code' => 'unauthorized_role']);
        $this->assertDatabaseHas('roles', ['id' => $role->id, 'name' => 'Protected Role']);
        $this->assertDatabaseMissing('role_permissions', [
            'role_id' => $role->id,
            'module_key' => 'user_management',
        ]);
    }

    public function test_can_toggle_user_status(): void
    {
        $user = User::factory()->create(['is_active' => true]);

        $response = $this->actingAs($this->superAdmin)
            ->patchJson("/api/users/{$user->id}/toggle-status");

        $response->assertStatus(200);
        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'is_active' => false,
        ]);
    }

    public function test_delete_request_deactivates_referenced_user_and_preserves_custody_ledger(): void
    {
        $holder = User::factory()->create(['role' => 'pic_lapangan', 'is_active' => true]);
        $item = Item::create(['code' => 'AUDIT-ITEM', 'name' => 'Audit Item', 'category' => 'cable', 'unit' => 'meter']);
        $ledger = CustodyLedger::create([
            'item_id' => $item->id,
            'holder_user_id' => $holder->id,
            'action' => 'STOCK_IN',
        ]);

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/users/{$holder->id}")
            ->assertOk()
            ->assertJsonPath('data.is_active', false);

        $this->assertDatabaseHas('users', ['id' => $holder->id, 'is_active' => false]);
        $this->assertDatabaseHas('custody_ledger', [
            'id' => $ledger->id,
            'holder_user_id' => $holder->id,
            'action' => 'STOCK_IN',
        ]);
    }

    public function test_can_get_rbac_roles_and_permissions_matrix(): void
    {
        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/roles-permissions');

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'roles' => [
                '*' => ['id', 'name', 'badge', 'color', 'description', 'user_count', 'permissions']
            ],
            'modules' => [
                '*' => ['key', 'name', 'group']
            ]
        ]);
    }

    public function test_can_list_and_create_vehicles(): void
    {
        $vehiclePayload = [
            'plate_number' => 'B 7777 RFID',
            'vehicle_type' => 'truck_medium',
            'driver_name' => 'Joko Driver',
            'driver_phone' => '081233334444',
            'transporter_name' => 'PT Fast Delivery',
            'max_pole_capacity' => 60,
            'is_active' => true,
            'notes' => 'Truk pengangkut tiang khusus',
        ];

        $createRes = $this->actingAs($this->superAdmin)
            ->postJson('/api/vehicles', $vehiclePayload);

        $createRes->assertStatus(201);
        $this->assertDatabaseHas('vehicles', ['plate_number' => 'B 7777 RFID']);

        $listRes = $this->actingAs($this->superAdmin)
            ->getJson('/api/vehicles');

        $listRes->assertStatus(200);
        $this->assertTrue(collect($listRes->json())->contains('plate_number', 'B 7777 RFID'));
    }

    public function test_can_create_approval_template_with_steps(): void
    {
        $templatePayload = [
            'name' => 'SPK Pengadaan Khusus Jawa Barat',
            'code' => 'TPL-SPK-JABAR',
            'module' => 'SPK',
            'description' => '2-tier review untuk SPK pengadaan FO',
            'is_default' => false,
            'min_amount' => 10000000,
            'max_amount' => 100000000,
            'steps' => [
                [
                    'step_name' => 'Review Teknis PM',
                    'approver_user_id' => $this->pm->id,
                    'sla_hours' => 24,
                ],
                [
                    'step_name' => 'Approval Direksi',
                    'approver_user_id' => $this->superAdmin->id,
                    'sla_hours' => 48,
                ],
            ],
        ];

        $response = $this->actingAs($this->superAdmin)
            ->postJson('/api/approval-templates', $templatePayload);

        $response->assertStatus(201);
        $this->assertDatabaseHas('approval_templates', ['code' => 'TPL-SPK-JABAR']);
        $this->assertDatabaseHas('approval_template_steps', ['step_name' => 'Review Teknis PM']);
    }

    public function test_can_create_custom_role_and_toggle_permission(): void
    {
        $rolePayload = [
            'name' => 'Quality Control Inspector',
            'code' => 'qc_inspector',
            'badge' => '🔍 QC INSPECTOR',
            'color' => 'teal',
            'description' => 'Inspeksi kualitas fisik tiang dan kabel di yard',
            'permissions' => [
                'stock_opname' => true,
                'return_verify' => true,
            ],
        ];

        $createRes = $this->actingAs($this->superAdmin)
            ->postJson('/api/roles', $rolePayload);

        $createRes->assertStatus(201);
        $this->assertDatabaseHas('roles', ['code' => 'qc_inspector']);
        $this->assertDatabaseHas('role_permissions', [
            'module_key' => 'stock_opname',
            'is_allowed' => true,
        ]);

        $roleId = $createRes->json('data.id');

        // Toggle a permission
        $toggleRes = $this->actingAs($this->superAdmin)
            ->patchJson("/api/roles/{$roleId}/toggle-permission", [
                'module_key' => 'gate_monitor',
                'is_allowed' => true,
            ]);

        $toggleRes->assertStatus(200);
        $this->assertDatabaseHas('role_permissions', [
            'role_id' => $roleId,
            'module_key' => 'gate_monitor',
            'is_allowed' => true,
        ]);

        // Delete custom role
        $deleteRes = $this->actingAs($this->superAdmin)
            ->deleteJson("/api/roles/{$roleId}");

        $deleteRes->assertStatus(200);
        $this->assertDatabaseMissing('roles', ['id' => $roleId]);
    }

    public function test_storeroom_is_forbidden_from_creating_master_data_and_gate_devices(): void
    {
        $storeroom = User::factory()->create([
            'name' => 'Joko Storeroom Staff',
            'email' => 'joko.storeroom@mosa.id',
            'role' => 'storeroom',
            'is_active' => true,
        ]);

        // 1. Cannot create warehouse
        $whRes = $this->actingAs($storeroom)->postJson('/api/warehouses', [
            'name' => 'Gudang Ilegal',
            'code' => 'WH-ILLEGAL',
        ]);
        $whRes->assertStatus(403);

        // 2. Cannot create vehicle
        $vehRes = $this->actingAs($storeroom)->postJson('/api/vehicles', [
            'plate_number' => 'B 9999 ILG',
            'vehicle_type' => 'truck_medium',
            'max_pole_capacity' => 50,
        ]);
        $vehRes->assertStatus(403);

        // 3. Cannot pair gate device
        $wh = Warehouse::create([
            'name' => 'Gudang Valid',
            'code' => 'WH-VALID-01',
            'gate_mode' => 'SINGLE_ANTENNA_SESSION',
        ]);

        $devRes = $this->actingAs($storeroom)->postJson('/api/devices', [
            'warehouse_id' => $wh->id,
            'device_code' => 'DEV-GATE-ILLEGAL',
            'device_name' => 'Reader Gerbang',
            'device_model' => 'ELECTRON_EL-UHF-RC4',
            'ip_address' => '192.168.1.250',
            'tcp_port' => 2022,
        ]);
        $devRes->assertStatus(403);

        // 4. Cannot enroll tags
        $tagRes = $this->actingAs($storeroom)->postJson('/api/tags/enroll', [
            'item_id' => 1,
            'tag_type' => 'anti_metal',
            'epc' => 'EPC-ILLEGAL-001',
        ]);
        $tagRes->assertStatus(403);
    }

    public function test_can_fetch_dashboard_kpis_successfully(): void
    {
        $response = $this->actingAs($this->superAdmin)->getJson('/api/reports/dashboard-kpis');

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'metrics' => [
                'total_tags',
                'active_tags',
                'total_items',
                'active_work_orders',
                'pending_gate_approvals',
                'in_transit_deliveries',
                'pending_returns',
                'total_spks',
                'pending_spks',
            ],
            'recent_gate_events',
            'recent_mismatches',
        ]);
    }
}
