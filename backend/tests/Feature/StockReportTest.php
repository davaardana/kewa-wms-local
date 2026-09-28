<?php

namespace Tests\Feature;

use App\Models\CustodyLedger;
use App\Models\Item;
use App\Models\Principal;
use App\Models\Project;
use App\Models\RfidTag;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StockReportTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Warehouse $warehouse;
    private Item $serializedItem;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::create([
            'name' => 'Auditor',
            'email' => 'auditor@mosa.test',
            'role' => 'management',
            'password' => bcrypt('password'),
        ]);
        $principal = Principal::create(['name' => 'Principal', 'code' => 'PR-STOCK']);
        $project = Project::create([
            'principal_id' => $principal->id,
            'code' => 'PJ-STOCK',
            'name' => 'Project Stock',
        ]);
        $this->warehouse = Warehouse::create([
            'project_id' => $project->id,
            'code' => 'WH-STOCK',
            'name' => 'Warehouse Stock',
        ]);
        $this->serializedItem = Item::create([
            'code' => 'IT-STOCK',
            'name' => 'Serialized Item',
            'category' => 'pole',
            'unit' => 'pcs',
            'is_serialized_tag' => true,
            'min_stock' => 2,
        ]);
    }

    public function test_stock_reports_require_authentication(): void
    {
        $this->getJson('/api/reports/stocks')->assertUnauthorized();
        $this->getJson('/api/reports/stock-card')->assertUnauthorized();
    }

    public function test_stock_summary_counts_only_active_tags_at_warehouse(): void
    {
        foreach ([['A', 'active'], ['B', 'active'], ['C', 'lost']] as [$epc, $status]) {
            RfidTag::create([
                'epc' => "EPC-$epc",
                'item_id' => $this->serializedItem->id,
                'status' => $status,
                'last_warehouse_id' => $this->warehouse->id,
            ]);
        }

        Sanctum::actingAs($this->user);
        $this->getJson('/api/reports/stocks?warehouse_id='.$this->warehouse->id)
            ->assertOk()
            ->assertJsonPath('data.0.active_tag_count', 2)
            ->assertJsonPath('data.0.stock_qty', 2)
            ->assertJsonPath('data.0.quantity_basis', 'SERIALIZED_TAG_COUNT');
    }

    public function test_non_serialized_stock_does_not_claim_tag_count_as_quantity(): void
    {
        $item = Item::create([
            'code' => 'IT-BATCH',
            'name' => 'Batch Item',
            'category' => 'cable',
            'unit' => 'meter',
            'is_serialized_tag' => false,
        ]);
        RfidTag::create([
            'epc' => 'EPC-BATCH',
            'item_id' => $item->id,
            'status' => 'active',
            'last_warehouse_id' => $this->warehouse->id,
        ]);

        Sanctum::actingAs($this->user);
        $this->getJson('/api/reports/stocks?item_id='.$item->id)
            ->assertOk()
            ->assertJsonPath('data.0.active_tag_count', 1)
            ->assertJsonPath('data.0.stock_qty', null)
            ->assertJsonPath('data.0.quantity_basis', 'UNAVAILABLE');
    }

    public function test_stock_card_calculates_opening_and_running_balance(): void
    {
        foreach ([
            ['STOCK_IN', '2026-09-01 08:00:00'],
            ['STOCK_IN', '2026-09-02 08:00:00'],
            ['PREPARED', '2026-09-05 08:00:00'],
            ['GATE_OUT', '2026-09-06 08:00:00'],
            ['STOCK_IN', '2026-09-07 08:00:00'],
        ] as $index => [$action, $createdAt]) {
            CustodyLedger::create([
                'tag_epc' => 'EPC-'.($index + 1),
                'item_id' => $this->serializedItem->id,
                'holder_user_id' => $this->user->id,
                'warehouse_id' => $this->warehouse->id,
                'action' => $action,
                'created_at' => $createdAt,
            ]);
        }

        Sanctum::actingAs($this->user);
        $this->getJson('/api/reports/stock-card?warehouse_id='.$this->warehouse->id.'&item_id='.$this->serializedItem->id.'&date_from=2026-09-05&date_to=2026-09-10')
            ->assertOk()
            ->assertJsonPath('opening_balance', 2)
            ->assertJsonCount(2, 'movements.data')
            ->assertJsonPath('movements.data.0.qty_out', 1)
            ->assertJsonPath('movements.data.0.running_balance', 1)
            ->assertJsonPath('movements.data.1.running_balance', 2);
    }
}
