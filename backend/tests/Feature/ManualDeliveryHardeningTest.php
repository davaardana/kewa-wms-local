<?php

namespace Tests\Feature;

use App\Models\Delivery;
use App\Models\Principal;
use App\Models\Project;
use App\Models\Spk;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ManualDeliveryHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_manual_delivery_and_approval_without_epc_are_disabled_without_mutation(): void
    {
        $user = User::create(['name' => 'User', 'email' => 'manual-delivery@test.id', 'role' => 'superadmin', 'password' => 'password']);
        Sanctum::actingAs($user);

        $this->postJson('/api/deliveries', [])->assertStatus(410);
        $this->postJson('/api/deliveries/999/approve')->assertStatus(410);

        $this->assertDatabaseCount('deliveries', 0);
        $this->assertDatabaseCount('delivery_items', 0);
        $this->assertDatabaseCount('custody_ledger', 0);
    }

    public function test_unassigned_storeroom_cannot_see_warehouse_deliveries(): void
    {
        $storeroom = User::create(['name' => 'Store', 'email' => 'unassigned-store@test.id', 'role' => 'storeroom', 'password' => 'password']);
        $principal = Principal::create(['name' => 'Principal', 'code' => 'MAN-P']);
        $project = Project::create(['principal_id' => $principal->id, 'name' => 'Project', 'code' => 'MAN-PRJ']);
        $warehouse = Warehouse::create(['project_id' => $project->id, 'name' => 'Warehouse', 'code' => 'MAN-WH']);
        $spk = Spk::create(['principal_id' => $principal->id, 'project_id' => $project->id, 'spk_number' => 'MAN-SPK', 'title' => 'Manual SPK']);
        Delivery::create([
            'spk_id' => $spk->id,
            'warehouse_id' => $warehouse->id,
            'delivery_number' => 'MAN-DEL-1',
            'status' => 'in_transit',
            'reconciliation_status' => 'pending',
        ]);

        Sanctum::actingAs($storeroom);
        $this->getJson('/api/deliveries')->assertOk()->assertExactJson([]);
    }
}
