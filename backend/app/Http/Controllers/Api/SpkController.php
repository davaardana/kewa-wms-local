<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Spk;
use App\Models\SpkItem;
use App\Services\ApprovalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SpkController extends Controller
{
    public function __construct(
        protected ApprovalService $approvalService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = Spk::with([
            'principal',
            'project',
            'createdBy',
            'items.item',
            'deliveries',
            'approvalRequest.requesterUser',
            'approvalRequest.currentApproverUser',
            'approvalRequest.finalApprovedByUser',
            'approvalRequest.histories.actionByUser',
        ]);

        if ($request->filled('principal_id')) {
            $query->where('principal_id', $request->principal_id);
        }

        if ($request->filled('payment_status')) {
            $query->where('payment_status', $request->payment_status);
        }

        // Data Visibility Scoping: Creator, Approver Chain, PM/Procurement/Storeroom (if approved), or SuperAdmin/Management
        $user = $request->user();
        if ($user && !$user->isManagement()) {
            $userId = $user->id;
            $query->where(function ($q) use ($userId, $user) {
                $q->where('created_by_user_id', $userId)
                  ->orWhereNull('created_by_user_id')
                  ->orDoesntHave('approvalRequest')
                  ->orWhereHas('approvalRequest', function ($aq) use ($userId) {
                      $aq->where('requester_user_id', $userId)
                         ->orWhere('current_approver_user_id', $userId)
                         ->orWhere('final_approved_by_user_id', $userId)
                         ->orWhereHas('histories', function ($hq) use ($userId) {
                             $hq->where('action_by_user_id', $userId)
                                ->orWhere('designated_user_id', $userId);
                         })
                         ->orWhere('steps_snapshot_json', 'like', '%"approver_user_id":' . $userId . '%')
                         ->orWhere('steps_snapshot_json', 'like', '%"approver_user_id": ' . $userId . '%');
                  });

                // PM, Procurement, and Storeroom operational visibility for approved SPKs
                if ($user->isPm() || $user->isProcurement() || $user->isStoreroom()) {
                    $q->orWhereHas('approvalRequest', function ($aq) {
                        $aq->where('status', 'approved');
                    });
                }
            });
        }

        return response()->json($query->latest()->get());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'principal_id' => 'required|exists:principals,id',
            'project_id' => 'nullable|exists:projects,id',
            'spk_number' => 'required|string|max:100|unique:spks,spk_number',
            'title' => 'required|string|max:191',
            'total_amount' => 'required|numeric|min:0',
            'payment_status' => 'required|in:unpaid,partial,paid',
            'payment_terms_json' => 'nullable|array',
            'document_url' => 'nullable|string',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
            'notes' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.item_id' => 'required|exists:items,id',
            'items.*.target_qty' => 'required|integer|min:1',
            'items.*.price_per_unit' => 'required|numeric|min:0',
            'items.*.notes' => 'nullable|string',
        ]);

        return DB::transaction(function () use ($validated, $request) {
            $userId = $request->user()?->id ?? 1;

            $spk = Spk::create([
                'principal_id' => $validated['principal_id'],
                'project_id' => $validated['project_id'] ?? null,
                'created_by_user_id' => $userId,
                'spk_number' => $validated['spk_number'],
                'title' => $validated['title'],
                'total_amount' => $validated['total_amount'],
                'payment_status' => $validated['payment_status'],
                'payment_terms_json' => $validated['payment_terms_json'] ?? null,
                'document_url' => $validated['document_url'] ?? null,
                'start_date' => $validated['start_date'] ?? null,
                'end_date' => $validated['end_date'] ?? null,
                'notes' => $validated['notes'] ?? null,
            ]);

            foreach ($validated['items'] as $itemData) {
                SpkItem::create([
                    'spk_id' => $spk->id,
                    'item_id' => $itemData['item_id'],
                    'target_qty' => $itemData['target_qty'],
                    'price_per_unit' => $itemData['price_per_unit'],
                    'received_qty' => 0,
                    'notes' => $itemData['notes'] ?? null,
                ]);
            }

            // Create Approval Request for SPK
            $this->approvalService->createApprovalRequest(
                module: 'SPK',
                referenceId: $spk->id,
                referenceCode: $spk->spk_number,
                title: "Persetujuan Kontrak SPK: {$spk->title}",
                requesterUserId: $request->user()?->id ?? 1,
                projectId: $spk->project_id,
                totalAmount: (float) $spk->total_amount,
                metaData: ['items_count' => count($validated['items'])]
            );

            return response()->json($spk->load(['principal', 'items.item']), 201);
        });
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $spk = Spk::with([
            'principal',
            'project',
            'createdBy',
            'items.item',
            'deliveries.items.item',
            'approvalRequest.requesterUser',
            'approvalRequest.currentApproverUser',
            'approvalRequest.finalApprovedByUser',
            'approvalRequest.histories.actionByUser',
        ])->findOrFail($id);

        $user = $request->user();
        if ($user && !$user->isManagement()) {
            $userId = $user->id;
            $appReq = $spk->approvalRequest;
            $isAuthorized = (
                $spk->created_by_user_id === $userId ||
                is_null($spk->created_by_user_id) ||
                is_null($appReq) ||
                ($appReq && (
                    $appReq->requester_user_id === $userId ||
                    $appReq->current_approver_user_id === $userId ||
                    $appReq->final_approved_by_user_id === $userId ||
                    $appReq->histories->contains(fn ($h) => $h->action_by_user_id === $userId || $h->designated_user_id === $userId) ||
                    (is_array($appReq->steps_snapshot_json) && collect($appReq->steps_snapshot_json)->contains(fn ($s) => ($s['approver_user_id'] ?? null) == $userId))
                )) ||
                (($user->isPm() || $user->isProcurement() || $user->isStoreroom()) && (!$appReq || $appReq->status === 'approved'))
            );

            if (!$isAuthorized) {
                return response()->json(['message' => 'Anda tidak memiliki hak akses untuk melihat SPK ini.'], 403);
            }
        }

        return response()->json($spk);
    }

    public function updatePaymentStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'payment_status' => 'required|in:unpaid,partial,paid',
            'payment_terms_json' => 'nullable|array',
            'notes' => 'nullable|string',
        ]);

        $spk = Spk::findOrFail($id);
        $spk->update($validated);

        return response()->json([
            'message' => 'SPK payment status updated successfully',
            'spk' => $spk,
        ]);
    }
}
