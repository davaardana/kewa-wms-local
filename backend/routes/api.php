<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CustodyReportController;
use App\Http\Controllers\Api\DeviceTelemetryController;
use App\Http\Controllers\Api\FileUploadController;
use App\Http\Controllers\Api\GateEventController;
use App\Http\Controllers\Api\MasterDataController;
use App\Http\Controllers\Api\RfidTagController;
use App\Http\Controllers\Api\ShippingDocumentController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\WsControlTicketController;
use Illuminate\Support\Facades\Route;

// ──────────────────────────────────────────────
// PUBLIC — tidak perlu login
// ──────────────────────────────────────────────
Route::post('/auth/login', [AuthController::class, 'login']);

// ──────────────────────────────────────────────
// DEVICE AUTH — Edge Bridge / RFID Reader IoT
// ──────────────────────────────────────────────
Route::middleware('auth.device')->group(function () {
    Route::post('/gate/event',          [GateEventController::class,      'handleGateEvent']);
    Route::post('/devices/heartbeat',   [DeviceTelemetryController::class, 'heartbeat']);
    Route::post('/devices/incidents',   [DeviceTelemetryController::class, 'storeIncident']);
    Route::get('/devices/config',       [DeviceTelemetryController::class, 'config']);
});

// ──────────────────────────────────────────────
// USER AUTH — semua endpoint berikut perlu login
// ──────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {

    // WebSocket control ticket & SSE stream
    Route::post('/ws-control-ticket', [WsControlTicketController::class, 'store']);
    Route::get('/gate/stream',         [GateEventController::class,       'stream']);

    // Device telemetry (user-facing)
    Route::get('/devices/status',    [DeviceTelemetryController::class, 'getStatus']);
    Route::get('/devices/incidents', [DeviceTelemetryController::class, 'incidents']);

    // ── Auth & Profile ────────────────────────
    Route::get('/auth/me',       [AuthController::class, 'me']);
    Route::put('/auth/profile',  [AuthController::class, 'updateProfile']);
    Route::put('/auth/password', [AuthController::class, 'changePassword']);
    Route::post('/auth/logout',  [AuthController::class, 'logout']);

    // ── User & Role Management (SA only) ─────
    Route::get('/users',                         [UserController::class, 'index']);
    Route::post('/users',                        [UserController::class, 'store']);
    Route::put('/users/{id}',                    [UserController::class, 'update']);
    Route::delete('/users/{id}',                 [UserController::class, 'destroy']);
    Route::patch('/users/{id}/toggle-status',    [UserController::class, 'toggleStatus']);
    Route::get('/roles-permissions',             [UserController::class, 'getRolesAndPermissions']);
    Route::post('/roles',                        [UserController::class, 'createRole']);
    Route::put('/roles/{id}',                    [UserController::class, 'updateRole']);
    Route::delete('/roles/{id}',                 [UserController::class, 'deleteRole']);
    Route::patch('/roles/{id}/toggle-permission',[UserController::class, 'toggleRolePermission']);

    // ── File Upload ───────────────────────────
    Route::post('/upload', [FileUploadController::class, 'upload']);

    // ── Master Data ───────────────────────────
    Route::get('/warehouses',      [MasterDataController::class, 'getWarehouses']);
    Route::post('/warehouses',     [MasterDataController::class, 'createWarehouse']);
    Route::put('/warehouses/{id}', [MasterDataController::class, 'updateWarehouse']);

    Route::get('/items',   [MasterDataController::class, 'getItems']);
    Route::post('/items',  [MasterDataController::class, 'createItem']);

    // ── Device Management ─────────────────────
    Route::get('/devices',                    [DeviceTelemetryController::class, 'index']);
    Route::post('/devices',                   [DeviceTelemetryController::class, 'store']);
    Route::put('/devices/{id}',               [DeviceTelemetryController::class, 'update']);
    Route::delete('/devices/{id}',            [DeviceTelemetryController::class, 'destroy']);
    Route::post('/devices/test-connection',   [DeviceTelemetryController::class, 'testConnection']);

    // ── RFID Tag Registry & Enrollment ────────
    Route::get('/tags',                 [RfidTagController::class, 'index']);
    Route::post('/tags/enroll',         [RfidTagController::class, 'enroll']);
    Route::post('/tags/reserve',        [RfidTagController::class, 'reserve']);
    Route::post('/tags/bulk-delete',    [RfidTagController::class, 'bulkDestroy']);
    Route::get('/tags/{epc}',           [RfidTagController::class, 'show']);
    Route::patch('/tags/{epc}/status',  [RfidTagController::class, 'updateStatus']);
    Route::post('/tags/{epc}/reactivate',[RfidTagController::class, 'reactivate']);
    Route::delete('/tags/{epc}',        [RfidTagController::class, 'destroy']);

    // ── Shipping Documents ────────────────────
    // PM: buat, approve, cancel
    // PIC: assign-tags, scan-tag, batch-scan, complete
    Route::get('/shipping-documents',                      [ShippingDocumentController::class, 'index']);
    Route::post('/shipping-documents',                     [ShippingDocumentController::class, 'store']);
    Route::get('/shipping-documents/{id}',                 [ShippingDocumentController::class, 'show']);
    Route::post('/shipping-documents/{id}/approve',        [ShippingDocumentController::class, 'approve']);
    Route::post('/shipping-documents/{id}/assign-tags',    [ShippingDocumentController::class, 'assignTags']);
    Route::post('/shipping-documents/{id}/scan-tag',       [ShippingDocumentController::class, 'scanTag']);
    Route::post('/shipping-documents/{id}/batch-scan',     [ShippingDocumentController::class, 'batchScanTags']);
    Route::post('/shipping-documents/{id}/complete',       [ShippingDocumentController::class, 'complete']);
    Route::post('/shipping-documents/{id}/cancel',         [ShippingDocumentController::class, 'cancel']);

    // ── Gate Live Feed & Event Logs ───────────
    Route::get('/gate/live-feed',        [GateEventController::class, 'liveFeed']);
    Route::delete('/gate/events/{id}',   [GateEventController::class, 'destroy']);
    Route::delete('/gate/events',        [GateEventController::class, 'clearHistory']);

    // ── Reports & Audit Trail ─────────────────
    Route::get('/reports/stocks',        [CustodyReportController::class, 'stockSummary']);
    Route::get('/reports/stock-card',    [CustodyReportController::class, 'stockCard']);
    Route::get('/reports/audit-trail',   [CustodyReportController::class, 'auditTrail']);
    Route::get('/reports/dashboard-kpis',[CustodyReportController::class, 'dashboardKpis']);
    Route::post('/reports/stock-opname', [CustodyReportController::class, 'reconcileStockOpname']);
});
