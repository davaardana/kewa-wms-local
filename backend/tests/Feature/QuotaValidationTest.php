<?php

namespace Tests\Feature;

use App\Models\BoqItem;
use App\Models\Item;
use App\Models\Principal;
use App\Models\Project;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WorkOrder;
use App\Services\QuotaValidatorService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuotaValidationTest extends TestCase
{
    use RefreshDatabase;

    protected QuotaValidatorService $quotaService;
    protected WorkOrder $workOrder;
    protected Item $poleItem;
    protected User $pm;

    protected function setUp(): void
    {
        parent::setUp();
        $this->quotaService = new QuotaValidatorService();

        $this->pm = User::create([
            'name' => 'PM Test',
            'email' => 'pm.test@mosa.id',
            'role' => 'pm',
            'password' => bcrypt('password'),
        ]);

        $principal = Principal::create([
            'name' => 'Test Principal',
            'code' => 'TESTP',
        ]);

        $project = Project::create([
            'principal_id' => $principal->id,
            'code' => 'PRJ-TEST',
            'name' => 'Project Test',
            'status' => 'active',
        ]);

        $warehouse = Warehouse::create([
            'project_id' => $project->id,
            'code' => 'WH-TEST',
            'name' => 'Warehouse Test',
        ]);

        $this->poleItem = Item::create([
            'code' => 'POLE-TEST-7M',
            'name' => 'Tiang Test 7M',
            'category' => 'pole',
            'unit' => 'pcs',
        ]);

        $this->workOrder = WorkOrder::create([
            'project_id' => $project->id,
            'warehouse_id' => $warehouse->id,
            'pm_user_id' => $this->pm->id,
            'wo_number' => 'WO-TEST-001',
            'title' => 'Test Work Order',
            'status' => 'approved',
            'approved_by_user_id' => $this->pm->id,
            'approved_at' => Carbon::now(),
        ]);

        BoqItem::create([
            'work_order_id' => $this->workOrder->id,
            'item_id' => $this->poleItem->id,
            'quota_qty' => 10,
            'prepared_qty' => 10,
            'withdrawn_qty' => 3,
            'returned_qty' => 0,
        ]);
    }

    public function test_can_fulfill_when_request_is_within_remaining_quota(): void
    {
        // Quota is 10, already withdrawn 3 -> remaining is 7
        $result = $this->quotaService->validateWithdrawalQuota($this->workOrder, [
            ['item_id' => $this->poleItem->id, 'quantity' => 5],
        ]);

        $this->assertTrue($result['can_fulfill']);
        $this->assertEmpty($result['violations']);
    }

    public function test_rejects_when_request_exceeds_remaining_quota(): void
    {
        // Request 8 when remaining is only 7
        $result = $this->quotaService->validateWithdrawalQuota($this->workOrder, [
            ['item_id' => $this->poleItem->id, 'quantity' => 8],
        ]);

        $this->assertFalse($result['can_fulfill']);
        $this->assertCount(1, $result['violations']);
        $this->assertEquals(1, $result['violations'][0]['shortage']);
    }

    public function test_auto_approval_rules_during_normal_operating_hours(): void
    {
        // 10:00 AM (Within 07:00 - 18:00)
        $dayTime = Carbon::create(2026, 9, 2, 10, 0, 0);
        $canAutoApprove = $this->quotaService->canAutoApprove(
            $this->workOrder,
            [['item_id' => $this->poleItem->id, 'quantity' => 4]],
            $dayTime
        );

        $this->assertTrue($canAutoApprove);

        // 22:00 (Outside working hours -> requires PM manual escalation)
        $nightTime = Carbon::create(2026, 9, 2, 22, 0, 0);
        $canAutoApproveNight = $this->quotaService->canAutoApprove(
            $this->workOrder,
            [['item_id' => $this->poleItem->id, 'quantity' => 4]],
            $nightTime
        );

        $this->assertFalse($canAutoApproveNight);
    }
}
