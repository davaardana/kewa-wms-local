<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\GateDevice;
use App\Models\GatePassEvent;
use App\Models\Project;
use App\Models\RfidTag;
use App\Models\ShippingDocument;
use App\Models\ShippingDocumentItem;
use App\Models\ShippingDocumentTag;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\CustodyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RfidTagMutationHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_custody_rejects_invalid_action_reference_and_epc_item(): void
    {
        $user = User::create(['name' => 'Admin', 'email' => 'custody-admin@test.id', 'role' => 'superadmin', 'password' => 'password']);
        $item = Item::create(['name' => 'Pole', 'code' => 'CUST-POLE', 'category' => 'pole', 'unit' => 'pcs']);
        $other = Item::create(['name' => 'Cable', 'code' => 'CUST-CABLE', 'category' => 'cable', 'unit' => 'm']);
        RfidTag::create(['epc' => 'CUST-EPC', 'item_id' => $item->id, 'status' => 'active']);
        $service = app(CustodyService::class);

        foreach ([
            fn () => $service->recordEvent($item->id, $user->id, 'UNKNOWN'),
            fn () => $service->recordEvent($item->id, $user->id, 'GATE_OUT'),
            fn () => $service->recordEvent($other->id, $user->id, 'AUDIT_OPNAME', 'CUST-EPC'),
            fn () => $service->recordEvent($item->id, $user->id, 'AUDIT_OPNAME', 'MISSING-EPC'),
            fn () => $service->recordEvent($item->id, $user->id, 'PREPARED', null, \App\Models\WorkOrder::class),
        ] as $operation) {
            try {
                $operation();
                $this->fail('Expected DomainException.');
            } catch (\DomainException) {
                $this->assertDatabaseCount('custody_ledger', 0);
            }
        }
    }

    public function test_stock_opname_normalizes_and_deduplicates_epcs_without_mutating_stock_or_ledger(): void
    {
        $suffix = uniqid();
        $user = User::create(['name' => 'Auditor', 'email' => "opname-auditor-$suffix@test.id", 'role' => 'management', 'password' => 'password']);
        $project = Project::create(['code' => "OPNAME-PROJECT-$suffix", 'name' => 'Opname Project']);
        $warehouse = Warehouse::create(['project_id' => $project->id, 'code' => "OPNAME-WH-$suffix", 'name' => 'Opname Warehouse']);
        $item = Item::create(['name' => 'Opname Pole', 'code' => "OPNAME-POLE-$suffix", 'category' => 'pole', 'unit' => 'pcs']);
        $matchedEpc = strtoupper("OPNAME-A-$suffix");
        $missingEpc = strtoupper("OPNAME-B-$suffix");
        $matchedTag = RfidTag::create(['epc' => $matchedEpc, 'item_id' => $item->id, 'status' => 'active', 'last_warehouse_id' => $warehouse->id]);
        $missingTag = RfidTag::create(['epc' => $missingEpc, 'item_id' => $item->id, 'status' => 'active', 'last_warehouse_id' => $warehouse->id]);
        $ledgerCountBeforeRequest = \App\Models\CustodyLedger::count();
        Sanctum::actingAs($user);

        $this->postJson('/api/reports/stock-opname', [
            'warehouse_id' => $warehouse->id,
            'scanned_epcs' => [" $matchedEpc ", strtoupper($matchedEpc), strtoupper("OPNAME-FOREIGN-$suffix")],
        ])
            ->assertOk()
            ->assertJsonPath('total_system_expected', 2)
            ->assertJsonPath('total_physically_scanned', 2)
            ->assertJsonPath('matched_count', 1)
            ->assertJsonPath('missing_count', 1)
            ->assertJsonPath('unexpected_count', 1)
            ->assertJsonPath('missing_epcs.0', $missingEpc)
            ->assertJsonPath('unexpected_epcs.0', strtoupper("OPNAME-FOREIGN-$suffix"));

        $this->assertSame('active', $matchedTag->fresh()->status);
        $this->assertSame($warehouse->id, $matchedTag->fresh()->last_warehouse_id);
        $this->assertSame('active', $missingTag->fresh()->status);
        $this->assertSame($warehouse->id, $missingTag->fresh()->last_warehouse_id);
        $this->assertSame($ledgerCountBeforeRequest, \App\Models\CustodyLedger::count());
    }

    public function test_bulk_decommission_is_all_or_nothing_and_transitions_are_guarded(): void
    {
        $admin = User::create(['name' => 'Admin', 'email' => 'tag-admin@test.id', 'role' => 'superadmin', 'password' => 'password']);
        $item = Item::create(['name' => 'Pole', 'code' => 'TAG-POLE', 'category' => 'pole', 'unit' => 'pcs']);
        $tag = RfidTag::create(['epc' => 'TAG-ONE', 'item_id' => $item->id, 'status' => 'active']);
        Sanctum::actingAs($admin);

        $this->postJson('/api/tags/bulk-delete', ['epcs' => ['TAG-ONE', 'MISSING']])->assertStatus(422);
        $this->assertSame('active', $tag->fresh()->status);
        $this->assertDatabaseCount('custody_ledger', 0);

        $this->postJson('/api/tags/TAG-ONE/reactivate')->assertStatus(409);
        $this->deleteJson('/api/tags/TAG-ONE')->assertOk();
        $this->deleteJson('/api/tags/TAG-ONE')->assertStatus(409);
        $this->postJson('/api/tags/TAG-ONE/reactivate')->assertOk();
        $this->assertSame('active', $tag->fresh()->status);
        $this->assertDatabaseCount('custody_ledger', 2);
    }

    public function test_hard_delete_preserves_lifecycle_ledger_but_blocks_operational_custody(): void
    {
        $admin = User::create(['name' => 'Admin', 'email' => 'hard-delete-admin@test.id', 'role' => 'superadmin', 'password' => 'password']);
        $pm = User::create(['name' => 'PM', 'email' => 'hard-delete-pm@test.id', 'role' => 'pm', 'password' => 'password']);
        $item = Item::create(['name' => 'Pole', 'code' => 'HARD-DELETE-POLE', 'category' => 'pole', 'unit' => 'pcs']);
        $lifecycleTag = RfidTag::create(['epc' => 'HARD-DELETE-LIFECYCLE', 'item_id' => $item->id, 'status' => 'decommissioned']);
        app(CustodyService::class)->recordEvent(
            itemId: $item->id,
            holderUserId: $admin->id,
            action: 'TAG_ENROLLED',
            tagEpc: $lifecycleTag->epc,
        );
        app(CustodyService::class)->recordEvent(
            itemId: $item->id,
            holderUserId: $admin->id,
            action: 'TAG_DECOMMISSIONED',
            tagEpc: $lifecycleTag->epc,
        );
        $operatedTag = RfidTag::create(['epc' => 'HARD-DELETE-OPERATED', 'item_id' => $item->id, 'status' => 'active']);
        app(CustodyService::class)->recordEvent(
            itemId: $item->id,
            holderUserId: $admin->id,
            action: 'AUDIT_OPNAME',
            tagEpc: $operatedTag->epc,
        );
        Sanctum::actingAs($pm);
        $this->deleteJson("/api/tags/{$lifecycleTag->epc}/hard-delete")->assertForbidden();
        $this->assertDatabaseHas('rfid_tags', ['epc' => $lifecycleTag->epc]);

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/tags/{$lifecycleTag->epc}/hard-delete")
            ->assertOk();
        $this->assertDatabaseMissing('rfid_tags', ['epc' => $lifecycleTag->epc]);
        $this->assertDatabaseHas('custody_ledger', ['tag_epc' => $lifecycleTag->epc, 'action' => 'TAG_ENROLLED']);
        $this->assertDatabaseHas('custody_ledger', ['tag_epc' => $lifecycleTag->epc, 'action' => 'TAG_DECOMMISSIONED']);

        $this->deleteJson("/api/tags/{$operatedTag->epc}/hard-delete")
            ->assertStatus(409);
        $this->assertDatabaseHas('rfid_tags', ['epc' => $operatedTag->epc]);
        $this->assertDatabaseHas('custody_ledger', ['tag_epc' => $operatedTag->epc, 'action' => 'AUDIT_OPNAME']);
    }

    public function test_hard_delete_of_decommissioned_stock_tag_posts_write_off_before_removing_registry_row(): void
    {
        $admin = User::create(['name' => 'Admin', 'email' => 'hard-delete-stock-admin@test.id', 'role' => 'superadmin', 'password' => 'password']);
        $project = Project::create(['code' => 'HARD-DELETE-STOCK', 'name' => 'Hard Delete Stock']);
        $warehouse = Warehouse::create(['project_id' => $project->id, 'code' => 'HD-STOCK', 'name' => 'Hard Delete Stock']);
        $item = Item::create(['name' => 'Stocked Pole', 'code' => 'HARD-DELETE-STOCK-POLE', 'category' => 'pole', 'unit' => 'pcs', 'is_serialized_tag' => true]);
        $tag = RfidTag::create([
            'epc' => 'HARD-DELETE-STOCK-EPC',
            'item_id' => $item->id,
            'status' => 'active',
        ]);
        app(CustodyService::class)->recordEvent(
            itemId: $item->id,
            holderUserId: $admin->id,
            action: 'STOCK_IN',
            tagEpc: $tag->epc,
            warehouseId: $warehouse->id,
        );
        app(CustodyService::class)->recordEvent(
            itemId: $item->id,
            holderUserId: $admin->id,
            action: 'TAG_DECOMMISSIONED',
            tagEpc: $tag->epc,
            warehouseId: $warehouse->id,
        );
        $tag->update(['status' => 'decommissioned']);
        Sanctum::actingAs($admin);

        $this->deleteJson("/api/tags/{$tag->epc}/hard-delete")
            ->assertOk();

        $this->assertDatabaseMissing('rfid_tags', ['epc' => $tag->epc]);
        $this->assertDatabaseHas('custody_ledger', [
            'tag_epc' => $tag->epc,
            'action' => 'STOCK_WRITE_OFF',
            'warehouse_id' => $warehouse->id,
        ]);
        $this->assertDatabaseHas('custody_ledger', ['tag_epc' => $tag->epc, 'action' => 'TAG_DECOMMISSIONED']);
        $this->getJson('/api/reports/stocks?warehouse_id='.$warehouse->id)
            ->assertOk()
            ->assertJsonCount(0, 'data');
        $this->getJson('/api/reports/stock-card?warehouse_id='.$warehouse->id.'&item_id='.$item->id.'&date_from='.today()->toDateString().'&date_to='.today()->toDateString())
            ->assertOk()
            ->assertJsonCount(2, 'movements.data')
            ->assertJsonPath('movements.data.1.action', 'STOCK_WRITE_OFF')
            ->assertJsonPath('movements.data.1.direction', 'WRITE_OFF')
            ->assertJsonPath('movements.data.1.qty_out', 1)
            ->assertJsonPath('movements.data.1.running_balance', 0);
    }

    public function test_tag_listing_supports_bounded_pagination_and_stock_filters(): void
    {
        $user = User::create(['name' => 'Auditor', 'email' => 'tag-list-auditor@test.id', 'role' => 'management', 'password' => 'password']);
        $project = Project::create(['code' => 'TAG-LIST-PROJECT', 'name' => 'Tag List Project']);
        $warehouse = Warehouse::create(['project_id' => $project->id, 'code' => 'TAG-LIST-WH', 'name' => 'Tag List Warehouse']);
        $item = Item::create(['name' => 'Tag List Item', 'code' => 'TAG-LIST-ITEM', 'category' => 'pole', 'unit' => 'pcs']);
        foreach ([['A', 'active'], ['B', 'active'], ['C', 'lost'], ['D', 'decommissioned']] as [$epc, $status]) {
            RfidTag::create([
                'epc' => "TAG-LIST-$epc",
                'item_id' => $item->id,
                'status' => $status,
                'last_warehouse_id' => $warehouse->id,
            ]);
        }

        Sanctum::actingAs($user);
        $this->getJson('/api/tags?item_id='.$item->id.'&warehouse_id='.$warehouse->id.'&status=active&per_page=1')
            ->assertOk()
            ->assertJsonPath('per_page', 1)
            ->assertJsonPath('total', 2)
            ->assertJsonCount(1, 'data');

        $this->getJson('/api/tags?search=tag-list-b&per_page=10')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.epc', 'TAG-LIST-B');

        $this->getJson('/api/tags?warehouse_id='.$warehouse->id.'&status_not=decommissioned&per_page=10')
            ->assertOk()
            ->assertJsonPath('total', 3);

        $this->getJson('/api/tags?per_page=101')->assertUnprocessable();
    }

    public function test_hard_delete_preserves_terminal_document_gate_and_custody_history(): void
    {
        $admin = User::create(['name' => 'Admin', 'email' => 'hard-delete-refs-admin@test.id', 'role' => 'superadmin', 'password' => 'password']);
        $creator = User::create(['name' => 'PM', 'email' => 'hard-delete-refs-pm@test.id', 'role' => 'pm', 'password' => 'password']);
        $item = Item::create(['name' => 'Pole', 'code' => 'HARD-DELETE-REFS-POLE', 'category' => 'pole', 'unit' => 'pcs']);
        $project = Project::create(['code' => 'HARD-DELETE-REFS', 'name' => 'Hard Delete Refs']);
        $warehouse = Warehouse::create(['project_id' => $project->id, 'code' => 'HARD-DELETE-REFS', 'name' => 'Hard Delete Refs']);
        $document = ShippingDocument::create([
            'document_number' => 'DOC-HARD-DELETE-REFS',
            'type' => 'outbound',
            'status' => 'draft',
            'created_by_user_id' => $creator->id,
            'warehouse_id' => $warehouse->id,
        ]);
        $documentItem = ShippingDocumentItem::create([
            'shipping_document_id' => $document->id,
            'item_id' => $item->id,
            'expected_qty' => 1,
        ]);
        $assignedTag = RfidTag::create(['epc' => 'HARD-DELETE-ASSIGNED', 'item_id' => $item->id, 'status' => 'decommissioned']);
        ShippingDocumentTag::create([
            'shipping_document_id' => $document->id,
            'shipping_document_item_id' => $documentItem->id,
            'rfid_tag_id' => $assignedTag->id,
            'tag_epc' => $assignedTag->epc,
        ]);

        $eventTag = RfidTag::create(['epc' => 'HARD-DELETE-GATE-EVENT', 'item_id' => $item->id, 'status' => 'decommissioned']);
        $device = GateDevice::create([
            'warehouse_id' => $warehouse->id,
            'device_code' => 'HARD-DELETE-GATE',
            'device_name' => 'Hard Delete Gate',
            'device_model' => 'TEST',
            'is_active' => true,
        ]);
        GatePassEvent::create([
            'gate_device_id' => $device->id,
            'event_id' => '2595a2bb-71f0-42e0-ae02-a303d5351760',
            'observed_at' => now(),
            'warehouse_id' => $warehouse->id,
            'gate_id' => $device->device_code,
            'direction' => 'OUT',
            'antenna_sequence' => 'A_TO_B',
            'tag_epcs_json' => [$eventTag->epc],
            'total_tags_detected' => 1,
        ]);
        foreach ([$assignedTag, $eventTag] as $tag) {
            app(CustodyService::class)->recordEvent(
                itemId: $item->id,
                holderUserId: $admin->id,
                action: 'TAG_DECOMMISSIONED',
                tagEpc: $tag->epc,
            );
        }
        Sanctum::actingAs($admin);

        $this->deleteJson("/api/tags/{$assignedTag->epc}/hard-delete")->assertStatus(409);
        $this->assertDatabaseHas('rfid_tags', ['epc' => $assignedTag->epc]);

        $document->update(['status' => 'completed']);
        $this->deleteJson("/api/tags/{$assignedTag->epc}/hard-delete")->assertOk();
        $this->deleteJson("/api/tags/{$eventTag->epc}/hard-delete")->assertOk();

        $this->assertDatabaseMissing('rfid_tags', ['epc' => $assignedTag->epc]);
        $this->assertDatabaseMissing('rfid_tags', ['epc' => $eventTag->epc]);
        $this->assertDatabaseHas('shipping_document_tags', [
            'rfid_tag_id' => null,
            'tag_epc' => $assignedTag->epc,
        ]);
        $this->assertDatabaseHas('gate_pass_events', [
            'gate_device_id' => $device->id,
            'tag_epcs_json' => json_encode([$eventTag->epc]),
        ]);
        $this->assertDatabaseHas('custody_ledger', ['tag_epc' => $assignedTag->epc, 'action' => 'TAG_DECOMMISSIONED']);
        $this->assertDatabaseHas('custody_ledger', ['tag_epc' => $eventTag->epc, 'action' => 'TAG_DECOMMISSIONED']);
    }
}
