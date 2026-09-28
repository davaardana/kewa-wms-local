# Panduan Lengkap Instalasi Hardware RFID Reader ke Sistem MOSA WMS

Buku petunjuk teknis ini memandu Anda langkah-demi-langkah mulai dari pembongkaran kemasan (*unboxing*), pemasangan fisik di tiang gerbang, pengkabelan, konfigurasi jaringan, hingga perangkat RFID Reader terhubung dan mengirimkan data secara real-time ke sistem **MOSA WMS RFID**.

> Diagnostik membedakan Edge Bridge hidup dari reader merespons. Setelan default `HEARTBEAT_INTERVAL_MS=10000` dan `READER_RESPONSE_TIMEOUT_MS=5000` tersedia di `.env`; timeout reader wajib divalidasi dengan hardware nyata. Respons inventory valid tanpa tag tetap sehat. Insiden disimpan lokal bila internet terputus dan dikirim setelah pulih.

---

## 📑 Daftar Isi
1. [Daftar Kebutuhan Perangkat & Bahan](#1-daftar-kebutuhan-perangkat--bahan)
2. [Spesifikasi Teknis Perangkat & Opsi Reader](#2-spesifikasi-teknis-perangkat--opsi-reader)
3. [Memahami Sertifikasi SDPPI / Postel Kominfo](#3-memahami-sertifikasi-sdppi--postel-kominfo)
4. [Langkah 1: Pemasangan Fisik di Tiang Gerbang (Mounting)](#4-langkah-1-pemasangan-fisik-di-tiang-gerbang-mounting)
5. [Langkah 2: Pengkabelan & Daya Listrik (Wiring)](#5-langkah-2-pengkabelan--daya-listrik-wiring)
6. [Langkah 3: Konfigurasi Reader via Software Demo Electron (Mode TCP Client)](#6-langkah-3-konfigurasi-reader-via-software-demo-electron-mode-tcp-client)
7. [Langkah 4: Opsi Deployment Edge Bridge & Fleksibilitas Sensor A/B](#7-langkah-4-opsi-deployment-edge-bridge--fleksibilitas-sensor-ab)
8. [Langkah 5: Pengujian & Validasi Akhir](#8-langkah-5-pengujian--validasi-akhir)
9. [Penanganan Masalah Lapangan (Troubleshooting)](#9-penanganan-masalah-lapangan-troubleshooting)
10. [Rekomendasi Handheld Reader (Untuk Mandor & Yard Gudang)](#10-rekomendasi-handheld-reader-untuk-mandor--yard-gudang)

---

> [!IMPORTANT]
> **Pertanyaan Umum: Di Mana `edge-bridge` Dipasang? Apakah Perlu di Smartphone?**
> * **Smartphone / HP Mandor:** **TIDAK PERLU SAMA SEKALI! ❌**  
>   Pekerja lapangan membuka aplikasi melalui browser. UI umum dapat berjalan pada browser modern; pairing Web Bluetooth memerlukan browser Chromium dan perangkat/OS yang mendukung. Safari/iOS tidak didukung untuk alur pairing BLE.
> * **Komputer Pos Gerbang Gudang:** **CUKUP 1 PERANGKAT PER GUDANG ✅**  
>   `edge-bridge` hanya perlu diinstal di satu komputer/laptop kasir atau Mini PC murah di pos gudang transit untuk menerima aliran data kabel LAN dari Reader di gerbang dan meneruskannya ke server cloud.

---

## 1. Daftar Kebutuhan Perangkat & Bahan

| No | Komponen | Jumlah | Keterangan |
|:---|:---|:---:|:---|
| 1 | **Unit Reader: HW-VX6346KL / EL-UHF-RC4-C1 / HW-VX6330K v2** | 1–2 unit / gerbang | Reader terintegrasi antena UHF port LAN RJ45. (Est: Rp 2,2jt – Rp 4,5jt). |
| 2 | **Bracket U-Bolt Stainless** | 1 set / unit | Sudah termasuk dalam paket kemasan unit. |
| 3 | **Adaptor Power Supply DC 12V 3A–5A** | 1 unit / reader | Daya listrik DC 9V–24V/36V (disarankan 12V 3A stabil). |
| 4 | **Kabel LAN UTP Cat6 Outdoor** | Sesuai jarak | Menghubungkan reader ke Switch/Router pos gudang. |
| 5 | **Router / Switch Jaringan Gudang** | 1 unit | Menyediakan jaringan lokal (misal: IP `192.168.1.1`). |
| 6 | **Komputer / Mini PC Pos Gudang** | 1 unit | Menjalankan daemon `edge-bridge` (Windows/Linux/Pi). |
| 7 | **Waterproof Junction Box IP66** | 1 buah / reader | Melindungi sambungan kabel adaptor & LAN dari hujan. |
| 8 | **Tag Anti-Metal Tiang Besi (EL-UHF-MT05 / WZ-Y258)** | Sesuai kuota tiang | Tag ABS Anti-Metal IP68 UCODE 8/9 (baut/cable tie) untuk tiang FO. (Est: Rp 9.600 / pcs, Ready Stock). |
| 9 | **Stiker RFID Non-Logam (EL-UHF9424-U9-W)** | Sesuai kuota non-logam | Stiker PET Bening tahan air UCODE 9 untuk drum kabel & box ODP. |

---

## 2. Spesifikasi Teknis Perangkat & Opsi Reader

Sistem MOSA mendukung 3 pilihan perangkat UHF RFID reader dari Electron Indonesia:

### A. Target Reader Utama: Electron HW-VX6346KL ⭐
* **Tipe Antena:** 12 dBi Linear Polarization Antenna Terintegrasi (Dimensi 445 × 445 mm)
* **Jangkauan Baca:** Hingga **15 – 20 meter** (Sangat kuat menembus tumpukan tiang di bak truk besar)
* **Daya Pancar RF:** 1 – 30 dBm (Dapat disetel via software)
* **Antarmuka (Interface):** Ethernet TCP/IP (RJ45), RS232, RS485, Wiegand 26, **2x Relay Output**
* **Rating Proteksi:** **IP65** (Tahan semprotan air hujan deras & debu outdoor)
* **Frekuensi Operasional:** 902 – 928 MHz (Disetel 920 – 925 MHz regulasi SDPPI Indonesia)
* **Protokol Tag:** ISO18000-6C (EPC Class 1 Gen 2) & ISO18000-6B
* **Estimasi Harga (Sep 2026):** Rp 3.800.000 – Rp 4.500.000

### B. Opsi Rekomendasi Upgrade (+RSSI): Electron EL-UHF-RC4-C1 🚀
*Sebagai opsi rekomendasi upgrade bila memerlukan indikator sinyal RSSI untuk deteksi arah atau filtering interferensi.*
* **Tipe Antena:** 12 dBi Linear Polarization (Dimensi 445 × 445 × 80 mm)
* **Jangkauan Baca:** Hingga **15 meter**
* **Daya Pancar RF:** 0 – 30 dBm
* **Antarmuka (Interface):** Ethernet TCP/IP (varian **-T**), RS232, Wiegand 26, **1x Relay Output** (Manual & Auto)
* **Fitur Unggulan RSSI:** ✅ Melaporkan kekuatan sinyal per-tag secara real-time. Memungkinkan estimasi arah gerak (Approaching / Departing) pada mode `SINGLE_ANTENNA_SESSION`.
* **Rating Proteksi:** **IP65** (Tahan hujan & debu outdoor)
* **Tegangan Input:** 9V – 24V DC
* **Protokol Tag:** ISO18000-6C (EPC Gen2)
* **Kompatibilitas:** ✅ **100% didukung native oleh UniversalParser MOSA Edge-Bridge**
* **Estimasi Harga (Sep 2026):** Rp 3.650.000 – Rp 5.840.000

### C. Opsi Alternatif (Middle-Range): Electron HW-VX6330K v2
*Digunakan sebagai opsi hemat untuk gerbang berlebar sempit (≤ 5 meter).*
* **Tipe Antena:** 8 dBi Circular Polarization Antenna Terintegrasi (Dimensi 235 × 235 mm)
* **Jangkauan Baca:** **6 – 8 meter** (Bebas blind-spot orientasi tiang berkat polarisasi sirkuler)
* **Antarmuka (Interface):** Ethernet TCP/IP (RJ45), RS232, RS485, Wiegand 26, Trigger
* **Rating Proteksi:** IP54 (Wajib memakai kanopi / pelindung peneduh tambahan jika dipasang outdoor tanpa atap)
* **No. Sertifikat SDPPI Postel:** 119246/DJID/2026
* **Estimasi Harga (Sep 2026):** Rp 2.200.000 – Rp 3.500.000

> [!WARNING]
> **HW-VX6330K TIDAK memiliki Relay Output built-in.** Jika pintu gerbang membutuhkan trigger magnetic lock langsung dari reader, gunakan **HW-VX6346KL** (2x relay) atau **EL-UHF-RC4-C1** (1x relay).

---

### 📊 Tabel Perbandingan Cepat 3 Reader

| Parameter | HW-VX6346KL ⭐ | EL-UHF-RC4-C1 🚀 | HW-VX6330K v2 |
|:---|:---:|:---:|:---:|
| **Rekomendasi Posisi** | **Pilihan Utama Gerbang** | **Pilihan Upgrade (+RSSI)** | **Pilihan Budget Gerbang Kecil** |
| **Jarak Baca** | 15 – 20 m | Hingga 15 m | 6 – 8 m |
| **Antena** | 12 dBi Linear | 12 dBi Linear | 8 dBi Circular |
| **Relay Built-in** | ✅ 2x Relay | ✅ 1x Relay | ❌ Tidak Ada |
| **Laporan RSSI** | ❌ | ✅ Real-time (dBm) | ❌ |
| **Proteksi Cuaca** | IP65 Outdoor | IP65 Outdoor | IP54 (Butuh Kanopi) |
| **Protokol di Bridge** | HW-VX Native | RC4 Native (Universal) | HW-VX Native |

---

## 3. Memahami Sertifikasi SDPPI / Postel Kominfo

> [!NOTE]
> **Apa itu Sertifikasi SDPPI?**
> SDPPI (*Sumber Daya dan Perangkat Pos dan Informatika*) adalah direktorat teknis di bawah **Kementerian Komunikasi dan Digital (Komdigi/Kominfo) RI**. Sertifikat ini adalah izin edar dan verifikasi kelaikan teknis radio resmi di Indonesia.

**Mengapa wajib diperhatikan untuk pengadaan di proyek MyRepublic / Biznet?**
1. **Regulasi Frekuensi Indonesia:** UHF RFID di Indonesia dialokasikan pada frekuensi **920 – 923 MHz** (atau pita regional 920 – 925 MHz). Perangkat luar negeri tanpa sertifikasi resmi seringkali memakai pita US (902–928 MHz) yang melanggar hukum dan dapat mengganggu frekuensi seluler GSM/LTE, berisiko penertiban Balmon Kominfo.
2. **Kepatuhan Audit Vendor Telco:** Klien telekomunikasi enterprise mewajibkan lampiran sertifikat SDPPI pada proses vendor qualification (BoQ).
3. **Status Perangkat:**
   - `HW-VX6330K v2`: Memiliki sertifikat SDPPI resmi nomor **119246/DJID/2026**.
   - `HW-VX6346KL` & `EL-UHF-RC4-C1`: Menggunakan modul radio standar regulasi Indonesia (920–925 MHz) dari Electron Indonesia. Pastikan meminta surat deklarasi kepatuhan pita frekuensi saat pengadaan massal.


---

## 3. Langkah 1: Pemasangan Fisik di Tiang Gerbang (Mounting)

```
                       [TIANG PORTAL GERBANG GUDANG]
                                    │
                         ┌──────────┴──────────┐
                         │   BRACKET U-BOLT    │
                         └──────────┬──────────┘
                                    │
                       ┌─────────────────────────┐
                       │  ELECTRON HW-VX6346KL   │
                       │     (12 dBi Linear)     │ ◄── Ketinggian: 2.0 - 2.5 Meter
                       │            ATAU         │     Kemiringan: 15° - 20° ke bawah
                       │       HW-VX6330K        │
                       │    (8 dBi Circular)     │
                       └────────────┬────────────┘
                                    │
                                    ▼ [Sinar RF Menyorot Bak Muatan Truk]
```

1. **Pilih Posisi Tiang:** Pasang unit pada tiang samping pintu gerbang atau portal loading bay tempat truk melintas.
2. **Ketinggian Ideal:** Ketinggian pemasangan adalah **2.0 hingga 2.5 meter** dari permukaan tanah agar sinar radio tidak terhalang kabin depan truk dan langsung mengenai muatan tiang besi di bak belakang.
3. **Kemiringan Sudut (Tilt Down):**
   * Miringkan panel ke bawah sebesar **15° hingga 20°** menghadap ke arah datangnya kendaraan.
   * Kencangkan baut bracket *U-Bolt* dengan kunci pas agar posisi tidak bergeser saat diterpa angin kencang.
4. **Orientasi Polarisasi Antena:**
   * **Jika Memakai HW-VX6346KL (Linear):** Pastikan posisi penempelan tag RFID anti-metal pada tiang besi dipasang **sejajar (paralel)** dengan garis polarisasi antena untuk mendapatkan jarak baca terjauh.
   * **Jika Memakai HW-VX6330K (Circular):** Antena circular dapat membaca tag anti-metal dalam orientasi apapun (tegak, rebah, miring) tanpa blind spot polarisasi.

---

## 4. Langkah 2: Pengkabelan & Daya Listrik (Wiring)

### A. Wiring Unit Utama (HW-VX6346KL)
```
            ┌──────────────────────────────────────────────┐
            │          KABEL PIGTAIL HW-VX6346KL           │
            ├──────────────────────────────────────────────┤
            │ 🔴 Merah  : +12V DC (Power Positif)          │
            │ ⚫ Hitam  : GND (Power Negatif)              │
            │ 🌐 RJ45   : Port Ethernet LAN (TCP/IP)       │
            │ 🟤 Cokelat: COM (Relay 1 - Magnetic Lock)    │
            │ 🌸 Pink   : NO  (Relay 1 - Magnetic Lock)    │
            └──────────────────────────────────────────────┘
```

#### B. Wiring Opsi Rekomendasi Upgrade (EL-UHF-RC4-C1)
```
            ┌──────────────────────────────────────────────┐
            │          KABEL PIGTAIL EL-UHF-RC4-C1         │
            ├──────────────────────────────────────────────┤
            │ 🔴 Merah  : +9V - 24V DC (Power Positif)     │
            │ ⚫ Hitam  : GND (Power Negatif)              │
            │ 🌐 RJ45   : Port Ethernet LAN (TCP/IP)       │
            │ 🟨 Kuning : Relay COM (Magnetic Lock)        │
            │ 🟩 Hijau  : Relay NO  (Magnetic Lock)        │
            │ 🟣 Ungu   : RS232 TX / 485+                  │
            │ ⚪ Putih  : RS232 RX / 485-                  │
            └──────────────────────────────────────────────┘
```

### C. Wiring Opsi Alternatif (HW-VX6330K v2)
```
            ┌──────────────────────────────────────────────┐
            │          KABEL PIGTAIL HW-VX6330K v2         │
            ├──────────────────────────────────────────────┤
            │ 🔴 Merah  : +9V - 36V DC (Power Positif)     │
            │ ⚫ Hitam  : GND (Power Negatif)              │
            │ 🌐 RJ45   : Port Ethernet LAN (TCP/IP)       │
            │ 🟣 Ungu   : RS485+                           │
            │ 🟠 Oranye : RS485-                           │
            │ ⚪ Abu-Abu: Trigger Input                    │
            │ 🔵 Biru   : Wiegand Data 1                   │
            │ 🔷 Biru Md: Wiegand Data 0                   │
            └──────────────────────────────────────────────┘
```

1. **Sambungan Daya:**
   * Hubungkan kabel **Merah** ke kutub positif adaptor (12V).
   * Hubungkan kabel **Hitam** ke kutub negatif (GND) adaptor.
2. **Sambungan Jaringan (LAN):**
   * Colokkan konektor **RJ45** dari pigtail ke kabel LAN Cat6 outdoor.
   * Ujung kabel LAN satunya dicolokkan ke **Switch / Router** di kantor pos gudang.
3. **Pengamanan Sambungan (Waterproofing):**
   * Masukkan seluruh sambungan kabel adaptor dan konektor RJ45 ke dalam **Waterproof Junction Box IP66** yang dipasang di bawah tiang.
   * Kencangkan *cable gland* agar air hujan tidak dapat merembes ke konektor LAN.

---

## 6. Langkah 3: Konfigurasi Reader via Software Demo Electron (Mode TCP Client)

> [!TIP]
> **Referensi Tutorial Resmi Electron Indonesia:**
> * Seri HW-VX: [Electron HW-VX mode TCP Client (Remote IP)](https://electron.id/tutorial/hw-vx-tcp-client-remote-ip/)
> * Seri EL-UHF-RC4: [Protokol EL-UHF-RC4 & Demo Program](https://electron.id/protocol/el-uhf-rc4-protocol/)
>
> Unduh software konfigurasi resmi:
> * Software HW-VX Series: 👉 [Download Demo & NetConfig HW-VX](https://cloud.electron.id/s/fLMCJjPqktA9JBC)
> * Software RC4 Series: 👉 [Download Demo & Tools RC4](https://cloud.electron.id/s/wSap3C2PiWXz4Jj)

1. Hubungkan laptop teknisi ke router gudang yang sama (via kabel LAN atau Wi-Fi).
2. Buka aplikasi **UHF Reader Demo / NetConfig.exe** (sesuai seri reader Anda).

### A. Pengaturan Jaringan (Mode TCP Client):
1. Klik tombol **"Search"** atau **"Specific Search"**. Unit reader akan muncul di daftar perangkat aktif.
2. Atur parameter jaringan pada tab **Network**:
   * **Protocol:** `TCP`
   * **Work Mode:** `Client` (Sangat penting: Reader bertindak sebagai pengirim otomatis)
   * **Remote IP:** Masukkan IP Komputer Pos Gudang (contoh: `192.168.1.10`)
   * **Remote Port:** 
     * Reader A (Sisi Dalam Gudang): `2077`
     * Reader B (Sisi Luar Gudang): `2079`
   * **Gateway IP:** Masukkan IP Router gudang (contoh: `192.168.1.1`)
   * **Subnet Mask:** `255.255.255.0`
   * **Connection Mode:** `Immediately` (Langsung menyambung ke daemon edge-bridge saat menyala)
   * **Connection Timeout:** `0`
3. Klik tombol **"Set Setting"** / **"Save"**.

### B. Pengaturan Parameter Radio:
1. **Work Mode:** Pilih **`Active Mode`** (Reader langsung otomatis membaca dan menembakkan nomor tag seketika saat terdeteksi tanpa menunggu perintah polling manual).
2. **RF Output Power:**
   * Untuk HW-VX6346KL (12 dBi): Setel ke **`28 - 30 dBm`** (Jarak maksimal s.d 15–20 meter).
   * Untuk EL-UHF-RC4-C1 (12 dBi): Setel ke **`26 - 30 dBm`** (Jarak hingga 15 meter, RSSI aktif).
   * Untuk HW-VX6330K v2 (8 dBi): Setel ke **`26 - 30 dBm`** (Jarak 6–8 meter).
3. **Frequency Band:** Pilih **`User band: 920 - 925 MHz`** (Sesuai regulasi SDPPI Indonesia).
4. Klik **"Set Parameter"**. Reader akan mengeluarkan bunyi *beep* tanda konfigurasi berhasil disimpan di memori permanen.

---

## 7. Langkah 4: Opsi Deployment Edge Bridge & Fleksibilitas Sensor A/B

Daemon `edge-bridge` dirancang **sangat fleksibel** dan mendukung beberapa skenario pemasangan perangkat di lapangan:

### 🌟 Mode Rekomendasi: 1 Komputer / 1 Daemon dengan Dual-Port Listener (Sensor A & B)
Jika menggunakan 2 fisik reader terpisah (Reader A di sisi dalam gerbang, Reader B di sisi luar gerbang):
* **Port 2077 (Default Port A):** Aliran data dari Reader Sisi Dalam Gudang.
* **Port 2079 (Default Port B):** Aliran data dari Reader Sisi Luar Gudang.
* **Port 2078:** WebSocket dashboard; jangan dipakai sebagai port TCP Reader B.
* **Auto-Detect Protokol:** Daemon otomatis mem-parsing baik frame HW-VX maupun frame RC4 (bahkan bila Reader A dan Reader B berbeda model!).

```
[Reader Sisi Dalam (Sensor A)] ──(LAN)──> [Port 2077] ──┐
                                                        ├─> [DirectionEngine] ─> [Cloud API]
[Reader Sisi Luar  (Sensor B)] ──(LAN)──> [Port 2079] ──┘
```

Teknisi cukup menyetel pada software NetConfig masing-masing reader:
- Reader A diarahkan ke `Remote IP: 192.168.1.10`, `Remote Port: 2077`
- Reader B diarahkan ke `Remote IP: 192.168.1.10`, `Remote Port: 2079`

### 🏢 Mode 2 Aplikasi Terpisah (Dedicated Instance A / B)
Jika gerbang sangat lebar atau masing-masing sensor dikontrol oleh Mini PC / controller terpisah, jalankan daemon dengan environment variable role antena:

* **Untuk Sensor A (Sisi Dalam):**
  ```bash
  $env:ASSIGNED_ANTENNA="A"; $env:TCP_PORT="2077"; npm start
  ```
* **Untuk Sensor B (Sisi Luar):**
  ```bash
   $env:ASSIGNED_ANTENNA="B"; $env:TCP_PORT="2079"; npm start
  ```

---

## Tiga Opsi Infrastruktur Komputer Pos

Anda dapat memilih satu dari 3 opsi infrastruktur komputer sesuai anggaran di masing-masing gudang:

### OPSI 1: Komputer Pos Gudang Bertindak Sekaligus sebagai Edge Bridge
Jika pos gudang sudah memiliki komputer/laptop kasir/administrasi:
```
[RFID Reader di Gerbang] ──(Kabel LAN Cat6)──> [Router Pos Gudang] ──(LAN / Wi-Fi)──> [Laptop/PC Pos Gudang] ──(Internet)──> [Server Cloud MOSA]
```
1. Pasang Node.js LTS di laptop kasir gudang.
2. Buka folder `edge-bridge\scripts`.
3. Klik kanan **`install-windows-service.bat`** lalu pilih **"Run as Administrator"**.
4. Daemon Edge Bridge akan otomatis terpasang sebagai service background yang berjalan 24/7 dan otomatis *auto-start* saat Windows menyala.

### OPSI 2 (Enterprise Otonom): Dedicated Mini PC / Raspberry Pi (Linux Systemd)
Jika gerbang terpisah jauh dari kantor gudang (>50 meter), pasang Mini PC fanless (Intel N100 / Raspberry Pi 4) di dalam panel enclosure gerbang:
1. Jalankan skrip installer systemd:
   ```bash
   cd /opt/mosa/edge-bridge/scripts
   sudo chmod +x install-linux-service.sh
   sudo ./install-linux-service.sh
   ```
2. Service `mosa-edge-bridge` akan dikelola secara otomatis oleh `systemd` dengan auto-restart jika terjadi mati lampu atau gangguan daya.

### OPSI 3 (Direct Cloud): Reader Langsung Mengirim ke IP Publik Server
Jika gudang memiliki koneksi internet dengan IP Publik Statis, `Remote IP` pada reader dapat langsung diarahkan ke IP Cloud VPS.

---

## 8. Langkah 5: Pengujian & Validasi Akhir

1. **Uji Koneksi Soket Langsung dari Web Panel (Zero-Coding):**
   * Buka browser ke aplikasi MOSA WMS $\to$ Menu **Pairing Reader & Device** (`/device-pairing`).
   * Daftarkan IP hardware reader Anda (misal `192.168.1.200` port `2022`).
   * Provision token acak unik minimal 32 karakter saat pairing, lalu isi plaintext yang sama sebagai `DEVICE_API_TOKEN` pada `.env` Edge Bridge. Backend hanya menyimpan hash SHA-256; jangan memakai token yang sama untuk perangkat lain.
   * Pastikan `API_BASE_URL` menunjuk root API backend dan menyertakan suffix `/api` (contoh `https://wms.example.com/api`).
   * Klik tombol ⚡ **"Test Socket Ping"** untuk memeriksa latensi koneksi langsung dari antarmuka web.
   * Daemon `edge-bridge` menyinkronkan konfigurasi perangkat terautentikasi melalui `GET /api/devices/config`.

2. **Uji Deteksi Tag Tiang:**
   * Bawa tiang FO yang sudah ditempel tag anti-metal **WZ-Y258** melintasi tiang sensor.
   * Lampu LED pada reader akan berkedip hijau dan reader mengeluarkan bunyi *beep*.
   * Nomor EPC tag akan langsung muncul secara instan di log streaming WebSocket web dashboard (`ws://127.0.0.1:2078`).
   * Pada dual mode, uji kedua urutan lengkap: A→B menghasilkan OUT, B→A menghasilkan IN. Pembacaan satu sisi tidak boleh dikirim sebagai perlintasan.
   * Relay dan CCTV saat ini hanya simulasi/logical marker. Jangan menyatakan commissioning fisik berhasil sebelum adapter nyata serta uji lingkungan dilakukan.
2. **Pantau Layar Monitor:**
   * Terminal `edge-bridge` akan menampilkan log:
     ```
     🎯 [GATE SENSOR] Tag E28011606000020410000001 detected on Reader Address: 00
     🚀 [GATE EVENT TRIGGER] Dispatching tags to MOSA Cloud API...
     ```
   * Buka browser di halaman **Monitor Sensor Gerbang**, event perlintasan akan muncul secara instan!

---

---

## 10. Rekomendasi Handheld Reader (Untuk Mandor & Yard Gudang)

Untuk operasi bergerak di luar jangkauan gerbang fixed (seperti **Handheld 1 di Yard Principal** dan **Handheld 2 di Receiving Gudang**, serta scan mandor via PWA), berikut 2 pilihan handheld terbaik dari Electron Indonesia:

### 🌟 Pilihan Utama: Electron EL-UHF-RS01 (Bluetooth RFID Sled Reader)
* **Konsep:** Grip pistol (*sled gun*) ergonomis dengan penjepit smartphone Android.
* **Konektivitas:** Bluetooth 4.0 / BLE $\to$ Langsung terhubung ke aplikasi **PWA MOSA** di browser Chrome HP via **Web Bluetooth API** (tanpa perlu install aplikasi native tambahan!).
* **Baterai:** 5.200 mAh (tahan lebih dari 70 jam standby / seharian penuh di yard).
* **Antena & Jarak:** Circular Polarized, jarak tembak **1 – 10 meter** (bebas blind-spot orientasi tag tiang).
* **Estimasi Harga (Sep 2026):** Rp 7.600.000 – Rp 9.500.000.
* **Kelebihan untuk MOSA:** Staf & mandor memakai HP masing-masing; cukup pinjam unit sled reader saat butuh memindai muatan truk atau stock opname tiang.

### 🏢 Pilihan Alternatif (All-in-One Rugged): Electron EL-UHF-RH02 / RH03
* **Konsep:** Mobile computer industri terintegrasi (layar sentuh + reader UHF + OS Android 10/12).
* **Material:** Rugged casing berlapis karet, tahan jatuh 1,5 meter, tombol fisik besar (*hard button*) ramah sarung tangan lapangan.
* **Konektivitas:** Wi-Fi & Bluetooth (Catatan: fungsi kartu SIM seluler lokal belum aktif terkait registrasi IMEI).
* **Kelebihan:** Sangat tangguh untuk lingkungan yard berlumpur/hujan tanpa risiko HP pribadi mandor rusak.


