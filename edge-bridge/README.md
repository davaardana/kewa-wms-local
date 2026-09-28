# MOSA Edge Bridge — IoT RFID Gate Daemon

Daemon ringan berbasis Node.js yang berfungsi sebagai jembatan (*bridge*) antara **Hardware RFID Reader di gerbang gudang** dengan **Server Cloud MOSA WMS (Laravel REST API)** dan **Web Dashboard Monitor (WebSocket)**.

Kontrol WebSocket: klien meminta tiket HMAC melalui `POST /api/ws-control-ticket`, lalu pesan pertama wajib `AUTH`. Tiket berlaku 10–60 detik (default 45), terikat user, gudang, command, dan satu pemakaian per proses edge. Payload maksimal 4 KiB; `SET_MODE` hanya menerima `GATE_SECURITY`/`ENROLLMENT`. `SIMULATE_TAG` dan `TRIGGER_SCAN` selalu ditolak. `WS_ALLOWED_ORIGINS` menerima daftar Origin browser dipisahkan koma. Set `WS_CONTROL_SECRET` acak minimum 32 byte dengan nilai identik pada backend dan edge. Uji: `npm test`.

Tiket v2 juga mengikat `device_code`: wajib set `WS_DEVICE_CODE` identik pairing; v1 ditolak. Deploy backend/Edge bersamaan. Endpoint `edge_ws_url` disimpan pada pairing HO, terpisah dari IP reader; frontend hanya memakai endpoint respons tiket. Lihat [konfigurasi HO/gudang](../doc/instalasi-edge-bridge-client-windows.md#konfigurasi-ho-dan-gudang-wss-per-perangkat).

**Batas keamanan:** cache replay hilang saat restart edge; TTL pendek membatasi dampaknya. Origin bukan autentikasi. Gunakan WSS dan jangan mengekspos port 2078 langsung ke jaringan tidak tepercaya. Secret HMAC bersama bukan isolasi kriptografis antar cabang; binding perangkat mencegah salah tujuan, bukan pemalsuan oleh Edge yang memegang secret.

---

## Fitur Utama

1. **Universal Multi-Reader Parser (Auto-Detect):**
   * **Electron HW-VX Series** (`HW-VX6346KL` & `HW-VX6330K v2`).
   * **Electron EL-UHF-RC4 Series** (`EL-UHF-RC4-C1` dengan pelaporan level sinyal RSSI).
   * Otomatis mengenali format paket biner reader tanpa perlu mengubah kode sumber.
2. **Fleksibilitas Topologi Sensor A & B:**
   * **Dual-Port Mode (1 Daemon, 2 Reader):** Membuka Port `2077` (Sensor A / Sisi Dalam) dan Port `2079` (Sensor B / Sisi Luar) secara simultan.
   * **Multi-Instance Mode (2 Daemon Terpisah):** Mendukung parameter `ASSIGNED_ANTENNA="A"` atau `"B"` untuk deployment di PC berbeda.
3. **Filter RSSI:**
   * RSSI membantu menyaring ghost read. Pada mode single antenna, arah tetap berasal dari tipe sesi terotorisasi server, bukan gradien RSSI.
4. **Relay Door Controller (Simulasi):**
   * Saat ini hanya status logis dengan auto-relock 5 detik; belum mengendalikan relay fisik.
5. **Offline Store-and-Forward Buffer:**
   * Menampung event JSON secara persisten, replay FIFO single-flight, penulisan atomik, serta dead-letter untuk kegagalan permanen/batas retry.
6. **Device Health Telemetry:**
      * Heartbeat default 10 detik; status reader berubah hanya setelah respons protokol valid atau kegagalan koneksi/timeout.
      * Set `HEARTBEAT_INTERVAL_MS` dan `READER_RESPONSE_TIMEOUT_MS` di `.env`. Insiden reader disimpan lokal dan direplay memakai UUID yang sama.
7. **Real-time WebSocket Broadcaster:**
   * Memancarkan event pembacaan tag ke Dashboard Web Monitor di port `2078`; latensi bergantung jaringan dan belum dibenchmark.

> **Known issue:** timer flush offline, heartbeat, dan watchdog berhenti setelah batch pertama karena perilaku `_takeBatch()`. Jangan menganggap reliability kontinu lulus sebelum bug diperbaiki dan regression test tersedia.

---

## Instalasi & Persiapan

Gunakan **Node.js 20 LTS**.

```bash
cd D:\Docker\wms\mosa\edge-bridge
npm install
```

---

## ⚙️ Konfigurasi Environment (`.env`)

Buat atau edit file `.env` di dalam direktori `edge-bridge`:

```ini
# Identitas Gudang & Gerbang
WAREHOUSE_ID=1
GATE_ID=GATE-01

# Alamat Backend API Cloud
# Wajib menunjuk root REST API dan menyertakan suffix /api
API_BASE_URL=http://127.0.0.1:8000/api

# Token acak unik (minimal 32 karakter) yang sama dengan token saat pairing device.
# Plaintext hanya disimpan pada host Edge; backend menyimpan hash SHA-256.
DEVICE_API_TOKEN=ganti-dengan-token-acak-unik-minimum-32-karakter

# Konfigurasi Port TCP Listener Reader
TCP_PORT=2077          # Port untuk Sensor A (Sisi Dalam Gudang)
TCP_PORT_B=2079        # Port untuk Sensor B (Sisi Luar Gudang)

# Port WebSocket Broadcaster untuk Web Dashboard
WS_PORT=2078
WS_ALLOWED_ORIGINS=http://localhost:5173
WS_CONTROL_SECRET=ganti-dengan-secret-acak-minimum-32-byte

# Direct connection: Edge sebagai TCP client ke reader
ENABLE_DIRECT_READER=true
READER_HOST=192.168.1.200
READER_PORT=2022

# Telemetri
HEARTBEAT_INTERVAL_MS=10000
READER_RESPONSE_TIMEOUT_MS=5000

# [Opsional] Role Antena jika menjalankan instance terpisah: 'A' atau 'B' (kosongkan untuk dual-port auto)
# ASSIGNED_ANTENNA=A

# Batas batch reliability
BATCH_IDLE_MS=2500
BATCH_DEADLINE_MS=5000
MAX_BATCH_SIZE=100
```

Sebelum menjalankan Edge Bridge, jalankan `php artisan migrate` agar token perangkat dan migration `2026_09_09_000003_add_edge_idempotency_to_gate_pass_events` tersedia. Event memakai `event_id` stabil, `observed_at`, dan `gate_transaction_id` eksplisit. Replay selalu gagal-buka (`unlock_gate=false`).

---

## 🖥️ Cara Menjalankan

### 1. Menjalankan Server Standar (Dual-Port Sensor A & B)
```bash
npm start
```
*Output Terminal:*
```
🎯 [EDGE BRIDGE] TCP Listener active on port 2077 -> Dedicated Antenna A (HW-VX & RC4 Auto-Detect)
🎯 [EDGE BRIDGE] TCP Listener active on port 2079 -> Dedicated Antenna B (HW-VX & RC4 Auto-Detect)
🌐 [WEBSOCKET BROADCASTER] Real-time WS Server listening on ws://0.0.0.0:2078
```

### 2. Menjalankan 2 Aplikasi Terpisah (Dedicated Instance)
Jika ingin memisahkan proses untuk Sensor A dan Sensor B:
* **Terminal 1 (Sensor A):**
  ```powershell
  $env:ASSIGNED_ANTENNA="A"; $env:TCP_PORT="2077"; npm start
  ```
* **Terminal 2 (Sensor B):**
  ```powershell
   $env:ASSIGNED_ANTENNA="B"; $env:TCP_PORT="2079"; npm start
  ```

### 3. Service Sistem

#### Windows

Ikuti panduan kanonik [`../doc/instalasi-edge-bridge-client-windows.md`](../doc/instalasi-edge-bridge-client-windows.md). Installer saat ini wajib divalidasi boot/restart/SCM sebelum disebut production-ready; file PM2 `.bat` adalah jalur legacy/development.

#### 🐧 Opsi Linux / Raspberry Pi (Systemd Unit):
```bash
cd edge-bridge/scripts
chmod +x install-linux-service.sh uninstall-linux-service.sh
sudo ./install-linux-service.sh
```
*Perintah kontrol:*
* Cek status: `sudo systemctl status mosa-edge-bridge`
* Cek log: `sudo journalctl -u mosa-edge-bridge -f`

---

### 🛡️ Fitur Ketahanan Perangkat Keras (Hardware Resiliency & Watchdog)
* **Adaptive Exponential Backoff:** Jika koneksi reader TCP terputus akibat mati listrik atau kabel LAN terlepas, sistem otomatis mencoba menyambung kembali dengan jeda bertingkat (*1.5s $\to$ 15s*) disertai *randomized jitter*.
* **Inactivity Watchdog:** Probe dijalankan setiap 1 detik; reinventory dilakukan setelah idle 30 detik.
* **Graceful Signal Handling:** Menangani sinyal `SIGINT` dan `SIGTERM` secara bersih untuk menutup port listener tanpa kebocoran memori.

---

### 4. Menjalankan Simulasi Pengujian
Untuk menguji seluruh alur pembacaan sensor gerbang tanpa perangkat fisik:
```bash
npm run simulate
# atau jalankan unit test parser:
npm test
```

Relay dan CCTV tetap simulasi. Jalankan `npm test`; hasil test tidak dianggap bukti commissioning hardware.

---

## 📡 Konfigurasi di Hardware Reader (NetConfig / Demo Software)

Pada aplikasi konfigurasi bawaan reader (**UHF Reader Demo / NetConfig.exe**):
1. Pilih **Protocol:** `TCP`
2. Pilih **Work Mode:** `Client`
3. Masukkan **Remote IP:** Alamat IP Komputer Pos Gudang (misal `192.168.1.10`)
4. Masukkan **Remote Port:**
   * Untuk Reader A (Sisi Dalam): `2077`
   * Untuk Reader B (Sisi Luar): `2079`
5. Atur **Work Mode Radio:** `Active Mode` (otomatis transmit saat ada tag)
6. Klik **Save / Set Setting**.
