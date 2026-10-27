<?php
$token = 'cb076bdc01876e19f27b2459db3d324f907d74f9260a2c12bc9bda3f0f19c364';
$hash  = hash('sha256', $token);
echo $hash . PHP_EOL;

// Update DB langsung
$pdo = new PDO('pgsql:host=mosa-postgres;dbname=mosa_wms', 'mosa_user', 'default123');
$stmt = $pdo->prepare("UPDATE gate_devices SET api_token_hash = ? WHERE device_code = 'GATE-01'");
$stmt->execute([$hash]);
echo "UPDATED: " . $stmt->rowCount() . " row(s)" . PHP_EOL;

// Verifikasi
$row = $pdo->query("SELECT device_code, api_token_hash, is_active FROM gate_devices WHERE device_code = 'GATE-01'")->fetch(PDO::FETCH_ASSOC);
print_r($row);
