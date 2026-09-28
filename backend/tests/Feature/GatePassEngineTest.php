<?php

namespace Tests\Feature;

use App\Models\BoqItem;
use App\Models\GatePassEvent;
use App\Models\GateDevice;
use App\Models\GateTransaction;
use App\Models\GateTransactionItem;
use App\Models\Item;
use App\Models\Principal;
use App\Models\Project;
use App\Models\RfidTag;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WorkOrder;
use App\Services\CustodyService;
use App\Services\GateEngineService;
use App\Services\QuotaValidatorService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GatePassEngineTest extends TestCase
{
    use RefreshDatabase;

    protected GateEngineService $gateEngine;
    protected Warehouse $warehouse;
    protected User $pic;
    protected Item $poleItem;
    protected WorkOrder $workOrder;
    protected RfidTag $tag1;
    protected RfidTag $tag2;
    protected GateDevice $device;

    protected function setUp(): void
    {
        parent::setUp();
        $this->gateEngine = new GateEngineService(new CustodyService(), new QuotaValidatorService());

        $userPm = User::create(['name' => 'PM', 'email' => 'pm@mosa.id', 'role' => 'pm', 'password' => bcrypt('password')]);
        $this->pic = User::create(['name' => 'PIC', 'email' => 'pic@mosa.id', 'role' => 'pic_lapangan', 'password' => bcrypt('password')]);

        $principal = Principal::create(['name' => 'Test Principal', 'code' => 'TESTP']);
        $project = Project::create(['principal_id' => $principal->id, 'code' => 'PRJ-TEST', 'name' => 'Project Test', 'status' => 'active']);
        $this->warehouse = Warehouse::create(['project_id' => $project->id, 'code' => 'WH-TEST', 'name' => 'Warehouse Test']);
        $this->device = GateDevice::create([
            'warehouse_id' => $this->warehouse->id,
            'device_code' => 'GATE-01',
            'device_name' => 'Test Gate',
            'device_model' => 'TEST',
            'is_active' => true,
        ]);

        $this->poleItem = Item::create(['code' => 'POLE-01', 'name' => 'Tiang 7M', 'category' => 'pole', 'unit' => 'pcs']);

        $this->tag1 = RfidTag::create([
            'epc' => 'EPC-TEST-001',
            'item_id' => $this->poleItem->id,
            'tag_type' => 'anti_metal',
            'status' => 'active',
            'last_warehouse_id' => $this->warehouse->id,
        ]);

        $this->tag2 = RfidTag::create([
            'epc' => 'EPC-TEST-002',
            'item_id' => $this->poleItem->id,
            'tag_type' => 'anti_metal',
            'status' => 'active',
            'last_warehouse_id' => $this->warehouse->id,
        ]);

        $this->workOrder = WorkOrder::create([
            'project_id' => $project->id,
            'warehouse_id' => $this->warehouse->id,
            'pm_user_id' => $userPm->id,
            'wo_number' => 'WO-TEST-001',
            'title' => 'Test Work Order',
            'status' => 'approved',
        ]);

        BoqItem::create([
            'work_order_id' => $this->workOrder->id,
            'item_id' => $this->poleItem->id,
            'quota_qty' => 10,
            'prepared_qty' => 10,
            'withdrawn_qty' => 0,
            'returned_qty' => 0,
        ]);
    }

    public function test_gate_unlocks_and_updates_boq_on_valid_approved_withdrawal(): void
    {
        // 1. Create an approved gate transaction for 2 poles
        $transaction = GateTransaction::create([
            'transaction_number' => 'GTX-TEST-001',
            'work_order_id' => $this->workOrder->id,
            'warehouse_id' => $this->warehouse->id,
            'pic_user_id' => $this->pic->id,
            'type' => 'OUT_FULFILLMENT',
            'status' => 'approved',
            'valid_until' => Carbon::now()->addHour(),
        ]);

        GateTransactionItem::create([
            'gate_transaction_id' => $transaction->id,
            'item_id' => $this->poleItem->id,
            'requested_qty' => 2,
            'passed_qty' => 0,
        ]);

        // 2. Hardware event: Antenna A -> B (OUT direction) with 2 tags
        $result = $this->gateEngine->processGateEvent([
            'warehouse_id' => $this->warehouse->id,
            'gate_id' => 'GATE-01',
            'antenna_sequence' => 'A_TO_B',
            'epc_list' => [$this->tag1->epc, $this->tag2->epc],
            'cctv_snapshot_path' => '/storage/snapshots/pass_001.jpg',
            'gate_transaction_id' => $transaction->id,
        ], $this->device);

        // 3. Assertions
        $this->assertTrue($result['unlock_gate']);
        $this->assertEquals('OUT', $result['direction']);
        $this->assertEquals('SUCCESS', $result['status']);
        $this->assertFalse($result['mismatch']);

        // Assert BOQ withdrawn quantity updated
        $boq = BoqItem::where('work_order_id', $this->workOrder->id)->where('item_id', $this->poleItem->id)->first();
        $this->assertEquals(2, $boq->withdrawn_qty);

        // Assert Custody Ledger entries recorded
        $this->assertDatabaseHas('custody_ledger', [
            'tag_epc' => $this->tag1->epc,
            'action' => 'GATE_OUT',
            'holder_user_id' => $this->pic->id,
        ]);
    }

    public function test_gate_revalidates_epc_state_and_boq_balance_at_pass_time(): void
    {
        $first = GateTransaction::create(['transaction_number' => 'GTX-RACE-1', 'work_order_id' => $this->workOrder->id, 'warehouse_id' => $this->warehouse->id, 'pic_user_id' => $this->pic->id, 'type' => 'OUT_FULFILLMENT', 'status' => 'approved', 'valid_until' => now()->addHour()]);
        $second = GateTransaction::create(['transaction_number' => 'GTX-RACE-2', 'work_order_id' => $this->workOrder->id, 'warehouse_id' => $this->warehouse->id, 'pic_user_id' => $this->pic->id, 'type' => 'OUT_FULFILLMENT', 'status' => 'approved', 'valid_until' => now()->addHour()]);
        GateTransactionItem::create(['gate_transaction_id' => $first->id, 'item_id' => $this->poleItem->id, 'requested_qty' => 1]);
        GateTransactionItem::create(['gate_transaction_id' => $second->id, 'item_id' => $this->poleItem->id, 'requested_qty' => 1]);
        BoqItem::where('work_order_id', $this->workOrder->id)->update(['quota_qty' => 1]);

        $payload = ['warehouse_id' => $this->warehouse->id, 'gate_id' => 'GATE-01', 'antenna_sequence' => 'A_TO_B', 'epc_list' => [$this->tag1->epc]];
        $firstResult = $this->gateEngine->processGateEvent($payload + ['gate_transaction_id' => $first->id], $this->device);
        $secondResult = $this->gateEngine->processGateEvent($payload + ['gate_transaction_id' => $second->id], $this->device);

        $this->assertTrue($firstResult['unlock_gate']);
        $this->assertFalse($secondResult['unlock_gate']);
        $this->assertSame('DENIED', $secondResult['status']);
        $this->assertSame(1, BoqItem::where('work_order_id', $this->workOrder->id)->value('withdrawn_qty'));
        $this->assertDatabaseCount('custody_ledger', 1);
        $this->assertSame('approved', $second->fresh()->status);
    }

    public function test_new_gate_session_is_locked_while_warehouse_has_an_active_session(): void
    {
        $payload = [
            'work_order_id' => $this->workOrder->id,
            'warehouse_id' => $this->warehouse->id,
            'type' => 'OUT_FULFILLMENT',
            'items' => [['item_id' => $this->poleItem->id, 'requested_qty' => 1]],
        ];

        $this->actingAs($this->pic, 'sanctum')->postJson('/api/gate/transactions', $payload)
            ->assertCreated();

        $this->actingAs($this->pic, 'sanctum')->postJson('/api/gate/transactions', $payload)
            ->assertStatus(409)
            ->assertJsonPath('active_status', 'pending_approval');
    }

    public function test_completed_gate_session_does_not_block_a_new_session(): void
    {
        $payload = [
            'work_order_id' => $this->workOrder->id,
            'warehouse_id' => $this->warehouse->id,
            'type' => 'OUT_FULFILLMENT',
            'items' => [['item_id' => $this->poleItem->id, 'requested_qty' => 1]],
        ];

        $first = $this->actingAs($this->pic, 'sanctum')->postJson('/api/gate/transactions', $payload)
            ->assertCreated()
            ->json('gate_transaction.id');
        GateTransaction::findOrFail($first)->update(['status' => 'completed']);

        $this->actingAs($this->pic, 'sanctum')->postJson('/api/gate/transactions', $payload)
            ->assertCreated();
    }

    public function test_gate_denies_and_flags_unauthorized_exit_without_approval(): void
    {
        // No active approval exists for this warehouse
        $result = $this->gateEngine->processGateEvent([
            'warehouse_id' => $this->warehouse->id,
            'gate_id' => 'GATE-01',
            'antenna_sequence' => 'A_TO_B',
            'epc_list' => [$this->tag1->epc],
            'cctv_snapshot_path' => '/storage/snapshots/unauthorized.jpg',
        ], $this->device);

        // Gate should remain locked
        $this->assertFalse($result['unlock_gate']);
        $this->assertEquals('DENIED', $result['status']);
        $this->assertTrue($result['mismatch']);

        // Check event log has mismatch flag
        $this->assertDatabaseHas('gate_pass_events', [
            'warehouse_id' => $this->warehouse->id,
            'is_valid' => false,
            'mismatch_flag' => true,
        ]);
    }

    public function test_gate_event_delete_and_clear_are_rejected_without_mutation(): void
    {
        $pm = User::where('role', 'pm')->first();

        $event1 = GatePassEvent::create([
            'warehouse_id' => $this->warehouse->id,
            'gate_id' => 'GATE-01',
            'antenna_sequence' => 'A_TO_B',
            'direction' => 'OUT',
            'total_tags_detected' => 1,
            'tag_epcs_json' => ['E28011606000020410000001'],
            'is_valid' => true,
            'mismatch_flag' => false,
        ]);

        $event2 = GatePassEvent::create([
            'warehouse_id' => $this->warehouse->id,
            'gate_id' => 'GATE-01',
            'antenna_sequence' => 'A_TO_B',
            'direction' => 'OUT',
            'total_tags_detected' => 2,
            'tag_epcs_json' => ['E28011606000020410000001', 'E28011606000020410000002'],
            'is_valid' => false,
            'mismatch_flag' => true,
        ]);

        $respDelete = $this->actingAs($pm)->deleteJson("/api/gate/events/{$event1->id}");
        $respDelete->assertStatus(405)->assertJsonPath('success', false);
        $this->assertDatabaseHas('gate_pass_events', ['id' => $event1->id]);
        $this->assertDatabaseHas('gate_pass_events', ['id' => $event2->id]);

        $respClear = $this->actingAs($pm)->deleteJson("/api/gate/events", ['warehouse_id' => $this->warehouse->id]);
        $respClear->assertStatus(405)->assertJsonPath('deleted_count', 0);
        $this->assertDatabaseHas('gate_pass_events', ['id' => $event1->id]);
        $this->assertDatabaseHas('gate_pass_events', ['id' => $event2->id]);
    }

    public function test_gate_detects_mismatch_if_tag_belongs_to_different_project_in_shared_warehouse(): void
    {
        // Create Project B and assign a tag explicitly to Project B
        $principalB = Principal::create(['name' => 'Biznet', 'code' => 'BIZNET']);
        $projectB = Project::create(['principal_id' => $principalB->id, 'code' => 'PRJ-BIZNET', 'name' => 'Project Biznet', 'status' => 'active']);

        $tagBiznet = RfidTag::create([
            'epc' => 'EPC-BIZNET-POLE-999',
            'item_id' => $this->poleItem->id,
            'tag_type' => 'anti_metal',
            'status' => 'active',
            'last_warehouse_id' => $this->warehouse->id,
            'project_id' => $projectB->id,
        ]);

        // Create authorized gate transaction for Project A (WorkOrder 1)
        $tx = GateTransaction::create([
            'transaction_number' => 'GTX-TEST-MULTI-PRJ',
            'work_order_id' => $this->workOrder->id, // Belongs to Project A
            'warehouse_id' => $this->warehouse->id,
            'pic_user_id' => $this->pic->id,
            'type' => 'OUT_FULFILLMENT',
            'status' => 'approved',
            'valid_until' => Carbon::now()->addMinutes(60),
        ]);

        GateTransactionItem::create([
            'gate_transaction_id' => $tx->id,
            'item_id' => $this->poleItem->id,
            'requested_qty' => 1,
            'passed_qty' => 0,
        ]);

        // Scan the Biznet tag through the gate session of Project A
        $result = $this->gateEngine->processGateEvent([
            'warehouse_id' => $this->warehouse->id,
            'antenna_sequence' => 'A_TO_B',
            'epc_list' => [$tagBiznet->epc],
            'gate_transaction_id' => $tx->id,
            'gate_id' => 'GATE-01',
        ], $this->device);

        $this->assertTrue($result['mismatch'], 'Gate must flag mismatch for cross-project tag');
        $this->assertFalse($result['unlock_gate'], 'Gate lock must stay secure');
        $this->assertStringContainsString('KESALAHAN ALOKASI PROYEK', $result['mismatch_details'][0]);
    }

    public function test_gate_holds_and_keeps_session_approved_on_undercount_then_completes_on_full_rescan(): void
    {
        // 1. Create an approved gate transaction for 2 poles
        $transaction = GateTransaction::create([
            'transaction_number' => 'GTX-TEST-UNDERCOUNT',
            'work_order_id' => $this->workOrder->id,
            'warehouse_id' => $this->warehouse->id,
            'pic_user_id' => $this->pic->id,
            'type' => 'OUT_FULFILLMENT',
            'status' => 'approved',
            'valid_until' => Carbon::now()->addHour(),
        ]);

        GateTransactionItem::create([
            'gate_transaction_id' => $transaction->id,
            'item_id' => $this->poleItem->id,
            'requested_qty' => 2,
            'passed_qty' => 0,
        ]);

        // Attempt 1: Only 1 tag is scanned (undercount)
        $result1 = $this->gateEngine->processGateEvent([
            'warehouse_id' => $this->warehouse->id,
            'gate_id' => 'GATE-01',
            'antenna_sequence' => 'A_TO_B',
            'epc_list' => [$this->tag1->epc],
            'gate_transaction_id' => $transaction->id,
        ], $this->device);

        // Assert Attempt 1 is held in STANDBY, gate remains locked, and transaction stays 'approved'
        $this->assertFalse($result1['unlock_gate'], 'Gate must remain locked on undercount');
        $this->assertTrue($result1['is_undercount'], 'Result must be flagged as undercount');
        $this->assertEquals('STANDBY', $result1['status']);
        $this->assertEquals('approved', $transaction->fresh()->status, 'Transaction must NOT be closed prematurely');

        // Assert BOQ has not been withdrawn yet
        $boq = BoqItem::where('work_order_id', $this->workOrder->id)->where('item_id', $this->poleItem->id)->first();
        $this->assertEquals(0, $boq->withdrawn_qty);

        // Attempt 2: Worker backs up and rescans all 2 tags
        $result2 = $this->gateEngine->processGateEvent([
            'warehouse_id' => $this->warehouse->id,
            'gate_id' => 'GATE-01',
            'antenna_sequence' => 'A_TO_B',
            'epc_list' => [$this->tag1->epc, $this->tag2->epc],
            'gate_transaction_id' => $transaction->id,
        ], $this->device);

        // Assert Attempt 2 unlocks the gate and completes the transaction
        $this->assertTrue($result2['unlock_gate'], 'Gate must unlock when all tags pass');
        $this->assertFalse($result2['is_undercount']);
        $this->assertFalse($result2['mismatch']);
        $this->assertEquals('SUCCESS', $result2['status']);
        $this->assertEquals('completed', $transaction->fresh()->status, 'Transaction must now be completed');

        // Assert BOQ withdrawn quantity is now accurately updated to 2
        $boqFresh = BoqItem::where('work_order_id', $this->workOrder->id)->where('item_id', $this->poleItem->id)->first();
        $this->assertEquals(2, $boqFresh->withdrawn_qty);
    }

    public function test_pic_can_cancel_active_gate_transaction(): void
    {
        $transaction = GateTransaction::create([
            'transaction_number' => 'GTX-CANCEL-TEST',
            'work_order_id' => $this->workOrder->id,
            'warehouse_id' => $this->warehouse->id,
            'pic_user_id' => $this->pic->id,
            'type' => 'OUT_FULFILLMENT',
            'status' => 'approved',
            'valid_until' => Carbon::now()->addMinutes(60),
        ]);

        GateTransactionItem::create([
            'gate_transaction_id' => $transaction->id,
            'item_id' => $this->poleItem->id,
            'requested_qty' => 5,
            'passed_qty' => 0,
        ]);

        $response = $this->actingAs($this->pic, 'sanctum')->postJson("/api/gate/transactions/{$transaction->id}/cancel", [
            'reason' => 'Perubahan rencana muatan',
        ]);

        $response->assertStatus(200);
        $this->assertEquals('cancelled', $transaction->fresh()->status);
        $this->assertStringContainsString('Perubahan rencana muatan', $transaction->fresh()->notes);
    }

    public function test_expired_transaction_is_denied_without_reviving_validity(): void
    {
        $transaction = GateTransaction::create([
            'transaction_number' => 'GTX-EXPIRED', 'work_order_id' => $this->workOrder->id,
            'warehouse_id' => $this->warehouse->id, 'pic_user_id' => $this->pic->id,
            'type' => 'OUT_FULFILLMENT', 'status' => 'approved', 'valid_until' => now()->subMinute(),
        ]);
        GateTransactionItem::create(['gate_transaction_id' => $transaction->id, 'item_id' => $this->poleItem->id, 'requested_qty' => 1]);

        $result = $this->gateEngine->processGateEvent([
            'warehouse_id' => $this->warehouse->id, 'gate_id' => 'GATE-01', 'antenna_sequence' => 'A_TO_B',
            'epc_list' => [$this->tag1->epc], 'gate_transaction_id' => $transaction->id,
        ], $this->device);

        $this->assertFalse($result['unlock_gate']);
        $this->assertLessThan(now(), $transaction->fresh()->valid_until);
        $this->assertSame(0, BoqItem::where('work_order_id', $this->workOrder->id)->first()->withdrawn_qty);
    }

    public function test_rejected_event_epc_is_not_counted_by_later_batch(): void
    {
        $transaction = GateTransaction::create([
            'transaction_number' => 'GTX-REJECTED-EPC', 'work_order_id' => $this->workOrder->id,
            'warehouse_id' => $this->warehouse->id, 'pic_user_id' => $this->pic->id,
            'type' => 'OUT_FULFILLMENT', 'status' => 'approved', 'valid_until' => now()->addHour(),
        ]);
        GateTransactionItem::create(['gate_transaction_id' => $transaction->id, 'item_id' => $this->poleItem->id, 'requested_qty' => 2]);
        GatePassEvent::create(['gate_transaction_id' => $transaction->id, 'warehouse_id' => $this->warehouse->id,
            'gate_id' => 'GATE-01', 'direction' => 'OUT', 'antenna_sequence' => 'A_TO_B',
            'tag_epcs_json' => [$this->tag1->epc], 'total_tags_detected' => 1, 'is_valid' => false, 'mismatch_flag' => true]);

        $result = $this->gateEngine->processGateEvent([
            'warehouse_id' => $this->warehouse->id, 'gate_id' => 'GATE-01', 'antenna_sequence' => 'A_TO_B',
            'epc_list' => [$this->tag2->epc], 'gate_transaction_id' => $transaction->id,
        ], $this->device);

        $this->assertSame('STANDBY', $result['status']);
        $this->assertSame(1, $result['cumulative_tags_count']);
        $this->assertSame(0, BoqItem::where('work_order_id', $this->workOrder->id)->first()->withdrawn_qty);
    }

    public function test_device_scoped_event_replay_returns_stored_result_without_second_mutation(): void
    {
        $transaction = GateTransaction::create([
            'transaction_number' => 'GTX-IDEMPOTENT', 'work_order_id' => $this->workOrder->id,
            'warehouse_id' => $this->warehouse->id, 'pic_user_id' => $this->pic->id,
            'type' => 'OUT_FULFILLMENT', 'status' => 'approved', 'approved_at' => now()->subMinute(),
            'valid_until' => now()->addHour(),
        ]);
        GateTransactionItem::create(['gate_transaction_id' => $transaction->id, 'item_id' => $this->poleItem->id, 'requested_qty' => 1]);
        $payload = [
            'event_id' => '11111111-1111-4111-8111-111111111111', 'observed_at' => now()->toIso8601String(),
            'warehouse_id' => $this->warehouse->id, 'gate_id' => 'GATE-01', 'antenna_sequence' => 'A_TO_B',
            'epc_list' => [$this->tag1->epc], 'gate_transaction_id' => $transaction->id,
        ];

        $first = $this->gateEngine->processGateEvent($payload, $this->device);
        $replay = $this->gateEngine->processGateEvent($payload, $this->device);

        $this->assertTrue($first['unlock_gate']);
        $this->assertFalse($replay['unlock_gate']);
        $this->assertTrue($replay['idempotent_replay']);
        $this->assertSame(1, GatePassEvent::where('event_id', $payload['event_id'])->count());
        $this->assertSame(1, \App\Models\CustodyLedger::where('tag_epc', $this->tag1->epc)->where('action', 'GATE_OUT')->count());
        $this->assertSame(1, BoqItem::where('work_order_id', $this->workOrder->id)->first()->withdrawn_qty);
    }

    public function test_configured_mode_and_historical_authorization_fail_closed(): void
    {
        $this->warehouse->update(['gate_mode' => 'DUAL_ANTENNA_AUTO']);
        $this->expectException(\DomainException::class);
        $this->gateEngine->processGateEvent([
            'event_id' => '22222222-2222-4222-8222-222222222222', 'observed_at' => now()->toIso8601String(),
            'warehouse_id' => $this->warehouse->id, 'gate_id' => 'GATE-01',
            'antenna_sequence' => 'SINGLE_ANTENNA', 'direction' => 'OUT', 'epc_list' => [$this->tag1->epc],
        ], $this->device);
    }
}

