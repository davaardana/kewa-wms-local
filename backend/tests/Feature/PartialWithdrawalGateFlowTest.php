<?php

namespace Tests\Feature;

use App\Models\CustodyLedger;
use App\Models\GateDevice;
use App\Models\Item;
use App\Models\Project;
use App\Models\RfidTag;
use App\Models\ShippingDocument;
use App\Models\ShippingDocumentItem;
use App\Models\ShippingDocumentTag;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\CustodyService;
use App\Services\GateEngineService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Test suite untuk partial withdrawal (drum kabel / length-based items).
 */
class PartialWithdrawalGateFlowTest extends TestCase
{
    use RefreshDatabase;

    private GateEngineService $gateEngine;
    private User $pic;
    private Warehouse $warehouse;
    private Item $cableItem;
    private GateDevice $device;

    protected function setUp(): void
    {
        parent::setUp();
        $this->gateEngine = new GateEngineService(new CustodyService());
        $this->pic = User::create([
            'name'     => 'PIC Lapangan',
            'email'    => 'partial-pic@example.test',
            'role'     => 'pic_lapangan',
            'password' => bcrypt('password'),
        ]);
        $project = Project::create(['code' => 'PARTIAL-PROJ', 'name' => 'Partial Test Project']);
        $this->warehouse = Warehouse::create([
            'project_id' => $project->id,
            'code'       => 'PARTIAL-WH',
            'name'       => 'Partial Test Warehouse',
            'gate_mode'  => 'DUAL_ANTENNA_AUTO',
        ]);
        $this->device = GateDevice::create([
            'warehouse_id' => $this->warehouse->id,
            'device_code'  => 'PARTIAL-GATE',
            'device_name'  => 'Partial Test Gate',
            'device_model' => 'TEST',
            'is_active'    => true,
        ]);
        $this->cableItem = Item::create([
            'code'             => 'CABLE-001',
            'name'             => 'Kabel NYY 4x70mm',
            'category'         => 'material',
            'unit'             => 'm',
            'is_serialized_tag' => true,
            'is_length_based'  => true,
        ]);
    }

    private function makeDrum(string $epc, float $totalLength, ?float $remaining = null): RfidTag
    {
        return RfidTag::create([
            'epc'                => strtoupper($epc),
            'item_id'            => $this->cableItem->id,
            'tag_type'           => 'sticker',
            'status'             => 'attached',
            'last_warehouse_id'  => $this->warehouse->id,
            'total_length_m'     => $totalLength,
            'remaining_length_m' => $remaining ?? $totalLength,
        ]);
    }

    private function makeDocumentWithDrum(float $dispatched, RfidTag $drum): array
    {
        $doc = ShippingDocument::create([
            'document_number'    => 'DOC-OUT-' . Str::uuid(),
            'type'               => 'outbound',
            'status'             => 'in_progress',
            'created_by_user_id' => $this->pic->id,
            'warehouse_id'       => $this->warehouse->id,
        ]);
        $docItem = ShippingDocumentItem::create([
            'shipping_document_id' => $doc->id,
            'item_id'              => $this->cableItem->id,
            'expected_qty'         => 1,
        ]);
        ShippingDocumentTag::create([
            'shipping_document_id'      => $doc->id,
            'shipping_document_item_id' => $docItem->id,
            'rfid_tag_id'               => $drum->id,
            'tag_epc'                   => $drum->epc,
            'status'                    => 'expected',
            'length_dispatched'         => $dispatched,
        ]);
        return [$doc, $docItem];
    }

    private function sendPass(ShippingDocument $doc, array $epcs): array
    {
        return $this->gateEngine->processGateEvent([
            'event_id'             => (string) Str::uuid(),
            'observed_at'          => now()->toIso8601String(),
            'warehouse_id'         => $this->warehouse->id,
            'gate_id'              => $this->device->device_code,
            'antenna_sequence'     => 'A_TO_B',
            'epc_list'             => $epcs,
            'shipping_document_id' => $doc->id,
        ], $this->device);
    }



    public function test_partial_exit_50m_from_100m_drum(): void
    {
        $drum = $this->makeDrum('AABBCCDD00000001', 100.0);
        [$doc] = $this->makeDocumentWithDrum(50.0, $drum);

        $result = $this->sendPass($doc, [$drum->epc]);

        $this->assertTrue($result['unlock_gate'], 'Gate harus terbuka untuk partial drum');
        $this->assertSame('SUCCESS', $result['status']);

        $drum->refresh();
        $this->assertEquals(50.0, (float) $drum->remaining_length_m, 'Sisa harus 50m');
        $this->assertSame('attached', $drum->status, 'Tag harus tetap attached setelah partial exit');
        $this->assertNotNull($drum->last_warehouse_id, 'last_warehouse_id harus tetap ada');

        $ledger = CustodyLedger::where('tag_epc', $drum->epc)->where('action', 'PARTIAL_OUT')->first();
        $this->assertNotNull($ledger, 'PARTIAL_OUT harus dicatat di custody ledger');
        $this->assertStringContainsString('50', $ledger->notes, 'Notes harus menyebut meter');

        $docTag = ShippingDocumentTag::where('rfid_tag_id', $drum->id)->first();
        $this->assertSame('scanned', $docTag->status, 'Document tag harus berubah ke scanned');
    }

    public function test_final_exit_last_50m_resets_tag_to_active(): void
    {
        $drum = $this->makeDrum('AABBCCDD00000002', 100.0, 50.0);
        [$doc] = $this->makeDocumentWithDrum(50.0, $drum);

        $result = $this->sendPass($doc, [$drum->epc]);

        $this->assertTrue($result['unlock_gate'], 'Gate harus terbuka untuk last pull');

        $drum->refresh();
        $this->assertEquals(0.0, (float) $drum->remaining_length_m, 'Sisa harus 0m');
        $this->assertSame('active', $drum->status, 'Tag harus reset ke active setelah drum habis');
        $this->assertNull($drum->last_warehouse_id, 'last_warehouse_id harus null setelah habis');

        $ledger = CustodyLedger::where('tag_epc', $drum->epc)->where('action', 'GATE_OUT')->first();
        $this->assertNotNull($ledger, 'GATE_OUT harus dicatat untuk last pull');
        $this->assertNull(
            CustodyLedger::where('tag_epc', $drum->epc)->where('action', 'PARTIAL_OUT')->first(),
            'PARTIAL_OUT tidak boleh dicatat untuk last pull'
        );
    }

    public function test_empty_drum_cannot_exit_again(): void
    {
        $drum = $this->makeDrum('AABBCCDD00000003', 100.0, 0.0);
        $drum->update(['status' => 'active', 'last_warehouse_id' => null]);
        [$doc] = $this->makeDocumentWithDrum(50.0, $drum);

        $result = $this->sendPass($doc, [$drum->epc]);

        $this->assertFalse($result['unlock_gate'], 'Drum habis tidak boleh exit lagi');
        $this->assertSame('DENIED', $result['status']);
    }



    public function test_non_length_based_item_uses_normal_gate_out_flow(): void
    {
        $regularItem = Item::create([
            'code'              => 'REG-ITEM-001',
            'name'              => 'Tiang Besi',
            'category'          => 'material',
            'unit'              => 'pcs',
            'is_serialized_tag' => true,
            'is_length_based'   => false,
        ]);
        $tag = RfidTag::create([
            'epc'               => 'AABBCCDD00000004',
            'item_id'           => $regularItem->id,
            'tag_type'          => 'sticker',
            'status'            => 'attached',
            'last_warehouse_id' => $this->warehouse->id,
        ]);
        $doc = ShippingDocument::create([
            'document_number'    => 'DOC-OUT-REG-' . Str::uuid(),
            'type'               => 'outbound',
            'status'             => 'in_progress',
            'created_by_user_id' => $this->pic->id,
            'warehouse_id'       => $this->warehouse->id,
        ]);
        $docItem = ShippingDocumentItem::create([
            'shipping_document_id' => $doc->id,
            'item_id'              => $regularItem->id,
            'expected_qty'         => 1,
        ]);
        ShippingDocumentTag::create([
            'shipping_document_id'      => $doc->id,
            'shipping_document_item_id' => $docItem->id,
            'rfid_tag_id'               => $tag->id,
            'tag_epc'                   => $tag->epc,
            'status'                    => 'expected',
        ]);

        $result = $this->sendPass($doc, [$tag->epc]);

        $this->assertTrue($result['unlock_gate']);
        $tag->refresh();
        $this->assertSame('active', $tag->status, 'Non-drum harus reset ke active');
        $this->assertNull($tag->last_warehouse_id);
        $this->assertNotNull(
            CustodyLedger::where('tag_epc', $tag->epc)->where('action', 'GATE_OUT')->first()
        );
    }

    public function test_assign_tags_api_requires_length_dispatched_for_drum(): void
    {
        $drum = $this->makeDrum('AABBCCDD00000005', 100.0);
        $doc = ShippingDocument::create([
            'document_number'    => 'DOC-OUT-ASSIGN-' . Str::uuid(),
            'type'               => 'outbound',
            'status'             => 'in_progress',
            'created_by_user_id' => $this->pic->id,
            'warehouse_id'       => $this->warehouse->id,
        ]);
        $docItem = ShippingDocumentItem::create([
            'shipping_document_id' => $doc->id,
            'item_id'              => $this->cableItem->id,
            'expected_qty'         => 1,
        ]);

        $response = $this->actingAs($this->pic, 'sanctum')
            ->postJson("/api/shipping-documents/{$doc->id}/assign-tags", [
                'tags' => [['epc' => $drum->epc, 'document_item_id' => $docItem->id]],
            ]);

        $response->assertOk();
        $this->assertNotEmpty($response->json('errors'));
        $this->assertStringContainsString('length_dispatched', $response->json('errors.0'));
    }

    public function test_assign_tags_api_rejects_over_withdrawal(): void
    {
        $drum = $this->makeDrum('AABBCCDD00000006', 100.0);
        $doc = ShippingDocument::create([
            'document_number'    => 'DOC-OUT-OVER-' . Str::uuid(),
            'type'               => 'outbound',
            'status'             => 'in_progress',
            'created_by_user_id' => $this->pic->id,
            'warehouse_id'       => $this->warehouse->id,
        ]);
        $docItem = ShippingDocumentItem::create([
            'shipping_document_id' => $doc->id,
            'item_id'              => $this->cableItem->id,
            'expected_qty'         => 1,
        ]);

        $response = $this->actingAs($this->pic, 'sanctum')
            ->postJson("/api/shipping-documents/{$doc->id}/assign-tags", [
                'tags' => [[
                    'epc'               => $drum->epc,
                    'document_item_id'  => $docItem->id,
                    'length_dispatched' => 120.0,
                ]],
            ]);

        $response->assertOk();
        $this->assertNotEmpty($response->json('errors'));
        $this->assertStringContainsString('melebihi', $response->json('errors.0'));
    }

    public function test_assign_tags_api_succeeds_with_valid_length_dispatched(): void
    {
        $drum = $this->makeDrum('AABBCCDD00000007', 100.0);
        $doc = ShippingDocument::create([
            'document_number'    => 'DOC-OUT-VALID-' . Str::uuid(),
            'type'               => 'outbound',
            'status'             => 'in_progress',
            'created_by_user_id' => $this->pic->id,
            'warehouse_id'       => $this->warehouse->id,
        ]);
        $docItem = ShippingDocumentItem::create([
            'shipping_document_id' => $doc->id,
            'item_id'              => $this->cableItem->id,
            'expected_qty'         => 1,
        ]);

        $response = $this->actingAs($this->pic, 'sanctum')
            ->postJson("/api/shipping-documents/{$doc->id}/assign-tags", [
                'tags' => [[
                    'epc'               => $drum->epc,
                    'document_item_id'  => $docItem->id,
                    'length_dispatched' => 40.0,
                ]],
            ]);

        $response->assertOk();
        $this->assertEmpty($response->json('errors'));
        $this->assertSame([$drum->epc], $response->json('assigned'));

        $docTag = ShippingDocumentTag::where('rfid_tag_id', $drum->id)
            ->where('shipping_document_id', $doc->id)->first();
        $this->assertNotNull($docTag);
        $this->assertEquals(40.0, (float) $docTag->length_dispatched);
    }
}
