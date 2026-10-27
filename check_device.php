<?php
require '/var/www/backend/vendor/autoload.php';

$app = require_once '/var/www/backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\GateDevice;
use Illuminate\Support\Facades\DB;

echo "DB Connection: " . config('database.default') . PHP_EOL;
echo "DB Host: " . config('database.connections.pgsql.host') . PHP_EOL;
echo "DB Name: " . config('database.connections.pgsql.database') . PHP_EOL;

$count = GateDevice::count();
echo "GateDevice count: " . $count . PHP_EOL;

if ($count > 0) {
    $d = GateDevice::first();
    echo "Device: " . $d->device_code . ", active: " . ($d->is_active ? 'yes' : 'no') . PHP_EOL;
    echo "Token hash: " . $d->api_token_hash . PHP_EOL;
}

$testToken = 'cb076bdc01876e19f27b2459db3d324f907d74f9260a2c12bc9bda3f0f19c364';
$testHash = hash('sha256', $testToken);
echo "Test token hash: " . $testHash . PHP_EOL;

$found = GateDevice::where('api_token_hash', $testHash)->where('is_active', true)->first();
echo "Device found by token: " . ($found ? 'YES id='.$found->id : 'NO') . PHP_EOL;

// Also try raw DB
$raw = DB::select('SELECT id, device_code, api_token_hash, is_active FROM gate_devices');
echo "Raw DB count: " . count($raw) . PHP_EOL;
foreach ($raw as $r) {
    echo " - id={$r->id} code={$r->device_code} active={$r->is_active} hash_start=" . substr($r->api_token_hash, 0, 20) . PHP_EOL;
}
