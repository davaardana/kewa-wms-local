<?php
$token = 'cb076bdc01876e19f27b2459db3d324f907d74f9260a2c12bc9bda3f0f19c364';
$hash = hash('sha256', $token);
echo 'PHP hash: ' . $hash . PHP_EOL;
echo 'Length: ' . strlen($hash) . PHP_EOL;
