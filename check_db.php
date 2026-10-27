<?php
require "/var/www/backend/vendor/autoload.php";
$app = require "/var/www/backend/bootstrap/app.php";
$app->make("Illuminate\Contracts\Console\Kernel")->bootstrap();

echo "=== GateDevices ===\n";
$devices = \App\Models\GateDevice::all();
foreach ($devices as $x) {
    echo json_encode([
        'id' => $x->id,
        'code' => $x->device_code,
        'role' => $x->device_role,
        'ws_url' => $x->edge_ws_url,
        'ip' => $x->ip_address,
        'port' => $x->tcp_port,
        'warehouse_id' => $x->warehouse_id,
        'is_active' => $x->is_active,
    ], JSON_PRETTY_PRINT) . "\n---\n";
}

echo "\n=== Warehouses ===\n";
$warehouses = \App\Models\Warehouse::all(['id','name','gate_mode']);
foreach ($warehouses as $w) {
    echo json_encode($w->toArray()) . "\n";
}

echo "\n=== nginx/ALLOW_HYBRID_DEVICE env ===\n";
echo "ALLOW_HYBRID_DEVICE=" . env('ALLOW_HYBRID_DEVICE','(unset)') . "\n";
echo "WS_CONTROL_PILOT_URL=" . env('WS_CONTROL_PILOT_URL','(unset)') . "\n";
echo "WS_CONTROL_PILOT_WAREHOUSE_ID=" . env('WS_CONTROL_PILOT_WAREHOUSE_ID','(unset)') . "\n";
echo "WS_CONTROL_SECRET=" . substr((string)env('WS_CONTROL_SECRET',''), 0, 4) . "****\n";
