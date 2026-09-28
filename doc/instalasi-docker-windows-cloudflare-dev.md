# Panduan Docker Windows + Cloudflare Tunnel — Development/Uji Coba

> **Development-only.** Untuk PC rumah/laptop Windows saat uji coba. Jangan gunakan token, credential, atau data production.

---

## 1. Prasyarat

1. Install **Docker Desktop for Windows**.
2. Aktifkan WSL2 bila diminta:
   ```powershell
   wsl --install
   ```
3. Restart Windows jika diminta Docker/WSL.
4. Cek Docker:
   ```powershell
   docker version
   docker compose version
   ```

---

## 2. Jalankan MOSA lokal

Buka PowerShell di folder project:

```powershell
cd D:\Docker\wms\mosa
```

Buat file `.env` di root project:

```env
DEVICE_API_TOKEN=ganti-token-acak-unik-minimum-32-karakter
WS_CONTROL_SECRET=
WS_DEVICE_CODE=
WS_ALLOWED_ORIGINS=http://localhost
CLOUDFLARE_TUNNEL_TOKEN=
```

Build dan jalankan:

```powershell
docker compose --env-file .env -f docker-compose.yml -f docker-compose.windows-dev.yml --profile tunnel build
docker compose --env-file .env -f docker-compose.yml -f docker-compose.windows-dev.yml --profile tunnel up -d
```

Inisialisasi Laravel:

```powershell
docker compose exec backend php artisan key:generate
docker compose exec backend php artisan storage:link
docker compose exec backend php artisan migrate --force
```

**Peringatan:** command berikut menghapus/mengganti data. Jalankan hanya pada database development yang boleh di-reset.

```powershell
docker compose exec backend php artisan mosa:clean-init --staging-ready
```

Mode ini hanya menyiapkan user operasional, principal, gudang, master barang, dan template approval. EPC, project, SPK, delivery, WO, transaksi gate, armada, serta pairing device tetap kosong.

Akses lokal:

```text
http://localhost
```

---

## 3. Pairing device untuk monitoring

1. Buka `http://localhost`.
2. Login.
3. Buka **Pairing Reader & Device**.
4. Tambah reader.
5. Isi IP reader, contoh `192.168.1.200`.
6. Isi port reader, contoh `2022`.
7. Isi token device sama dengan `DEVICE_API_TOKEN`.
8. Simpan.

Catatan:
- `edge-bridge` memakai `READER_HOST`, bukan `READER_IP`.
- Port `2077` dan `2079` untuk reader TCP listener.
- Port `2078` untuk WebSocket monitoring pada jaringan tepercaya; jangan ekspos langsung ke Internet.
- Heartbeat default 10 detik.
- Toleransi koneksi default 90 detik per device.

---

## 4. Cloudflare Tunnel gratis untuk development

Gunakan jika PC rumah ingin diakses dari luar tanpa IP publik.

### 4.1 Buat tunnel

1. Buka `https://dash.cloudflare.com`.
2. Masuk **Zero Trust**.
3. Buka **Networks** → **Tunnels**.
4. Klik **Add a tunnel**.
5. Pilih **Cloudflared**.
6. Nama: `mosa-dev-pc-rumah`.
7. Pilih connector **Docker**.
8. Copy token tunnel.

### 4.2 Public hostname

Di tunnel yang sama:

- Subdomain: `wms`
- Domain: domain kamu
- Type: `HTTP`
- URL: `nginx:80`

Simpan.

### 4.3 Isi token tunnel

Edit file `.env` root project:

```env
DEVICE_API_TOKEN=mosa-trial-device-token-1234567890abcdef
CLOUDFLARE_TUNNEL_TOKEN=token-panjang-dari-cloudflare
```

Jalankan tunnel:

```powershell
docker compose --profile tunnel up -d
```

Cek log:

```powershell
docker compose logs -f cloudflared
```

Akses publik:

```text
https://wms.domainkamu.com
```

---

## 5. Perintah operasional

```powershell
# Status container
docker compose ps

# Log backend
docker compose logs -f backend

# Log edge bridge
docker compose logs -f edge-bridge

# Restart semua
docker compose restart

# Stop semua
docker compose down

# Update setelah git pull
docker compose build --no-cache
docker compose up -d
docker compose exec backend php artisan migrate --force
```

---

## 6. Batasan development

- Cloudflare Tunnel bergantung koneksi PC rumah.
- Saat PC tidur/mati, aplikasi publik ikut mati.
- Cloud tidak bisa menerima insiden reader saat internet lokasi putus; insiden dikirim ulang setelah pulih.
- Untuk production, pakai server/VPS/domain permanen bila sistem sudah siap.