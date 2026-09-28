<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EpcReservationTest extends TestCase
{
    use RefreshDatabase;

    public function test_procurement_can_reserve_unique_sequential_epcs_and_lookup_their_purpose(): void
    {
        $user = User::factory()->create(['role' => 'procurement']);
        $item = Item::create([
            'code' => 'POLE-A',
            'name' => 'Tiang A',
            'category' => 'pole',
            'unit' => 'batang',
            'epc_prefix' => 'POLEA1',
            'epc_suffix_digits' => 4,
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/tags/reserve', [
            'item_id' => $item->id,
            'quantity' => 3,
            'tag_type' => 'anti_metal',
        ])->assertCreated()
            ->assertJsonPath('reserved_count', 3)
            ->assertJsonPath('tags.0.epc', 'POLEA10001')
            ->assertJsonPath('tags.2.epc', 'POLEA10003');

        $this->postJson('/api/tags/reserve', [
            'item_id' => $item->id,
            'quantity' => 2,
            'tag_type' => 'anti_metal',
        ])->assertCreated()->assertJsonPath('tags.0.epc', 'POLEA10004');

        $this->assertDatabaseCount('rfid_tags', 5);
        $this->assertDatabaseHas('rfid_tags', ['epc' => 'POLEA10005', 'item_id' => $item->id, 'status' => 'reserved']);
        $this->getJson('/api/tags/polea10001')->assertOk()
            ->assertJsonPath('tag.item.name', 'Tiang A')
            ->assertJsonPath('tag.status', 'reserved');
    }

    public function test_reservation_requires_configuration_and_enforces_batch_limit(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'procurement']));
        $item = Item::create(['code' => 'NO-EPC', 'name' => 'Tanpa EPC', 'category' => 'tools', 'unit' => 'unit']);

        $this->postJson('/api/tags/reserve', ['item_id' => $item->id, 'quantity' => 1, 'tag_type' => 'sticker'])
            ->assertUnprocessable();
        $this->postJson('/api/tags/reserve', ['item_id' => $item->id, 'quantity' => 1001, 'tag_type' => 'sticker'])
            ->assertUnprocessable();
        $this->assertDatabaseCount('rfid_tags', 0);
    }
}
