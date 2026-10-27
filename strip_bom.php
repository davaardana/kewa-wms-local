<?php
$p = '/var/www/backend/app/Http/Controllers/Api/ShippingDocumentController.php';
$d = file_get_contents($p);
$bom = chr(0xEF) . chr(0xBB) . chr(0xBF);
if (substr($d, 0, 3) === $bom) {
    $d = substr($d, 3);
    echo "BOM stripped\n";
} else {
    echo "No BOM found\n";
}
$d = str_replace("\r\n", "\n", $d);
file_put_contents($p, $d);
echo strlen($d) . " bytes written\n";
