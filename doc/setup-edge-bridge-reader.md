# Setup Edge-Bridge — Koneksi Reader RFID

> **Terakhir diverifikasi:** 2026-10-13  
> **Reader:** Electron EL-UHF-RC4 — IP `192.168.1.200`, Port `2022`  
> **Lokasi:** Gudang Transit Proyek Tajur Bogor  
> **VPS:** `206.237.98.48`

---

## Masalah & Solusi yang Ditemukan

### Problem: Reader hanya menerima koneksi dari subnet yang sama

Reader `192.168.1.200` memiliki firewall yang **hanya mengizinkan koneksi dari source IP `192.168.1.x`**.

Laptop biasanya mendapat IP dari WiFi lain (`192.168.0.x` atau `192.168.193.x`), sehingga koneksi ke reader selalu timeout/filtered.

**Solusi:** Tambahkan IP alias `192.168.1.99` ke interface WiFi aktif sebelum menjalankan edge-bridge.

---

## Langkah Menjalankan Edge-Bridge

### 1. Pastikan terhubung ke WiFi yang bisa reach `192.168.1.x`

Setelah connect WiFi di lokasi gudang, verifikasi:

```bash
# Cek apakah jaringan 192.168.1.x bisa direach
ping -c 2 192.168.1.1
```

Jika reply → lanjut ke step 2.

---

### 2. Tambahkan IP alias ke interface aktif

```bash
# Ganti 'en0' dengan interface WiFi aktif (cek dengan: ifconfig | grep "inet ")
sudo ifconfig en0 alias 192.168.1.99 255.255.255.0

# WAJIB: tambah route eksplisit (macOS tidak otomatis buat route dari alias)
sudo route add -net 192.168.1.0/24 -interface en0
```

Verifikasi:
```bash
ping -S 192.168.1.99 -c 2 192.168.1.200
# Harus reply (0% packet loss)
```

---

### 3. Jalankan edge-bridge

```bash
cd /Users/apple/Downloads/Mosaik-WMS/edge-bridge
node src/index.js
```

Log sukses yang diharapkan:
```
✅ [SSE] Connected to VPS event stream
✅ [DIRECT READER CONNECTED] Successfully connected to EL-UHF-RC4 Reader at 192.168.1.200:2022!
[READER HEALTH] responsive
✨ [DIRECT READER] Module Init ACK received: SUCCESS (RF baseband online)
```

---

## Catatan Penting

| Item | Detail |
|---|---|
| **IP alias** | Hilang setelah restart Mac — harus dijalankan ulang |
| **Sudo password** | Diperlukan untuk `ifconfig` |
| **WiFi yang dibutuhkan** | WiFi yang serve subnet `192.168.1.x` di lokasi gudang |
| **Router lokasi** | MikroTik di `192.168.1.9` |
| **Firewall reader** | Hanya allow source IP `192.168.1.x` |

---

## Konfigurasi Edge-Bridge (`.env`)

```env
READER_HOST=192.168.1.200
READER_PORT=2022
ENABLE_DIRECT_READER=true
WAREHOUSE_ID=1
GATE_ID=GATE-01
API_BASE_URL=http://206.237.98.48/api
DEVICE_API_TOKEN=cb076bdc01876e19f27b2459db3d324f907d74f9260a2c12bc9bda3f0f19c364
HEARTBEAT_INTERVAL_MS=10000
WS_PORT=2078
TCP_PORT=2077
```

---

## Troubleshooting

### Port 2022 filtered / timeout
```bash
# Pastikan source IP dari subnet 192.168.1.x
sudo ifconfig en0 alias 192.168.1.99 255.255.255.0
nc -s 192.168.1.99 -zv 192.168.1.200 2022 -w 3
# Harus: Connection succeeded!
```

### Reader tidak ditemukan di jaringan
```bash
# Scan dengan nmap (install dulu jika belum: brew install nmap)
nmap -sn 192.168.1.0/24
# Cari 192.168.1.200 di hasil

# Force scan meski tidak respond ping
nmap -Pn -p 2022,80 192.168.1.200
```

### SSE ke VPS error 500
```bash
# Deploy ulang EdgeStreamController via docker cp
scp -P 2210 backend/app/Http/Controllers/Api/EdgeStreamController.php \
  dava@206.237.98.48:/tmp/EdgeStreamController.php

ssh -p 2210 dava@206.237.98.48 \
  "docker cp /tmp/EdgeStreamController.php \
   mosa-backend:/var/www/backend/app/Http/Controllers/Api/EdgeStreamController.php && \
   docker exec mosa-backend php artisan cache:clear"
```

### IP alias hilang setelah restart
Alias bersifat sementara. Buat script permanen:

```bash
# Simpan sebagai ~/start-edge-bridge.sh
#!/bin/bash
sudo ifconfig en0 alias 192.168.1.99 255.255.255.0
cd /Users/apple/Downloads/Mosaik-WMS/edge-bridge
node src/index.js
```

```bash
chmod +x ~/start-edge-bridge.sh
~/start-edge-bridge.sh
```

---

## Topologi Jaringan

```
Browser (http://206.237.98.48)
    │
    ▼
VPS 206.237.98.48
├── Nginx Host → 127.0.0.1:8081 → Docker mosa-nginx → mosa-backend (REST API)
│       │  POST /api/ws-control-ticket → mengembalikan edge_ws_url
│       └─ mosa-edge-bridge TIDAK dipakai (tidak bisa reach reader LAN)
│
│  WebSocket langsung ke laptop (ws://192.168.193.131:2078)
▼
Laptop macOS (edge-bridge Node.js — port 2078)
├── en0 WiFi: 192.168.193.131 (DHCP — wajib update DB jika berubah)
├── en0 alias: 192.168.1.99 (manual, untuk reach reader)
└── Terhubung ke WiFi jaringan gudang (subnet 192.168.1.x)
    │
    │  TCP port 2022 (dari source 192.168.1.99)
    ▼
Reader RFID: Electron EL-UHF-RC4
├── IP: 192.168.1.200
├── Port data: 2022
└── Firewall: hanya terima source 192.168.1.x
```

> ⚠️ **Penting:** `edge_ws_url` di tabel `gate_devices` HARUS diisi IP WiFi laptop
> yang reachable dari browser (bukan `localhost`). Jika IP DHCP berubah, update DB:
> ```bash
> docker exec mosa-backend php artisan tinker --execute="DB::table('gate_devices')->where('id',1)->update(['edge_ws_url'=>'ws://IP_BARU:2078']);"
> ```
> Jalankan juga di VPS:
> ```bash
> ssh -p 2210 dava@206.237.98.48 'docker exec mosa-backend php artisan tinker --execute="DB::table(\"gate_devices\")->where(\"id\",1)->update([\"edge_ws_url\"=>\"ws://IP_BARU:2078\"]);"'
> ```
