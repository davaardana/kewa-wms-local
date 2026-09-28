<?php

namespace Tests\Feature;

use App\Models\BoqItem;
use App\Models\GateTransaction;
use App\Models\GateTransactionItem;
use App\Models\GatePassEvent;
use App\Models\Item;
use App\Models\Principal;
use App\Models\Project;
use App\Models\RfidTag;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WorkOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReturnHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_return_match_is_server_derived_and_posts_once_with_outstanding_bound(): void
    {
        $pm = User::create(['name' => 'PM', 'email' => 'return-pm@test.id', 'role' => 'pm', 'password' => 'password']);
        $pic = User::create(['name' => 'PIC', 'email' => 'return-pic@test.id', 'role' => 'pic_lapangan', 'password' => 'password']);
        $store = User::create(['name' => 'Store', 'email' => 'return-store@test.id', 'role' => 'storeroom', 'password' => 'password']);
        $principal = Principal::create(['name' => 'Principal', 'code' => 'RET-P']);
        $project = Project::create(['principal_id' => $principal->id, 'name' => 'Project', 'code' => 'RET-PRJ']);
        $warehouse = Warehouse::create(['project_id' => $project->id, 'name' => 'Warehouse', 'code' => 'RET-WH']);
        $store->assignedWarehouses()->attach($warehouse->id);
        $item = Item::create(['name' => 'Pole', 'code' => 'RET-ITEM', 'category' => 'pole', 'unit' => 'pcs']);
        $wo = WorkOrder::create(['project_id' => $project->id, 'warehouse_id' => $warehouse->id, 'pm_user_id' => $pm->id, 'wo_number' => 'RET-WO', 'title' => 'Return WO', 'status' => 'in_progress']);
        BoqItem::create(['work_order_id' => $wo->id, 'item_id' => $item->id, 'quota_qty' => 5, 'withdrawn_qty' => 5, 'installed_qty' => 2]);
        $tx = GateTransaction::create(['transaction_number' => 'RET-TX', 'work_order_id' => $wo->id, 'warehouse_id' => $warehouse->id, 'pic_user_id' => $pic->id, 'type' => 'IN_RETURN', 'status' => 'completed']);
        GateTransactionItem::create(['gate_transaction_id' => $tx->id, 'item_id' => $item->id, 'requested_qty' => 3, 'passed_qty' => 3]);
        $epcs = ['RET-EPC-1', 'RET-EPC-2', 'RET-EPC-3'];
        foreach ($epcs as $epc) {
            RfidTag::create(['epc' => $epc, 'item_id' => $item->id, 'status' => 'attached']);
        }
        GatePassEvent::create(['gate_transaction_id' => $tx->id, 'warehouse_id' => $warehouse->id, 'gate_id' => 'GATE-01', 'direction' => 'IN', 'antenna_sequence' => 'B_TO_A', 'tag_epcs_json' => $epcs, 'total_tags_detected' => 3, 'is_valid' => true]);

        Sanctum::actingAs($store);
        $this->postJson("/api/returns/{$tx->id}/verify", [
            'verified_items' => [['item_id' => $item->id, 'physical_qty' => 3]],
            'is_matched' => false,
        ])->assertOk()->assertJsonPath('is_matched', true);

        $this->assertEquals(3, BoqItem::where('work_order_id', $wo->id)->value('returned_qty'));
        $this->postJson("/api/returns/{$tx->id}/verify", [
            'verified_items' => [['item_id' => $item->id, 'physical_qty' => 3]],
        ])->assertStatus(422);
        $this->assertEquals(3, BoqItem::where('work_order_id', $wo->id)->value('returned_qty'));
        $this->assertDatabaseCount('custody_ledger', 3);
        foreach ($epcs as $epc) {
            $this->assertDatabaseHas('custody_ledger', ['action' => 'STOCK_IN', 'tag_epc' => $epc]);
            $this->assertDatabaseHas('rfid_tags', ['epc' => $epc, 'status' => 'active', 'last_warehouse_id' => $warehouse->id]);
        }
    }

    public function test_return_mismatch_does_not_post_stock_or_custody(): void
    {
        $pm = User::create(['name' => 'PM', 'email' => 'mismatch-pm@test.id', 'role' => 'pm', 'password' => 'password']);
        $pic = User::create(['name' => 'PIC', 'email' => 'mismatch-pic@test.id', 'role' => 'pic_lapangan', 'password' => 'password']);
        $store = User::create(['name' => 'Store', 'email' => 'mismatch-store@test.id', 'role' => 'storeroom', 'password' => 'password']);
        $principal = Principal::create(['name' => 'Principal', 'code' => 'MIS-P']);
        $project = Project::create(['principal_id' => $principal->id, 'name' => 'Project', 'code' => 'MIS-PRJ']);
        $warehouse = Warehouse::create(['project_id' => $project->id, 'name' => 'Warehouse', 'code' => 'MIS-WH']);
        $store->assignedWarehouses()->attach($warehouse->id);
        $item = Item::create(['name' => 'Pole', 'code' => 'MIS-ITEM', 'category' => 'pole', 'unit' => 'pcs']);
        $wo = WorkOrder::create(['project_id' => $project->id, 'warehouse_id' => $warehouse->id, 'pm_user_id' => $pm->id, 'wo_number' => 'MIS-WO', 'title' => 'Mismatch WO', 'status' => 'in_progress']);
        $boq = BoqItem::create(['work_order_id' => $wo->id, 'item_id' => $item->id, 'quota_qty' => 3, 'withdrawn_qty' => 3]);
        $tx = GateTransaction::create(['transaction_number' => 'MIS-TX', 'work_order_id' => $wo->id, 'warehouse_id' => $warehouse->id, 'pic_user_id' => $pic->id, 'type' => 'IN_RETURN', 'status' => 'completed']);
        GateTransactionItem::create(['gate_transaction_id' => $tx->id, 'item_id' => $item->id, 'requested_qty' => 3, 'passed_qty' => 3]);

        Sanctum::actingAs($store);
        $this->postJson("/api/returns/{$tx->id}/verify", [
            'verified_items' => [['item_id' => $item->id, 'physical_qty' => 2]],
        ])->assertOk()->assertJsonPath('is_matched', false);

        $this->assertSame(0, $boq->fresh()->returned_qty);
        $this->assertSame('return_mismatch', $tx->fresh()->status);
        $this->assertDatabaseCount('custody_ledger', 0);
    }
}