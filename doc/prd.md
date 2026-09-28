# MOSA WMS RFID — Product Requirements Document (PRD)

## 1. Informasi Dokumen & Konteks Produk
* **Nama Produk:** MOSA WMS RFID (Warehouse Management System & Digital Chain of Custody)
* **Klien / Target Pengguna:** Vendor Penyedia Jasa Manpower Pemasangan Tiang Fiber Optic (Principal: MyRepublic, Biznet)
* **Snapshot:** 12 September 2026
* **Status:** Campuran `IMPLEMENTED`, `PARTIAL`, dan `PLANNED`; tabel status di bawah mengikuti implementasi aktual.

---

## 2. Latar Belakang & Masalah Bisnis

### A. Problem Statement
1. **Tingginya Tingkat Kehilangan Material Bernilai Tinggi:** Tiang FO galvanis, drum kabel fiber optic, mesin fusion splicer, dan OTDR sering hilang di lokasi gudang atau saat didistribusikan ke lapangan.
2. **Kehilangan di Perjalanan Logistik (In-Transit Shrinkage):** Saat truk memuat tiang dari yard Principal (MyRepublic/Biznet) menuju gudang transit vendor, sering terjadi kebocoran/penjualan gelap tiang di tengah jalan tanpa jejak.
3. **Keterbatasan Kepercayaan terhadap Staf Gudang (Storeroom):** Staf gudang rawan melakukan manipulasi catatan kuota pengeluaran barang untuk menutupi selisih fisik barang yang hilang.
4. **Variasi Kapasitas & Anggaran Gudang Transit:** Gudang pusat membutuhkan gerbang keamanan otomatis 2 antena, sedangkan gudang ruko kecil/proyek pilot membutuhkan opsi 1 antena yang hemat biaya.

### B. Tujuan Produk (Product Goals)
1. Membangun **Digital Chain of Custody** (Rantai Kepemilikan Digital) yang *append-only* (tidak dapat diedit/dihapus) sejak pemuatan di Principal, penerimaan di gudang, hingga barang terpasang atau diretur.
2. Menerapkan **Pencocokan 2 Handheld Reader**: Handheld 1 di Principal (*Dispatch Manifest*) vs Handheld 2 di Gudang (*Receiving Reconciler*) untuk mendeteksi kehilangan di jalan secara instan.
3. Menerapkan **Setting Fleksibel Gerbang RFID**:
   * **Mode 2 Antena (`DUAL_ANTENNA_AUTO`):** Deteksi arah fisik otomatis ($A \to B$ Keluar vs $B \to A$ Masuk).
   * **Mode 1 Antena (`SINGLE_ANTENNA_SESSION`):** Deteksi arah berbasis konteks sesi aktif aplikasi (hemat biaya hardware).
4. Menegakkan **Pemisahan Peran (Segregation of Duties)** di mana staf gudang berstatus *read-only* terhadap kuota BOQ.

---

## 3. Aktor Sistem & Matriks Hak Akses

| Aktor | Peran Utama | Tanggung Jawab & Batasan Hak Akses |
|---|---|---|
| **Principal** (MyRepublic / Biznet) | Pemilik Proyek | Menerbitkan SPK, menyediakan material tiang & kabel di yard pusat. |
| **Vendor / Procurement (Handheld 1)** | Bagian Pengadaan | Mengelola SPK & pembayaran, memasang tag RFID anti-metal, dan melakukan *Dispatch Scan* saat truk dimuat di yard Principal. |
| **Gudang / Storeroom (Handheld 2)** | Pengelola Fisik Gudang | Melakukan *Receiving Scan* saat truk tiba di gudang, mencocokkan manifest tiba vs berangkat (**Read-Only Kuota BOQ**), dan verifikasi retur. |
| **Project Manager (PM / Approver)** | Otorisator Kuota & Keamanan | Menyetujui Work Order (WO) + BOQ (mengunci kuota penarikan), menyetujui anomali selisih muatan *in-transit*, dan eskalasi gerbang. |
| **Direksi / BOD (Top Management)** | Pengambil Keputusan Eksekutif | Pemantauan analitik global multi-proyek (*Global Visibility*), laporan shrinkage, dan sign-off approval transaksi bernilai tinggi. |
| **Super Administrator** | Pengelola Sistem & Akses | Full access ke konfigurasi perangkat IoT, master data, user & role management, serta simulasi pengujian. |
| **Sistem IoT (RFID Gate)** | Eksekutor Otomatis | Deteksi tag dan validasi sesi. Relay fisik serta CCTV nyata belum diimplementasikan/commissioning. |
| **PIC Lapangan (Mandor)** | Penanggung Jawab Lapangan | Login personal, meminta izin keluar gerbang, menerima serah terima fisik barang, melaporkan material terpasang, dan mengajukan retur. |

---

## 4. Kebutuhan Fungsional (Functional Requirements)

### 4.1 Master Data & Pengaturan Gudang
* **FR-MD-01:** Pengelolaan Master Principal (MyRepublic, Biznet) dan Master Proyek Rollout FO (Kode Proyek, Budget, Target Tiang & FO).
* **FR-MD-02:** Pengelolaan **Gudang Transit Bergerak** (*Transient Warehouses*) dengan konfigurasi:
  * Penetapan Kepala Gudang / PIC Utama (`pic_user_id`), kapasitas tampung tiang, dan kontak telepon operasional.
  * Penetapan Staf Operasional Gudang (`warehouse_staff` pivot: storeroom, security, operator).
  * Konfigurasi Mode Antena Gerbang (`gate_mode`):
    * `DUAL_ANTENNA_AUTO`: Dual 8dBi UHF antennas (urutan waktu $A \leftrightarrow B$).
    * `SINGLE_ANTENNA_SESSION`: Single 8dBi UHF antenna (konteks sesi PIC aktif).
* **FR-MD-03:** Registri Armada Truk Pengangkut (`vehicles`) mencakup nomor plat polisi, supir, vendor logistik, dan kapasitas muat tiang.
* **FR-MD-04:** Katalog Material FO (sifat logam/anti-metal, reusable/tools, serial/batch).
* **FR-MD-05:** Registri Tag RFID EPC 24-digit hex dan pemetaan status.

### 4.2 Alur 2 Handheld: Dispatch Principal $\to$ Receiving Gudang
* **FR-PR-01:** Pencatatan kontrak SPK dan termin pembayaran bertahap (*unpaid, partial, paid*).
* **FR-PR-02 (Handheld 1 — Principal Dispatch):**
  * Petugas pengadaan/lapangan memasang tag ke material di yard Principal.
  * Handheld 1 melakukan pemindaian massal (*bulk scan*) saat barang dinaikkan ke truk pengangkut.
  * Sistem menyimpan daftar EPC keberangkatan (`dispatch_epcs_json`) dan mengubah status pengiriman menjadi `in_transit`.
* **FR-PR-03 (Handheld 2 — Warehouse Receiving Reconciler):**
  * Petugas gudang melakukan pemindaian massal (*bulk scan*) saat truk tiba di loading bay gudang transit.
  * Sistem membandingkan `dispatch_epcs_json` vs `received_epcs_json` dan **wajib menampilkan Pratinjau Rekonsiliasi (Pre-Reconciliation Check Modal)** sebelum melakukan komit ke database:
    * Jika 100% Cocok $\to$ Pratinjau menampilkan badge hijau `100% MATCH`, rincian verifikasi 1-ke-1, dan tombol aksi `[ Konfirmasi & Masukkan ke Stok Gudang ]` untuk auto-restock ke inventaris aktif dan log Custody `STOCK_IN`.
    * Jika ada selisih $\to$ Pratinjau menampilkan badge `MISMATCH`, rincian tag yang hilang di jalan (*in-transit shrinkage*) dan tag asing, opsi `[ Periksa Truk & Scan Ulang ]`, serta form pembuatan Berita Acara (kronologi & foto bukti) untuk eskalasi approval investigasi PM.
* **FR-PR-04 (Lampiran Bukti Dokumen & Foto Fisik):**
  * Procurement dapat mengunggah file PDF kontrak SPK / BAST / PO (`document_url`).
  * Petugas muat truk (Handheld 1) dan bongkar gudang (Handheld 2) dapat mengunggah foto fisik muatan (`proof_photo_url`) dan foto surat jalan fisik bertanda tangan langsung dari kamera ponsel / file upload.

### 4.3 Work Order, Kuota BOQ & Laporan Instalasi Lapangan
* **FR-WO-01:** Pembuatan Work Order baru oleh PM dengan penetapan Proyek, SPK terkait (opsional), Gudang Transit, dan rincian kuota Bill of Quantities (BOQ items).
* **FR-WO-02:** Persetujuan WO oleh PM mengunci kuota penarikan secara mutlak (*Immutable Quota Lock*).
* **FR-WO-03:** Storeroom mengakses BOQ dengan status **Read-Only Kuota**, melaporkan kesiapan fisik di rak (`prepared_qty`).
* **FR-WO-04:** Notifikasi otomatis ke PM jika terjadi kekurangan barang (*Shortage*).
* **FR-WO-05 (Laporan Instalasi Mandor):** Mandor melaporkan kuantitas fisik material yang telah selesai terpasang di rute jalan (`installed_qty`) beserta catatan lokasi/segmen titik tiang.

### 4.4 Gate Withdrawal & Otomatisasi Gerbang (Gate Out)
* **FR-GT-01:** Permintaan sesi gerbang oleh PIC Lapangan via akun login personal dengan memilih armada truk pengangkut (`vehicle_id` / `plate_number_snapshot`).
* **FR-GT-02:** Validasi sisa kuota: $\text{Sisa Kuota} = \text{quota\_qty} - \text{withdrawn\_qty} + \text{returned\_qty}$ serta verifikasi kesiapan fisik rak (`prepared_qty >= requested_qty`).
* **FR-GT-03:** Evaluasi Sesuai Mode Gerbang Gudang:
  * **Mode 2 Antena:** Urutan $A \to B \implies$ Keluar, $B \to A \implies$ Masuk.
  * **Mode 1 Antena:** Arah divalidasi dari sesi transaksi aktif yang dipilih PIC di aplikasi.
* **FR-GT-04:** Keputusan unlock dan pulse 5 detik tersedia secara logis. Adapter kunci elektromagnetik fail-secure fisik masih `PLANNED`.

### 4.5 Alur Retur Barang Sisa (Gate In & Verification)
* **FR-RT-01:** PIC Lapangan menginput kuantitas & kondisi barang sisa (*good, damaged, scrap*).
* **FR-RT-02:** Pembatasan retur (tidak boleh melebihi kuantitas yang pernah ditarik).
* **FR-RT-03:** Deteksi Gerbang Masuk ($B \to A$ pada mode dual, atau sesi return pada mode single).
* **FR-RT-04 (Verifikasi Retur 2-Langkah dengan Pratinjau):**
  * Langkah 1: Storeroom memasukkan hitungan fisik nyata barang di loading bay inbound.
  * Langkah 2: Sistem menghitung komparasi otomatis (*Laporan PIC vs Hitungan Nyata vs Selisih*) dalam layar Pratinjau Rekonsiliasi.
  * Jika cocok, Storeroom mengklik `[ Konfirmasi Cocok & Pulihkan Kuota WO ]`. Jika ada selisih, Storeroom wajib mengisi Berita Acara dan mengklik `[ Kirim Berita Acara Selisih ke PM ]`.

### 4.6 Digital Chain of Custody & Audit Opname
* **FR-CC-01:** Buku besar `custody_ledger` ditujukan append-only. Model/API menolak update/delete; proteksi DB langsung dan FK historis masih `PARTIAL`.
* **FR-CC-02:** Setiap record mencatat EPC, user penanggung jawab, aksi, referensi, koordinat GPS, foto bukti, dan timestamp.
* **FR-CC-03 (Stock Opname Fisik Yard & Cetak BAP):**
  * Rekonsiliasi massal pembacaan handheld scanner di yard untuk mendeteksi *missing EPCs*.
  * Sistem menyajikan **Modal Pratinjau Rekonsiliasi Opname** (Saldo Buku, Fisik Terbaca, Cocok, Hilang, Tag Asing).
  * UI menyediakan cetak BAP melalui browser. Endpoint opname hanya menghitung hasil; persistence eskalasi tiket PM masih `PLANNED`.

---

## 5. Kebutuhan Non-Fungsional (Non-Functional Requirements)

* **NFR-UX-01 (Prinsip Desain untuk Pengguna Lapangan):**
  * Tampilan antarmuka PWA Lapangan dirancang khusus untuk mandor dan pekerja fisik yang jarang menggunakan gadget (*Non-Tech-Savvy Friendly*).
  * **Ukuran Tombol Raksasa (Large Touch Targets $\ge 56\text{px}$):** Mudah ditekan menggunakan jempol kasar atau saat mengenakan sarung tangan kerja.
  * **Kontras Warna Tinggi (Outdoor Sunlight Legibility):** Warna tebal dan jelas, menghindari font abu-abu tipis agar tetap terbaca di bawah terik sinar matahari.
  * **Bahasa Indonesia Lapangan yang Lugas:** Menghilangkan jargon teknis IT bahasa Inggris (misal: "Minta Buka Gerbang", "Balikkan Barang Sisa", "Cek Scanner RFID").
  * **Audio & Haptic Feedback (Sound Beep):** Setiap kali tag terdeteksi atau gerbang berhasil dibuka, sistem mengeluarkan suara *beep* audio seperti scanner kasir supermarket sehingga pekerja tahu proses berhasil tanpa harus terus-menerus menatap layar.
  * **Angka & Ringkasan Besar:** Menampilkan nama material dan jumlah barang (misal: "10 Batang Tiang") dengan angka raksasa, bukan kode hex yang membingungkan.
* **NFR-SEC-01:** Wajib autentikasi personal berbasis token (Laravel Sanctum).
* **NFR-SEC-02 (`PARTIAL`):** Immutabilitas pada model/API; enforcement DB belum selesai.
* **NFR-PERF-01 (`PLANNED/UNVERIFIED`):** Target latensi keputusan gerbang $\le 800\text{ms}$; belum ada benchmark acceptance.
* **NFR-REL-01 (`PARTIAL`):** Store-and-forward tersedia, tetapi timer runtime memiliki known issue setelah batch pertama.
* **NFR-HW-01 (`PARTIAL`):** Parser model HW-VX/RC4 tersedia; kompatibilitas tiap reader/firmware wajib commissioning.

---

## 6. Status Implementasi

| Area | Status | Batas saat ini |
|---|---|---|
| Master data, tag EPC, kendaraan | IMPLEMENTED | TID/anti-clone belum tersedia. |
| Dispatch EPC dua handheld | IMPLEMENTED | Bukti foto/dokumen masih opsional pada API. |
| Receiving full match | IMPLEMENTED | Mismatch tidak dapat disahkan menjadi stok parsial. |
| WO, BOQ, preparation, installation | IMPLEMENTED | Sebagian endpoint pembuat masih auth-only. |
| Gate dual/single dan idempotensi | IMPLEMENTED | Relay fisik/CCTV nyata belum ada. |
| Return berbasis EPC | IMPLEMENTED | Eskalasi mismatch server-side belum lengkap. |
| Custody append-only | PARTIAL | Model dilindungi; DB/FK belum mutlak. |
| Stock opname | PARTIAL | Rekonsiliasi/cetak UI ada; tiket eskalasi belum dipersistensikan. |
| RBAC REST | PARTIAL | Guard campuran role hard-coded dan auth-only. |
| Edge offline reliability | PARTIAL | Known issue timer setelah batch pertama. |

Detail kontrak dan gap: [`api-spec.md`](api-spec.md), [`schema.md`](schema.md), [`rules.md`](rules.md), dan [`../RENCANA_HARDENING_FASE_2.md`](../RENCANA_HARDENING_FASE_2.md).
