<?php

use App\Http\Controllers\Api\ApprovalController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CustodyReportController;
use App\Http\Controllers\Api\DeliveryController;
use App\Http\Controllers\Api\FileUploadController;
use App\Http\Controllers\Api\GateEventController;
use App\Http\Controllers\Api\GateTransactionController;
use App\Http\Controllers\Api\MasterDataController;
use App\Http\Controllers\Api\DeviceTelemetryController;
use App\Http\Controllers\Api\ReturnController;
use App\Http\Controllers\Api\RfidTagController;
use App\Http\Controllers\Api\SpkController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\WorkOrderController;
use App\Http\Controllers\Api\WsControlTicketController;
use Illuminate\Support\Facades\Route;

// Public Auth routes
Route::post('/auth/login', [AuthController::class, 'login']);

// IoT Edge Gate Bridge Ingest Route & Remote Device Telemetry & Real-Time SSE Stream
Route::middleware('auth.device')->group(function () {
    Route::post('/gate/event', [GateEventController::class, 'handleGateEvent']);
    Route::post('/devices/heartbeat', [DeviceTelemetryController::class, 'heartbeat']);
    Route::post('/devices/incidents', [DeviceTelemetryController::class, 'storeIncident']);
    Route::get('/devices/config', [DeviceTelemetryController::class, 'config']);
});

// Protected API routes
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/ws-control-ticket', [WsControlTicketController::class, 'store']);
    Route::get('/gate/stream', [GateEventController::class, 'stream']);
    Route::get('/devices/status', [DeviceTelemetryController::class, 'getStatus']);
    Route::get('/devices/incidents', [DeviceTelemetryController::class, 'incidents']);

    // Auth Profile
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::put('/auth/profile', [AuthController::class, 'updateProfile']);
    Route::put('/auth/password', [AuthController::class, 'changePassword']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    // User & Access Management
    Route::get('/users', [UserController::class, 'index']);
    Route::post('/users', [UserController::class, 'store']);
    Route::put('/users/{id}', [UserController::class, 'update']);
    Route::delete('/users/{id}', [UserController::class, 'destroy']);
    Route::patch('/users/{id}/toggle-status', [UserController::class, 'toggleStatus']);
    Route::get('/roles-permissions', [UserController::class, 'getRolesAndPermissions']);
    Route::post('/roles', [UserController::class, 'createRole']);
    Route::put('/roles/{id}', [UserController::class, 'updateRole']);
    Route::delete('/roles/{id}', [UserController::class, 'deleteRole']);
    Route::patch('/roles/{id}/toggle-permission', [UserController::class, 'toggleRolePermission']);

    // File / Proof Document Upload
    Route::post('/upload', [FileUploadController::class, 'upload']);

    // Master Data
    Route::get('/principals', [MasterDataController::class, 'getPrincipals']);
    Route::post('/principals', [MasterDataController::class, 'createPrincipal']);

    Route::get('/projects', [MasterDataController::class, 'getProjects']);
    Route::post('/projects', [MasterDataController::class, 'createProject']);

    Route::get('/warehouses', [MasterDataController::class, 'getWarehouses']);
    Route::post('/warehouses', [MasterDataController::class, 'createWarehouse']);
    Route::put('/warehouses/{id}', [MasterDataController::class, 'updateWarehouse']);

    Route::get('/items', [MasterDataController::class, 'getItems']);
    Route::post('/items', [MasterDataController::class, 'createItem']);

    Route::get('/vehicles', [MasterDataController::class, 'getVehicles']);
    Route::post('/vehicles', [MasterDataController::class, 'createVehicle']);

    // Device Management & Pairing
    Route::get('/devices', [DeviceTelemetryController::class, 'index']);
    Route::post('/devices', [DeviceTelemetryController::class, 'store']);
    Route::put('/devices/{id}', [DeviceTelemetryController::class, 'update']);
    Route::delete('/devices/{id}', [DeviceTelemetryController::class, 'destroy']);
    Route::post('/devices/test-connection', [DeviceTelemetryController::class, 'testConnection']);

    // RFID Tag Registry & Enrollment
    Route::get('/tags', [RfidTagController::class, 'index']);
    Route::post('/tags/reserve', [RfidTagController::class, 'reserve']);
    Route::post('/tags/enroll', [RfidTagController::class, 'enroll']);
    Route::get('/tags/{epc}', [RfidTagController::class, 'show']);
    Route::patch('/tags/{epc}/status', [RfidTagController::class, 'updateStatus']);
    Route::delete('/tags/{epc}', [RfidTagController::class, 'destroy']);
    Route::post('/tags/{epc}/reactivate', [RfidTagController::class, 'reactivate']);
    Route::post('/tags/bulk-delete', [RfidTagController::class, 'bulkDestroy']);

    // SPK (Procurement & Contracts)
    Route::get('/spks', [SpkController::class, 'index']);
    Route::post('/spks', [SpkController::class, 'store']);
    Route::get('/spks/{id}', [SpkController::class, 'show']);
    Route::patch('/spks/{id}/payment-status', [SpkController::class, 'updatePaymentStatus']);

    // Deliveries (Principal Stock-In & Handheld 1 / Handheld 2 Reconciler)
    Route::get('/deliveries', [DeliveryController::class, 'index']);
    Route::post('/deliveries', fn () => response()->json([
        'message' => 'Manual delivery without EPC is disabled. Use dispatch-scan and receiving-scan.',
    ], 410));
    Route::post('/deliveries/dispatch-scan', [DeliveryController::class, 'recordDispatchScan']);
    Route::post('/deliveries/{id}/receiving-scan', [DeliveryController::class, 'recordReceivingScan']);
    Route::post('/deliveries/{id}/approve', fn () => response()->json([
        'message' => 'Manual delivery approval without EPC is disabled.',
    ], 410));

    // Work Orders & BOQ Quotas
    Route::get('/work-orders', [WorkOrderController::class, 'index']);
    Route::post('/work-orders', [WorkOrderController::class, 'store']);
    Route::get('/work-orders/{id}', [WorkOrderController::class, 'show']);
    Route::post('/work-orders/{id}/approve', [WorkOrderController::class, 'approve']);
    Route::post('/work-orders/{id}/report-prepared', [WorkOrderController::class, 'reportPrepared']);
    Route::patch('/work-orders/{id}/report-installed', [WorkOrderController::class, 'reportInstalled']);

    // Gate Transactions (Fulfillment & Return Access Requests)
    Route::get('/gate/transactions', [GateTransactionController::class, 'index']);
    Route::post('/gate/transactions', [GateTransactionController::class, 'store']);
    Route::post('/gate/transactions/{id}/approve', [GateTransactionController::class, 'approve']);
    Route::post('/gate/transactions/{id}/reject', [GateTransactionController::class, 'reject']);
    Route::post('/gate/transactions/{id}/cancel', [GateTransactionController::class, 'cancel']);
    Route::post('/gate/transactions/{id}/finalize-partial', [GateTransactionController::class, 'finalizePartial']);
    Route::post('/gate/transactions/{id}/adjust-items', [GateTransactionController::class, 'adjustItems']);

    // Live Monitoring & Gate Event Logs
    Route::get('/gate/live-feed', [GateEventController::class, 'liveFeed']);
    Route::delete('/gate/events/{id}', [GateEventController::class, 'destroy']);
    Route::delete('/gate/events', [GateEventController::class, 'clearHistory']);

    // Returns Flow
    Route::post('/returns/request', [ReturnController::class, 'createReturnRequest']);
    Route::post('/returns/{transactionId}/verify', [ReturnController::class, 'verifyReturn']);

    // Approval Engine & Workflow
    Route::get('/approvals', [ApprovalController::class, 'index']);
    Route::get('/approvals/{id}', [ApprovalController::class, 'show']);
    Route::post('/approvals/{id}/action', [ApprovalController::class, 'action']);
    
    Route::get('/approval-templates', [ApprovalController::class, 'getTemplates']);
    Route::post('/approval-templates', [ApprovalController::class, 'storeTemplate']);
    Route::put('/approval-templates/{id}', [ApprovalController::class, 'updateTemplate']);
    Route::delete('/approval-templates/{id}', [ApprovalController::class, 'deleteTemplate']);
    
    Route::get('/approval-configs', [ApprovalController::class, 'getConfigs']);
    Route::post('/approval-configs', [ApprovalController::class, 'saveConfig']);
    Route::delete('/approval-configs/{id}', [ApprovalController::class, 'deleteConfig']);

    // Reports & Audit Trail
    Route::get('/reports/stocks', [CustodyReportController::class, 'stockSummary']);
    Route::get('/reports/stock-card', [CustodyReportController::class, 'stockCard']);
    Route::get('/reports/audit-trail', [CustodyReportController::class, 'auditTrail']);
    Route::get('/reports/dashboard-kpis', [CustodyReportController::class, 'dashboardKpis']);
    Route::post('/reports/stock-opname', [CustodyReportController::class, 'reconcileStockOpname']);
});
