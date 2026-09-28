<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApprovalConfig;
use App\Models\ApprovalConfigStep;
use App\Models\ApprovalRequest;
use App\Models\ApprovalTemplate;
use App\Models\ApprovalTemplateStep;
use App\Services\ApprovalService;
use Exception;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ApprovalController extends Controller
{
    protected ApprovalService $approvalService;

    public function __construct(ApprovalService $approvalService)
    {
        $this->approvalService = $approvalService;
    }

    /**
     * Get list of approval requests with filtering
     */
    public function index(Request $request): JsonResponse
    {
        $query = ApprovalRequest::with([
            'project',
            'warehouse',
            'requesterUser',
            'currentApproverUser',
            'finalApprovedByUser',
            'histories.actionByUser',
            'histories.designatedUser',
        ])->latest('id');

        if ($request->has('module') && $request->module !== 'ALL') {
            $query->where('module', $request->module);
        }

        if ($request->has('status') && $request->status !== 'ALL') {
            $query->where('status', $request->status);
        }

        if ($request->has('project_id') && $request->project_id) {
            $query->where('project_id', $request->project_id);
        }

        if ($request->has('warehouse_id') && $request->warehouse_id) {
            $query->where('warehouse_id', $request->warehouse_id);
        }

        if ($request->has('user_id') && $request->filter_type === 'my_pending') {
            $userId = (int) $request->user_id;
            $query->where('status', 'pending')
                  ->where('current_approver_user_id', $userId);
        }

        // Data Visibility Scoping: Creator, Approver Chain, or SuperAdmin/Management
        $user = $request->user();
        if ($user && !$user->isManagement()) {
            $userId = $user->id;
            $query->where(function ($q) use ($userId) {
                $q->where('requester_user_id', $userId)
                  ->orWhere('current_approver_user_id', $userId)
                  ->orWhere('final_approved_by_user_id', $userId)
                  ->orWhereHas('histories', function ($hq) use ($userId) {
                      $hq->where('action_by_user_id', $userId)
                         ->orWhere('designated_user_id', $userId);
                  })
                  ->orWhere('steps_snapshot_json', 'like', '%"approver_user_id":' . $userId . '%')
                  ->orWhere('steps_snapshot_json', 'like', '%"approver_user_id": ' . $userId . '%');
            });
        }

        $requests = $query->paginate($request->get('per_page', 50));

        return response()->json($requests);
    }

    /**
     * Get single approval request detail
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $approvalRequest = ApprovalRequest::with([
            'project',
            'warehouse',
            'requesterUser',
            'currentApproverUser',
            'finalApprovedByUser',
            'histories.actionByUser',
            'histories.designatedUser',
        ])->findOrFail($id);

        $user = $request->user();
        if ($user && !$user->isManagement()) {
            $userId = $user->id;
            $isAuthorized = (
                $approvalRequest->requester_user_id === $userId ||
                $approvalRequest->current_approver_user_id === $userId ||
                $approvalRequest->final_approved_by_user_id === $userId ||
                $approvalRequest->histories->contains(fn ($h) => $h->action_by_user_id === $userId || $h->designated_user_id === $userId) ||
                (is_array($approvalRequest->steps_snapshot_json) && collect($approvalRequest->steps_snapshot_json)->contains(fn ($s) => ($s['approver_user_id'] ?? null) == $userId))
            );

            if (!$isAuthorized) {
                return response()->json(['message' => 'Anda tidak memiliki hak akses untuk melihat permohonan approval ini.'], 403);
            }
        }

        return response()->json($approvalRequest);
    }

    /**
     * Process step action (approve / reject / revision_requested)
     */
    public function action(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'action' => 'required|in:approved,rejected,revision_requested',
            'comments' => 'nullable|string|max:1000',
        ]);

        try {
            $updated = $this->approvalService->processStepAction(
                $id,
                (int) $request->user()->id,
                $validated['action'],
                $validated['comments'] ?? null
            );

            return response()->json([
                'success' => true,
                'message' => "Aksi {$validated['action']} berhasil diproses.",
                'data' => $updated,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Get all approval templates
     */
    public function getTemplates(): JsonResponse
    {
        $templates = ApprovalTemplate::with(['steps.approverUser'])
            ->orderBy('module')
            ->orderBy('name')
            ->get();

        return response()->json($templates);
    }

    /**
     * Store a new approval template
     */
    public function storeTemplate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:150',
            'code' => 'required|string|max:50|unique:approval_templates,code',
            'module' => 'required|in:SPK,WORK_ORDER,DELIVERY,RETURN_SCRAP,GATE_ACCESS',
            'description' => 'nullable|string',
            'is_default' => 'boolean',
            'min_amount' => 'nullable|numeric',
            'max_amount' => 'nullable|numeric',
            'steps' => 'required|array|min:1',
            'steps.*.step_name' => 'required|string|max:150',
            'steps.*.approver_user_id' => 'required|exists:users,id',
            'steps.*.sla_hours' => 'nullable|integer|min:1',
        ]);

        $template = DB::transaction(function () use ($validated) {
            $tpl = ApprovalTemplate::create([
                'name' => $validated['name'],
                'code' => $validated['code'],
                'module' => $validated['module'],
                'description' => $validated['description'] ?? null,
                'is_default' => $validated['is_default'] ?? false,
                'min_amount' => $validated['min_amount'] ?? null,
                'max_amount' => $validated['max_amount'] ?? null,
            ]);

            foreach ($validated['steps'] as $idx => $step) {
                ApprovalTemplateStep::create([
                    'approval_template_id' => $tpl->id,
                    'step_order' => $idx + 1,
                    'step_name' => $step['step_name'],
                    'approver_user_id' => $step['approver_user_id'],
                    'sla_hours' => $step['sla_hours'] ?? 24,
                    'can_reject' => true,
                ]);
            }

            return $tpl;
        });

        return response()->json([
            'success' => true,
            'message' => 'Template approval berhasil dibuat',
            'data' => $template->load('steps.approverUser'),
        ], 201);
    }

    /**
     * Update an approval template
     */
    public function updateTemplate(Request $request, int $id): JsonResponse
    {
        $tpl = ApprovalTemplate::findOrFail($id);

        $validated = $request->validate([
            'name' => 'required|string|max:150',
            'code' => "required|string|max:50|unique:approval_templates,code,{$id}",
            'module' => 'required|in:SPK,WORK_ORDER,DELIVERY,RETURN_SCRAP,GATE_ACCESS',
            'description' => 'nullable|string',
            'is_default' => 'boolean',
            'min_amount' => 'nullable|numeric',
            'max_amount' => 'nullable|numeric',
            'steps' => 'required|array|min:1',
            'steps.*.step_name' => 'required|string|max:150',
            'steps.*.approver_user_id' => 'required|exists:users,id',
            'steps.*.sla_hours' => 'nullable|integer|min:1',
        ]);

        DB::transaction(function () use ($tpl, $validated) {
            $tpl->update([
                'name' => $validated['name'],
                'code' => $validated['code'],
                'module' => $validated['module'],
                'description' => $validated['description'] ?? null,
                'is_default' => $validated['is_default'] ?? false,
                'min_amount' => $validated['min_amount'] ?? null,
                'max_amount' => $validated['max_amount'] ?? null,
            ]);

            $tpl->steps()->delete();

            foreach ($validated['steps'] as $idx => $step) {
                ApprovalTemplateStep::create([
                    'approval_template_id' => $tpl->id,
                    'step_order' => $idx + 1,
                    'step_name' => $step['step_name'],
                    'approver_user_id' => $step['approver_user_id'],
                    'sla_hours' => $step['sla_hours'] ?? 24,
                    'can_reject' => true,
                ]);
            }
        });

        return response()->json([
            'success' => true,
            'message' => 'Template approval berhasil diperbarui',
            'data' => $tpl->fresh(['steps.approverUser']),
        ]);
    }

    /**
     * Delete approval template
     */
    public function deleteTemplate(int $id): JsonResponse
    {
        $tpl = ApprovalTemplate::findOrFail($id);
        $tpl->delete();

        return response()->json([
            'success' => true,
            'message' => 'Template approval berhasil dihapus',
        ]);
    }

    /**
     * Get all project / warehouse approval configs
     */
    public function getConfigs(): JsonResponse
    {
        $configs = ApprovalConfig::with([
            'project',
            'warehouse',
            'template.steps.approverUser',
            'customSteps.approverUser',
        ])->get();

        return response()->json($configs);
    }

    /**
     * Save project or warehouse custom approval config
     */
    public function saveConfig(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'scope_type' => 'required|in:project,warehouse',
            'project_id' => 'nullable|required_if:scope_type,project|exists:projects,id',
            'warehouse_id' => 'nullable|required_if:scope_type,warehouse|exists:warehouses,id',
            'module' => 'required|in:SPK,WORK_ORDER,DELIVERY,RETURN_SCRAP,GATE_ACCESS',
            'use_template' => 'required|boolean',
            'approval_template_id' => 'nullable|required_if:use_template,true|exists:approval_templates,id',
            'description' => 'nullable|string',
            'custom_steps' => 'nullable|array',
            'custom_steps.*.step_name' => 'required_if:use_template,false|string|max:150',
            'custom_steps.*.approver_user_id' => 'required_if:use_template,false|exists:users,id',
            'custom_steps.*.sla_hours' => 'nullable|integer|min:1',
        ]);

        $config = DB::transaction(function () use ($validated) {
            $cfg = ApprovalConfig::updateOrCreate(
                [
                    'scope_type' => $validated['scope_type'],
                    'project_id' => $validated['scope_type'] === 'project' ? $validated['project_id'] : null,
                    'warehouse_id' => $validated['scope_type'] === 'warehouse' ? $validated['warehouse_id'] : null,
                    'module' => $validated['module'],
                ],
                [
                    'use_template' => $validated['use_template'],
                    'approval_template_id' => $validated['use_template'] ? ($validated['approval_template_id'] ?? null) : null,
                    'description' => $validated['description'] ?? null,
                    'is_active' => true,
                ]
            );

            $cfg->customSteps()->delete();

            if (!$validated['use_template'] && !empty($validated['custom_steps'])) {
                foreach ($validated['custom_steps'] as $idx => $step) {
                    ApprovalConfigStep::create([
                        'approval_config_id' => $cfg->id,
                        'step_order' => $idx + 1,
                        'step_name' => $step['step_name'],
                        'approver_user_id' => $step['approver_user_id'],
                        'sla_hours' => $step['sla_hours'] ?? 24,
                        'can_reject' => true,
                    ]);
                }
            }

            return $cfg;
        });

        return response()->json([
            'success' => true,
            'message' => 'Konfigurasi approval berhasil disimpan',
            'data' => $config->load(['project', 'warehouse', 'template.steps.approverUser', 'customSteps.approverUser']),
        ]);
    }

    /**
     * Delete approval config
     */
    public function deleteConfig(int $id): JsonResponse
    {
        $cfg = ApprovalConfig::findOrFail($id);
        $cfg->delete();

        return response()->json([
            'success' => true,
            'message' => 'Konfigurasi approval berhasil dihapus',
        ]);
    }
}
