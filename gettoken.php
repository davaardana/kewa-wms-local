<?php
chdir('/var/www/backend');
require '/var/www/backend/vendor/autoload.php';
$app = require '/var/www/backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$u = App\Models\User::where('role', 'superadmin')->first();
if (!$u) { echo "NO_SUPERADMIN\n"; exit(1); }

// Hapus token lama ber-nama 'clitest' biar tidak numpuk
$u->tokens()->where('name', 'clitest')->delete();
$tok = $u->createToken('clitest')->plainTextToken;
echo $tok . "\n";
