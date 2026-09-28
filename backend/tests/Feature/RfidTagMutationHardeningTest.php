<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\RfidTag;
use App\Models\User;
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
}
