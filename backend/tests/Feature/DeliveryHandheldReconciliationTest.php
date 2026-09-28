<?php

namespace Tests\Feature;

use App\Models\Delivery;
use App\Models\Item;
use App\Models\Principal;
use App\Models\Project;
use App\Models\RfidTag;
use App\Models\Spk;
use App\Models\SpkItem;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\CustodyService;
use App\Services\GateEngineService;
use App\Services\QuotaValidatorService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DeliveryHandheldReconciliationTest extends TestCase
{
    use RefreshDatabase;

    protected User $procurementUser;
    protected User $storeroomUser;
    protected Spk $spk;
    protected Warehouse $warehouseDual;
    protected Warehouse $warehouseSingle;
    protected Item $poleItem;
    protected string $epc1 = 'E28011606000020410000001';
    protected string $epc2 = 'E28011606000020410000002';
    protected string $epc3 = 'E28011606000020410000003';

    protected function setUp(): void
    {
        parent::setUp();

        $this->procurementUser = User::create([
            'name' => 'Procurement Tester',
            'email' => 'procurement.test@mosa.id',
            'role' => 'procurement',
            'password' => bcrypt('password'),
        ]);

        $this->storeroomUser = User::create([
            'name' => 'Storeroom Tester',
            'email' => 'storeroom.test@mosa.id',
            'role' => 'storeroom',
            'password' => bcrypt('password'),
        ]);

        $principal = Principal::create(['name' => 'MyRepublic Test', 'code' => 'MYREP-T']);
        $project = Project::create(['principal_id' => $principal->id, 'code' => 'PRJ-T', 'name' => 'Project Test']);

        $this->warehouseDual = Warehouse::create([
            'project_id' => $project->id,
            'code' => 'WH-DUAL',
            'name' => 'Warehouse Dual Antenna',
            'gate_mode' => 'DUAL_ANTENNA_AUTO',
        ]);

        $this->warehouseSingle = Warehouse::create([
            'project_id' => $project->id,
            'code' => 'WH-SINGLE',
            'name' => 'Warehouse Single Antenna',
            'gate_mode' => 'SINGLE_ANTENNA_SESSION',
        ]);
        $this->storeroomUser->assignedWarehouses()->attach([$this->warehouseDual->id, $this->warehouseSingle->id]);

        $this->poleItem = Item::create([
            'code' => 'POLE-7M-T',
            'name' => 'Tiang 7M Test',
            'category' => 'pole',
            'unit' => 'pcs',
        ]);

        RfidTag::create(['epc' => $this->epc1, 'item_id' => $this->poleItem->id, 'tag_type' => 'anti_metal', 'status' => 'active']);
        RfidTag::create(['epc' => $this->epc2, 'item_id' => $this->poleItem->id, 'tag_type' => 'anti_metal', 'status' => 'active']);
        RfidTag::create(['epc' => $this->epc3, 'item_id' => $this->poleItem->id, 'tag_type' => 'anti_metal', 'status' => 'active']);

        $this->spk = Spk::create([
            'principal_id' => $principal->id,
            'project_id' => $project->id,
            'spk_number' => 'SPK-TEST-001',
            'title' => 'SPK Test Delivery',
            'total_amount' => 100000000,
        ]);

        SpkItem::create([
            'spk_id' => $this->spk->id,
            'item_id' => $this->poleItem->id,
            'target_qty' => 10,
            'price_per_unit' => 650000,
        ]);
    }

    public function test_enrollment_with_reader_warehouse_remains_dispatchable_for_all_allowed_users(): void
    {
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $this->poleItem->update(['is_serialized_tag' => true]);
        \App\Models\ApprovalRequest::create([
            'request_number' => 'APR-ENROLLMENT', 'module' => 'SPK',
            'reference_id' => $this->spk->id, 'reference_code' => $this->spk->spk_number,
            'title' => 'Approved enrollment dispatch', 'status' => 'approved',
            'requester_user_id' => $this->procurementUser->id,
        ]);
        $epcs = [];
        foreach (['superadmin', 'pm', 'procurement'] as $role) {
            $user = User::create([
                'name' => $role, 'email' => "enroll-{$role}@test.id",
                'role' => $role, 'password' => 'password',
            ]);
            Sanctum::actingAs($user);
            foreach (['epc', 'epc_list'] as $input) {
                $epc = strtoupper("ENROLL-{$role}-{$input}");
                $epcs[] = $epc;
                $this->postJson('/api/tags/enroll', [
                    'item_id' => $this->poleItem->id, 'warehouse_id' => $this->warehouseDual->id,
                    'tag_type' => 'anti_metal', $input => $input === 'epc' ? $epc : [$epc],
                ])->assertCreated()->assertJsonPath('tags.0.last_warehouse_id', null);
                $this->assertDatabaseHas('rfid_tags', ['epc' => $epc, 'status' => 'active', 'last_warehouse_id' => null]);
                $this->assertDatabaseHas('custody_ledger', [
                    'tag_epc' => $epc, 'action' => 'TAG_ENROLLED',
                    'holder_user_id' => $user->id, 'warehouse_id' => $this->warehouseDual->id,
                ]);
            }
        }
        Sanctum::actingAs($this->procurementUser);
        $this->assertDatabaseMissing('custody_ledger', ['action' => 'STOCK_IN']);
        $this->getJson('/api/reports/stocks?warehouse_id='.$this->warehouseDual->id)
            ->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/reports/stock-card?'.http_build_query([
            'warehouse_id' => $this->warehouseDual->id, 'item_id' => $this->poleItem->id,
            'date_from' => now()->toDateString(), 'date_to' => now()->toDateString(),
        ]))->assertOk()->assertJsonPath('opening_balance', 0)->assertJsonCount(0, 'movements.data');
        $this->getJson('/api/reports/audit-trail?action=TAG_ENROLLED')
            ->assertOk()->assertJsonCount(6, 'data');
        $response = $this->postJson('/api/deliveries/dispatch-scan', [
            'spk_id' => $this->spk->id, 'warehouse_id' => $this->warehouseDual->id,
            'delivery_number' => 'SJ-ENROLLED', 'dispatch_epcs' => $epcs,
            'items' => [['item_id' => $this->poleItem->id, 'delivered_qty' => count($epcs)]],
        ])->assertCreated()->assertJsonPath('delivery.reconciliation_status', 'in_transit');
        $this->assertDatabaseMissing('custody_ledger', ['action' => 'STOCK_IN']);
        Sanctum::actingAs($this->storeroomUser);
        $this->postJson('/api/deliveries/'.$response->json('delivery.id').'/receiving-scan', [
            'received_epcs' => $epcs,
        ])->assertOk()->assertJsonPath('reconciliation.status', 'matched');
        foreach ($epcs as $epc) {
            $this->assertDatabaseHas('rfid_tags', ['epc' => $epc, 'last_warehouse_id' => $this->warehouseDual->id]);
            $this->assertDatabaseHas('custody_ledger', [
                'tag_epc' => $epc, 'action' => 'STOCK_IN', 'holder_user_id' => $this->storeroomUser->id,
            ]);
        }
        $this->assertDatabaseCount('custody_ledger', 12);
    }

    public function test_handheld_1_dispatch_and_handheld_2_receiving_full_match(): void
    {
        // 1. Handheld 1 at Principal: Tagging and Dispatched Manifest
        Sanctum::actingAs($this->procurementUser);

        $dispatchResponse = $this->postJson('/api/deliveries/dispatch-scan', [
            'spk_id' => $this->spk->id,
            'warehouse_id' => $this->warehouseDual->id,
            'delivery_number' => 'SJ-TEST-MATCH-01',
            'dispatch_epcs' => [$this->epc1, $this->epc2],
            'items' => [
                ['item_id' => $this->poleItem->id, 'delivered_qty' => 2],
            ],
            'notes' => 'Loaded onto truck at Principal Yard',
        ]);

        $dispatchResponse->assertStatus(201);
        $deliveryId = $dispatchResponse->json('delivery.id');
        $this->assertDatabaseHas('deliveries', [
            'id' => $deliveryId,
            'reconciliation_status' => 'in_transit',
        ]);
        $this->assertNull(RfidTag::where('epc', $this->epc1)->value('last_warehouse_id'));

        // 2. Handheld 2 at Warehouse: Receiving Scan (Both 2 EPCs arrived)
        Sanctum::actingAs($this->storeroomUser);

        $receivingResponse = $this->postJson("/api/deliveries/{$deliveryId}/receiving-scan", [
            'received_epcs' => [$this->epc1, $this->epc2],
            'notes' => 'Unloaded at Warehouse bay',
        ]);

        $receivingResponse->assertStatus(200);
        $receivingResponse->assertJsonPath('reconciliation.status', 'matched');
        $receivingResponse->assertJsonPath('reconciliation.missing_in_transit_count', 0);
        $receivingResponse->assertJsonPath('delivery.status', 'approved');

        // Check custody ledger recorded
        $this->assertDatabaseHas('custody_ledger', [
            'tag_epc' => $this->epc1,
            'action' => 'STOCK_IN',
            'holder_user_id' => $this->storeroomUser->id,
        ]);
        $this->assertEquals($this->warehouseDual->id, RfidTag::where('epc', $this->epc1)->value('last_warehouse_id'));
        $this->assertEquals(2, SpkItem::where('spk_id', $this->spk->id)->value('received_qty'));

        $this->postJson("/api/deliveries/{$deliveryId}/receiving-scan", [
            'received_epcs' => [$this->epc1, $this->epc2],
        ])->assertStatus(409);
        $this->assertEquals(2, SpkItem::where('spk_id', $this->spk->id)->value('received_qty'));
        $this->assertDatabaseCount('custody_ledger', 2);
    }

    public function test_handheld_receiving_detects_in_transit_missing_shrinkage(): void
    {
        // 1. Dispatch 3 poles from Principal
        Sanctum::actingAs($this->procurementUser);

        $dispatchResponse = $this->postJson('/api/deliveries/dispatch-scan', [
            'spk_id' => $this->spk->id,
            'warehouse_id' => $this->warehouseDual->id,
            'delivery_number' => 'SJ-TEST-SHRINK-01',
            'dispatch_epcs' => [$this->epc1, $this->epc2, $this->epc3],
            'items' => [
                ['item_id' => $this->poleItem->id, 'delivered_qty' => 3],
            ],
            'proof_photo_url' => '/storage/dispatch-first.jpg',
            'document_url' => '/storage/dispatch-first.pdf',
        ]);

        $deliveryId = $dispatchResponse->json('delivery.id');

        // 2. Receiving scan at warehouse only found 2 poles (1 pole lost in transit)
        Sanctum::actingAs($this->storeroomUser);

        $receivingResponse = $this->postJson("/api/deliveries/{$deliveryId}/receiving-scan", [
            'received_epcs' => [$this->epc1, $this->epc2],
            'proof_photo_url' => '/storage/receiving-first.jpg',
            'document_url' => '/storage/receiving-first.pdf',
        ]);

        $receivingResponse->assertStatus(200);
        $receivingResponse->assertJsonPath('reconciliation.status', 'mismatch_shortage');
        $receivingResponse->assertJsonPath('reconciliation.missing_in_transit_count', 1);
        $receivingResponse->assertJsonPath('reconciliation.missing_epcs.0', $this->epc3);
        $receivingResponse->assertJsonPath('delivery.status', 'mismatch_flagged');

        // Verify Approval Request is created in pending state
        $approvalReq = \App\Models\ApprovalRequest::where('module', 'DELIVERY')
            ->where('reference_id', $deliveryId)
            ->first();
        $this->assertNotNull($approvalReq);
        $this->assertEquals('pending', $approvalReq->status);
        $this->assertDatabaseHas('deliveries', [
            'id' => $deliveryId,
            'proof_photo_url' => '/storage/dispatch-first.jpg',
            'document_url' => '/storage/dispatch-first.pdf',
            'receiving_proof_photo_url' => '/storage/receiving-first.jpg',
            'receiving_document_url' => '/storage/receiving-first.pdf',
        ]);

        $this->postJson("/api/deliveries/{$deliveryId}/receiving-scan", [
            'received_epcs' => [$this->epc1, $this->epc2],
            'proof_photo_url' => '/storage/replacement.jpg',
        ])->assertStatus(409)->assertJsonPath('message', 'Lampiran receiving yang telah disubmit tidak dapat diganti.');

        // 3. Storeroom re-scans finding all 3 poles (Full Match)
        $rescanResponse = $this->postJson("/api/deliveries/{$deliveryId}/receiving-scan", [
            'received_epcs' => [$this->epc1, $this->epc2, $this->epc3],
        ]);

        $rescanResponse->assertStatus(200);
        $rescanResponse->assertJsonPath('reconciliation.status', 'matched');
        $rescanResponse->assertJsonPath('delivery.status', 'approved');

        // Verify previous Approval Request was auto-resolved
        $approvalReq->refresh();
        $this->assertEquals('approved', $approvalReq->status);
        $this->assertStringContainsString('Terselesaikan Otomatis', $approvalReq->title);
    }

    public function test_single_antenna_mode_processes_explicit_session_direction(): void
    {
        $gateEngine = new GateEngineService(new CustodyService(), new QuotaValidatorService());
        $device = \App\Models\GateDevice::create([
            'warehouse_id' => $this->warehouseSingle->id,
            'device_code' => 'GATE-01',
            'device_name' => 'Single Gate',
            'device_model' => 'TEST',
            'is_active' => true,
        ]);

        $workOrder = \App\Models\WorkOrder::create([
            'project_id' => $this->warehouseSingle->project_id,
            'warehouse_id' => $this->warehouseSingle->id,
            'pm_user_id' => $this->procurementUser->id,
            'wo_number' => 'WO-SINGLE-DIRECTION',
            'title' => 'Single antenna direction test',
            'status' => 'approved',
        ]);
        \App\Models\BoqItem::create([
            'work_order_id' => $workOrder->id,
            'item_id' => $this->poleItem->id,
            'quota_qty' => 1,
            'prepared_qty' => 1,
        ]);
        $transaction = \App\Models\GateTransaction::create([
            'transaction_number' => 'GTX-SINGLE-DIRECTION',
            'work_order_id' => $workOrder->id,
            'warehouse_id' => $this->warehouseSingle->id,
            'pic_user_id' => $this->storeroomUser->id,
            'type' => 'OUT_FULFILLMENT',
            'status' => 'approved',
            'approved_at' => now()->subMinute(),
            'valid_until' => now()->addHour(),
        ]);
        \App\Models\GateTransactionItem::create([
            'gate_transaction_id' => $transaction->id,
            'item_id' => $this->poleItem->id,
            'requested_qty' => 1,
        ]);
        RfidTag::where('epc', $this->epc1)->update(['last_warehouse_id' => $this->warehouseSingle->id]);

        // Client direction is untrusted; single-antenna direction comes from the identified session type.
        $result = $gateEngine->processGateEvent([
            'warehouse_id' => $this->warehouseSingle->id,
            'gate_id' => 'GATE-01',
            'antenna_sequence' => 'SINGLE_ANTENNA',
            'direction' => 'IN',
            'gate_transaction_id' => $transaction->id,
            'epc_list' => [$this->epc1],
        ], $device);

        $this->assertEquals('OUT', $result['direction']);
        $this->assertTrue($result['unlock_gate']);
        $this->assertEquals(1, $result['total_tags']);
    }
}
