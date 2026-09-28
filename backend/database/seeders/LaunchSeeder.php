<?php

namespace Database\Seeders;

use App\Models\ApprovalTemplate;
use App\Models\ApprovalTemplateStep;
use App\Models\Item;
use App\Models\Principal;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class LaunchSeeder extends Seeder
{
    /**
     * Seed pure Master Data for Launch / Production Go-Live.
     * Contains NO fake transactions, NO dummy SPKs, NO fake deliveries.
     */
    public function run(): void
    {
        // 1. Initial Production & Operation Users
        $password = Hash::make('password123');

        $superAdmin = User::firstOrCreate(
            ['email' => 'superadmin@mosa.id'],
            [
                'name' => 'Super Administrator',
                'role' => 'superadmin',
                'phone' => '08111222333',
                'password' => $password,
            ]
        );

        $direksi = User::firstOrCreate(
            ['email' => 'direksi.hendra@mosa.id'],
            [
                'name' => 'Hendra Wijaya (Direktur Utama / Management)',
                'role' => 'management',
                'phone' => '08119998881',
                'password' => $password,
            ]
        );

        $pm = User::firstOrCreate(
            ['email' => 'pm.budi@mosa.id'],
            [
                'name' => 'Budi Santoso (Project Manager)',
                'role' => 'pm',
                'phone' => '081234567890',
                'password' => $password,
            ]
        );

        $procurement = User::firstOrCreate(
            ['email' => 'procurement.siti@mosa.id'],
            [
                'name' => 'Siti Aminah (Procurement)',
                'role' => 'procurement',
                'phone' => '081298765432',
                'password' => $password,
            ]
        );

        $storeroom = User::firstOrCreate(
            ['email' => 'storeroom.joko@mosa.id'],
            [
                'name' => 'Joko Prasetyo (Storeroom Staff)',
                'role' => 'storeroom',
                'phone' => '081345678901',
                'password' => $password,
            ]
        );

        $picAgus = User::firstOrCreate(
            ['email' => 'pic.agus@mosa.id'],
            [
                'name' => 'Agus Pratama (PIC Lapangan)',
                'role' => 'pic_lapangan',
                'phone' => '081567890123',
                'password' => $password,
            ]
        );

        $picDani = User::firstOrCreate(
            ['email' => 'pic.dani@mosa.id'],
            [
                'name' => 'Dani Kurniawan (PIC Lapangan)',
                'role' => 'pic_lapangan',
                'phone' => '081678901234',
                'password' => $password,
            ]
        );

        $gateService = User::firstOrCreate(
            ['email' => 'gate.service@mosa.id'],
            [
                'name' => 'IoT Gate Edge Bridge',
                'role' => 'gate_service',
                'phone' => '081999888777',
                'password' => $password,
            ]
        );

        // 2. Principals Telco
        $myrep = Principal::firstOrCreate(
            ['code' => 'MYREP'],
            [
                'name' => 'PT MyRepublic Indonesia',
                'contact_person' => 'Rian Hidayat (Head of Rollout)',
                'phone' => '021-50505050',
                'email' => 'vendor.ops@myrepublic.co.id',
                'address' => 'Gedung MyRepublic Lt. 8, BSD City, Tangerang',
            ]
        );

        $biznet = Principal::firstOrCreate(
            ['code' => 'BZNET'],
            [
                'name' => 'PT Biznet Networks',
                'contact_person' => 'Hendro Wijaya (Procurement Manager)',
                'phone' => '021-57998888',
                'email' => 'procurement@biznetnetworks.com',
                'address' => 'MidPlaza 2 Lt. 8, Jl. Jend. Sudirman, Jakarta Pusat',
            ]
        );

        $telkom = Principal::firstOrCreate(
            ['code' => 'TLKM'],
            [
                'name' => 'PT Telkom Indonesia Tbk',
                'contact_person' => 'Bambang Soediro (Logistik FO)',
                'phone' => '021-5215123',
                'email' => 'logistik.access@telkom.co.id',
                'address' => 'Telkom Landmark Tower, Jl. Gatot Subroto, Jakarta Selatan',
            ]
        );

        $moratel = Principal::firstOrCreate(
            ['code' => 'MORA'],
            [
                'name' => 'PT Moratelindo (Oxygen.id)',
                'contact_person' => 'Dwi Cahyono',
                'phone' => '021-31998800',
                'email' => 'rollout@moratelindo.co.id',
                'address' => 'Graha 9 Lt. 5, Jl. Matraman Raya No. 9, Jakarta Timur',
            ]
        );

        // 3. Warehouses
        $whBogor = Warehouse::firstOrCreate(
            ['code' => 'WH-BOGOR-01'],
            [
                'project_id' => null,
                'name' => 'Gudang Transit Proyek Tajur Bogor',
                'gate_mode' => 'SINGLE_ANTENNA_SESSION',
                'address' => 'Jl. Raya Tajur No. 88, Bogor Timur',
                'latitude' => -6.6214560,
                'longitude' => 106.8284500,
                'pic_user_id' => $storeroom->id,
                'phone' => '0813-9876-5432',
                'capacity' => 1000,
                'is_active' => true,
            ]
        );
        $whBogor->staff()->syncWithoutDetaching([
            $storeroom->id => ['role_in_warehouse' => 'pic'],
            $superAdmin->id => ['role_in_warehouse' => 'staff'],
        ]);

        $whDepok = Warehouse::firstOrCreate(
            ['code' => 'WH-DEPOK-01'],
            [
                'project_id' => null,
                'name' => 'Gudang Lapangan Margonda',
                'gate_mode' => 'SINGLE_ANTENNA_SESSION',
                'address' => 'Jl. Margonda Raya No. 120, Depok',
                'latitude' => -6.3728400,
                'longitude' => 106.8329400,
                'pic_user_id' => $storeroom->id,
                'phone' => '0812-3456-7890',
                'capacity' => 500,
                'is_active' => true,
            ]
        );
        $whDepok->staff()->syncWithoutDetaching([
            $storeroom->id => ['role_in_warehouse' => 'pic'],
        ]);

        $whSharedHub = Warehouse::firstOrCreate(
            ['code' => 'WH-HUB-JABAR'],
            [
                'project_id' => null,
                'name' => 'Gudang Hub Regional Jabar Sentul (Shared Multi-Project)',
                'gate_mode' => 'DUAL_ANTENNA_AUTO',
                'address' => 'Kawasan Industri Sentul Kav. 8, Bogor-Depok Ring Road',
                'latitude' => -6.5341200,
                'longitude' => 106.8572100,
                'pic_user_id' => $storeroom->id,
                'phone' => '0811-2233-4455',
                'capacity' => 3000,
                'is_active' => true,
            ]
        );
        $whSharedHub->staff()->syncWithoutDetaching([
            $storeroom->id => ['role_in_warehouse' => 'pic'],
            $superAdmin->id => ['role_in_warehouse' => 'staff'],
        ]);
        // 4. Comprehensive 35 Master Items Catalog for FO Rollout
        $catalogItems = [
            // --- KELOMPOK 1: TIANG & PONDASI (POLE) ---
            [
                'code' => 'POLE-FO-7M',
                'name' => 'Tiang FO 7 Meter Besi Hot-Dip Galvanis 3.2mm',
                'category' => 'pole',
                'is_metal' => true,
                'is_reusable' => false,
                'is_serialized_tag' => true,
                'unit' => 'batang',
                'min_stock' => 50,
                'description' => 'Tiang besi hot-dip galvanis tebal 3.2mm untuk tiang distribusi FO perumahan',
            ],
            [
                'code' => 'POLE-FO-9M',
                'name' => 'Tiang FO 9 Meter Besi Hot-Dip Galvanis Crossing',
                'category' => 'pole',
                'is_metal' => true,
                'is_reusable' => false,
                'is_serialized_tag' => true,
                'unit' => 'batang',
                'min_stock' => 20,
                'description' => 'Tiang besi galvanis crossing jalan protokol & feeder utama',
            ],
            [
                'code' => 'POLE-FO-12M',
                'name' => 'Tiang FO 12 Meter Galvanis Heavy Duty Crossing Jalan Raya',
                'category' => 'pole',
                'is_metal' => true,
                'is_reusable' => false,
                'is_serialized_tag' => true,
                'unit' => 'batang',
                'min_stock' => 10,
                'description' => 'Tiang galvanis ekstra tinggi untuk perlintasan rel kereta & jalan tol',
            ],
            [
                'code' => 'POLE-BASE-PLATE',
                'name' => 'Base Plate & Set Angkur Pondasi Tiang FO Galvanis',
                'category' => 'pole',
                'is_metal' => true,
                'is_reusable' => false,
                'is_serialized_tag' => false,
                'unit' => 'set',
                'min_stock' => 30,
                'description' => 'Plat landasan dan baut angkur tanam cor beton untuk pondasi tiang',
            ],
            [
                'code' => 'POLE-CAP-PVC',
                'name' => 'Tutup Tiang FO Anti-Air (Pole Cap PVC 3 Inch)',
                'category' => 'accessories',
                'is_metal' => false,
                'is_reusable' => false,
                'is_serialized_tag' => false,
                'unit' => 'pcs',
                'min_stock' => 100,
                'description' => 'Penutup puncak tiang agar tidak kemasukan air hujan dan mencegah karat dalam',
            ],

            // --- KELOMPOK 2: KABEL FIBER OPTIK & DROP CORE (CABLE) ---
            [
                'code' => 'CABLE-FO-ADSS-48C',
                'name' => 'Kabel FO ADSS 48 Core (Per Drum 2000m)',
                'category' => 'cable',
                'is_metal' => false,
                'is_reusable' => false,
                'is_serialized_tag' => true,
                'unit' => 'drum',
                'min_stock' => 2,
                'description' => 'Drum kabel FO aerial All-Dielectric Self-Supporting (ADSS) G.652D backbone/feeder',
            ],
            [
                'code' => 'CABLE-FO-ADSS-24C',
                'name' => 'Kabel FO ADSS 24 Core (Per Drum 2000m)',
                'category' => 'cable',
                'is_metal' => false,
                'is_reusable' => false,
                'is_serialized_tag' => true,
                'unit' => 'drum',
                'min_stock' => 3,
                'description' => 'Drum kabel FO aerial ADSS 24 Core untuk distribusi sub-feeder',
            ],
            [
                'code' => 'CABLE-FO-DROP-1C',
                'name' => 'Kabel Drop Core FO 1 Core 3-Wire G.657A1 (Roll 1000m)',
                'category' => 'cable',
                'is_metal' => true,
                'is_reusable' => false,
                'is_serialized_tag' => true,
                'unit' => 'roll',
                'min_stock' => 10,
                'description' => 'Kabel drop wire 1 core dengan kawat penggantung baja untuk sambungan rumah pelanggan',
            ],
            [
                'code' => 'CABLE-FO-DROP-2C',
                'name' => 'Kabel Drop Core FO 2 Core Fig-8 Messenger (Roll 1000m)',
                'category' => 'cable',
                'is_metal' => true,
                'is_reusable' => false,
                'is_serialized_tag' => true,
                'unit' => 'roll',
                'min_stock' => 5,
                'description' => 'Kabel drop wire 2 core outdoor untuk pelanggan korporat / dual ONT',
            ],
            [
                'code' => 'CABLE-FO-DUCT-96C',
                'name' => 'Kabel FO Duct Armored 96 Core (Per Drum 4000m)',
                'category' => 'cable',
                'is_metal' => true,
                'is_reusable' => false,
                'is_serialized_tag' => true,
                'unit' => 'drum',
                'min_stock' => 1,
                'description' => 'Kabel tanam duct fiber optik lapis baja anti-gigitan hewan pengerat',
            ],

            // --- KELOMPOK 3: AKSESORIS TIANG, FASTENER, BAUT, KLEM & TIES ---
            [
                'code' => 'ACC-BAND-SUS-201',
                'name' => 'Stainless Steel Band / Strapping Belt SUS-201 3/4" (Roll 30m)',
                'category' => 'accessories',
                'is_metal' => true,
                'is_reusable' => false,
                'is_serialized_tag' => false,
                'unit' => 'roll',
                'min_stock' => 15,
                'description' => 'Pita baja stainless anti-karat untuk mengikat breket ke tiang bulat',
            ],
            [
                'code' => 'ACC-BUCKLE-SUS',
                'name' => 'Stainless Steel Buckle / Stopless 3/4" (Box isi 100 pcs)',
                'category' => 'accessories',
                'is_metal' => true,
                'is_reusable' => false,
                'is_serialized_tag' => false,
                'unit' => 'box',
                'min_stock' => 20,
                'description' => 'Klip pengunci stainless steel strapping band pada tiang',
            ],
            [
                'code' => 'ACC-BOLT-NUT-M16',
                'name' => 'Baut & Mur Tiang M16 x 250mm Hot-Dip Galvanis (Set isi 25 pcs)',
                'category' => 'accessories',
                'is_metal' => true,
                'is_reusable' => false,
                'is_serialized_tag' => false,
                'unit' => 'set',
                'min_stock' => 20,
                'description' => 'Baut tembus tiang galvanis untuk pemasangan cross-arm & traves',
            ],
            [
                'code' => 'ACC-BOLT-NUT-M14',
                'name' => 'Baut & Mur Tiang M14 x 200mm Galvanis (Set isi 25 pcs)',
                'category' => 'accessories',
                'is_metal' => true,
                'is_reusable' => false,
                'is_serialized_tag' => false,
                'unit' => 'set',
                'min_stock' => 20,
                'description' => 'Baut pengikat breket tiang ukuran medium',
            ],
            [
                'code' => 'ACC-TIES-UV-300',
                'name' => 'Kabel Ties UV-Resistant Outdoor Hitam 300mm x 7.6mm (Pack 100 pcs)',
                'category' => 'accessories',
                'is_metal' => false,
                'is_reusable' => false,
                'is_serialized_tag' => false,
                'unit' => 'pack',
                'min_stock' => 50,
                'description' => 'Tali ties nilon tahan sinar matahari cuaca ekstrem outdoor untuk merapikan jalur kabel di tiang',
            ],
            [
                'code' => 'ACC-TIES-UV-500',
                'name' => 'Kabel Ties UV-Resistant Outdoor Hitam 500mm x 9.0mm Heavy Duty (Pack 100 pcs)',
                'category' => 'accessories',
                'is_metal' => false,
                'is_reusable' => false,
                'is_serialized_tag' => false,
                'unit' => 'pack',
                'min_stock' => 30,
                'description' => 'Kabel ties ukuran ekstra besar untuk pengikatan bundle kabel feeder',
            ],
            [
                'code' => 'ACC-CLAMP-SUSP-BAG',
                'name' => 'Suspension Clamp Tiang FO (Bag isi 50 pcs)',
                'category' => 'accessories',
                'is_metal' => true,
                'is_reusable' => false,
                'is_serialized_tag' => false,
                'unit' => 'bag',
                'min_stock' => 20,
                'description' => 'Klem gantung kabel FO ADSS pada tiang lurus',
            ],
            [
                'code' => 'ACC-CLAMP-DEADEND',
                'name' => 'Dead End / Tension Clamp Wedge Type ADSS (Bag isi 50 pcs)',
                'category' => 'accessories',
                'is_metal' => true,
                'is_reusable' => false,
                'is_serialized_tag' => false,
                'unit' => 'bag',
                'min_stock' => 20,
                'description' => 'Klem penarik kabel ADSS pada tiang sudut (tikungan) dan tiang akhir',
            ],
            [
                'code' => 'ACC-DROP-CLAMP-S',
                'name' => 'S-Clamp / Drop Wire Clamp Serat Optik Stainless (Box isi 100 pcs)',
                'category' => 'accessories',
                'is_metal' => true,
                'is_reusable' => false,
                'is_serialized_tag' => false,
                'unit' => 'box',
                'min_stock' => 30,
                'description' => 'Klem bentuk S pengikat kawat messenger drop core ke tiang distribusi',
            ],
            [
                'code' => 'ACC-HOOK-POLE-J',
                'name' => 'J-Hook / Pigtail Bolt Gantungan Drop Cable (Set isi 20 pcs)',
                'category' => 'accessories',
                'is_metal' => true,
                'is_reusable' => false,
                'is_serialized_tag' => false,
                'unit' => 'set',
                'min_stock' => 25,
                'description' => 'Gantungan klem drop wire berbentuk kait J pada tiang',
            ],
            [
                'code' => 'ACC-BRACKET-POLE',
                'name' => 'Pole Bracket Serbaguna Hot-Dip Galvanis (Set isi 10 pcs)',
                'category' => 'accessories',
                'is_metal' => true,
                'is_reusable' => false,
                'is_serialized_tag' => false,
                'unit' => 'set',
                'min_stock' => 25,
                'description' => 'Breket dudukan ODP & klem penarik pada tiang',
            ],

            // --- KELOMPOK 4: ENCLOSURE, PANEL, ODP & ODC ---
            [
                'code' => 'ODP-SOLID-16C',
                'name' => 'Optical Distribution Point (ODP) Solid 16 Core + Splitter PLC 1:8 / 1:16',
                'category' => 'accessories',
                'is_metal' => false,
                'is_reusable' => false,
                'is_serialized_tag' => true,
                'unit' => 'unit',
                'min_stock' => 20,
                'description' => 'Kotak distribusi outdoor tahan cuaca IP65 untuk terminasi 16 pelanggan',
            ],
            [
                'code' => 'ODP-CLOSURE-24C',
                'name' => 'ODP Closure Dome Enclosure 24 Core IP68 Tiang',
                'category' => 'accessories',
                'is_metal' => false,
                'is_reusable' => false,
                'is_serialized_tag' => true,
                'unit' => 'unit',
                'min_stock' => 15,
                'description' => 'Joint closure kombinasi ODP kedap air pada tiang persimpangan',
            ],
            [
                'code' => 'ACC-CLOSURE-96C',
                'name' => 'Dome Joint Closure FOSC 96 Core Waterproof IP68',
                'category' => 'accessories',
                'is_metal' => false,
                'is_reusable' => false,
                'is_serialized_tag' => true,
                'unit' => 'unit',
                'min_stock' => 10,
                'description' => 'Kotak penyambungan kabel fiber optik udara / manhole kapasitas 96 core',
            ],
            [
                'code' => 'ODC-CABINET-144C',
                'name' => 'Optical Distribution Cabinet (ODC) Outdoor 144 Core',
                'category' => 'accessories',
                'is_metal' => true,
                'is_reusable' => false,
                'is_serialized_tag' => true,
                'unit' => 'unit',
                'min_stock' => 2,
                'description' => 'Lemari kabinet outdoor titik agregasi pusat feeder ke distribution',
            ],
            [
                'code' => 'OTB-RACK-24C',
                'name' => 'Optical Termination Box (OTB) Rackmount 24 Port SC-UPC',
                'category' => 'accessories',
                'is_metal' => true,
                'is_reusable' => false,
                'is_serialized_tag' => true,
                'unit' => 'unit',
                'min_stock' => 5,
                'description' => 'Panel terminasi kabel FO 19 inch 1U di rak server / shelter',
            ],
            [
                'code' => 'ACC-SPLICE-TRAY-24',
                'name' => 'Splice Tray Kaset Fiber 24 Core + Protection Sleeve (Set isi 5 tray)',
                'category' => 'accessories',
                'is_metal' => false,
                'is_reusable' => false,
                'is_serialized_tag' => false,
                'unit' => 'set',
                'min_stock' => 15,
                'description' => 'Tray penataan sambungan fiber optik beserta selongsong pelindung bakar',
            ],

            // --- KELOMPOK 5: TOOLS, ALAT UKUR & PERLENGKAPAN K3 ---
            [
                'code' => 'TOOL-SPLICER-INNO',
                'name' => 'Fusion Splicer Inno View 7 Core Alignment',
                'category' => 'tools',
                'is_metal' => true,
                'is_reusable' => true,
                'is_serialized_tag' => true,
                'unit' => 'unit',
                'min_stock' => 2,
                'description' => 'Mesin penyambung serat optik otomatis presisi tinggi untuk tim instalasi',
            ],
            [
                'code' => 'TOOL-OTDR-EXFO',
                'name' => 'OTDR Handheld EXFO MaxTester 720C + VFL',
                'category' => 'tools',
                'is_metal' => true,
                'is_reusable' => true,
                'is_serialized_tag' => true,
                'unit' => 'unit',
                'min_stock' => 1,
                'description' => 'Alat ukur pantulan optik untuk menganalisa redaman kabel & deteksi titik putus',
            ],
            [
                'code' => 'TOOL-OPM-VFL',
                'name' => 'Optical Power Meter (OPM) + Visual Fault Locator (Laser Merah 10mW)',
                'category' => 'tools',
                'is_metal' => true,
                'is_reusable' => true,
                'is_serialized_tag' => true,
                'unit' => 'unit',
                'min_stock' => 5,
                'description' => 'Pengukur kekuatan sinyal dBm dan laser pencari jalur core kabel',
            ],
            [
                'code' => 'TOOL-CLEAVER-FIBER',
                'name' => 'Precision Fiber Cleaver Diamond Blade (Pemotong Fiber)',
                'category' => 'tools',
                'is_metal' => true,
                'is_reusable' => true,
                'is_serialized_tag' => true,
                'unit' => 'unit',
                'min_stock' => 4,
                'description' => 'Alat potong presisi kaca fiber optik 90 derajat sebelum proses splicing',
            ],
            [
                'code' => 'TOOL-CRIMPING-SUS',
                'name' => 'Banding Tool / Tang Penarik Stainless Steel Strap Belt',
                'category' => 'tools',
                'is_metal' => true,
                'is_reusable' => true,
                'is_serialized_tag' => true,
                'unit' => 'unit',
                'min_stock' => 4,
                'description' => 'Tang pengencang & pemotong strapping band baja pada tiang',
            ],
            [
                'code' => 'TOOL-LADDER-FIBER',
                'name' => 'Tangga Lipat Teleskopik Fiberglass Isolasi 6 Meter (Anti-Listrik)',
                'category' => 'tools',
                'is_metal' => false,
                'is_reusable' => true,
                'is_serialized_tag' => true,
                'unit' => 'unit',
                'min_stock' => 3,
                'description' => 'Tangga non-konduktif isolator listrik tegangan menengah PLN untuk keselamatan teknisi',
            ],
            [
                'code' => 'TOOL-CHAIN-HOIST',
                'name' => 'Lever Block / Chain Hoist Penarik Kabel 1.5 Ton (Takel Tarik)',
                'category' => 'tools',
                'is_metal' => true,
                'is_reusable' => true,
                'is_serialized_tag' => true,
                'unit' => 'unit',
                'min_stock' => 3,
                'description' => 'Katrol rantai untuk menarik kabel fiber bentangan panjang melewati jalan',
            ],
            [
                'code' => 'TOOL-K3-SAFETY-SET',
                'name' => 'Set Safety K3 (Helm Proyek ANSI, Full Body Harness, Rompi & Sarung Tangan)',
                'category' => 'tools',
                'is_metal' => false,
                'is_reusable' => true,
                'is_serialized_tag' => true,
                'unit' => 'set',
                'min_stock' => 6,
                'description' => 'Alat Pelindung Diri (APD) standar K3 pekerjaan ketinggian tiang FO',
            ],
        ];

        foreach ($catalogItems as $item) {
            Item::firstOrCreate(['code' => $item['code']], $item);
        }

        // 8. Approval Templates
        // Template 1: SPK Standar (<= 50 Juta -> 1 Tier PM)
        $tplSpkStd = ApprovalTemplate::firstOrCreate(
            ['code' => 'TPL-SPK-STD'],
            [
                'name' => 'Alur SPK Pengadaan Reguler (<= 50 Jt)',
                'module' => 'SPK',
                'description' => 'Persetujuan 1 tingkat oleh Project Manager untuk pengadaan material di bawah Rp 50 Juta',
                'min_amount' => 0,
                'max_amount' => 50000000,
                'is_default' => true,
            ]
        );
        ApprovalTemplateStep::firstOrCreate(
            ['approval_template_id' => $tplSpkStd->id, 'step_order' => 1],
            [
                'step_name' => 'Review & Persetujuan PM',
                'approver_user_id' => $pm->id,
                'sla_hours' => 24,
                'can_reject' => true,
            ]
        );

        // Template 2: SPK Nilai Besar (> 50 Juta -> 2 Tier PM + Superadmin)
        $tplSpkHigh = ApprovalTemplate::firstOrCreate(
            ['code' => 'TPL-SPK-HIGH'],
            [
                'name' => 'Alur SPK Pengadaan Nilai Besar (> 50 Jt)',
                'module' => 'SPK',
                'description' => 'Persetujuan 2 tingkat berjenjang (PM Review lalu Superadmin Final Sign-off) untuk pengadaan > Rp 50 Juta',
                'min_amount' => 50000001,
                'max_amount' => null,
                'is_default' => false,
            ]
        );
        ApprovalTemplateStep::firstOrCreate(
            ['approval_template_id' => $tplSpkHigh->id, 'step_order' => 1],
            [
                'step_name' => 'Step 1: Evaluasi & Review PM',
                'approver_user_id' => $pm->id,
                'sla_hours' => 24,
                'can_reject' => true,
            ]
        );
        ApprovalTemplateStep::firstOrCreate(
            ['approval_template_id' => $tplSpkHigh->id, 'step_order' => 2],
            [
                'step_name' => 'Step 2: Sign-off Direksi / Superadmin',
                'approver_user_id' => $superAdmin->id,
                'sla_hours' => 48,
                'can_reject' => true,
            ]
        );

        // Template 3: Work Order & Kunci Kuota BOQ
        $tplWo = ApprovalTemplate::firstOrCreate(
            ['code' => 'TPL-WO-DEFAULT'],
            [
                'name' => 'Alur Persetujuan Work Order & Kunci Kuota BOQ',
                'module' => 'WORK_ORDER',
                'description' => 'Penguncian kuota BOQ proyek oleh Project Manager',
                'is_default' => true,
            ]
        );
        ApprovalTemplateStep::firstOrCreate(
            ['approval_template_id' => $tplWo->id, 'step_order' => 1],
            [
                'step_name' => 'Approval & Penguncian Kuota PM',
                'approver_user_id' => $pm->id,
                'sla_hours' => 12,
                'can_reject' => true,
            ]
        );

        // Template 4: Delivery Anomaly / Mismatch Shortage
        $tplDelivery = ApprovalTemplate::firstOrCreate(
            ['code' => 'TPL-DELIVERY-MISMATCH'],
            [
                'name' => 'Alur Investigasi Selisih Truk (In-Transit Shrinkage)',
                'module' => 'DELIVERY',
                'description' => 'Persetujuan investigasi jika terdeteksi selisih antara muat Handheld 1 vs bongkar Handheld 2',
                'is_default' => true,
            ]
        );
        ApprovalTemplateStep::firstOrCreate(
            ['approval_template_id' => $tplDelivery->id, 'step_order' => 1],
            [
                'step_name' => 'Investigasi & Approval Penerimaan PM',
                'approver_user_id' => $pm->id,
                'sla_hours' => 24,
                'can_reject' => true,
            ]
        );

        // Template 5: Return / Scrap
        $tplReturn = ApprovalTemplate::firstOrCreate(
            ['code' => 'TPL-RETURN-SCRAP'],
            [
                'name' => 'Alur Verifikasi Retur & Afkir Material',
                'module' => 'RETURN_SCRAP',
                'description' => 'Persetujuan penerimaan barang sisa/rusak dari lapangan',
                'is_default' => true,
            ]
        );
        ApprovalTemplateStep::firstOrCreate(
            ['approval_template_id' => $tplReturn->id, 'step_order' => 1],
            [
                'step_name' => 'Verifikasi Fisik Gudang & PM',
                'approver_user_id' => $pm->id,
                'sla_hours' => 24,
                'can_reject' => true,
            ]
        );
    }
}
