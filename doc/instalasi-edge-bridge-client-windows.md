# Instalasi Edge Bridge di PC Client Windows

Panduan untuk IT saat memasang MOSA Edge Bridge pada mini PC/PC gudang. Jangan memasang source mentah di PC yang dipakai operator harian.

## Rekomendasi Topologi

- Backend, frontend, DB: server/cloud.
- Edge Bridge: mini PC khusus di gudang, dekat reader RFID.
- Storeroom: memakai browser di PC/HP lain.
- Mini PC edge: menyala 24 jam, user non-admin, folder service dikunci.

## Prasyarat
### Konfigurasi HO dan gudang (WSS per cabang)

1. HO: terapkan migration forward melalui prosedur deployment terkontrol. Pada Device Pairing, pertahankan `ip_address`/`tcp_port` untuk reader LAN; isi `edge_ws_url` dengan domain WSS Edge cabang, misalnya `wss://edge-gudang-a.example.com/ws`.
2. Gudang: TLS proxy/tunnel tepercaya meneruskan domain/path tersebut ke Edge `WS_PORT` (2078). Browser harus dapat menjangkaunya; jangan membuka TCP reader ke Internet. Sertifikat, routing Upgrade WebSocket, VPN/tunnel memerlukan commissioning nyata.
3. Gudang: isi `WS_DEVICE_CODE` sama persis dengan `device_code` pairing, `WAREHOUSE_ID` sesuai gudang, `WS_CONTROL_SECRET` identik backend; `DEVICE_API_TOKEN` tetap token unik perangkat. `WS_ALLOWED_ORIGINS` berisi origin frontend HO. `READER_HOST` tetap IP reader, bukan domain WSS.
4. Deploy backend dan Edge bersama: tiket v2 memerlukan binding perangkat; tiket v1 ditolak. Frontend memakai endpoint respons tiket, tidak memakai `VITE_WS_URL`. Pilih perangkat pada live preview; halaman lain tanpa pemilih menolak gudang dengan beberapa perangkat aktif.
5. Pilot lama hanya dapat memakai fallback server eksplisit `WS_CONTROL_PILOT_URL` + `WS_CONTROL_PILOT_WAREHOUSE_ID`, WSS tepercaya, tepat satu perangkat aktif. Kosong berarti tanpa fallback; WS plaintext tidak didukung. Tetap wajib `WS_DEVICE_CODE`.

Konfigurasi endpoint hanya boleh menuju Edge yang dikelola organisasi. Validasi sintaks bukan verifikasi kepemilikan domain. Secret HMAC bersama berarti Edge yang dipercaya memegang kemampuan menandatangani tiket; binding perangkat bukan isolasi secret antar cabang.

### Contoh multi-cabang

Gunakan **satu hostname WSS per cabang/gateway Edge**, bukan satu hostname per reader. Domain induk tetap sama; subdomain dibedakan berdasarkan cabang.

| Cabang | `warehouse_id` | `edge_ws_url` | `device_code` | Reader LAN |
|---|---:|---|---|---|
| Gudang Jakarta | `1` | `wss://edge-jakarta.example.com/ws` | `EDGE-JKT-01` | `192.168.10.20:2022` |
| Gudang Bogor | `2` | `wss://edge-bogor.example.com/ws` | `EDGE-BGR-01` | `192.168.20.20:2022` |
| Gudang Bandung | `3` | `wss://edge-bandung.example.com/ws` | `EDGE-BDG-01` | `192.168.30.20:2022` |

Contoh konfigurasi PC Edge Gudang Bogor:

```env
API_BASE_URL=https://wms.example.com/api
WAREHOUSE_ID=2
GATE_ID=GATE-BOGOR-01
WS_DEVICE_CODE=EDGE-BGR-01
WS_PORT=2078
WS_ALLOWED_ORIGINS=https://wms.example.com
WS_CONTROL_SECRET=<secret-yang-sama-dengan-backend>
DEVICE_API_TOKEN=<token-unik-EDGE-BGR-01>
READER_HOST=192.168.20.20
READER_PORT=2022
```

Pengaturan Device Pairing di HO untuk baris `EDGE-BGR-01`:

```text
Warehouse: Gudang Bogor (ID 2)
Device code: EDGE-BGR-01
Reader IP: 192.168.20.20
Reader TCP port: 2022
Edge WebSocket URL: wss://edge-bogor.example.com/ws
```

Per cabang:

1. Buat tunnel Cloudflare terpisah pada PC Edge cabang.
2. Arahkan hostname cabang ke port lokal Edge `2078`.
3. Pastikan `edge_ws_url` pada Device Pairing menunjuk hostname cabang yang benar.
4. Gunakan `DEVICE_API_TOKEN` dan `device_code` unik.
5. Gunakan `WAREHOUSE_ID` yang sama pada database, pairing, dan `.env` Edge.

Beberapa reader dalam satu cabang boleh berbagi hostname WSS bila dilayani satu Edge Bridge. Jika setiap reader memiliki PC/Edge Bridge sendiri, gunakan hostname berbeda:

```text
edge-jakarta-gate-1.example.com
edge-jakarta-gate-2.example.com
```

Jangan memakai satu hostname WSS untuk semua cabang tanpa gateway/routing pusat. Cloudflare Tunnel tidak otomatis memilih cabang berdasarkan `warehouse_id` atau tiket HMAC.

1. Windows 10/11 atau Windows Server.
2. Akses Administrator untuk instalasi.
3. Node.js LTS 20 terpasang system-wide.
4. Koneksi dari PC edge ke backend `API_BASE_URL`.
5. Koneksi dari PC edge ke reader RFID `READER_HOST:READER_PORT` atau reader mengirim TCP ke port edge.

Installer PowerShell saat ini **tidak menginstal Node.js otomatis**. Jika Node belum ada, installer berhenti dengan pesan instruksi. Jika Node sudah ada, installer memakai `node.exe` dari PATH sistem.

## Secret dan Token

Generate di mesin IT, jangan lewat chat:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

- `WS_CONTROL_SECRET`: sama di backend dan edge.
- `DEVICE_API_TOKEN`: unik per device; isi saat pairing reader, lalu tempel ke edge `.env`.

## Instalasi Pilot Terkendali

Script legacy/development `scripts\install-windows-service.bat` mensyaratkan Node.js minimum versi 20 dan memeriksa file `edge-bridge\.env`, menjalankan `npm ci` serta `npm test`, lalu memasang PM2 bila belum tersedia. Node.js 20 adalah baseline; versi di atas 20 menghasilkan peringatan tetapi dapat dilanjutkan bila instalasi dependency dan seluruh test lulus. Versi di bawah 20 ditolak. Script berhenti saat salah satu tahap gagal; folder `node_modules` yang ada tidak dianggap bukti dependency lengkap. Jalankan dari source yang memiliki `package-lock.json`. Autostart tetap wajib dibuktikan melalui uji reboot.

## Development: Edge Bridge Native, Bukan Docker

Core MOSA tetap di Docker; `edge-bridge` dijalankan langsung di Windows.

Jalankan dari root repository:

```powershell
docker compose -f docker-compose.yml -f docker-compose.windows-dev.yml -f docker-compose.windows-dev-no-edge.yml --profile tunnel up -d --build
```

Siapkan Edge Bridge:

```powershell
cd D:\Docker\wms\mosa\edge-bridge
npm install
Copy-Item .env.example .env -ErrorAction SilentlyContinue
notepad .env
npm start
```

Minimal `.env` untuk development lokal:

```env
API_BASE_URL=http://127.0.0.1/api
WAREHOUSE_ID=1
GATE_ID=GATE-01
WS_PORT=2078
WS_ALLOWED_ORIGINS=https://wms.jeungdevelopment.my.id,http://localhost
WS_CONTROL_SECRET=<secret-sama-dengan-backend>
DEVICE_API_TOKEN=<token-device>
READER_HOST=192.168.1.200
READER_PORT=2022
ENABLE_DIRECT_READER=true
```

Cloudflare hanya meneruskan HTTP ke Nginx. WebSocket Edge native perlu tunnel/hostname terpisah yang mengarah ke `http://host.docker.internal:2078` atau jalur WSS lain; jangan mengekspos port 2078 langsung ke Internet.

> **Peringatan:** installer mendaftarkan `powershell.exe` melalui `sc.exe`. Proses tersebut belum dibuktikan mengimplementasikan Windows Service Control Dispatcher dan dapat gagal dengan error SCM 1053. Jangan gunakan sebagai production service sebelum uji install, start, boot, restart, recovery, dan uninstall lulus. Gunakan service wrapper tervalidasi atau Scheduled Task sebagai jalur deployment yang disetujui IT.

Jalankan PowerShell sebagai Administrator:

```powershell
cd D:\Docker\wms\mosa\edge-bridge
.\scripts\install-production-windows-service.ps1
```

Default target:

```text
C:\Program Files\MOSA Edge Bridge
```

Target script:

- menyalin edge bridge ke `C:\Program Files\MOSA Edge Bridge`;
- menjalankan `npm ci --omit=dev`;
- mencoba membuat Windows service `MosaEdgeBridge` auto-start;
- membuat folder `logs`;
- mengunci ACL folder dan `.env` untuk admin/IT;
- membuka firewall port 2077, 2078, 2079 pada profile Private.

Setelah install, edit config sebagai Administrator:

```powershell
notepad "C:\Program Files\MOSA Edge Bridge\.env"
```

Minimal single reader:

```env
API_BASE_URL=https://domain-produksi.com/api
DEVICE_API_TOKEN=token_device_yang_diisi_saat_pairing
WS_CONTROL_SECRET=secret_sama_dengan_backend
WS_ALLOWED_ORIGINS=https://domain-produksi.com
WAREHOUSE_ID=1
GATE_ID=GATE-01
READER_HOST=192.168.1.200
READER_PORT=2022
ENABLE_DIRECT_READER=true
WS_PORT=2078
```

Mulai service:

```powershell
Start-Service MosaEdgeBridge
Get-Service MosaEdgeBridge
Get-Content "C:\Program Files\MOSA Edge Bridge\logs\service.log" -Tail 50
```

## Update Source di PC Terpasang

Untuk update pilot:

1. Stop service.
2. Jalankan installer dari source versi baru.
3. Installer menyalin ulang kode, mempertahankan `.env` bila sudah ada.
4. Start service.

```powershell
Stop-Service MosaEdgeBridge
cd D:\path\edge-bridge-versi-baru
.\scripts\install-production-windows-service.ps1
Start-Service MosaEdgeBridge
```

Catatan: ini belum MSI/updater signed. Untuk banyak cabang, target berikutnya adalah paket installer resmi dan mekanisme update terkontrol.

## Uninstall

Service saja:

```powershell
.\scripts\uninstall-production-windows-service.ps1
```

Service dan file:

```powershell
.\scripts\uninstall-production-windows-service.ps1 -RemoveFiles
```

## Pembatasan Keamanan

- User storeroom tidak boleh admin Windows.
- Jangan beri akses tulis ke `C:\Program Files\MOSA Edge Bridge`.
- `.env` hanya admin/IT.
- Jangan install VS Code/git pada mini PC edge operasional.
- Gunakan firewall/VPN/WSS; token bukan pengganti jaringan aman.
- Source masih berupa JavaScript di folder instalasi. ACL mengurangi akses operator, bukan proteksi dari admin lokal jahat.
- Relay fisik dan CCTV nyata belum tersedia; daemon hanya menjalankan simulasi logis/marker.

## Status Saat Ini

- Kandidat pilot setelah acceptance test SCM/boot selesai.
- Belum menggantikan MSI/NSIS installer, code signing, bundled Node runtime, GUI Edge Manager, service account khusus, remote updater, atau diagnostic bundle.
