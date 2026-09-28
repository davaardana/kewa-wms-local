<?php

namespace App\Console\Commands;

use App\Models\ApprovalHistory;
use App\Models\ApprovalRequest;
use App\Models\BoqItem;
use App\Models\CustodyLedger;
use App\Models\Delivery;
use App\Models\DeliveryItem;
use App\Models\DeviceHealthIncident;
use App\Models\GateDevice;
use App\Models\GatePassEvent;
use App\Models\GateTransaction;
use App\Models\GateTransactionItem;
use App\Models\Item;
use App\Models\Principal;
use App\Models\Project;
use App\Models\RfidTag;
use App\Models\Spk;
use App\Models\SpkItem;
use App\Models\Vehicle;
use App\Models\Warehouse;
use App\Models\WorkOrder;
use App\Models\User;
use Database\Seeders\DevelopmentSeeder;
use Database\Seeders\LaunchSeeder;
use Database\Seeders\StagingReadySeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

class CleanInitDatabase extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'mosa:clean-init 
                            {--dev : Alias data master bersih untuk development} 
                            {--staging-ready : Alias data master bersih untuk staging} 
                            {--prepared : Alias untuk --staging-ready} 
                            {--staging : Alias untuk --staging-ready} 
                            {--launch : Pure production launch master data only (No dummy transactions)} 
                            {--master-only : Setup User, Principal, Gudang & Katalog Barang (operasional kosong)} 
                            {--only-users : Empty ALL master data and transactions, keeping only users & system roles}
                            {--force : Force execution without confirmation}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Reset operational data and preserve master data for every Docker variant';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $isOnlyUsers = $this->option('only-users');
        $isDev = $this->option('dev');
        $isStagingReady = $this->option('staging-ready') || $this->option('prepared') || $this->option('staging');
        $isMasterOnly = $this->option('master-only') || $this->option('launch');

        $modeText = $isOnlyUsers 
            ? 'KOSONGKAN SEMUA DATA (HANYA SISAKAN USER & ROLE)' 
                : ($isDev
                ? 'DEVELOPMENT MASTER BERSIH'
                : ($isStagingReady 
                    ? 'STAGING MASTER BERSIH' 
                    : 'MASTER READY (USER, PRINCIPAL, GUDANG, BARANG — OPERASIONAL KOSONG)'));

        $this->info('===========================================================');
        $this->info("   MOSA WMS RFID — Database Reset & Clean Tool            ");
        $this->info("   Target Mode: [ {$modeText} ] ");
        $this->info('===========================================================');

        $this->line('1. Mengosongkan data transaksi operasional...');

        Schema::disableForeignKeyConstraints();

        // 1. Truncate Transactional Tables
        CustodyLedger::truncate();
        GatePassEvent::truncate();
        GateTransactionItem::truncate();
        GateTransaction::truncate();
        ApprovalHistory::truncate();
        ApprovalRequest::truncate();
        DeliveryItem::truncate();
        Delivery::truncate();
        BoqItem::truncate();
        WorkOrder::truncate();
        SpkItem::truncate();
        Spk::truncate();
        RfidTag::truncate();
        DeviceHealthIncident::truncate();
        GateDevice::truncate();

        // Keep warehouse_staff: warehouse assignments are master data.
        DB::table('project_warehouses')->truncate();
        Warehouse::query()->update(['project_id' => null]);
        Project::truncate();

        if ($isOnlyUsers) {
            // Truncate Master Data
            DB::table('warehouse_staff')->truncate();
            Warehouse::truncate();
            Project::truncate();
            Principal::truncate();
            Vehicle::truncate();
            Item::truncate();

            Schema::enableForeignKeyConstraints();

            // Ensure all 7 standard users exist if users table is empty or missing accounts
            $this->ensureDefaultUsersExist();

            $this->info('   [OK] Seluruh data master dan transaksi berhasil dikosongkan!');
            $this->info('   [OK] Akun Pengguna & Konfigurasi Role (7 Akun) tetap dipertahankan & siap digunakan.');
            $this->info('===========================================================');
            $this->info('   ✅ BERHASIL: Database Bersih Total (Hanya Sisakan User)! ');
            $this->info('===========================================================');
            return 0;
        }

        Schema::enableForeignKeyConstraints();

        $this->info('   [OK] Seluruh data transaksi lama berhasil dibersihkan.');
        $targetSeederName = $isDev 
            ? 'DevelopmentSeeder' 
            : ($isStagingReady ? 'StagingReadySeeder' : 'LaunchSeeder');

        $this->line('2. Menjalankan Seeder Target (' . $targetSeederName . ')...');

        if ($isDev) {
            $this->call('db:seed', ['--class' => DevelopmentSeeder::class]);
            $this->info('   [OK] Master data development bersih berhasil diinisialisasi.');
        } elseif ($isStagingReady) {
            $this->call('db:seed', ['--class' => StagingReadySeeder::class]);
            $this->info('   [OK] Master data staging bersih berhasil diinisialisasi.');
        } else {
            $this->call('db:seed', ['--class' => LaunchSeeder::class]);
            $this->info('   [OK] Master Data Murni (35 Katalog Item FO, Users, Gudang, Rules) berhasil diinisialisasi.');
        }

        $this->info('===========================================================');
        $this->info('   ✅ BERHASIL: Database Siap Digunakan!                  ');
        $this->info('===========================================================');

        return 0;
    }

    /**
     * Ensure all 7 standard production & operational users exist with matching roles.
     */
    protected function ensureDefaultUsersExist(): void
    {
        $password = Hash::make('password123');

        $users = [
            [
                'email' => 'superadmin@mosa.id',
                'name' => 'Super Administrator',
                'role' => 'superadmin',
                'phone' => '08111222333',
                'password' => $password,
            ],
            [
                'email' => 'direksi.hendra@mosa.id',
                'name' => 'Hendra Wijaya (Direktur Utama / Management)',
                'role' => 'management',
                'phone' => '08119998881',
                'password' => $password,
            ],
            [
                'email' => 'pm.budi@mosa.id',
                'name' => 'Budi Santoso (Project Manager)',
                'role' => 'pm',
                'phone' => '081234567890',
                'password' => $password,
            ],
            [
                'email' => 'procurement.siti@mosa.id',
                'name' => 'Siti Aminah (Procurement)',
                'role' => 'procurement',
                'phone' => '081298765432',
                'password' => $password,
            ],
            [
                'email' => 'storeroom.joko@mosa.id',
                'name' => 'Joko Prasetyo (Storeroom Staff)',
                'role' => 'storeroom',
                'phone' => '081345678901',
                'password' => $password,
            ],
            [
                'email' => 'pic.agus@mosa.id',
                'name' => 'Agus Pratama (PIC Lapangan)',
                'role' => 'pic_lapangan',
                'phone' => '081567890123',
                'password' => $password,
            ],
            [
                'email' => 'pic.dani@mosa.id',
                'name' => 'Dani Kurniawan (PIC Lapangan)',
                'role' => 'pic_lapangan',
                'phone' => '081678901234',
                'password' => $password,
            ],
            [
                'email' => 'gate.service@mosa.id',
                'name' => 'Gate Service System',
                'role' => 'superadmin',
                'phone' => '08110000000',
                'password' => $password,
            ],
        ];

        foreach ($users as $u) {
            User::firstOrCreate(['email' => $u['email']], $u);
        }
    }
}
