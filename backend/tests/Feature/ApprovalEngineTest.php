<?php

namespace Tests\Feature;

use App\Models\ApprovalConfig;
use App\Models\ApprovalHistory;
use App\Models\ApprovalRequest;
use App\Models\ApprovalTemplate;
use App\Models\ApprovalTemplateStep;
use App\Models\Item;
use App\Models\Principal;
use App\Models\Project;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WorkOrder;
use App\Services\ApprovalService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApprovalEngineTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;
    protected User $pm;
    protected User $storeroom;
    protected Project $project;
    protected Warehouse $warehouse;
    protected ApprovalService $approvalService;

    protected function setUp(): void
    {
        parent::setUp();
        $this->approvalService = app(ApprovalService::class);

        $this->superAdmin = User::create([
            'name' => 'Super Admin',
            'email' => 'superadmin@mosa.id',
            'role' => 'superadmin',
            'password' => bcrypt('password'),
        ]);

        $this->pm = User::create([
            'name' => 'PM Budi',
            'email' => 'pm@mosa.id',
            'role' => 'pm',
            'password' => bcrypt('password'),
        ]);

        $this->storeroom = User::create([
            'name' => 'Gudang Dani',
            'email' => 'gudang@mosa.id',
            'role' => 'storeroom',
            'password' => bcrypt('password'),
        ]);

        $principal = Principal::create([
            'name' => 'MyRepublic',
            'code' => 'MYREP',
        ]);

        $this->project = Project::create([
            'principal_id' => $principal->id,
            'code' => 'PRJ-BOGOR',
            'name' => 'Proyek Bogor',
            'status' => 'active',
        ]);

        $this->warehouse = Warehouse::create([
            'project_id' => $this->project->id,
            'code' => 'WH-BOGOR',
            'name' => 'Gudang Bogor',
        ]);
    }

    public function test_can_list_and_filter_approval_requests(): void
    {
        $req = $this->approvalService->createApprovalRequest(
            module: 'WORK_ORDER',
            referenceId: 10,
            referenceCode: 'WO-001',
            title: 'Test WO Approval',
            requesterUserId: $this->storeroom->id,
            projectId: $this->project->id,
            warehouseId: $this->warehouse->id
        );

        $response = $this->actingAs($this->pm)
            ->getJson('/api/approvals');

        $response->assertStatus(200);
        $response->assertJsonFragment(['reference_code' => 'WO-001']);
    }

    public function test_multi_step_approval_workflow_execution(): void
    {
        // 1. Create a 2-step template
        $template = ApprovalTemplate::create([
            'name' => '2-Step WO Template',
            'code' => 'TPL-2STEP',
            'module' => 'WORK_ORDER',
            'is_default' => true,
        ]);

        ApprovalTemplateStep::create([
            'approval_template_id' => $template->id,
            'step_order' => 1,
            'step_name' => 'Step 1 - PM Review',
            'approver_user_id' => $this->pm->id,
            'sla_hours' => 24,
            'can_reject' => true,
        ]);

        ApprovalTemplateStep::create([
            'approval_template_id' => $template->id,
            'step_order' => 2,
            'step_name' => 'Step 2 - Superadmin Final',
            'approver_user_id' => $this->superAdmin->id,
            'sla_hours' => 48,
            'can_reject' => true,
        ]);

        $wo = WorkOrder::create([
            'project_id' => $this->project->id,
            'warehouse_id' => $this->warehouse->id,
            'pm_user_id' => $this->pm->id,
            'wo_number' => 'WO-TEST-2STEP',
            'title' => 'Test WO 2-Step',
            'status' => 'draft',
        ]);

        // Create approval request
        $req = $this->approvalService->createApprovalRequest(
            module: 'WORK_ORDER',
            referenceId: $wo->id,
            referenceCode: $wo->wo_number,
            title: 'Approval for WO 2-Step',
            requesterUserId: $this->storeroom->id,
            projectId: $this->project->id,
            warehouseId: $this->warehouse->id
        );

        $this->assertEquals(1, $req->current_step_order);
        $this->assertEquals(2, $req->total_steps);
        $this->assertEquals($this->pm->id, $req->current_approver_user_id);
        $this->assertEquals('pending', $req->status);

        // Unauthorized user attempts step 1 -> Should be rejected
        $respUnauthorized = $this->actingAs($this->storeroom)
            ->postJson("/api/approvals/{$req->id}/action", [
                'action' => 'approved',
                'user_id' => $this->storeroom->id,
                'comments' => 'I try to approve',
            ]);
        $respUnauthorized->assertStatus(422);

        // Step 1: PM Approves
        $respStep1 = $this->actingAs($this->pm)
            ->postJson("/api/approvals/{$req->id}/action", [
                'action' => 'approved',
                'user_id' => $this->pm->id,
                'comments' => 'Step 1 OK by PM',
            ]);
        $respStep1->assertStatus(200);

        $req->refresh();
        $this->assertEquals(2, $req->current_step_order);
        $this->assertEquals($this->superAdmin->id, $req->current_approver_user_id);
        $this->assertEquals('pending', $req->status);
        $this->assertEquals('draft', $wo->fresh()->status); // Not yet final approved

        // Step 2: Superadmin Approves -> Reaches Final Approval
        $respStep2 = $this->actingAs($this->superAdmin)
            ->postJson("/api/approvals/{$req->id}/action", [
                'action' => 'approved',
                'user_id' => $this->superAdmin->id,
                'comments' => 'Final Step OK by SuperAdmin',
            ]);
        $respStep2->assertStatus(200);

        $req->refresh();
        $this->assertEquals('approved', $req->status);
        $this->assertNull($req->current_approver_user_id);
        $this->assertEquals('approved', $wo->fresh()->status); // Work Order auto-updated to approved!
    }

    public function test_approval_rejection_marks_request_rejected(): void
    {
        $template = ApprovalTemplate::create([
            'name' => 'Reject Test Template',
            'code' => 'TPL-REJECT',
            'module' => 'WORK_ORDER',
            'is_default' => true,
        ]);

        ApprovalTemplateStep::create([
            'approval_template_id' => $template->id,
            'step_order' => 1,
            'step_name' => 'Review PM',
            'approver_user_id' => $this->pm->id,
            'sla_hours' => 24,
            'can_reject' => true,
        ]);

        $req = $this->approvalService->createApprovalRequest(
            module: 'WORK_ORDER',
            referenceId: 99,
            referenceCode: 'WO-REJECT',
            title: 'Reject Test',
            requesterUserId: $this->storeroom->id,
            projectId: $this->project->id,
            warehouseId: $this->warehouse->id
        );

        $resp = $this->actingAs($this->pm)
            ->postJson("/api/approvals/{$req->id}/action", [
                'action' => 'rejected',
                'user_id' => $this->pm->id,
                'comments' => 'Over budget quota',
            ]);

        $resp->assertStatus(200);
        $req->refresh();
        $this->assertEquals('rejected', $req->status);
        $this->assertNull($req->current_approver_user_id);
    }

    public function test_approval_action_uses_authenticated_actor_instead_of_spoofed_user_id(): void
    {
        $req = $this->approvalService->createApprovalRequest(
            module: 'WORK_ORDER',
            referenceId: 100,
            referenceCode: 'WO-SPOOF',
            title: 'Actor Spoof Test',
            requesterUserId: $this->storeroom->id,
            projectId: $this->project->id,
            warehouseId: $this->warehouse->id
        );

        $this->actingAs($this->storeroom)
            ->postJson("/api/approvals/{$req->id}/action", [
                'action' => 'approved',
                'user_id' => $this->pm->id,
            ])->assertStatus(422);

        $this->assertSame('pending', $req->fresh()->status);
        $this->assertDatabaseMissing('approval_histories', [
            'approval_request_id' => $req->id,
        ]);
    }

    public function test_data_visibility_scoping_for_creator_approver_and_management(): void
    {
        $managementUser = User::create([
            'name' => 'Direksi Hendra',
            'email' => 'direksi@mosa.id',
            'role' => 'management',
            'password' => bcrypt('password'),
        ]);

        $otherPm = User::create([
            'name' => 'PM Lain',
            'email' => 'pmlain@mosa.id',
            'role' => 'pm',
            'password' => bcrypt('password'),
        ]);

        $req = $this->approvalService->createApprovalRequest(
            module: 'WORK_ORDER',
            referenceId: 555,
            referenceCode: 'WO-SCOPING-TEST',
            title: 'Scoping Test WO',
            requesterUserId: $this->storeroom->id,
            projectId: $this->project->id,
            warehouseId: $this->warehouse->id
        );

        // 1. Originator / Requester (Storeroom) CAN see their own request
        $respRequester = $this->actingAs($this->storeroom)->getJson('/api/approvals');
        $respRequester->assertStatus(200)->assertJsonFragment(['reference_code' => 'WO-SCOPING-TEST']);

        // 2. Designated Reviewer (PM) CAN see the request
        $respApprover = $this->actingAs($this->pm)->getJson('/api/approvals');
        $respApprover->assertStatus(200)->assertJsonFragment(['reference_code' => 'WO-SCOPING-TEST']);

        // 3. Top Management (Direksi) CAN see all requests
        $respMgmt = $this->actingAs($managementUser)->getJson('/api/approvals');
        $respMgmt->assertStatus(200)->assertJsonFragment(['reference_code' => 'WO-SCOPING-TEST']);

        // 4. Super Admin CAN see all requests
        $respAdmin = $this->actingAs($this->superAdmin)->getJson('/api/approvals');
        $respAdmin->assertStatus(200)->assertJsonFragment(['reference_code' => 'WO-SCOPING-TEST']);

        // 5. Unrelated PM (PM Lain) CANNOT see the request in listing
        $respOther = $this->actingAs($otherPm)->getJson('/api/approvals');
        $respOther->assertStatus(200)->assertJsonMissing(['reference_code' => 'WO-SCOPING-TEST']);

        // 6. Unrelated PM CANNOT view single detail (403 Forbidden)
        $respDetailOther = $this->actingAs($otherPm)->getJson("/api/approvals/{$req->id}");
        $respDetailOther->assertStatus(403);
    }
}
