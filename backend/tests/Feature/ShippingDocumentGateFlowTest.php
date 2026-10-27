<?php

namespace Tests\Feature;

use App\Models\CustodyLedger;
use App\Models\GateDevice;
use App\Models\GatePassEvent;
use App\Models\Item;
use App\Models\Project;
use App\Models\RfidTag;
use App\Models\ShippingDocument;
use App\Models\ShippingDocumentAudit;
use App\Models\ShippingDocumentItem;
use App\Models\ShippingDocumentTag;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\CustodyService;
use App\Services\GateEngineService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class ShippingDocumentGateFlowTest extends TestCase
{
    use RefreshDatabase;

    private GateEngineService $gateEngine;
    private User $pic;
    private User $pm;
    private User $superadmin;
    private Warehouse $warehouse;
    private Item $item;
    private GateDevice $device;

    protected function setUp(): void
    {
        parent::setUp();
        $this->gateEngine = new GateEngineService(new CustodyService());
        $this->pic = User::create([
            'name' => 'Field PIC',
            'email' => 'shipping-pic@example.test',
            'role' => 'pic_lapangan',
            'password' => bcrypt('password'),
        ]);
        $this->superadmin = User::create([
            'name' => 'Superadmin',
            'email' => 'shipping-superadmin@example.test',
            'role' => 'superadmin',
            'password' => bcrypt('password'),
        ]);
        $this->pm = User::create([
            'name' => 'Project Manager',
            'email' => 'shipping-pm@example.test',
            'role' => 'pm',
            'password' => bcrypt('password'),
        ]);
        $project = Project::create(['code' => 'SHIP-TEST', 'name' => 'Shipping Test']);
        $this->warehouse = Warehouse::create([
            'project_id' => $project->id,
            'code' => 'SHIP-WH',
            'name' => 'Shipping Warehouse',
            'gate_mode' => 'DUAL_ANTENNA_AUTO',
        ]);
        $this->device = GateDevice::create([
            'warehouse_id' => $this->warehouse->id,
            'device_code' => 'SHIP-GATE',
            'device_name' => 'Shipping Test Gate',
            'device_model' => 'TEST',
            'is_active' => true,
        ]);
        $this->item = Item::create([
            'code' => 'SHIP-ITEM',
            'name' => 'Serialized Test Item',
            'category' => 'hardware',
            'unit' => 'pcs',
            'is_serialized_tag' => true,
        ]);
    }

    public function test_outbound_gate_requires_exact_assigned_epcs_and_rejects_duplicate_pass(): void
    {
        [$document, $documentItem] = $this->makeDocument('outbound', 1);
        $assigned = $this->makeTag('EPC-OUT-ASSIGNED', $this->warehouse);
        $notAssigned = $this->makeTag('EPC-OUT-OTHER', $this->warehouse);
        $this->assign($document, $documentItem, $assigned);

        $denied = $this->sendPass($document, [$notAssigned->epc], 'A_TO_B');
        $this->assertFalse($denied['unlock_gate']);
        $this->assertSame('DENIED', $denied['status']);
        $this->assertSame($document->id, $denied['shipping_document_id']);
        $this->assertStringContainsString('tidak di-assign', implode(' ', $denied['mismatch_details']));
        $this->assertSame('expected', $document->tags()->first()->status);
        $this->assertSame(0, CustodyLedger::where('action', 'GATE_OUT')->count());

        $approved = $this->sendPass($document, [$assigned->epc], 'A_TO_B');
        $this->assertTrue($approved['unlock_gate']);
        $this->assertSame(1, $document->tags()->where('status', 'scanned')->count());
        $this->assertNull($assigned->fresh()->last_warehouse_id);
        $this->assertSame(1, CustodyLedger::where('action', 'GATE_OUT')->count());

        $replayAsNewEvent = $this->sendPass($document, [$assigned->epc], 'A_TO_B');
        $this->assertFalse($replayAsNewEvent['unlock_gate']);
        $this->assertSame(1, CustodyLedger::where('action', 'GATE_OUT')->count());
    }

    public function test_gate_auto_matches_in_progress_outbound_document_without_document_id(): void
    {
        [$document, $documentItem] = $this->makeDocument('outbound', 1);
        $tag = $this->makeTag('EPC-OUT-AUTO-MATCH', $this->warehouse);
        $this->assign($document, $documentItem, $tag);

        $result = $this->sendPass($document, [$tag->epc], 'A_TO_B', includeDocumentId: false);

        $this->assertTrue($result['unlock_gate']);
        $this->assertSame($document->id, $result['shipping_document_id']);
        $this->assertSame('scanned', $document->tags()->first()->status);
    }

    public function test_gate_recovers_from_stale_document_id_when_epc_matches_one_active_document(): void
    {
        [$document, $documentItem] = $this->makeDocument('outbound', 1);
        $tag = $this->makeTag('EPC-OUT-STALE-DOCUMENT', $this->warehouse);
        $this->assign($document, $documentItem, $tag);

        $result = $this->sendPass($document, [$tag->epc], 'A_TO_B', shippingDocumentId: 999999);

        $this->assertTrue($result['unlock_gate']);
        $this->assertSame($document->id, $result['shipping_document_id']);
        $this->assertSame('scanned', $document->tags()->first()->status);
    }

    public function test_gate_fails_closed_when_epcs_match_multiple_active_documents(): void
    {
        [$firstDocument, $firstItem] = $this->makeDocument('outbound', 1);
        [$secondDocument, $secondItem] = $this->makeDocument('outbound', 1);
        $firstTag = $this->makeTag('EPC-OUT-AMBIGUOUS-ONE', $this->warehouse);
        $secondTag = $this->makeTag('EPC-OUT-AMBIGUOUS-TWO', $this->warehouse);
        $this->assign($firstDocument, $firstItem, $firstTag);
        $this->assign($secondDocument, $secondItem, $secondTag);

        $result = $this->sendPass($firstDocument, [$firstTag->epc, $secondTag->epc], 'A_TO_B', includeDocumentId: false);

        $this->assertFalse($result['unlock_gate']);
        $this->assertSame('DENIED', $result['status']);
        $this->assertNull($result['shipping_document_id']);
        $this->assertSame(0, CustodyLedger::where('action', 'GATE_OUT')->count());
    }

    public function test_device_config_only_authorizes_a_unique_document_for_single_antenna_sessions(): void
    {
        $creator = User::create([
            'name' => 'Config PM',
            'email' => 'shipping-config-pm@example.test',
            'role' => 'pm',
            'password' => bcrypt('password'),
        ]);
        $document = ShippingDocument::create([
            'document_number' => 'DOC-CONFIG-OUT-001',
            'type' => 'outbound',
            'status' => 'in_progress',
            'created_by_user_id' => $creator->id,
            'warehouse_id' => $this->warehouse->id,
        ]);
        $token = 'shipping-gate-config-token-123456';
        $this->device->update(['api_token_hash' => hash('sha256', $token)]);

        $this->withToken($token)->getJson('/api/devices/config')
            ->assertOk()
            ->assertJsonPath('authorized_document', null);

        $this->warehouse->update(['gate_mode' => 'SINGLE_ANTENNA_SESSION']);
        $this->withToken($token)->getJson('/api/devices/config')
            ->assertOk()
            ->assertJsonPath('authorized_document.id', $document->id);

        $queuedDocument = ShippingDocument::create([
            'document_number' => 'DOC-CONFIG-OUT-002',
            'type' => 'outbound',
            'status' => 'approved',
            'created_by_user_id' => $creator->id,
            'warehouse_id' => $this->warehouse->id,
        ]);

        $this->withToken($token)->getJson('/api/devices/config')
            ->assertOk()
            ->assertJsonPath('authorized_document.id', $document->id);

        $queuedDocument->update(['status' => 'in_progress']);
        $this->withToken($token)->getJson('/api/devices/config')
            ->assertOk()
            ->assertJsonPath('authorized_document', null);
    }

    public function test_single_antenna_inbound_gate_infers_direction_from_active_document_when_edge_omits_it(): void
    {
        [$document, $documentItem] = $this->makeDocument('inbound', 1);
        $this->warehouse->update(['gate_mode' => 'SINGLE_ANTENNA_SESSION']);
        $tag = $this->makeTag('EPC-IN-SINGLE-ANTENNA', null);
        $this->assign($document, $documentItem, $tag);

        $payload = [
            'event_id' => (string) Str::uuid(),
            'observed_at' => now()->toIso8601String(),
            'warehouse_id' => $this->warehouse->id,
            'gate_id' => $this->device->device_code,
            'antenna_sequence' => 'SINGLE_ANTENNA',
            'shipping_document_id' => $document->id,
            'epc_list' => [$tag->epc],
        ];
        $result = $this->gateEngine->processGateEvent($payload, $this->device);

        $this->assertTrue($result['unlock_gate']);
        $this->assertSame('IN', $result['direction']);
        $this->assertSame($document->id, $result['shipping_document_id']);
        $this->assertSame('scanned', $document->tags()->first()->status);
    }

    public function test_clean_standby_batches_accumulate_until_exact_manifest_passes(): void
    {
        [$document, $documentItem] = $this->makeDocument('outbound', 2);
        $tagOne = $this->makeTag('EPC-OUT-ONE', $this->warehouse);
        $tagTwo = $this->makeTag('EPC-OUT-TWO', $this->warehouse);
        $this->assign($document, $documentItem, $tagOne);
        $this->assign($document, $documentItem, $tagTwo);

        $standby = $this->sendPass($document, [$tagOne->epc], 'A_TO_B', includeDocumentId: false);
        $this->assertSame('STANDBY', $standby['status']);
        $this->assertFalse($standby['unlock_gate']);
        $this->assertSame(0, $document->tags()->where('status', 'scanned')->count());
        $this->assertSame(0, CustodyLedger::where('action', 'GATE_OUT')->count());

        $approved = $this->sendPass($document, [$tagTwo->epc], 'A_TO_B', includeDocumentId: false);
        $this->assertTrue($approved['unlock_gate']);
        $this->assertSame(2, $document->tags()->where('status', 'scanned')->count());
        $this->assertSame(2, CustodyLedger::where('action', 'GATE_OUT')->count());
    }

    public function test_inbound_gate_pass_posts_stock_only_when_document_is_completed(): void
    {
        [$document, $documentItem] = $this->makeDocument('inbound', 1);
        $document->update(['created_by_user_id' => $this->pm->id]);
        $tag = $this->makeTag('EPC-IN-NEW', null);
        $this->assign($document, $documentItem, $tag);

        $approved = $this->sendPass($document, [$tag->epc], 'B_TO_A');
        $this->assertTrue($approved['unlock_gate']);
        $this->assertSame('attached', $tag->fresh()->status);
        $this->assertSame(0, CustodyLedger::where('action', 'STOCK_IN')->count());

        $this->actingAs($this->pic, 'sanctum')
            ->postJson("/api/shipping-documents/{$document->id}/complete")
            ->assertOk()
            ->assertJsonPath('document.status', 'completed');

        $this->assertSame('attached', $tag->fresh()->status); // STOCK_IN menyimpan tag di gudang → status 'attached'
        $this->assertSame($this->warehouse->id, $tag->fresh()->last_warehouse_id);
        $this->assertDatabaseHas('custody_ledger', [
            'action'   => 'STOCK_IN',
            'tag_epc'  => $tag->epc,
            'holder_user_id' => $this->pic->id,
            'ref_id' => $document->id,
        ]);
    }

    public function test_manual_scan_endpoint_cannot_advance_progress(): void
    {
        [$document, $documentItem] = $this->makeDocument('outbound', 1);
        $tag = $this->makeTag('EPC-MANUAL-TEST', $this->warehouse);
        $this->assign($document, $documentItem, $tag);

        $this->actingAs($this->pic, 'sanctum')
            ->postJson("/api/shipping-documents/{$document->id}/scan-tag", ['epc' => $tag->epc])
            ->assertUnprocessable();

        $this->assertSame('expected', $document->tags()->first()->status);
    }

    public function test_outbound_assignment_rejects_excess_tags_for_an_item(): void
    {
        [$document, $documentItem] = $this->makeDocument('outbound', 1);
        $document->update(['status' => 'approved']);
        $first = $this->makeTag('E280689400004035E3459CAA', $this->warehouse);
        $extra = $this->makeTag('E280689400004035E3459CAB', $this->warehouse);

        $this->actingAs($this->pic, 'sanctum')
            ->postJson("/api/shipping-documents/{$document->id}/assign-tags", [
                'tags' => [
                    ['epc' => $first->epc, 'document_item_id' => $documentItem->id],
                    ['epc' => $extra->epc, 'document_item_id' => $documentItem->id],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('assigned', [$first->epc])
            ->assertJsonPath('errors.0', "Jumlah tag untuk item {$this->item->id} sudah mencapai target 1.");

        $this->assertSame(1, $document->tags()->count());
        $this->assertSame('in_progress', $document->fresh()->status);
    }

    public function test_inbound_assignment_explains_when_tag_is_already_stocked_in_the_warehouse(): void
    {
        [$document, $documentItem] = $this->makeDocument('inbound', 1);
        $tag = $this->makeTag('E280689400005035E342C0AB', $this->warehouse);

        $this->actingAs($this->pic, 'sanctum')
            ->postJson("/api/shipping-documents/{$document->id}/assign-tags", [
                'tags' => [['epc' => $tag->epc, 'document_item_id' => $documentItem->id]],
            ])
            ->assertOk()
            ->assertJsonPath('assigned', [])
            ->assertJsonPath('errors.0', "Tag EPC {$tag->epc} sudah tercatat sebagai stok di gudang ini. Gunakan dokumen Barang Keluar; mengarsipkan dokumen lama tidak mengubah lokasi stok.");

        $this->assertSame(0, $document->tags()->count());
        $this->assertSame($this->warehouse->id, $tag->fresh()->last_warehouse_id);
    }

    public function test_superadmin_can_reconcile_legacy_inbound_stock_only_with_full_valid_gate_evidence(): void
    {
        [$document, $documentItem] = $this->makeDocument('inbound', 1);
        $tag = $this->makeTag('E280689400004035E3459CAD', null);
        $this->assign($document, $documentItem, $tag);
        $this->assertTrue($this->sendPass($document, [$tag->epc], 'B_TO_A')['unlock_gate']);
        $document->update(['status' => 'completed']);

        $this->actingAs($this->pic, 'sanctum')
            ->getJson("/api/shipping-documents/{$document->id}/stock-reconciliation")
            ->assertForbidden();

        $this->actingAs($this->superadmin, 'sanctum')
            ->getJson("/api/shipping-documents/{$document->id}/stock-reconciliation")
            ->assertOk()
            ->assertJsonPath('eligible_count', 1)
            ->assertJsonPath('gate_evidence_valid', true);

        $payload = [
            'evidence_reference' => 'BA-001/RECEIVING/2026',
            'physical_confirmation' => true,
        ];
        $this->postJson("/api/shipping-documents/{$document->id}/stock-reconciliation", $payload)
            ->assertOk()
            ->assertJsonPath('reconciled_count', 1)
            ->assertJsonPath('epcs.0', $tag->epc);

        $this->assertSame('attached', $tag->fresh()->status); // STOCK_IN menyimpan tag di gudang → status 'attached'
        $this->assertSame($this->warehouse->id, $tag->fresh()->last_warehouse_id);
        $this->assertDatabaseHas('custody_ledger', [
            'action'        => 'STOCK_IN',
            'tag_epc'       => $tag->epc,
            'holder_user_id' => $this->superadmin->id,
            'ref_type' => ShippingDocument::class,
            'ref_id' => $document->id,
        ]);

        $this->postJson("/api/shipping-documents/{$document->id}/stock-reconciliation", $payload)
            ->assertOk()
            ->assertJsonPath('reconciled_count', 0);
        $this->assertSame(1, CustodyLedger::where('action', 'STOCK_IN')->where('tag_epc', $tag->epc)->count());
    }

    public function test_reconciliation_requires_explicit_physical_confirmation(): void
    {
        [$document, $documentItem] = $this->makeDocument('inbound', 1);
        $tag = $this->makeTag('E280689400004035E3459CAE', null);
        $this->assign($document, $documentItem, $tag);
        $this->assertTrue($this->sendPass($document, [$tag->epc], 'B_TO_A')['unlock_gate']);
        $document->update(['status' => 'completed']);

        $this->actingAs($this->superadmin, 'sanctum')
            ->postJson("/api/shipping-documents/{$document->id}/stock-reconciliation", [
                'evidence_reference' => 'BA-002/RECEIVING/2026',
                'physical_confirmation' => false,
            ])
            ->assertUnprocessable();

        $this->assertSame('attached', $tag->fresh()->status);
        $this->assertSame(0, CustodyLedger::where('action', 'STOCK_IN')->count());
    }

    public function test_legacy_attestation_can_reconcile_old_progress_without_full_valid_gate_event(): void
    {
        [$document, $documentItem] = $this->makeDocument('inbound', 1);
        $assigned = $this->makeTag('E280689400004035E3459CAF', null);
        $different = $this->makeTag('E280689400004035E3459CB0', null);
        $this->assign($document, $documentItem, $assigned);
        $this->assertFalse($this->sendPass($document, [$different->epc], 'B_TO_A')['unlock_gate']);
        $document->tags()->update(['status' => 'scanned', 'scanned_at' => now()]);
        $document->update(['status' => 'completed']);

        $this->actingAs($this->superadmin, 'sanctum')
            ->getJson("/api/shipping-documents/{$document->id}/stock-reconciliation")
            ->assertOk()
            ->assertJsonPath('gate_evidence_valid', false)
            ->assertJsonPath('legacy_reconciliation_available', true)
            ->assertJsonPath('reconciliation_mode', 'legacy_superadmin_attestation')
            ->assertJsonPath('eligible_count', 1);

        $this->postJson("/api/shipping-documents/{$document->id}/stock-reconciliation", [
            'evidence_reference' => 'BA-LEGACY-003/2026',
            'physical_confirmation' => true,
        ])->assertOk()->assertJsonPath('reconciled_count', 1);

        $this->assertSame('attached', $assigned->fresh()->status); // STOCK_IN menyimpan tag di gudang → status 'attached'
        $this->assertSame($this->warehouse->id, $assigned->fresh()->last_warehouse_id);
        $this->assertSame(1, CustodyLedger::where('action', 'STOCK_IN')->where('tag_epc', $assigned->epc)->count());
    }

    public function test_pm_can_post_legacy_stock_in_but_pic_cannot(): void
    {
        [$document, $documentItem] = $this->makeDocument('inbound', 1);
        $tag = $this->makeTag('E280689400004035E3459CB1', null);
        $this->assign($document, $documentItem, $tag);
        $document->tags()->update(['status' => 'scanned', 'scanned_at' => now()]);
        $document->update(['status' => 'completed']);

        $this->actingAs($this->pic, 'sanctum')
            ->postJson("/api/shipping-documents/{$document->id}/stock-reconciliation", [
                'evidence_reference' => 'BA-PM-001',
                'physical_confirmation' => true,
            ])
            ->assertForbidden();

        $this->actingAs($this->pm, 'sanctum')
            ->postJson("/api/shipping-documents/{$document->id}/stock-reconciliation", [
                'evidence_reference' => 'BA-PM-001',
                'physical_confirmation' => true,
            ])
            ->assertOk()
            ->assertJsonPath('reconciled_count', 1);

        $this->assertDatabaseHas('custody_ledger', [
            'action' => 'STOCK_IN',
            'tag_epc' => $tag->epc,
            'holder_user_id' => $this->pm->id,
        ]);
    }

    public function test_completed_document_metadata_edit_is_audited_and_physical_fields_are_locked(): void
    {
        [$document, $documentItem] = $this->makeDocument('inbound', 1);
        $tag = $this->makeTag('E280689400004035E3459CB2', null);
        $this->assign($document, $documentItem, $tag);
        $this->assertTrue($this->sendPass($document, [$tag->epc], 'B_TO_A')['unlock_gate']);
        $document->update(['status' => 'completed']);

        $this->actingAs($this->superadmin, 'sanctum')
            ->putJson("/api/shipping-documents/{$document->id}", ['notes' => 'Tambahan keterangan audit'])
            ->assertOk()
            ->assertJsonPath('document.notes', 'Tambahan keterangan audit');

        $this->assertDatabaseHas('shipping_document_audits', [
            'shipping_document_id' => $document->id,
            'actor_user_id' => $this->superadmin->id,
            'action' => 'METADATA_UPDATED',
        ]);

        $this->actingAs($this->superadmin, 'sanctum')
            ->putJson("/api/shipping-documents/{$document->id}", [
                'type' => 'outbound',
                'warehouse_id' => $this->warehouse->id,
                'items' => [['item_id' => $this->item->id, 'expected_qty' => 1]],
            ])
            ->assertUnprocessable();

        $this->assertSame('inbound', $document->fresh()->type);
        $this->assertSame(1, GatePassEvent::where('shipping_document_id', $document->id)->count());
    }

    public function test_superadmin_delete_archives_completed_document_without_erasing_audit_evidence(): void
    {
        [$document, $documentItem] = $this->makeDocument('inbound', 1);
        $tag = $this->makeTag('E280689400004035E3459CB3', null);
        $this->assign($document, $documentItem, $tag);
        $this->assertTrue($this->sendPass($document, [$tag->epc], 'B_TO_A')['unlock_gate']);
        $document->update(['status' => 'completed']);

        $this->actingAs($this->superadmin, 'sanctum')
            ->deleteJson("/api/shipping-documents/{$document->id}")
            ->assertOk()
            ->assertJsonPath('document.status', 'completed');

        $this->assertNotNull($document->fresh()->archived_at);
        $this->assertSame(1, $document->tags()->count());
        $this->assertSame(1, GatePassEvent::where('shipping_document_id', $document->id)->count());
        $this->assertDatabaseHas('shipping_document_audits', [
            'shipping_document_id' => $document->id,
            'actor_user_id' => $this->superadmin->id,
            'action' => 'ARCHIVED',
        ]);
        $this->actingAs($this->superadmin, 'sanctum')
            ->getJson('/api/shipping-documents?archived=1')
            ->assertOk()
            ->assertJsonFragment(['document_number' => $document->document_number]);

        $this->actingAs($this->pm, 'sanctum')
            ->getJson("/api/shipping-documents/{$document->id}")
            ->assertForbidden();

        $this->actingAs($this->superadmin, 'sanctum')
            ->getJson("/api/shipping-documents/{$document->id}")
            ->assertOk();
    }

    public function test_archiving_active_document_audits_status_before_and_after_archive(): void
    {
        [$document] = $this->makeDocument('outbound', 1);

        $this->actingAs($this->superadmin, 'sanctum')
            ->deleteJson("/api/shipping-documents/{$document->id}")
            ->assertOk();

        $audit = ShippingDocumentAudit::where('shipping_document_id', $document->id)
            ->where('action', 'ARCHIVED')
            ->firstOrFail();
        $this->assertSame('in_progress', $audit->before_json['status']);
        $this->assertSame('cancelled', $audit->after_json['status']);
    }

    private function makeDocument(string $type, int $quantity): array
    {
        $document = ShippingDocument::create([
            'document_number' => 'DOC-'.strtoupper($type).'-'.Str::uuid(),
            'type' => $type,
            'status' => 'in_progress',
            'created_by_user_id' => $this->pic->id,
            'warehouse_id' => $this->warehouse->id,
        ]);
        $item = ShippingDocumentItem::create([
            'shipping_document_id' => $document->id,
            'item_id' => $this->item->id,
            'expected_qty' => $quantity,
        ]);

        return [$document, $item];
    }

    private function makeTag(string $epc, ?Warehouse $warehouse): RfidTag
    {
        return RfidTag::create([
            'epc'               => $epc,
            'item_id'           => $this->item->id,
            'tag_type'          => 'sticker',
            // Tag yang berada di dalam gudang harus berstatus 'attached' agar
            // GateEngineService mengizinkan GATE_OUT. Tag yang belum masuk gudang
            // (inbound / dari vendor) tetap 'active'.
            'status'            => $warehouse !== null ? 'attached' : 'active',
            'last_warehouse_id' => $warehouse?->id,
        ]);
    }

    private function assign(ShippingDocument $document, ShippingDocumentItem $item, RfidTag $tag): void
    {
        ShippingDocumentTag::create([
            'shipping_document_id' => $document->id,
            'shipping_document_item_id' => $item->id,
            'rfid_tag_id' => $tag->id,
            'tag_epc' => $tag->epc,
            'status' => 'expected',
        ]);
    }

    private function sendPass(ShippingDocument $document, array $epcs, string $antennaSequence, bool $includeDocumentId = true, ?int $shippingDocumentId = null): array
    {
        $payload = [
            'event_id' => (string) Str::uuid(),
            'observed_at' => now()->toIso8601String(),
            'warehouse_id' => $this->warehouse->id,
            'gate_id' => $this->device->device_code,
            'antenna_sequence' => $antennaSequence,
            'epc_list' => $epcs,
        ];
        if ($includeDocumentId) {
            $payload['shipping_document_id'] = $shippingDocumentId ?? $document->id;
        }

        return $this->gateEngine->processGateEvent($payload, $this->device);
    }
}
