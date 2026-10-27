# Panduan Penggunaan MOSA WMS RFID

Panduan operasional lengkap per role. Untuk instalasi sistem lihat [doc/README.md](README.md).

---

## Akun & Login

Buka `http://localhost` (atau domain yang dikonfigurasi). Masukkan email dan password.

| Role | Kemampuan Utama |
|:-----|:----------------|
| **Super Administrator** | Akses penuh semua fitur + kelola pengguna |
| **Project Manager (PM)** | Buat/approve dokumen, master data, laporan |
| **PIC Lapangan** | Assign tag, proses penerimaan barang |

---

## Menu Sidebar

### 1. Dashboard
Ringkasan KPI real-time:
- Jumlah tag aktif, tag terdaftar, transaksi hari ini
- Status gate (aman/peringatan)
- Grafik pergerakan material

---

### 2. Dokumen Barang
Mengelola dokumen barang masuk (inbound) dan keluar (outbound).

#### Alur Dokumen

```
Draft → Disetujui → Diproses → Selesai
              ↓
         Dibatalkan
```

#### Cara Membuat Dokumen (PM/SA)

1. Klik **+ Buat Dokumen**
2. Pilih tipe: **Masuk** atau **Keluar**
3. Pilih gudang tujuan
4. Tambah item material + jumlah yang diharapkan
5. Tambah lampiran jika perlu (PDF/Word/Gambar, maks 5 file)
6. Klik **Buat Dokumen** → status: `Draft`

#### Approve Dokumen (PM/SA)

1. Klik dokumen → klik **Approve**
2. Status berubah: `Draft` → `Disetujui`

#### Assign Tag RFID ke Dokumen (PIC/PM/SA)

1. Buka dokumen yang sudah disetujui
2. Klik **Assign Tag**
3. Pilih EPC untuk item dan gudang yang tepat. Barang Keluar memakai tag aktif di gudang asal; Barang Masuk memakai tag aktif yang belum tercatat pada gudang.
4. Assign tepat sejumlah target per item; backend menolak tag salah item/lokasi atau jumlah berlebih.
5. Klik **Assign Tag**.

#### Scan Gate dan Selesaikan Dokumen (PIC)

1. Lewatkan barang melalui reader dengan arah sesuai dokumen: `IN` untuk Barang Masuk, `OUT` untuk Barang Keluar.
2. Lintasan parsial berstatus STANDBY; progress dan custody menunggu set tag lengkap dan valid.
3. Setelah progress mencapai 100%, klik **ACC — Selesaikan**.
4. Penyelesaian Barang Masuk mencatat `STOCK_IN` per EPC dan mengaktifkan stok di gudang tujuan; Barang Keluar sudah mencatat `GATE_OUT` saat gate menyetujui set lengkap.
5. Scan manual tidak mengubah progress; progress berasal dari event gate yang disetujui.

#### Catat Barang Masuk Lama ke Stok (PM/Superadmin)

Gunakan hanya jika dokumen inbound berstatus selesai sebelum pencatatan stok otomatis tersedia.

1. Buka dokumen inbound selesai dan pilih **Catat Stok Masuk**.
2. Periksa daftar EPC dan gudang tujuan.
3. Pastikan barang dan EPC yang ditampilkan ada secara fisik di gudang tujuan.
4. Klik **Catat Stok Masuk** dan konfirmasi. PM/Superadmin boleh; PIC tidak. Sistem membuat reference audit otomatis berdasarkan dokumen, user, dan waktu.
5. Jika gate lama tidak merekam lintasan valid lengkap, event baru ditandai attestasi legacy (bukan persetujuan gate). Simpan BA/surat jalan fisik sebagai bukti pendukung; ledger lama tetap utuh.
6. Tag yang sudah berpindah gudang atau statusnya tidak cocok tidak dapat diposting lewat tombol ini dan perlu investigasi.

PM/Superadmin dapat mengedit semua dokumen: untuk Draft item/qty juga bisa diubah; setelah proses dimulai hanya catatan/lampiran yang bisa diedit dan setiap perubahan diaudit. Superadmin dapat **Hapus / Arsipkan** dari daftar di semua status. Arsip menyembunyikan dokumen dari daftar aktif tetapi tidak menghapus record/evidence. Jika dokumen aktif sudah memiliki event gate atau tag terbaca, arsip ditolak; gunakan pembatalan/koreksi yang sesuai. Tombol **Lihat Arsip** menampilkan dokumen yang diarsipkan.

---

### 3. Pendaftaran Tag RFID
Mendaftarkan identitas tag RFID baru ke sistem.

#### Mode Pendaftaran

| Mode | Keterangan |
|:-----|:-----------|
| **1-per-1 (Satuan)** | Scan satu tag, pilih material, simpan |
| **Kantong Ziplock (Array)** | Dekatkan kantong berisi banyak tag sekaligus ke reader |

#### Langkah (1-per-1)

1. Pilih tab **1-per-1 (Satuan)**
2. Pilih Material FO Target
3. Pilih Gudang Reader & Tipe Tag
4. Scan atau ketik EPC di kotak input
5. Klik **+ Tambah**
6. Klik **Aktifkan Tag** → status: `active`

#### Langkah (Kantong Ziplock)

1. Pilih tab **Kantong Ziplock (Array)**
2. Pilih Material FO & Gudang Reader
3. Dekatkan kantong ke antena UHF Reader → EPC otomatis terbaca
4. Review daftar tag yang masuk
5. Klik **Aktifkan Seluruh Tag di Kantong**

Di kolom **Audit & Aksi**, Superadmin memiliki dua tindakan terpisah: **Nonaktifkan** menyimpan EPC dan menambahkan event audit; **Hard Delete** hanya tersedia setelah tag nonaktif dan tidak dipakai dokumen aktif. Jika tag masih punya lokasi stok, sistem lebih dahulu mencatat event `STOCK_WRITE_OFF` agar saldo berkurang; custody ledger tidak dihapus. Assignment EPC pada dokumen terminal dan event gate tetap disimpan.

---

### 4. Master Data

Tab-tab yang tersedia:

| Tab | Isi |
|:----|:----|
| **Katalog Material** | Daftar material FO (tiang, kabel, aksesoris) |
| **Gudang & Lokasi** | Gudang transit + PIC + staf storeroom |
| **Proyek** | Proyek rollout FO aktif |
| **Stock** | Saldo tag aktif per gudang/material dan daftar nomor EPC aktif |
| **Principal** | Klien Telco (kontraktor utama) |
| **Armada** | Kendaraan/truk pengangkut |

#### Tambah Material Baru

1. Buka tab **Katalog Material**
2. Klik **+ Tambah Material Baru**
3. Isi kode material, nama, kategori, satuan, tipe tag RFID
4. Klik **Simpan**

#### Tambah Gudang Baru

1. Buka tab **Gudang & Lokasi**
2. Klik **+ Tambah Gudang Baru**
3. Isi nama, kode, lokasi, kapasitas
4. Assign PIC & Staf Storeroom
5. Klik **Simpan**

#### Lihat Stock Aktif

1. Buka tab **Stock** untuk melihat saldo berdasarkan gudang dan material.
2. Gunakan pencarian atau filter gudang untuk mempersempit daftar.
3. Klik jumlah EPC pada baris material untuk melihat nomor EPC aktif; daftar dapat dibuka per halaman.
4. Saldo berasal dari tag aktif yang tercatat di gudang. Laporan Stock Opname tetap berada di menu Laporan dan tidak berubah.

---

### 5. RFID Gate

#### Tab Monitor Gate

Monitoring perlintasan material real-time di pintu gudang.

- Status gate: **AMAN** / **PERINGATAN** / **STANDBY**
- Log riwayat pembacaan RFID (waktu, arah, jumlah tag, evaluasi)
- Test Scan untuk simulasi pembacaan

> Gate otomatis mengevaluasi apakah tag yang melintas sesuai dokumen yang diizinkan.

#### Tab Konfigurasi Reader

Menambah dan mengkonfigurasi perangkat RFID Reader.

1. Klik **+ Tambah Device**
2. Masukkan nama device, gudang, model (WZ-Y258/EL-UHF)
3. Generate token untuk Edge Bridge
4. Paste token ke konfigurasi Edge Bridge di PC gudang
5. Klik **Pairing Reader** untuk koneksi live

---

### 6. Laporan

#### Tab Audit Trail
Riwayat seluruh pergerakan material (append-only, tidak bisa diedit/dihapus).

- Filter berdasarkan aksi: `STOCK_IN`, `GATE_OUT`, `FIELD_RECEIVED`, dll
- Cari berdasarkan nomor EPC tag
- Klik **Refresh Ledger** untuk data terbaru

| Aksi | Keterangan |
|:-----|:-----------|
| `TAG_ENROLLED` | Tag baru didaftarkan |
| `STOCK_IN` | Barang masuk gudang |
| `PREPARED` | Barang disiapkan storeroom |
| `GATE_OUT` | Barang keluar via gate |
| `FIELD_RECEIVED` | Diterima PIC di lapangan |
| `INSTALLED` | Terpasang di proyek |
| `GATE_IN` | Barang retur masuk gate |

#### Tab Stock Opname
Rekonsiliasi stok fisik vs sistem secara massal.

1. Pilih gudang target
2. Tembakkan scanner handheld ke semua tag yang ada di gudang
3. Paste daftar EPC hasil scan (satu per baris) ke kotak input
4. Klik **Jalankan Rekonsiliasi Opname Fisik vs Sistem**
5. Sistem menampilkan: matched, missing, unexpected
6. Jika ada selisih: cetak **Berita Acara (BAP)** atau eskalasi ke PM

#### Tab Kartu Stok
Saldo material per gudang dan riwayat mutasi tag serialized.

1. Filter gudang dan/atau material
2. Klik **Buka Kartu** pada baris yang ingin dilihat
3. Atur rentang tanggal → klik **Terapkan**
4. Lihat riwayat: masuk, keluar, saldo berjalan

---

### 7. Kelola Pengguna *(Super Admin only)*

#### Buat User Baru

1. Klik **+ Tambah Pengguna Baru**
2. Isi nama, email, password, role, nomor HP
3. Assign ke gudang (jika PIC/Storeroom)
4. Klik **Simpan**

#### Edit / Nonaktifkan / Hapus User

- **Edit**: klik ikon ✏️
- **Nonaktifkan**: klik ikon ⚡ (toggle aktif/nonaktif)
- **Hapus**: klik ikon 🗑️ → konfirmasi → user dihapus permanen (atau dinonaktifkan jika ada data audit terkait)

#### Toggle Tampilkan Nonaktif

Klik tombol **Nonaktif: OFF** di toolbar untuk melihat user yang sudah dinonaktifkan.

---

## Role & Hak Akses Ringkas

Lihat detail lengkap di [`roles-permissions.md`](roles-permissions.md).

| Fitur | SA | PM | PIC |
|:------|:--:|:--:|:---:|
| Buat dokumen barang | ✅ | ✅ | ❌ |
| Approve dokumen | ✅ | ✅ | ❌ |
| Assign tag ke dokumen | ✅ | ✅ | ✅ |
| Selesaikan dokumen | ✅ | ❌ | ✅ |
| Pendaftaran tag | ✅ | ✅ | ✅ |
| Master data | ✅ | ✅ | ❌ |
| Monitor gate | ✅ | ✅ | ✅ |
| Konfigurasi reader | ✅ | ✅ | ❌ |
| Laporan (semua tab) | ✅ | ✅ | ✅ |
| Kelola pengguna | ✅ | ❌ | ❌ |
