# Deployment Docker Ubuntu dan Domain

> **Status:** baseline deployment; hardening production belum sepenuhnya diterapkan pada `docker-compose.yml`. Jangan mengekspos MySQL, port reader, atau WebSocket Edge langsung ke Internet.

Panduan Windows development: [`instalasi-docker-windows-cloudflare-dev.md`](instalasi-docker-windows-cloudflare-dev.md). Edge Windows: [`instalasi-edge-bridge-client-windows.md`](instalasi-edge-bridge-client-windows.md).

## Compose Profiles
HO menyimpan endpoint WSS cabang pada `gate_devices.edge_ws_url` melalui Device Pairing, bukan mengganti IP reader. Browser menghubungi endpoint dari tiket backend; `VITE_WS_URL` tidak dipakai. Edge cabang wajib `WS_DEVICE_CODE`, TLS proxy, Origin frontend HO. Ikuti [konfigurasi HO dan gudang](instalasi-edge-bridge-client-windows.md#konfigurasi-ho-dan-gudang-wss-per-perangkat), termasuk upgrade tiket v2 dan fallback pilot eksplisit. Compose tidak otomatis membuat domain/proxy cabang.

Satu `docker-compose.yml` menjadi baseline. File override memilih exposure/topologi; jangan membuat empat stack yang isinya bercabang.

| Target | File override | Akses publik |
|---|---|---|
| Windows development + Cloudflare | `docker-compose.windows-dev.yml` | Tunnel ke `nginx`; DB/Edge localhost. |
| Windows pilot production + Cloudflare | `docker-compose.windows-production.yml` | Tunnel ke `nginx`; DB/Edge tidak dipublikasi. |
| Ubuntu development + Cloudflare | `docker-compose.ubuntu-dev.yml` | Tunnel ke `nginx`; app localhost `8080`. |
| Ubuntu production + custom domain/Cloudflare | `docker-compose.ubuntu-production.yml` | Host TLS/reverse proxy ke localhost `8080`; Edge per gudang. |

Salin [`.env.deploy.example`](../.env.deploy.example) ke file environment privat. Jangan commit file berisi secret.

Contoh:

```bash
docker compose --env-file .env.ubuntu-production -f docker-compose.yml -f docker-compose.ubuntu-production.yml up -d --build
```

## Topologi

- Server pusat: Nginx, frontend static build, Laravel/PHP-FPM, MySQL.
- Edge Bridge: PC/mini-PC per gudang pada LAN reader.
- Edge mengakses API pusat melalui HTTPS.
- Browser mengakses Edge hanya melalui LAN/VPN atau reverse proxy WSS terkontrol.
- Service `edge-bridge` pada compose pusat hanya cocok untuk lab/on-premise yang memiliki routing privat ke reader.

## Prasyarat

- Ubuntu 22.04/24.04 LTS.
- Docker Engine dan Compose plugin resmi.
- DNS domain mengarah ke server.
- Firewall default-deny.
- Backup terenkripsi di lokasi terpisah.

## Konfigurasi Secret

Sebelum menjalankan compose, hilangkan credential literal dari compose atau override melalui secret/environment deployment. Minimum:

```env
APP_ENV=production
APP_DEBUG=false
APP_URL=https://wms.example.com
DB_DATABASE=mosa_wms
DB_USERNAME=mosa_user
DB_PASSWORD=<acak-kuat>
MYSQL_ROOT_PASSWORD=<acak-kuat-berbeda>
WS_CONTROL_SECRET=<acak-minimum-32-byte>
DEVICE_API_TOKEN=<unik-per-device-minimum-32-karakter>
WS_ALLOWED_ORIGINS=https://wms.example.com
```

Generate secret langsung pada mesin administrasi; jangan kirim melalui chat atau commit ke Git.

## Instalasi Awal

```bash
git clone <repository-url> /var/www/mosa
cd /var/www/mosa
cp backend/.env.example backend/.env
docker compose config
docker compose up -d --build
docker compose exec backend php artisan key:generate
docker compose exec backend php artisan migrate --force
docker compose exec backend php artisan storage:link
```

### Inisialisasi master data

> **Peringatan:** `mosa:clean-init` melakukan truncate/reset data. Jalankan hanya pada database baru yang telah diverifikasi kosong. Jangan gunakan untuk upgrade atau recovery production.

```bash
docker compose exec backend php artisan mosa:clean-init --master-only
```

Upgrade berikutnya memakai migration normal dan backup, bukan clean-init.

## Port dan Firewall

Buka hanya:

- `22/tcp` dari IP administrasi/VPN.
- `80/tcp` untuk redirect atau ACME challenge.
- `443/tcp` untuk aplikasi.

Jangan buka ke Internet:

- `3306` MySQL.
- `2077/2079` listener reader.
- `2078` WebSocket Edge.

Compose saat ini memetakan port tersebut pada host. Sebelum production, hapus mapping MySQL dan Edge dari server pusat atau bind ke interface privat/localhost sesuai topologi. Jangan mengandalkan UFW saja.

## TLS dan Reverse Proxy

Baseline memakai bind yang dapat dioverride. Override production mengikat aplikasi ke `127.0.0.1:8080`; host Nginx/Cloudflare menjadi terminator TLS. Jangan memasang dua service pada port host yang sama.

Pilih satu terminator TLS:

1. Reverse proxy host/container khusus pada 80/443, lalu bind `mosa-nginx` internal ke `127.0.0.1:8080:80`; atau
2. Tambahkan TLS/certificate langsung pada Nginx container.

Untuk opsi reverse proxy host, target HTTP aplikasi adalah `127.0.0.1:8080`, bukan `127.0.0.1:80`.

Contoh location WebSocket hanya bila Edge dapat dijangkau melalui VPN/private route:

```nginx
location /ws-bridge/ {
    proxy_pass http://<private-edge-ip>:2078/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

Set frontend menjadi `VITE_WS_URL=wss://wms.example.com/ws-bridge/` saat build. Konfigurasi Nginx repo saat ini belum menyediakan route tersebut; tambahkan dan uji sebelum mengaktifkannya.

Cloudflare wajib memakai origin HTTPS tervalidasi dan mode **Full (strict)**. Jangan memakai Flexible. Origin Certificate atau sertifikat publik harus terpasang pada terminator TLS.

## Verifikasi Deployment

```bash
docker compose config
docker compose ps
docker compose exec backend php artisan migrate:status
docker compose exec backend php artisan test
curl -fsS https://wms.example.com/
curl -fsS https://wms.example.com/api/auth/me
```

Respons `401` dari `/api/auth/me` tanpa token membuktikan route terlindungi terjangkau. Verifikasi WSS, login, upload, receiving, gate, dan restore backup pada environment staging sebelum go-live.

## Backup dan Restore

Jangan menaruh password DB di argumen command atau script. Gunakan environment/file credential berizin ketat atau secret manager.

Backup minimum:

1. Dump MySQL konsisten.
2. Salin `backend/storage/app/public` bila bukti file dibutuhkan.
3. Enkripsi backup.
4. Simpan off-host.
5. Terapkan retention.
6. Jalankan restore test berkala pada database terpisah.

Contoh restore test harus memeriksa migration status, jumlah record penting, login, serta referensi file. Backup tanpa restore test belum dianggap valid.

## Update dan Rollback

1. Ambil backup terverifikasi.
2. Catat image/commit saat ini.
3. Build dan uji staging.
4. Jalankan `php artisan migrate --force`.
5. Smoke test.
6. Jika gagal, rollback image/code. Rollback migration hanya bila migration tersebut dirancang reversible dan dampak data dipahami.

## Batas Implementasi

- Compose repo masih memuat credential default dan port internal publik; belum production-safe tanpa override/perubahan.
- Relay fisik dan CCTV nyata belum tersedia.
- Edge central tidak dapat menjangkau reader LAN tanpa VPN/routing.
- HTTPS/WSS belum turnkey pada konfigurasi Nginx repo.
