<?php

namespace Tests\Feature;

use App\Models\BoqItem;
use App\Models\GateTransaction;
use App\Models\Item;
use App\Models\Principal;
use App\Models\Project;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WorkOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WorkOrderInstallationHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_pic_can_report_installed_materials(): void
    {
        [$wo, $boq] = $this->makeWorkOrder();
        $pm = User::create(['name' => 'PM', 'email' => 'install-pm@test.id', 'role' => 'pm', 'password' => 'password']);

        Sanctum::actingAs($pm);
        $this->patchJson("/api/work-orders/{$wo->id}/report-installed", [
            'installed_items' => [['item_id' => $boq->item_id, 'installed_qty' => 1]],
        ])->assertForbidden();

        $this->assertSame(2, $boq->fresh()->installed_qty);
        $this->assertDatabaseCount('custody_ledger', 0);
    }

    public function test_installation_is_bounded_by_withdrawn_balance_and_atomic(): void
    {
        [$wo, $boq, $pic] = $this->makeWorkOrder();
        Sanctum::actingAs($pic);

        $this->patchJson("/api/work-orders/{$wo->id}/report-installed", [
            'installed_items' => [['item_id' => $boq->item_id, 'installed_qty' => 3]],
        ])->assertStatus(422);

        $this->assertSame(2, $boq->fresh()->installed_qty);
        $this->assertDatabaseCount('custody_ledger', 0);

        $this->patchJson("/api/work-orders/{$wo->id}/report-installed", [
            'installed_items' => [['item_id' => $boq->item_id, 'installed_qty' => 2]],
        ])->assertOk();

        $this->assertSame(4, $boq->fresh()->installed_qty);
        $this->assertDatabaseHas('custody_ledger', ['action' => 'INSTALLED', 'ref_id' => $wo->id]);
    }

    public function test_installation_rejects_duplicate_and_non_boq_items(): void
    {
        [$wo, $boq, $pic] = $this->makeWorkOrder();
        $other = Item::create(['name' => 'Cable', 'code' => 'INST-OTHER', 'category' => 'cable', 'unit' => 'm']);
        Sanctum::actingAs($pic);

        $this->patchJson("/api/work-orders/{$wo->id}/report-installed", [
            'installed_items' => [
                ['item_id' => $boq->item_id, 'installed_qty' => 1],
                ['item_id' => $boq->item_id, 'installed_qty' => 1],
            ],
        ])->assertStatus(422);

        $this->patchJson("/api/work-orders/{$wo->id}/report-installed", [
            'installed_items' => [['item_id' => $other->id, 'installed_qty' => 1]],
        ])->assertStatus(422);

        $this->assertSame(2, $boq->fresh()->installed_qty);
        $this->assertDatabaseCount('custody_ledger', 0);
    }

    public function test_unassigned_pic_cannot_view_or_report_another_work_order(): void
    {
        [$wo, $boq] = $this->makeWorkOrder();
        $otherPic = User::create(['name' => 'Other PIC', 'email' => 'other-install-pic@test.id', 'role' => 'pic_lapangan', 'password' => 'password']);
        Sanctum::actingAs($otherPic);

        $this->getJson('/api/work-orders')->assertOk()->assertExactJson([]);
        $this->getJson("/api/work-orders/{$wo->id}")->assertForbidden();
        $this->patchJson("/api/work-orders/{$wo->id}/report-installed", [
            'installed_items' => [['item_id' => $boq->item_id, 'installed_qty' => 1]],
        ])->assertForbidden();

        $this->assertSame(2, $boq->fresh()->installed_qty);
        $this->assertDatabaseCount('custody_ledger', 0);
    }

    private function makeWorkOrder(): array
    {
        $pic = User::create(['name' => 'PIC', 'email' => uniqid('install-', true).'@test.id', 'role' => 'pic_lapangan', 'password' => 'password']);
        $pm = User::create(['name' => 'PM Owner', 'email' => uniqid('install-pm-', true).'@test.id', 'role' => 'pm', 'password' => 'password']);
        $principal = Principal::create(['name' => 'Principal', 'code' => uniqid('INST-P-')]);
        $project = Project::create(['principal_id' => $principal->id, 'name' => 'Project', 'code' => uniqid('INST-PRJ-')]);
        $warehouse = Warehouse::create(['project_id' => $project->id, 'name' => 'Warehouse', 'code' => uniqid('INST-WH-')]);
        $item = Item::create(['name' => 'Pole', 'code' => uniqid('INST-ITEM-'), 'category' => 'pole', 'unit' => 'pcs']);
        $wo = WorkOrder::create(['project_id' => $project->id, 'warehouse_id' => $warehouse->id, 'pm_user_id' => $pm->id, 'wo_number' => uniqid('INST-WO-'), 'title' => 'Install WO', 'status' => 'in_progress']);
        $boq = BoqItem::create(['work_order_id' => $wo->id, 'item_id' => $item->id, 'quota_qty' => 5, 'withdrawn_qty' => 5, 'returned_qty' => 1, 'installed_qty' => 2]);
        GateTransaction::create(['transaction_number' => uniqid('INST-TX-'), 'work_order_id' => $wo->id, 'warehouse_id' => $warehouse->id, 'pic_user_id' => $pic->id, 'type' => 'OUT_FULFILLMENT', 'status' => 'completed']);

        return [$wo, $boq, $pic];
    }
}
