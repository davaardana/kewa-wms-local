<?php
require __DIR__."/vendor/autoload.php";
$app = require __DIR__."/bootstrap/app.php";
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

$epcTarget = "E280689400004035E341B0F4";

// Kolom rfid_tags
$cols = DB::select("SELECT column_name FROM information_schema.columns WHERE table_name='rfid_tags' ORDER BY ordinal_position");
echo "Kolom rfid_tags: " . implode(', ', array_column($cols, 'column_name')) . "\n\n";

// Cek EPC di rfid_tags
$existing = DB::table('rfid_tags')->where('epc', $epcTarget)->first();
echo "EPC $epcTarget di rfid_tags: " . ($existing ? "ADA → ID={$existing->id}" : "BELUM ADA (belum dienroll)") . "\n";

// 10 tag terbaru
$tags = DB::table('rfid_tags')->orderByDesc('id')->limit(10)->get();
echo "\n10 rfid_tags terbaru:\n";
foreach ($tags as $t) {
    $arr = (array)$t;
    echo "  ID={$arr['id']} epc={$arr['epc']}\n";
}

// Cache state
$tag = Cache::get("enrollment_last_tag:1");
echo "\nCache enrollment_last_tag:1: " . ($tag ? "epc={$tag['epc']} rssi={$tag['rssi']} received_at={$tag['received_at']}" : "KOSONG") . "\n";

// SSE live test
$lr = json_decode(file_get_contents('http://206.237.98.48/api/auth/login', false,
    stream_context_create(['http'=>['method'=>'POST','ignore_errors'=>true,
        'header'=>"Content-Type: application/json\r\nAccept: application/json\r\n",
        'content'=>json_encode(["email"=>"dava@mosaik.co.id","password"=>"Lamineyamal10!"])]])), true);
$token = $lr['token'] ?? '';
echo "\nLogin API: " . ($token ? "OK" : "GAGAL") . "\n";

if ($token) {
    $body = @file_get_contents('http://nginx/api/enrollment/stream?warehouse_id=1', false,
        stream_context_create(['http'=>['method'=>'GET','timeout'=>3,'ignore_errors'=>true,
            'header'=>"Authorization: Bearer $token\r\nAccept: text/event-stream\r\n"]]));
    echo "SSE: " . ($http_response_header[0] ?? 'NO_RESP') . "\n";
    echo "EPC target di SSE stream: " . (strpos($body??'', $epcTarget)!==false ? "YA ✅" : "TIDAK ❌") . "\n";
    echo substr($body??'(kosong)', 0, 500) . "\n";
}
