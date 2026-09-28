<?php

namespace Tests\Feature;

use App\Models\BoqItem;
use App\Models\Item;
use App\Models\Principal;
use App\Models\Project;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WorkOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WorkOrderPreparationHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_assigned_storeroom_can_report_prepared_materials(): void
    {
        [$wo, $boq, $warehouse] = $this->makeWorkOrder();
        $pic = User::create(['name' => 'PIC', 'email' => 'prep-pic@test.id', 'role' => 'pic_lapangan', 'password' => 'password']);
        Sanctum::actingAs($pic);
        $this->postJson("/api/work-orders/{$wo->id}/report-prepared", [
            'prepared_items' => [['item_id' => $boq->item_id, 'prepared_qty' => 3]],
        ])->assertForbidden();

        $store = User::create(['name' => 'Store', 'email' => 'prep-store@test.id', 'role' => 'storeroom', 'password' => 'password']);
        Sanctum::actingAs($store);
        $this->postJson("/api/work-orders/{$wo->id}/report-prepared", [
            'prepared_items' => [['item_id' => $boq->item_id, 'prepared_qty' => 3]],
        ])->assertForbidden();

        $store->assignedWarehouses()->attach($warehouse->id);
        $this->postJson("/api/work-orders/{$wo->id}/report-prepared", [
            'prepared_items' => [['item_id' => $boq->item_id, 'prepared_qty' => 3]],
        ])->assertOk();

        $this->assertSame(3, $boq->fresh()->prepared_qty);
        $this->assertDatabaseHas('custody_ledger', ['action' => 'PREPARED', 'holder_user_id' => $store->id]);
    }

    public function test_invalid_preparation_payload_is_atomic(): void
    {
        [$wo, $boq, $warehouse] = $this->makeWorkOrder();
        $store = User::create(['name' => 'Store', 'email' => 'prep-atomic@test.id', 'role' => 'storeroom', 'password' => 'password']);
        $store->assignedWarehouses()->attach($warehouse->id);
        $other = Item::create(['name' => 'Cable', 'code' => 'PREP-OTHER', 'category' => 'cable', 'unit' => 'm']);
        Sanctum::actingAs($store);

        $this->postJson("/api/work-orders/{$wo->id}/report-prepared", [
            'prepared_items' => [
                ['item_id' => $boq->item_id, 'prepared_qty' => 4],
                ['item_id' => $other->id, 'prepared_qty' => 1],
            ],
        ])->assertStatus(422);

        $this->assertSame(0, $boq->fresh()->prepared_qty);
        $this->assertDatabaseCount('custody_ledger', 0);

        $this->postJson("/api/work-orders/{$wo->id}/report-prepared", [
            'prepared_items' => [
                ['item_id' => $boq->item_id, 'prepared_qty' => 1],
                ['item_id' => $boq->item_id, 'prepared_qty' => 2],
            ],
        ])->assertStatus(422);
    }

    private function makeWorkOrder(): array
    {
        $pm = User::create(['name' => 'PM', 'email' => uniqid('prep-pm-', true).'@test.id', 'role' => 'pm', 'password' => 'password']);
        $principal = Principal::create(['name' => 'Principal', 'code' => uniqid('PREP-P-')]);
        $project = Project::create(['principal_id' => $principal->id, 'name' => 'Project', 'code' => uniqid('PREP-PRJ-')]);
        $warehouse = Warehouse::create(['project_id' => $project->id, 'name' => 'Warehouse', 'code' => uniqid('PREP-WH-')]);
        $item = Item::create(['name' => 'Pole', 'code' => uniqid('PREP-ITEM-'), 'category' => 'pole', 'unit' => 'pcs']);
        $wo = WorkOrder::create(['project_id' => $project->id, 'warehouse_id' => $warehouse->id, 'pm_user_id' => $pm->id, 'wo_number' => uniqid('PREP-WO-'), 'title' => 'Prepare WO', 'status' => 'approved']);
        $boq = BoqItem::create(['work_order_id' => $wo->id, 'item_id' => $item->id, 'quota_qty' => 5]);

        return [$wo, $boq, $warehouse];
    }
}
