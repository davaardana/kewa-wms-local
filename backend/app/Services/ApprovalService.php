<?php

namespace App\Services;

use App\Models\ApprovalConfig;
use App\Models\ApprovalHistory;
use App\Models\ApprovalRequest;
use App\Models\ApprovalTemplate;
use App\Models\Delivery;
use App\Models\Spk;
use App\Models\User;
use App\Models\WorkOrder;
use Exception;
use Illuminate\Support\Facades\DB;

class ApprovalService
{
    /**
     * Resolve the approval steps for a given module and scope (project / warehouse / amount)
     */
    public function resolveApprovalSteps(
        string $module,
        ?int $projectId = null,
        ?int $warehouseId = null,
        float $totalAmount = 0
    ): array {
        // 1. Try finding specific custom config for Project
        if ($projectId) {
            $config = ApprovalConfig::with(['customSteps', 'template.steps'])
                ->where('scope_type', 'project')
                ->where('project_id', $projectId)
                ->where('module', $module)
                ->where('is_active', true)
                ->first();

            if ($config) {
                if (!$config->use_template && $config->customSteps->isNotEmpty()) {
                    return $config->customSteps->map(fn($st) => [
                        'step_order' => $st->step_order,
                        'step_name' => $st->step_name,
                        'approver_user_id' => $st->approver_user_id,
                        'sla_hours' => $st->sla_hours,
                        'can_reject' => $st->can_reject,
                    ])->toArray();
                }

                if ($config->use_template && $config->template && $config->template->steps->isNotEmpty()) {
                    return $config->template->steps->map(fn($st) => [
                        'step_order' => $st->step_order,
                        'step_name' => $st->step_name,
                        'approver_user_id' => $st->approver_user_id,
                        'sla_hours' => $st->sla_hours,
                        'can_reject' => $st->can_reject,
                    ])->toArray();
                }
            }
        }

        // 2. Try finding specific custom config for Warehouse
        if ($warehouseId) {
            $config = ApprovalConfig::with(['customSteps', 'template.steps'])
                ->where('scope_type', 'warehouse')
                ->where('warehouse_id', $warehouseId)
                ->where('module', $module)
                ->where('is_active', true)
                ->first();

            if ($config) {
                if (!$config->use_template && $config->customSteps->isNotEmpty()) {
                    return $config->customSteps->map(fn($st) => [
                        'step_order' => $st->step_order,
                        'step_name' => $st->step_name,
                        'approver_user_id' => $st->approver_user_id,
                        'sla_hours' => $st->sla_hours,
                        'can_reject' => $st->can_reject,
                    ])->toArray();
                }

                if ($config->use_template && $config->template && $config->template->steps->isNotEmpty()) {
                    return $config->template->steps->map(fn($st) => [
                        'step_order' => $st->step_order,
                        'step_name' => $st->step_name,
                        'approver_user_id' => $st->approver_user_id,
                        'sla_hours' => $st->sla_hours,
                        'can_reject' => $st->can_reject,
                    ])->toArray();
                }
            }
        }

        // 3. Find default template for module with amount threshold if applicable
        $template = ApprovalTemplate::with('steps')
            ->where('module', $module)
            ->where(function ($q) use ($totalAmount) {
                $q->where(function ($q2) use ($totalAmount) {
                    $q2->whereNotNull('min_amount')
                       ->where('min_amount', '<=', $totalAmount)
                       ->where(function ($q3) use ($totalAmount) {
                           $q3->whereNull('max_amount')->orWhere('max_amount', '>=', $totalAmount);
                       });
                })->orWhere('is_default', true);
            })
            ->orderBy('is_default', 'asc') // prefer specific amount thresholds first
            ->first();

        if ($template && $template->steps->isNotEmpty()) {
            return $template->steps->map(fn($st) => [
                'step_order' => $st->step_order,
                'step_name' => $st->step_name,
                'approver_user_id' => $st->approver_user_id,
                'sla_hours' => $st->sla_hours,
                'can_reject' => $st->can_reject,
            ])->toArray();
        }

        // 4. Fallback default: Designated PM or Superadmin user
        $defaultUser = User::where('role', 'pm')->orderBy('id')->first() ?? User::where('role', 'superadmin')->orderBy('id')->first();
        $fallbackUserId = $defaultUser ? $defaultUser->id : 1;

        return [
            [
                'step_order' => 1,
                'step_name' => 'Review & Approval Project Manager',
                'approver_user_id' => $fallbackUserId,
                'sla_hours' => 24,
                'can_reject' => true,
            ],
        ];
    }

    /**
     * Create an active Approval Request
     */
    public function createApprovalRequest(
        string $module,
        int $referenceId,
        string $referenceCode,
        string $title,
        int $requesterUserId,
        ?int $projectId = null,
        ?int $warehouseId = null,
        float $totalAmount = 0,
        ?array $metaData = null
    ): ApprovalRequest {
        $steps = $this->resolveApprovalSteps($module, $projectId, $warehouseId, $totalAmount);
        $totalSteps = count($steps);
        $firstStep = $steps[0];

        $requestNumber = 'APP-' . strtoupper($module) . '-' . date('Ymd') . '-' . rand(1000, 9999);

        return DB::transaction(function () use (
            $requestNumber,
            $module,
            $referenceId,
            $referenceCode,
            $title,
            $projectId,
            $warehouseId,
            $requesterUserId,
            $totalSteps,
            $firstStep,
            $totalAmount,
            $steps,
            $metaData
        ) {
            $req = ApprovalRequest::create([
                'request_number' => $requestNumber,
                'module' => $module,
                'reference_id' => $referenceId,
                'reference_code' => $referenceCode,
                'title' => $title,
                'project_id' => $projectId,
                'warehouse_id' => $warehouseId,
                'requester_user_id' => $requesterUserId,
                'current_step_order' => 1,
                'total_steps' => $totalSteps,
                'current_approver_user_id' => $firstStep['approver_user_id'],
                'status' => 'pending',
                'total_amount' => $totalAmount,
                'steps_snapshot_json' => $steps,
                'meta_data_json' => $metaData,
            ]);

            return $req;
        });
    }

    /**
     * Process step action (approve, reject, revision_requested) by designated user
     */
    public function processStepAction(
        int $approvalRequestId,
        int $actionByUserId,
        string $action,
        ?string $comments = null
    ): ApprovalRequest {
        return DB::transaction(function () use ($approvalRequestId, $actionByUserId, $action, $comments) {
            $request = ApprovalRequest::lockForUpdate()->findOrFail($approvalRequestId);

            if ($request->status !== 'pending' && $request->status !== 'revision_requested') {
                throw new Exception("Permohonan ini sudah tidak berstatus pending (status saat ini: {$request->status})");
            }

            $user = User::findOrFail($actionByUserId);
            $isDesignated = ($request->current_approver_user_id === $actionByUserId);
            $isSuperAdmin = $user->isSuperAdmin();

            if (!$isDesignated && !$isSuperAdmin) {
                throw new Exception("Hanya pengguna yang ditunjuk (atau Superadmin) yang berhak mengeksekusi step ini.");
            }

            $currentStepIndex = $request->current_step_order - 1;
            $steps = $request->steps_snapshot_json ?? [];
            $stepInfo = $steps[$currentStepIndex] ?? [
                'step_name' => "Step {$request->current_step_order}",
                'approver_user_id' => $request->current_approver_user_id,
            ];

            // Log history
            ApprovalHistory::create([
                'approval_request_id' => $request->id,
                'step_order' => $request->current_step_order,
                'step_name' => $stepInfo['step_name'] ?? "Step {$request->current_step_order}",
                'designated_user_id' => $request->current_approver_user_id ?? $actionByUserId,
                'action_by_user_id' => $actionByUserId,
                'action' => $action,
                'comments' => $comments,
                'action_at' => now(),
            ]);

            if ($action === 'rejected') {
                $request->update([
                    'status' => 'rejected',
                    'current_approver_user_id' => null,
                ]);
            } elseif ($action === 'revision_requested') {
                $request->update([
                    'status' => 'revision_requested',
                ]);
            } elseif ($action === 'approved') {
                if ($request->current_step_order < $request->total_steps) {
                    $nextStepIndex = $request->current_step_order;
                    $nextStep = $steps[$nextStepIndex] ?? null;

                    $request->update([
                        'current_step_order' => $request->current_step_order + 1,
                        'current_approver_user_id' => $nextStep['approver_user_id'] ?? null,
                        'status' => 'pending',
                    ]);
                } else {
                    // Final Approval Reached!
                    $request->update([
                        'status' => 'approved',
                        'current_approver_user_id' => null,
                        'final_approved_at' => now(),
                        'final_approved_by_user_id' => $actionByUserId,
                    ]);

                    // Trigger module actions
                    $this->triggerModuleApproved($request);
                }
            }

            return $request->fresh(['requesterUser', 'currentApproverUser', 'finalApprovedByUser', 'histories.actionByUser', 'project', 'warehouse']);
        });
    }

    /**
     * Trigger business actions on final approval
     */
    protected function triggerModuleApproved(ApprovalRequest $request): void
    {
        if ($request->module === 'DELIVERY') {
            $delivery = Delivery::find($request->reference_id);
            if ($delivery) {
                $delivery->update([
                    'status' => 'approved',
                    'approved_by_user_id' => $request->final_approved_by_user_id,
                    'approved_at' => now(),
                ]);
            }
        } elseif ($request->module === 'WORK_ORDER') {
            $wo = WorkOrder::find($request->reference_id);
            if ($wo) {
                $wo->update([
                    'status' => 'approved',
                    'approved_by_user_id' => $request->final_approved_by_user_id,
                    'approved_at' => now(),
                ]);
            }
        } elseif ($request->module === 'SPK') {
            $spk = Spk::find($request->reference_id);
            if ($spk) {
                $spk->update([
                    'notes' => trim(($spk->notes ?? '') . " [Approved by User #{$request->final_approved_by_user_id} at " . now()->format('Y-m-d H:i') . "]"),
                ]);
            }
        }
    }
}
