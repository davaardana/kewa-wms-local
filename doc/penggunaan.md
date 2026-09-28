# MOSA WMS RFID — Buku Panduan Penggunaan & Standar Operasional Prosedur (SOP)

Selamat datang di **Buku Panduan Penggunaan Sistem MOSA WMS RFID**. Dokumen ini disusun sebagai panduan operasional praktis langkah-demi-langkah bagi seluruh personel: **Super Administrator**, **Project Manager (PM)**, **Procurement**, **Staf Gudang (Storeroom)**, dan **Mandor / PIC Lapangan**.

---

## 📑 Daftar Isi
1. [Prinsip Dasar & Konsep Sistem](#1-prinsip-dasar--konsep-sistem)
   * [1.1 Profil Saya & Ubah Password](#11-profil-saya--ubah-password)
2. [Panduan Role: Procurement & Logistik Principal](#2-panduan-role-procurement--logistik-principal)
   * [2.1 Input Kontrak SPK & Unggah PDF](#21-input-kontrak-spk--unggah-pdf)
   * [2.2 Handheld 1: Tagging & Scan Muat di Yard Principal](#22-handheld-1-tagging--scan-muat-di-yard-principal)
3. [Panduan Role: Staf Gudang (Storeroom Staff)](#3-panduan-role-staf-gudang-storeroom-staff)
   * [3.1 Handheld 2: Scan Bongkar Truk & Rekonsiliasi Selisih](#31-handheld-2-scan-bongkar-truk--rekonsiliasi-selisih)
   * [3.2 Menyiapkan Barang untuk Work Order (Read-Only Kuota)](#32-menyiapkan-barang-untuk-work-order-read-only-kuota)
   * [3.3 Verifikasi Fisik Barang Retur](#33-verifikasi-fisik-barang-retur)
   * [3.4 Audit Massal Cepat (Stock Opname)](#34-audit-massal-cepat-stock-opname)
4. [Panduan Role: Mandor / PIC Lapangan (Aplikasi PWA)](#4-panduan-role-mandor--pic-lapangan-aplikasi-pwa)
   * [4.1 Buka PWA & Login Akun Personal](#41-buka-pwa--login-akun-personal)
   * [4.2 Tombol 1: Mau Keluar Gudang (Bawa Tiang/Kabel)](#42-tombol-1-mau-keluar-gudang-bawa-tiangkabel)
   * [4.3 Tombol 2: Balikkan Barang Sisa (Retur)](#43-tombol-2-balikkan-barang-sisa-retur)
   * [4.4 Tombol 3: Cek Scanner RFID & Bunyi Beep](#44-tombol-3-cek-scanner-rfid--bunyi-beep)
5. [Panduan Role: Project Manager (PM / Approver)](#5-panduan-role-project-manager-pm--approver)
   * [5.1 Pembuatan & Persetujuan Work Order (Kunci Kuota BOQ)](#51-pembuatan--persetujuan-work-order-kunci-kuota-boq)
   * [5.2 Menyetujui Anomali Muatan Truk (Mismatch Shortage)](#52-menyetujui-anomali-muatan-truk-mismatch-shortage)
   * [5.3 Monitoring Dashboard & Laporan Rantai Kepemilikan](#53-monitoring-dashboard--laporan-rantai-kepemilikan)
6. [Panduan Role: Super Administrator](#6-panduan-role-super-administrator)
   * [6.1 Pendaftaran Tag RFID Baru (Enrollment)](#61-pendaftaran-tag-rfid-baru-enrollment)
   * [6.2 Pengaturan Gudang & Mode Gerbang (1 vs 2 Antena)](#62-pengaturan-gudang--mode-gerbang-1-vs-2-antena)
7. [Panduan Operasional Gerbang Otomatis (Smart Gate)](#7-panduan-operasional-gerbang-otomatis-smart-gate)
8. [Tanya Jawab & Penanganan Masalah Lapangan (Troubleshooting)](#8-tanya-jawab--penanganan-masalah-lapangan-troubleshooting)

---

## 1. Prinsip Dasar & Konsep Sistem

### 1.1 Profil Saya & Ubah Password

Fitur ini tersedia untuk **semua role**. Klik kartu nama akun di bagian bawah sidebar untuk membuka **Profil Saya**.

1. Ubah nama, email, atau nomor HP lalu klik **Simpan Profil**. Role dan status akun tidak dapat diubah dari menu ini.
2. Untuk mengganti password, isi password saat ini, password baru minimal 8 karakter, serta konfirmasi password; klik **Ubah Password**.
3. Bila password saat ini salah, email telah dipakai, atau konfirmasi berbeda, sistem menolak perubahan dan menampilkan pesan validasi.

Sistem **MOSA WMS RFID** bekerja dengan 3 hukum integritas data:
1. **Tidak Ada Barang Keluar Tanpa Identitas:** Setiap tiang, drum kabel, dan peralatan kerja memiliki tag RFID anti-metal unik 24-digit heksadesimal.
2. **Kunci Kuota Mutlak (Anti-Manipulasi Gudang):** Staf gudang tidak memiliki wewenang mengedit angka kuota BOQ. Hanya Project Manager (PM) yang berhak menentukan kuota.
3. **Pencocokan 2 Handheld Reader:** Barang yang dimuat ke truk di yard Principal (Handheld 1) dicocokkan otomatis dengan barang yang dibongkar di gudang (Handheld 2) untuk mendeteksi barang hilang di jalan (*in-transit shrinkage*).

### 📊 Dashboard Ringkasan Adaptif Berbasis Role (Role-Aware Dashboard)
Dashboard Ringkasan secara otomatis mendeteksi role pengguna yang sedang login dan menyajikan metrik serta tombol aksi yang relevan dengan tanggung jawabnya:
* **Storeroom Staff (`storeroom`):** Menampilkan KPI Truk In-Transit Menunggu Bongkar, WO Siap Disiapkan, Retur Menunggu Verifikasi, dan Tag Aktif Yard. Tombol aksi utama: *Bongkar & Terima Truk*.
* **Procurement (`procurement`):** Menampilkan KPI Kontrak SPK, Truk In-Transit, Tag RFID Terdaftar, dan Katalog Material. Tombol aksi utama: *Kontrak SPK Baru*.
* **Project Manager (`pm`):** Menampilkan KPI Menunggu Approval PM, WO & Kuota BOQ, Truk In-Transit & Shrinkage, dan Total Tag Aset Proyek. Tombol aksi utama: *Pusat Approval*.
* **Direksi / Management (`management`):** Menampilkan KPI Approval Direksi, Aset Material Rollout, Proyek & WO Aktif, dan Pengiriman In-Transit. Tombol aksi utama: *Pusat Approval*.
* **Mandor Lapangan (`pic_lapangan`):** Menampilkan KPI Work Order Saya, Permohonan Izin Gerbang, Retur Diajukan, dan Status Scanner Handheld. Tombol aksi utama: *Buka PWA Lapangan*.
* **Super Administrator (`superadmin`):** Menampilkan metrik aset global, Central Fleet Telemetry reader IoT, antrean approval sistem, dan akses konfigurasi lengkap.

### 🗺️ Peta Menu & Alur Kronologis di Sidebar Aplikasi
Menu di sidebar disusun berurutan secara kronologis mengikuti siklus hidup material dari pengadaan hingga audit akhir:

```
┌──────────────────────────────────────────────────────────────────┐
│                      PETA MENU SIDEBAR APLIKASI                  │
├──────────────────────────────────────────────────────────────────┤
│ 📊 Dashboard Ringkasan                                           │
│                                                                  │
│ ── 1. MASTER & ORGANISASI PROYEK ─────────────────────────────   │
│ 🤝 Principal & Klien Telco (MyRepublic, Biznet, dll.)            │
│ 📁 Proyek Rollout FO (Inisiasi & Kontrol Proyek)                 │
│ 🏬 Gudang Transit & Staf Yard (Setting PIC, Staf & Antena)       │
│ 📦 Katalog Material FO (Tiang, Kabel & Aksesoris)                │
│ 🚚 Armada Truk Ekspedisi (Registri Kendaraan & Supir)            │
│                                                                  │
│ ── 2. PENGADAAN & LOGISTIK ───────────────────────────────────   │
│ 📄 Kontrak SPK & PO Vendor (Pengadaan Principal)                  │
│ 🚚 Muat Truk di Principal (Handheld 1 — Dispatch Scan)            │
│ 📦 Bongkar & Terima Truk (Handheld 2 — Receiving Scan)           │
│ 📋 Status Truk & Pengiriman (In-Transit Shrinkage Tracking)       │
│                                                                  │
│ ── 3. PERENCANAAN & GOVERNANCE ───────────────────────────────   │
│ 📋 Work Order & Kuota BOQ (Buat WO, Kunci Kuota PM & Storeroom)   │
│ 🛡️ Pusat Approval & Transaksi (Antrean Sign Off Multi-Tier)      │
│ ⚙️ Master Setting Approval (Template, Tiers & SLA)               │
│                                                                  │
│ ── 4. DISPATCH & SENSOR PORTAL ───────────────────────────────   │
│ 👷 PWA Mandor Lapangan (Muat Truk, Retur, Lapor Pasang & Scan)   │
│ 🚪 Monitor Sensor Pintu Gudang (Portal RFID & Alarm Anomali)      │
│ 🔌 Pairing Reader & Device (IP Reader, Port TCP & Test Socket)   │
│                                                                  │
│ ── 5. RETUR & AUDIT TRAIL ────────────────────────────────────   │
│ 📦 Stok & Kartu Stok (Saldo Gudang & Riwayat Mutasi)             │
│ 🔄 Verifikasi Retur Sisa (Pemeriksaan Fisik Barang di Gudang)     │
│ 📡 Stock Opname Fisik Yard (Bulk Scan Tiang di Halaman Gudang)    │
│ 📜 Audit Chain of Custody (Buku Besar Ledger Digital)            │
│                                                                  │
│ ── PENGATURAN & AKSES SISTEM ─────────────────────────────────   │
│ 👥 Pengguna & Hak Akses (Role, Akun & Matriks RBAC)              │
│ 🏷️ Pendaftaran Tag RFID (Registri EPC Baru)                       │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Panduan Role: Procurement & Logistik Principal

> Akun demo hanya tersedia pada environment development yang telah diinisialisasi dengan data demo. Jangan gunakan kredensial demo pada production.

### 2.1 Input Kontrak SPK Baru & Unggah PDF
1. Buka menu **📄 Kontrak SPK & PO Vendor** di sidebar kiri (Kelompok *1. PENGADAAN & LOGISTIK*).
2. Klik tombol hijau **"+ Buat SPK Baru"** di kanan atas daftar kontrak SPK.
3. Isi formulir pembuatan kontrak:
   * Pilih **Principal Vendor** (Contoh: *PT MyRepublic Indonesia* atau *PT Biznet Networks*).
   * Nomor SPK otomatis ter-generate sesuai kode vendor (atau ketik manual, misal: `SPK/MYREP-OPS/2026/088`).
   * Masukkan **Nama / Judul Pengadaan** (Contoh: *Pengadaan Material Drop Core & Aksesoris Rollout*).
   * Pilih **Proyek Terkait** (opsional).
   * Tentukan **Status Pembayaran** awal (*UNPAID*, *PARTIAL*, atau *PAID*).
   * Unggah file **Dokumen Kontrak SPK (PDF)** atau scan BAST bertanda tangan.
4. **Daftarkan Rincian Material Pesanan:**
   * Pilih material (misal: *Tiang FO 7 Meter*, *Kabel Drop Core*, dll.).
   * Masukkan Target Qty dan Harga Satuan.
   * Klik **"+ Tambah Barang"** jika terdapat beberapa jenis barang sekaligus. Nilai total kontrak akan otomatis terkalkulasi dan skema termin pembayaran (*DP 30%, Termin 2 50%, Termin 3 20%*) otomatis dihitung.
5. Klik **"Simpan Kontrak SPK"**. Kontrak baru akan langsung muncul di daftar SPK dan memiliki tombol **"📄 Lihat Kontrak SPK"**.

---

### 2.2 Handheld 1: Tagging & Scan Muat di Yard Principal
Tahap ini dilakukan saat tim logistik mengambil material langsung di yard pusat Principal sebelum truk diberangkatkan ke gudang proyek.

```
[Yard Principal] ──(Tempel Tag Anti-Metal)──> [Handheld 1 Scan Muat] ──(Kunci Manifest)──> [Truk Berangkat]
```

1. Tempelkan tag RFID anti-metal **WZ-Y258** pada tiang besi 7M/9M, atau stiker **EL-UHF9424-U9-W (Wet Inlay)** pada drum kabel/kardus aksesoris.
2. Buka menu **🚚 Muat Truk di Principal (Handheld 1)** di sidebar kiri.
3. Pilih **Kontrak SPK** dan **Gudang Transit Tujuan**.
4. Masukkan **Nomor Surat Jalan (SJ)** fisik (Contoh: `SJ-MYREP-2026-0045`).
5. **Dukungan Multi-Barang (Multi-Material Manifest):**
   * Di panel kiri (*Rincian Material SPK*), checklist material yang ingin dimuat ke dalam armada truk yang sama. Anda dapat memuat 1 jenis barang saja atau beberapa jenis barang sekaligus (misal: Tiang 7M dan Kabel Dropcore 1 Core).
   * Tentukan jumlah muat (*Kuantitas Muat*) untuk masing-masing item sesuai kapasitas bak truk dan sisa kuota SPK.
6. **Unggah Bukti Fisik Keberangkatan:**
   * Klik **Foto Muatan Truk**: Ambil foto susunan barang di atas bak truk pengangkut.
   * Klik **Dokumen Surat Jalan**: Foto lembar surat jalan fisik keberangkatan.
7. **Pemindaian Tag RFID per Material:**
   * Di panel kanan (*Scanner EPC Handheld*), pilih tab material yang sedang discan.
   * Tembakkan gun handheld reader ke arah fisik barang. Kotak counter tag akan menghitung jumlah EPC secara live dan memvalidasi apakah jumlah tag cocok dengan rencana muat.
   * Pindah ke tab material berikutnya dan ulangi pemindaian hingga seluruh material berstatus hijau (*Cocok*).
8. Klik tombol hijau: **"Kunci Manifest Keberangkatan (X Material • Y Tag)"**.
9. Status pengiriman berubah menjadi **IN-TRANSIT (DI PERJALANAN)**. Data muatan truk kini terkunci dan tidak dapat diubah oleh pihak gudang!
   * EPC/item ganda atau jumlah manifest yang berbeda dari jumlah EPC ditolak. Selama transit, barang belum menjadi stok gudang.

---

## 3. Panduan Role: Staf Gudang (Storeroom Staff)

> Gunakan akun personal ber-role `storeroom` yang ditugaskan ke gudang terkait.

### 3.1 Handheld 2: Scan Bongkar Truk & Rekonsiliasi Selisih
Saat truk dari Principal tiba di depan gerbang gudang transit:

```
[Truk Tiba di Gudang] ──(Bongkar Muatan)──> [Handheld 2 Scan Tiba] ──(Cocokkan Otomatis)
                                                                            │
                                     ┌──────────────────────────────────────┴──────────────────────────────────────┐
                                     ▼                                                                             ▼
                        🟢 100% Cocok (Matched)                                                     🔴 Selisih Kurang (Mismatch)
                 • Stok otomatis masuk gudang                                                 • Sistem menolak stok masuk
                 • Tercatat di Custody Ledger                                                 • Kirim notifikasi bahaya ke PM
```

1. Buka menu **📦 Bongkar & Terima Truk (Handheld 2)** di sidebar kiri (Kelompok *1. PENGADAAN & LOGISTIK*).
2. Pilih nomor surat jalan yang tiba dari daftar dropdown. Sistem akan menampilkan panel interaktif **"Rincian Material yang Dimuat di Truk Ini"** yang memuat seluruh jenis barang, kuantiti manifest berangkat, kuantiti terbaca bongkar, persentase progress, serta status pemenuhan per material.
3. **Pemantauan & Panduan Real-time Barang Kurang:**
   * **Deteksi Otomatis & Tombol "Arahkan ke Barang Kurang":** Saat proses pemindaian berjalan, jika sistem mendeteksi ada material yang belum lengkap, muncul banner peringatan kuning/merah beserta tombol **"🎯 Arahkan ke Barang Kurang"**. Mengklik tombol ini otomatis memfilter daftar dan mengarahkan fokus layar langsung ke kartu material yang bersangkutan.
   * **Rincian EPC Kurang vs Lengkap:** Setiap jenis barang dapat dibuka (*expand*) untuk melihat daftar nomor seri/EPC yang belum tiba (badge merah ❌) dan yang sudah terbaca (badge hijau ✓). Tersedia tombol **"📋 Salin EPC Kurang"** untuk mempermudah kru lapangan mencari fisik barang di bak truk.
   * **Quick Status Chips di Kolom Scanner:** Di atas area teks scanner terdapat chip ringkasan status per material yang langsung berubah secara live (`Tiang 7M: 3/4 (Kurang 1)` vs `Kabel 48C: 10/10 ✓`) dan dapat diklik untuk menyorot barang terkait.
4. **Unggah Bukti Fisik Penerimaan:**
   * Ambil foto fisik saat barang diturunkan dari truk (*Foto Bongkar*).
   * Ambil foto surat jalan yang sudah ditandatangani oleh sopir dan staf gudang.
5. **Pindai Tag yang Turun dari Truk:**
   * Gunakan Handheld 2 untuk memindai seluruh tag RFID barang yang dibongkar ke kolom scanner (atau otomatis terisi via live reader RFID).
6. Klik tombol biru: **"Jalankan Rekonsiliasi Susut In-Transit"**.
6. **Mekanisme Pratinjau Rekonsiliasi (Preview First) & Aksi Lanjutan:**
   Sistem **TIDAK langsung menyimpan ke database**, melainkan selalu menampilkan dialog **Pratinjau Rekonsiliasi (Pre-Reconciliation Check)** terlebih dahulu beserta rincian manifest material agar operator dapat memvalidasi data:
   * **Jika 100% Cocok (Full Match):**
     * Menampilkan banner hijau: *"Pratinjau Rekonsiliasi: Muatan Truk 100% Lengkap & Sesuai Manifest"*.
     * Menampilkan daftar manifest seluruh jenis barang, ringkasan metrik (Berangkat Pabrik, Terbaca Gudang, Susut 0, Tag Asing 0), serta daftar seluruh tag RFID yang tervalidasi 1-ke-1.
     * **Aksi 1: [ ↺ Kembali & Scan Ulang ]** — Kembali ke console jika ingin memeriksa kembali.
     * **Aksi 2: [ ✅ Konfirmasi & Masukkan ke Stok Gudang ]** — Mengeksekusi penambahan inventaris aktif gudang untuk masing-masing material, mencatat di Custody Ledger, dan menyelesaikan tiket selisih terdahulu (*Auto-Resolved*).
   * Konfirmasi ulang atas pengiriman matched ditolak. Stok hanya masuk setelah EPC distinct cocok 100% dan jumlah per material sesuai manifest.
   * **Jika Terdeteksi Selisih (Mismatch Shortage / Tag Asing):**
     * Menampilkan banner peringatan kuning/merah: *"Peringatan: Terdeteksi Selisih Muatan Truk (Mismatch Shortage)"*.
     * Menampilkan rincian tag RFID yang belum ditemukan di bak truk serta tag asing yang tidak tercantum di surat jalan.
     * **Aksi 1: [ ↺ Periksa Fisik Truk & Scan Ulang ]** — Gunakan opsi ini jika dicurigai masih ada tiang/kabel terselip di sudut bak truk. Data belum tersimpan ke DB dan tidak mengotori antrean PM.
     * **Aksi 2: [ ⚠️ Buat Berita Acara & Eskalasi ke PM ]** — Gunakan jika muatan truk sudah dibongkar total dan dipastikan memang ada barang yang raib di jalan (*In-Transit Shrinkage*). Staf gudang wajib melampirkan **Foto Fisik Bak Truk Kosong**, **Foto BAST Sopir**, dan **Catatan Kronologi Lapangan**. Setelah dikirim, pengiriman berstatus **MISMATCH FLAGGED** dan **DIKUNCI** untuk investigasi approval PM.

---

### 3.2 Menyiapkan Barang untuk Work Order (Read-Only Kuota)
1. Buka menu **📋 Work Order & Kuota BOQ** di sidebar kiri (Kelompok *2. PERENCANAAN GUDANG*).
2. Halaman menampilkan **Data Table Lengkap** dengan fitur live search & status filter. Cari nomor WO atau proyek Anda.
3. Klik tombol **"Detail BOQ"** pada baris WO untuk melihat rincian alokasi material.
4. Perhatikan kolom **Kuota PM (Terkunci)**: Staf gudang bersifat read-only dan tidak dapat mengubah angka kuota ini.
5. Klik tombol **"Siapkan"** atau **"Storeroom Siapkan Barang"**.
6. Masukkan kuantitas fisik yang berhasil disiapkan di rak dekat pintu gerbang. Jika jumlah fisik kurang dari kuota BOQ, sistem akan otomatis memberi peringatan *Shortage* ke PM.
7. Klik **"Simpan Laporan Persiapan"**.

---

### 3.3 Verifikasi Fisik Barang Retur (Alur 2-Langkah dengan Pratinjau)
Saat mandor lapangan mengembalikan sisa tiang yang tidak terpakai:
* Gunakan sesi retur yang selesai melintasi gate. Storeroom harus ditugaskan ke gudang dan berbeda dari PIC pengaju.
* Match dihitung server dari jumlah fisik versus `passed_qty`; operator tidak dapat memaksakan hasil. Posting matched hanya sekali, lalu stok/lokasi gudang aktif kembali.
1. Buka menu **🔄 Verifikasi Retur Sisa** di sidebar kiri (Kelompok *4. RETUR & AUDIT TRAIL*).
2. Temukan sesi retur dengan status **PENDING CEK** pada tabel berdensitas tinggi.
3. Klik tombol **"Periksa & Rekonsiliasi"** untuk membuka modal verifikasi.
4. **Langkah 1 (Input Hitungan Fisik):**
   * Cocokkan fisik nyata barang di loading bay inbound dengan laporan PIC mandor.
   * Masukkan jumlah aktual di kolom *Hitungan Nyata Storeroom*.
   * Klik tombol biru: **"Jalankan Rekonsiliasi & Pratinjau Selisih"**.
5. **Langkah 2 (Pratinjau Rekonsiliasi & Aksi):**
   * Sistem menghitung otomatis perbandingan per item (*Diajukan*, *Dihitung*, *Selisih ±0 / kurang / lebih*).
   * **Jika 100% Cocok (Full Match):**
     * Banner hijau: *"✅ 100% MATCH — Hitungan Fisik Lengkap Sesuai Dokumen"*.
     * **Aksi:** Klik **"✅ Konfirmasi Cocok & Pulihkan Kuota WO"** untuk menambah stok gudang dan mengembalikan kuota material Work Order.
   * **Jika Terdeteksi Selisih Fisik (Mismatch):**
     * Banner merah: *"⚠️ MISMATCH — Terdeteksi Selisih Antara Fisik vs Dokumen Retur"*.
     * Muncul form wajib: **Catatan Kronologi / Berita Acara Selisih** (misal: kabel drop kurang 50m).
     * **Aksi:** Klik **"⚠️ Kirim Berita Acara Selisih ke PM"** untuk eskalasi audit PM.
   * **Aksi Koreksi:** Kapan pun dapat mengklik **"↺ Kembali & Koreksi Hitungan"** untuk merevisi angka fisik.

---

### 3.4 Cek Stok Gudang & Kartu Stok
1. Buka menu **Stok & Kartu Stok**.
2. Filter gudang dan material. Tabel menampilkan jumlah tag aktif, stok tercatat, serta status terhadap batas minimum.
3. Klik **Buka Kartu** untuk melihat saldo awal dan mutasi `STOCK_IN`/`GATE_OUT` per periode.
4. Stok tercatat hanya berlaku untuk material serialized (`1 tag = 1 unit`). Untuk material batch/kabel, sistem menampilkan **QTY BELUM TERSEDIA**; jumlah tag tidak dianggap sebagai meter atau unit barang.

### 3.5 Audit Massal Cepat (Stock Opname Fisik Yard dengan Pratinjau & BAP)
1. Buka menu **📡 Stock Opname Fisik Yard** di sidebar kiri.
2. Pilih gudang transit target audit dari dropdown.
3. Bawa Handheld Reader berkeliling di halaman/yard gudang transit sambil menembakkan pelatuk scanner ke seluruh tiang FO.
4. Tempelkan (*paste*) daftar nomor tag EPC hasil scan (atau gunakan streaming Bluetooth reader).
5. Klik **"Jalankan Rekonsiliasi Opname Fisik vs Sistem"**.
6. **Modal Pratinjau Rekonsiliasi Opname Fisik Terbuka:**
   * **Metrik 4-Box:** Saldo Buku Sistem, Fisik Terbaca, Cocok (Matched), Selisih Hilang (Missing), dan Tag Asing (Unexpected).
   * **Daftar Rincian EPC:** Menampilkan kode tag yang hilang (merah) dan tag tak terdaftar (kuning).
   * **Pilihan Aksi Berkelanjutan:**
     * **[ ↺ Sisir Ulang Yard / Tambah Scan ]** — Menutup pratinjau untuk memungkinkan petugas menyisir sudut yard yang terlewat dan menambahkan EPC baru tanpa mereset input.
     * **[ 📄 Cetak Berita Acara Opname (BAP) ]** — Membuka jendela cetak resmi Berita Acara Stock Opname lengkap dengan nomor BAP, tanggal, persentase kecocokan, rincian tag selisih, dan kolom tanda tangan auditor serta kepala gudang.
     * **[ 🚨 Eskalasi Investigasi ke PM ]** *(aktif jika ada selisih hilang)* — Mengirimkan tiket anomali audit ke Project Manager dan Manajemen untuk investigasi rekaman CCTV dan log portal gerbang RFID.

---

## 4. Panduan Role: Mandor / PIC Lapangan (Aplikasi PWA)

> Gunakan akun personal ber-role `pic_lapangan`.

Aplikasi untuk mandor lapangan didesain dengan **huruf tebal, tombol sentuh raksasa, bahasa Indonesia sederhana, dan suara bunyi *BEEP!*** agar sangat mudah digunakan di bawah terik matahari.

```
                  ┌───────────────────────────────────────────────┐
                  │          📱 PWA LAPANGAN (MANDOR)             │
                  ├───────────────────────────────────────────────┤
                  │                                               │
                  │   [ 🟢 1. PENGELUARAN MATERIAL (Muat Truk)]   │
                  │                                               │
                  │   [ 🔵 2. PENGEMBALIAN / RETUR SISA       ]   │
                  │                                               │
                  │   [ 🟣 3. LAPORAN PEMASANGAN (INSTALASI)  ]   │
                  │                                               │
                  │   [ ⚪ 4. SCANNER HANDHELD / CEK TAG      ]   │
                  │                                               │
                  └───────────────────────────────────────────────┘
```

### 4.1 Buka PWA & Login Akun Personal
1. Buka aplikasi di browser ponsel Android Anda.
2. Di halaman login, klik tombol shortcut **"👷 PIC Lapangan"** lalu klik **"Masuk ke Sistem"**.
3. Di pojok kanan atas, pastikan status **"Suara ON"** aktif agar Anda mendengar bunyi *beep* setiap kali aksi berhasil.

---

### 4.2 Tombol 1: Pengeluaran Material (Muat Truk — Multi-Item & Pilih Armada)
Lakukan langkah ini saat Anda dan armada pikap bersiap memuat material (bisa beberapa jenis material sekaligus seperti Tiang FO, Kabel, dan Aksesoris) keluar gudang untuk dipasang di rute proyek:
1. Tekan tombol hijau raksasa: **"1. PENGELUARAN MATERIAL (MUAT TRUK)"**.
2. Pilih **Lokasi Proyek / Work Order** yang sedang dikerjakan.
3. **Tentukan Jumlah Tiap Material yang Dimuat ke Truk (Multi-Item):**
   * Layar menampilkan seluruh daftar material dalam BOQ proyek beserta sisa kuota yang diizinkan PM.
   * Tekan tombol **[ + ]** atau **[ - ]** (atau ketik angka) pada tiap barang yang Anda bawa di truk:
     * Misal: *Tiang FO 7 Meter = 5 batang*
     * Misal: *Kabel Drop Core = 2 drum*
   * Di bagian atas tertampil total muatan: *Total: 7 unit material*.
4. **Pilih Armada Truk Pengangkut:**
   * Pilih armada truk terdaftar dari dropdown (menampilkan plat nomor, driver, dan kapasitas tiang), atau ketik plat nomor manual jika truk sewa dadakan.
5. Tekan tombol hijau: **"AJUKAN IZIN KELUAR (7 UNIT)"**.
6. **Konfirmasi & Pengawasan Sensor Portal RFID:**
    * HP Anda akan berbunyi **"BEEP!"** nyaring dan status sesi menjadi **AKTIF**.
   * Bawa truk/material melintasi area **Portal Sensor RFID Pintu Keluar**.
   * Sensor akan memvalidasi bahwa seluruh material yang didaftarkan melintas bersama-sama.

> [!NOTE]
> **Penanganan Kondisi Lapangan Nyata (Bawa Bertahap 1-1, Barang Tertinggal, atau Tag Terhalang Logam):**
> * **1. Mendukung Pengangkutan Bertahap (Multi-Pass / Bawa 1 per 1):**  
>   Sensor portal gerbang secara cerdas **mengakumulasikan seluruh tag unik yang melintas** selama sesi izin aktif. Jika teknisi menggotong tiang satu per satu atau forklift mondar-mandir bertahap, angka di HP akan terus bertambah (misal: *1/14 $\to$ 2/14 $\to$ 14/14*). Tag yang melintas bolak-balik otomatis di-deduplikasi sehingga tidak terhitung dobel.
> * **2. Barang Batal Dibawa atau Tidak Terbaca:**  
>   Finalisasi parsial dinonaktifkan. Sistem tidak mengesahkan jumlah yang lebih kecil dari izin. Periksa fisik dan posisi tag; jika rencana berubah, batalkan sesi lalu buat permohonan baru dengan jumlah yang benar.
> * **3. Tombol Merah "Batalkan Sesi":**  
>   Jika terjadi perubahan rencana kerja total dan tidak ada material yang jadi dibawa keluar, tekan tombol **"Batalkan Sesi"** untuk membatalkan izin dan membuka pengajuan baru.
> * **Satu sesi per cabang:** Selama sesi masih menunggu persetujuan atau berstatus aktif, cabang tersebut tidak dapat membuka sesi gate baru. Selesaikan atau batalkan sesi sebelumnya terlebih dahulu. Jika sesi macet, minta supervisor membatalkannya.

> [!WARNING]
> **Peringatan Deteksi Barang yang Tidak Diminta (Unrequested Items):**
> Jika Anda membawa material yang **TIDAK ADA** dalam daftar izin di atas (misal membawa kabel padahal izinnya hanya tiang), atau membawa jumlah melebihi kuota, sensor portal gerbang akan **SEKETIKA** mendeteksinya:
> * Sirine audio di pos gudang berbunyi kencang dan banner merah berkedip di monitor.
> * Pesan WhatsApp darurat otomatis terkirim detik itu juga ke ponsel Project Manager (PM).
> * Kejadian tersebut tercatat permanen dalam riwayat audit sebagai *mismatch violation*.

---

### 4.3 Tombol 2: Pengembalian / Retur Sisa Material
Lakukan langkah ini jika ada material proyek yang tersisa dan dikembalikan ke gudang:
1. Tekan tombol biru: **"2. PENGEMBALIAN / RETUR SISA"**.
2. Pilih proyek terkait.
3. Atur jumlah unit untuk tiap material yang dikembalikan menggunakan tombol **[ + ]** dan **[ - ]**.
4. Pilih kondisi fisik: **"✅ Masih Bagus / Utuh"** atau **"⚠️ Rusak / Bengkok"**.
5. Tekan tombol: **"AJUKAN RETUR BARANG"**.
6. Lewatkan barang melalui portal sensor pintu gudang untuk verifikasi otomatis.

---

### 4.4 Tombol 3: Laporan Pemasangan Material di Lapangan (Instalasi Tiang & Kabel)
Lakukan langkah ini setiap kali tim Anda selesai menancapkan tiang atau menarik kabel di lapangan:
1. Tekan tombol ungu: **"3. LAPORAN PEMASANGAN (INSTALASI)"**.
2. Pilih **Lokasi Proyek / Work Order** terkait.
3. Atur jumlah material yang telah selesai terpasang hari ini dengan tombol **[ + ]** / **[ - ]**.
4. Masukkan **Catatan Lokasi Titik Pemasangan** (misal: *Jl. Raya Tajur KM 5 Titik Pole #10 - #25*).
5. Tekan tombol: **"KIRIM LAPORAN PEMASANGAN"**.
6. Angka `installed_qty` pada Work Order otomatis terupdate dan tercatat di buku besar kepemilikan material.

---

### 4.5 Tombol 4: Scanner Handheld / Cek Tag RFID
Gunakan menu ini untuk menguji apakah scanner handheld membaca tag RFID tiang/kabel dengan baik sebelum dimuat ke truk. Setiap kali tag terdeteksi, HP akan berbunyi *beep* dan menampilkan nomor EPC tag yang terbaca.

---

## 5. Panduan Role: Project Manager (PM / Approver)

> Gunakan akun personal ber-role `pm`.

### 5.1 Pembuatan & Persetujuan Work Order (Kunci Kuota BOQ)
1. Buka menu **Work Orders & Kuota BOQ**.
2. Klik tombol **"+ Buat Work Order"**.
3. Tentukan proyek, gudang penyedia, target tanggal selesai, dan rincian kuota BOQ (contoh: 20 batang tiang 7M, 5 drum kabel).
4. Klik **"Simpan & Ajukan"**.
5. Pada Work Order yang berstatus *Pending*, klik tombol hijau **"Approve & Kunci Kuota BOQ"**.
6. **Dampak Penguncian:** Angka kuota ini menjadi acuan mutlak gerbang RFID. Gudang dan mandor tidak akan pernah bisa mengeluarkan barang melebihi kuota ini tanpa persetujuan revisi dari Anda!

---

### 5.2 Menyetujui Anomali Muatan Truk (Mismatch Shortage)
Jika terjadi selisih yang dieskalasi oleh staf gudang:
1. Buka menu **Pusat Approval & Transaksi** (atau menu **Status Truk & Pengiriman** $\to$ Pengiriman bermarkah **`MISMATCH FLAGGED`**).
2. Klik permohonan investigasi untuk membuka **Dossier Lengkap Berita Acara**:
   * **Rincian Komparasi:** Jumlah berangkat dari yard vs jumlah fisik terbaca di gudang beserta persentase selisih.
   * **Daftar EPC Hilang:** Nomor seri RFID spesifik yang raib di perjalanan untuk keperluan *blacklist* aset.
   * **Bukti Lapangan:** Catatan kronologi dari staf gudang, foto fisik bak truk kosong, dan foto surat jalan/BAST berparaf sopir ekspedisi.
3. Lakukan koordinasi dan klarifikasi dengan vendor ekspedisi atau principal.
4. **Keputusan PM:** Minta pemeriksaan ulang atau lanjutkan investigasi. Pengiriman mismatch tidak menambah stok parsial; stok hanya diposting setelah rekonsiliasi EPC mencapai full match.
5. **Penyelesaian Otomatis (*Auto-Resolved*):** Jika sebelum investigasi selesai staf gudang berhasil menemukan seluruh barang yang tersisa dan memindai ulang dengan hasil 100% Match, tiket permohonan ini otomatis diselesaikan (*Auto-Resolved*) oleh sistem tanpa memerlukan tindakan manual PM.

---

### 5.3 Monitoring Dashboard & Laporan Rantai Kepemilikan
* Buka menu **Dashboard**: Pantau KPI real-time (Total Tag Terdaftar, Nilai Aset Terlindungi, Sesi Gerbang Hari Ini, Tingkat Pelanggaran 0%).
* Buka menu **Audit & Opname**: Menampilkan catatan *Custody Ledger* yang *append-only* (tidak dapat diedit atau dihapus oleh siapapun) mencakup nama penanggung jawab, timestamp, GPS, dan histori perpindahan barang.

### 5.4 Fleksibilitas Persetujuan: Langsung di Menu Operasional vs Pusat Approval
Sistem MOSA WMS mendukung dua metode persetujuan digital yang saling tersinkronisasi:

1. **Aksi Persetujuan Langsung di Masing-Masing Menu Operasional (Direkomendasikan):**
   * **Menu Kontrak SPK & PO Vendor:** PM dapat langsung melihat seluruh kontrak (baik yang pending maupun yang sudah disetujui), memfilter dengan dropdown **"Status Approval"** (termasuk filter *⚡ Perlu Tindakan Saya*), dan mengklik tombol **"Setujui"** atau membuka **"Detail"** untuk menyetujui, meminta revisi, atau menolak kontrak SPK secara instan tanpa perlu berpindah menu.
   * **Menu Work Order & Kuota BOQ:** PM dapat langsung meninjau draf kuota penarikan dan mengklik tombol hijau **"Approve"** pada baris Work Order untuk mengunci kuota BOQ.
2. **Pusat Approval & Transaksi (Opsional / Agregasi Sentral):**
   * Berfungsi sebagai dasbor konsolidasi multi-tier untuk meninjau seluruh antrean transaksi dari berbagai modul (SPK, Work Order, Rekonsiliasi Pengiriman, dan Izin Akses Pintu).
   * Tab **Inbox Menunggu** khusus menyaring antrean yang belum ditindaklanjuti. Dokumen yang sudah disetujui otomatis berpindah ke tab **Semua Permohonan**.

---

## 6. Panduan Role: Direksi / Top Level Management (BOD / Executive)

> Gunakan akun personal ber-role `management`.

### 6.1 Pemantauan Eksekutif & Ringkasan Portofolio Proyek
1. Buka menu **Dashboard Ringkasan**: Menampilkan metrik level tinggi (Total Nilai Valuasi Aset FO, Tingkat Susut Logistik/Shrinkage Rate 0%, Jumlah Proyek Aktif, dan Sesi Gerbang Hari Ini).
2. Buka menu **Status Truk & Pengiriman**: Memantau pergerakan armada antar-kota dari yard Principal ke gudang transit transit secara real-time.
3. Buka menu **Audit Chain of Custody**: Meninjau buku besar digital anti-tamper untuk kepatuhan audit tender dan mitigasi sengketa klaim kehilangan barang.

### 6.2 Sign-off Transaksi Bernilai Besar (High-Value Tier Approval)
1. Buka menu **Pusat Approval & Transaksi**.
2. Tab **Inbox Menunggu**: Tinjau permohonan SPK pengadaan bernilai besar (> Rp 500 Juta) atau penyesuaian kuota BOQ proyek strategis yang membutuhkan *Final Sign-off* dari level Direksi.
3. Berikan persetujuan eksekutif untuk mencairkan atau memvalidasi transaksi.

---

## 7. Panduan Role: Super Administrator

> Gunakan akun personal ber-role `superadmin`.

### 6.1 Pendaftaran Tag RFID Baru (Enrollment Satuan & Kantong Ziplock)
MOSA WMS mendukung dua mode aktivasi tag pra-pemasangan (*pre-encoding*):
Enrollment satuan/batch mencatat identitas aktif dan audit personal `TAG_ENROLLED`, tanpa memasukkan barang ke stok. EPC dapat digunakan pada manifest dispatch principal; stok masuk setelah receiving full match. Tag lama yang telanjur masuk stok tidak otomatis diperbaiki.

### Custom EPC vendor

1. Atur prefix dan jumlah digit suffix saat membuat jenis material.
2. Pada Pendaftaran RFID pilih **Generate EPC Vendor**, jenis material, lalu jumlah maksimal 1.000 per batch.
3. Export CSV hasil generate dan kirim ke vendor encoding. EPC langsung berstatus `reserved`; jangan enroll ulang satu per satu saat tag datang.
4. Saat muat barang di principal, scan EPC ke material yang sesuai. Sistem mengikat EPC ke manifest/proyek dan mengubah status menjadi `attached`.
5. Tombol **Cek EPC** pada menu handheld menampilkan peruntukan dan status tanpa mengubah data.

* **🛍️ Mode Kantong Ziplock (Array / Multi-Tag Sekaligus — *Paling Cepat*):**
  1. Buka menu **Pendaftaran Tag RFID** $\to$ Tab **"🛍️ Kantong Ziplock (Array)"**.
   2. Pilih **Material FO Target** (misal: *Tiang FO 7 Meter*) dan **Gudang Reader**, lalu reader pendaftaran. Gudang hanya menentukan reader dan konteks audit, bukan lokasi stok.
  3. Masukkan 10–50 keping tag RFID ke dalam 1 kantong ziplock, lalu **dekatkan kantong tersebut ke antena UHF Reader**.
  4. Seluruh nomor EPC unik yang terbaca otomatis terakumulasi dalam daftar array (*pills container*) secara real-time.
  5. *(Opsional)* Jika menggunakan scanner barcode/daftar supplier, Anda juga dapat menempelkan/paste teks daftar EPC di kotak input batch.
  6. Klik tombol **"Aktifkan Seluruh Tag di Kantong (X pcs)"**. Seluruh tag langsung terdaftar dan aktif di sistem dalam 1 kali klik.
  7. Berikan label pada kantong ziplock (misal: *"50 Tag Tiang 7M"*) dan bawa ke lapangan untuk ditempelkan ke tiang.

* **🎯 Mode Satuan (1-per-1 Individual Tag):**
  1. Buka Tab **"🎯 1-per-1 (Satuan)"**.
  2. Letakkan 1 tag di atas reader $\to$ nomor EPC otomatis terisi (atau klik `✨ Auto-Hex` untuk pengujian simulasi).
  3. Klik **"Registrasi & Simpan Tag Satuan"**. Form otomatis bersih kembali dan siap untuk tag berikutnya.

* **🛡️ Fitur Peredaman Alarm Otomatis (Single-Reader Hybrid Mode):**
  * Jika Anda hanya memiliki 1 reader fisik (seperti **EL-UHF-RC4**) yang digunakan bergantian untuk pengawasan gerbang dan meja pendaftaran:
  * Begitu halaman **Pendaftaran Tag RFID** dibuka di web browser, sistem secara otomatis mengalihkan reader ke **Mode Meja Pendaftaran (`ENROLLMENT`)**.
  * Dalam mode ini, seluruh pembacaan tag di meja admin **DIBEBASKAN DARI ALARM GERBANG** (tidak akan muncul insiden anomali palsu di Dashboard), sementara aliran EPC tetap langsung masuk ke form pendaftaran.
  * Begitu Anda berpindah ke menu lain, reader otomatis dikembalikan ke **Mode Pengawasan Gerbang (`GATE_SECURITY`)**.

---

### 6.2 Pengaturan Gudang & Mode Gerbang (1 vs 2 Antena)
MOSA WMS mendukung 2 konfigurasi gerbang yang bisa diatur per masing-masing lokasi gudang:
1. Buka menu **Master Data** $\to$ Kartu **Gudang**.
2. Setiap gudang memiliki badge mode gerbang:
   * **Mode 2 Antena (`DUAL_ANTENNA_AUTO`):** Menggunakan 2 antena UHF ($A \leftrightarrow B$) di sisi dalam dan luar pintu gerbang. Arah keluar/masuk dihitung otomatis berdasarkan urutan waktu sinyal. Direkomendasikan untuk gudang pusat berkapasitas besar.
   * **Mode 1 Antena (`SINGLE_ANTENNA_SESSION`):** Menggunakan 1 antena UHF. Arah pergerakan diselesaikan berdasarkan sesi aktif aplikasi mandor (hemat biaya untuk ruko/gudang transit bergerak).

---

### 6.3 Panel Pairing & Konfigurasi RFID Reader (Zero Script Editing & Multi-Warehouse Isolation)
Panel menampilkan dua kesehatan terpisah: **Edge** (heartbeat ke server) dan **Reader** (respons protokol hardware). `Koneksi terlambat` berarti heartbeat belum melewati toleransi; `Edge tidak terjangkau` berarti server tidak menerima heartbeat, bukan kepastian internet atau reader mati. Uji socket hanya menguji akses TCP dan tidak mengubah heartbeat. Monitoring memperbarui status sekitar setiap 5 detik.

Superadmin dapat memasangkan reader fisik (seperti **Electron EL-UHF-RC4** atau **HW-VX6346KL**) melalui Web UI:
1. Buka menu **Pairing Reader & Device** di seksi *4. DISPATCH & SENSOR PORTAL* pada sidebar.
2. **Statistik Status Perangkat:**
   * Memonitor jumlah total reader terdaftar, status online/offline, dan koneksi daemon Edge Bridge WebSocket (`ws://127.0.0.1:2078`).
3. **Memasangkan Reader Baru & Memilih Peran (Device Role):**
   * Klik tombol **"+ Pasangkan Reader Baru"**.
   * Pilih preset hardware cepat (misal: *Electron EL-UHF-RC4 Series* dengan port default 2022).
   * Masukkan **IP Address** reader (misal `192.168.1.200`), **Port TCP** (`2022`), dan pilih **Gudang Penempatan**.
   * Pilih **Peran / Fungsi Reader**:
     * 🚪 **Pintu Gerbang Keamanan (`gate_controller`):** Menjaga portal gerbang gudang 24/7 dan mendeteksi anomali perlintasan material.
     * 🏷️ **Meja Pendaftaran Tag (`enrollment_desktop`):** Digunakan khusus di meja admin untuk mendaftarkan tag baru tanpa memicu alarm gerbang.
     * 🔄 **Hybrid Workstation (`hybrid_workstation`):** Berfungsi ganda (bisa gerbang dan meja pendaftaran).
   * Klik tombol **"Test Ping IP"** di dalam modal untuk memverifikasi soket reader dapat dijangkau sebelum disimpan.
   * Klik **"Pasangkan Perangkat"**.
4. **Isolasi Antar Cabang Gudang (Zero Interference):**
   * Setiap reader terikat spesifik pada `warehouse_id` dan `device_code` masing-masing. Aktivitas pendaftaran tag di kantor/gudang Jakarta tidak akan mematikan sensor gerbang keamanan di cabang gudang lain (Bogor, Surabaya, dsb.).
5. **Uji Konektivitas Real-Time (Socket Ping):**
   * Pada kartu perangkat, klik tombol ⚡ **"Test Socket Ping"** untuk melakukan ping TCP langsung dengan feedback latensi instan (misal `🟢 Latency: 14.2ms`).
6. **Auto-Sync Edge Bridge Daemon:**
   * Daemon `edge-bridge` secara otomatis mendeteksi konfigurasi IP/Port reader yang tersimpan di server pusat saat dinyalakan (`npm start`), sehingga pergantian reader di lapangan dapat dilakukan sepenuhnya via GUI web browser.
7. **Instalasi Background Service Otomatis di Komputer Pos Gudang (24/7 Auto-Start):**
   * **🪟 Windows PC di Pos Gudang:**
     1. Buka folder `edge-bridge\scripts` di File Explorer.
     2. Klik kanan file **`install-windows-service.bat`** $\to$ pilih **"Run as Administrator"**.
     3. Daemon Edge Bridge akan otomatis terpasang via PM2 dan otomatis menyala setiap kali komputer dinyalakan/restart (*Auto-Start on Boot*).
     4. Untuk memantau log: jalankan `npm run logs:daemon` di terminal pos gudang.
   * **🐧 Linux / Raspberry Pi di Enclosure Gerbang:**
     1. Jalankan terminal:
        ```bash
        cd /opt/mosa/edge-bridge/scripts
        sudo chmod +x install-linux-service.sh
        sudo ./install-linux-service.sh
        ```
     2. Service otomatis dikontrol oleh `systemd` (`sudo systemctl status mosa-edge-bridge`).

---

### 6.4 Master Setting & Alur Approval (Multi-Tier Sign Off & SLA)
1. Buka menu **Master Setting Approval** di seksi *2. PERENCANAAN & GOVERNANCE*.
2. Tab **Template Alur Persetujuan**:
   * Klik **"Buat Template Alur Baru"** untuk menentukan rantai reviewer berjenjang per modul (`SPK`, `WORK_ORDER`, `DELIVERY`, `RETURN_SCRAP`, `GATE_ACCESS`).
   * Konfigurasi batas ambang nominal (*Tier Threshold*), misal: SPK $\le$ Rp 50 Juta cukup 1 tier review PM, SPK $>$ Rp 50 Juta wajib 2 tier review Superadmin/Direktur.
   * Tetapkan approver personal per step dan target SLA respon (contoh: SLA 24 jam).
3. Tab **Override Proyek & Gudang**:
   * Tetapkan pengecualian alur approval khusus untuk proyek atau gudang tertentu tanpa mengubah template global.
4. Tab **Kebijakan SoD**:
   * Referensi tata kelola kepatuhan anti-fraud pemisahan peran (*Segregation of Duties*).

---

### 6.4 Manajemen Pengguna, Akun & Hak Akses (RBAC Matrix)
1. Buka menu **Pengguna & Hak Akses** di seksi *PENGATURAN & AKSES SISTEM*.
2. Tab **Daftar Pengguna**:
   * Menampilkan seluruh user terdaftar, status aktif/suspended, role, dan kontak WhatsApp.
   * Klik **"Tambah Pengguna Baru"** untuk mendaftarkan akun baru lengkap dengan email, password, no HP, dan role fungsional.
   * Tombol Aksi: Klik ikon **Power** untuk menonaktifkan/mengaktifkan kembali akun, ikon **Edit** untuk update profil/password, atau ikon **Hapus**. Hapus hanya menonaktifkan akun; identitas dan audit tetap tersimpan.
3. Tab **Matriks Hak Akses & Role (RBAC)**:
   * **Pembuatan Role Kustom Baru:** Klik tombol **"+ Tambah Role Baru"** untuk mendefinisikan peran baru (contoh: *Quality Control Inspector*, *Finance Approver*, *Site Coordinator*), lengkap dengan kode slug, warna badge, deskripsi, dan checklist modul yang diizinkan.
   * **Pengaturan Izin Modular Real-Time:** Pada tabel matriks, Superadmin dapat langsung mengklik ikon centang/silang pada perpotongan baris modul dan kolom role untuk mengaktifkan atau menonaktifkan izin secara instan.
   * **Proteksi Role Sistem:** Role bawaan sistem (*Superadmin, PM, Procurement, Storeroom, Mandor Lapangan*) dilindungi dari penghapusan, namun kombinasi izin modulnya tetap fleksibel disesuaikan.
   * **Penugasan ke Pengguna:** Setiap role baru yang dibuat otomatis muncul di pilihan dropdown form tambah/edit pengguna di Tab 1.

---

### 6.5 Registri Armada Truk & Vendor Ekspedisi
1. Buka menu **Master Data Gudang & Truk** $\to$ Tab **Armada Truk**.
2. Klik tombol **"+ Tambah Armada Truk"**.
3. Masukkan nomor plat polisi, tipe truk (pickup/engkel medium/fuso berat/trailer), kapasitas muat tiang (misal 50 batang), nama supir, nomor HP, dan vendor ekspedisi.
4. Truk yang terdaftar akan menjadi pilihan validasi saat proses muat truk di yard principal (Handheld 1) dan bongkar terima di gerbang gudang (Handheld 2).

---

## 7. Alur Kerja (Workflow) Sensor Gerbang & Sistem Notifikasi Ketidaksesuaian

> [!NOTE]
> **Fokus Utama:** Sistem memprioritaskan keandalan **Alur Kerja (Workflow) Validasi Izin** dan **Deteksi Sensor RFID**. Pemasangan perangkat mekanis kunci magnetik dan kamera CCTV dapat diintegrasikan sebagai opsi hardware lanjutan. Fokus operasional utama saat ini adalah **kecepatan sensor mendeteksi ketidaksesuaian dan memicu notifikasi peringatan instan**.

```
                           [PEMBACAAN SENSOR RFID GERBANG]
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
         [100% SESUAI IZIN]                            [TERDETEKSI KETIDAKSESUAIAN]
                  │                                               │
                  ├─► Validasi Sesi Approved Berhasil             ├─► Peringatan Merah di Dashboard
                  ├─► Catat Event GATE_OUT / GATE_IN              ├─► Bunyikan Sirine Audio Alarm
                  └─► Mutasi Stok di Ledger Kepemilikan           ├─► Kirim Notifikasi WhatsApp ke PM
                                                                  └─► Catat Rincian Anomali di Log
```

### 7.1 Empat (4) Jenis Ketidaksesuaian yang Dideteksi Sensor:

1. **Perlintasan Tanpa Izin Sesi (Unapproved Movement / Breach):**
   * **Kondisi:** Sensor mendeteksi tag melintas, namun tidak ada sesi permohonan aktif yang berstatus *approved* untuk mandor/gudang tersebut.
   * **Notifikasi:** *"🚨 PERINGATAN ANOMALI: Terdeteksi perlintasan [X] tag di Gerbang TANPA ADANYA SESI IZIN APPROVED yang aktif!"*
   * **Aksi Sistem:** Membunyikan sirine audio dan mengirim notifikasi darurat WhatsApp ke ponsel Project Manager.

2. **Kelebihan Kuantitas Tag (Over-Quota / Selundupan):**
   * **Kondisi:** Sesi izin disetujui untuk 5 batang tiang, namun sensor mendeteksi 8 tag tiang melintas (ada kelebihan 3 tiang ekstra).
   * **Notifikasi:** *"⚠️ ANOMALI: Kelebihan muatan (+3 tag). Sensor membaca 8 tag, padahal izin sesi hanya untuk 5 unit."*
   * **Aksi Sistem:** Menandai transaksi sebagai ketidaksesuaian (*mismatch*) dan meminta klarifikasi pengawas lapangan.

3. **Tag Asing / Tidak Terdaftar (Unregistered Tags):**
   * **Kondisi:** Sensor mendeteksi nomor EPC yang tidak pernah didaftarkan pada database proyek.
   * **Notifikasi:** *"❓ ANOMALI: Tag mencurigakan / tidak terdaftar dalam database terdeteksi melintas!"*

4. **Arah Pergerakan Berlawanan (Direction Mismatch):**
   * **Kondisi:** Sesi izin diajukan untuk keluar (`OUT_FULFILLMENT`), namun sensor mendeteksi arah fisik masuk (`IN`).

---

### 7.2 Jalur Distribusi Notifikasi:

1. **Banner Peringatan Merah Real-time (Web Dashboard & Gate Monitor):**
   * Muncul banner merah mencolok dengan animasi berkedip dan sirine suara audio pada layar monitor kantor/gudang.
2. **Notifikasi WhatsApp Otomatis ke PM:**
   * Melalui `WhatsAppNotificationService`, sistem secara non-blocking mengirim pesan darurat berisi ID gerbang, arah, jumlah tag, dan rincian pelanggaran langsung ke nomor WhatsApp PM.
3. **Log Audit & Laporan Anomali:**
   * Seluruh insiden ketidaksesuaian tersimpan secara real-time di tabel log perlintasan sensor.
   * Log perlintasan tidak dapat dihapus melalui API. Koreksi dilakukan dengan event lanjutan agar histori audit tetap tersedia.

> [!TIP]
> **Petunjuk Pemasangan Fisik:** Untuk panduan teknis pemasangan kabel, konfigurasi IP, dan setup reader **Electron HW-VX6346KL**, silakan baca dokumen khusus: [**`doc/instalasi-hardware-reader.md` (Panduan Lengkap Instalasi Hardware)**](instalasi-hardware-reader.md).

---

## 8. Tanya Jawab & Penanganan Masalah Lapangan (Troubleshooting)

### Q1: Apa yang harus dilakukan jika alarm gerbang berbunyi nyaring?
* **Penyebab:** Ada tag melintas tanpa sesi approved aktif, arah/isi tidak sesuai, atau sesi kedaluwarsa. Sesi outbound memakai rolling idle 15 menit; sesi retur dapat berlaku hingga 4 jam.
* **Solusi:** 
  1. Hentikan kendaraan/petugas yang melintas.
  2. Buka menu **Monitor Gerbang RFID** untuk melihat foto snapshot CCTV dan nomor tag yang memicu alarm.
  3. Minta mandor lapangan membuat permohonan izin keluar gerbang di aplikasi PWA miliknya.

### Q2: Bagaimana jika internet di gudang transit tiba-tiba putus saat truk tiba?
* **Solusi:** Sistem gerbang Edge Bridge dilengkapi fitur **Store-and-Forward Buffer**. Reader gerbang tetap beroperasi menggunakan cache lokal. Seluruh data perlintasan dan snapshot CCTV disimpan di memori lokal mini PC, dan akan otomatis diunggah (*auto-sync*) ke server pusat begitu koneksi internet kembali normal.

### Q3: Mandor salah menekan jumlah tiang yang dibawa keluar. Bagaimana memperbaikinya?
* **Solusi:** 
  1. Jika gerbang belum dilewati, biarkan sesi kedaluwarsa otomatis (atau batalkan permohonan).
  2. Buat permohonan baru dengan jumlah tiang yang benar.
  3. Jika tiang sudah terlanjur keluar gerbang, kelebihan tiang cukup dilaporkan melalui menu **"2. Balikkan Barang Sisa (Retur)"** dan diverifikasi oleh staf gudang.

### Q4: Browser apa yang mendukung scanner Bluetooth?
* **Solusi:** UI umum dapat dibuka pada browser modern. Pairing Web Bluetooth memerlukan browser berbasis Chromium dan perangkat/OS yang mendukung Web Bluetooth; Safari/iOS tidak didukung untuk alur pairing ini.

### Q5: Apakah format foto dan dokumen yang didukung saat upload?
* **Solusi:** Format gambar yang didukung adalah `JPG`, `JPEG`, `PNG`, dan `WEBP` (bisa langsung jepret dari kamera HP). Dokumen pendukung dapat berupa file `PDF`, `DOC`, atau `DOCX` dengan ukuran maksimal 10 MB per file.

---

## 9. Inisialisasi Environment

Inisialisasi database merupakan tugas administrator/developer, bukan SOP operator. Lihat [`../README.md`](../README.md). Command reset atau seeder destruktif dilarang pada production.

### Skenario Presentasi Handheld

Gunakan hanya pada database development/staging yang boleh menerima transaksi demo. Command berikut tidak melakukan reset/delete dan default-nya hanya dry-run:

```powershell
docker compose exec backend php artisan mosa:prepare-handheld-demo
docker compose exec backend php artisan mosa:prepare-handheld-demo --apply
```

Fixture menyiapkan SPK `DEMO-HH-SPK-20260913`, Gudang Tajur Bogor, serta EPC berikut:

```text
E280DE002026091300000001
E280DE002026091300000002
```

1. Login `procurement.siti@mosa.id`, buka **Muat Truk di Principal**, pilih SPK demo, lalu paste kedua EPC untuk dispatch.
2. Login `storeroom.joko@mosa.id`, buka **Bongkar & Terima Truk**, pilih surat jalan hasil dispatch, lalu paste kedua EPC untuk full-match receiving.
3. Fixture hanya sekali pakai. Setelah delivery dibuat, command menolak reset custody/audit. Siapkan skenario bernomor baru bila presentasi perlu diulang.

Untuk memakai reader fisik, pilih `Hybrid Workstation` pada **Device Pairing** di stack Windows development, lalu pilih reader tersebut pada field **Reader Handheld Presentasi** di halaman Dispatch/Receiving. Sistem memilih reader sesuai gudang aktif, mengubahnya ke mode `ENROLLMENT`, dan hanya memasukkan EPC ke workflow yang sedang terbuka. `gate_controller` tidak ditawarkan. Hybrid dinonaktifkan secara default/production; meja khusus production memakai `enrollment_desktop`. Input manual tetap tersedia sebagai fallback.

