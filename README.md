# MOSA WMS RFID

Warehouse Management System berbasis RFID UHF untuk material rollout **fiber optic** (tiang, kabel, aksesoris). Dirancang untuk mengelola alur material dari gudang transit lapangan ke titik pemasangan dengan verifikasi RFID real-time.

---

## Fitur Utama

| Fitur | Deskripsi |
|:------|:----------|
| **Dokumen Barang** | Buat, approve, dan track dokumen penerimaan/pengiriman material |
| **Pendaftaran Tag RFID** | Enroll tag EPC satu-per-satu atau batch (Ziplock) via UHF Reader |
| **Master Data** | Katalog material, gudang transit, proyek, principal, armada |
| **RFID Gate** | Monitor perlintasan real-time + konfigurasi reader UHF |
| **Laporan** | Audit Trail custody, Stock Opname fisik, Kartu Stok per gudang |
| **Kelola Pengguna** | Manajemen user & hak akses berbasis role |

---

## Struktur Folder

```
Mosaik-WMS/
├── backend/          # Laravel 13 / PHP 8.3 — REST API, business logic, DB
├── frontend/         # React 18 + Vite — PWA dashboard & operator UI
├── edge-bridge/      # Node.js 20 — parser reader RFID, WebSocket, offline queue
├── docker/           # Konfigurasi Nginx, Dockerfile per service
├── doc/              # Dokumentasi lengkap (lihat doc/README.md)
├── docker-compose.yml              # macOS/Linux dev
├── docker-compose.windows-dev.yml  # Windows dev
└── AGENTS.md         # Aturan agent AI
```

---

## Cara Menjalankan

### Docker (Recommended)

```bash
# 1. Clone / buka folder
cd Mosaik-WMS

# 2. Buat environment privat dari template, lalu isi secret yang valid
cp .env.deploy.example .env

# 3. Jalankan service development
docker compose --env-file .env up -d --build

# 4. Inisialisasi schema dan seed secara eksplisit
docker compose --env-file .env exec backend php artisan migrate --force
docker compose --env-file .env exec backend php artisan db:seed --force

# 5. Buka browser
open http://localhost
```

Untuk production gunakan image immutable dan migration job terpisah:

```bash
docker compose --env-file .env.production \
       -f docker-compose.production.yml \
       -f docker-compose.ubuntu-production.yml \
       up -d --build
```

### Login Demo

| Role | Email | Password |
|:-----|:------|:---------|
| Super Administrator | superadmin@mosa.id | password |
| Project Manager | pm.budi@mosa.id | password |
| PIC Lapangan | pic.joko@mosa.id | password |

---

## Alur Penggunaan Sistem

```
[PM] Buat Dokumen Barang (draft)
       ↓
[PM] Approve Dokumen
       ↓
[PIC] Assign Tag RFID ke item dokumen
       ↓
[Edge Bridge] Reader UHF baca tag di gate
       ↓
[Sistem] Validasi & catat GATE_OUT/GATE_IN otomatis
       ↓
[PM/SA] Laporan Audit Trail & Stock Opname
```

---

## Stack Teknologi

| Layer | Teknologi |
|:------|:----------|
| Frontend | React 18, Vite, TailwindCSS (via vanilla CSS), PWA |
| Backend | Laravel 13, PHP 8.3, Sanctum, PostgreSQL |
| Edge | Node.js 20 LTS, WebSocket, TCP parser |
| Infra | Docker, Nginx, PHP-FPM |

---

## Dokumentasi

Indeks lengkap: [`doc/README.md`](doc/README.md)

| Dokumen | Isi |
|:--------|:----|
| [`doc/cara-penggunaan.md`](doc/cara-penggunaan.md) | Panduan lengkap alur & tombol per role |
| [`doc/arsitektur.md`](doc/arsitektur.md) | Komponen, topologi, trust boundary |
| [`doc/schema.md`](doc/schema.md) | Skema database & ERD |
| [`doc/api-spec.md`](doc/api-spec.md) | Kontrak REST API |
| [`doc/roles-permissions.md`](doc/roles-permissions.md) | Matriks hak akses per role |
| [`doc/instalasi-docker-dan-domain.md`](doc/instalasi-docker-dan-domain.md) | Deploy production Ubuntu |
| [`doc/instalasi-hardware-reader.md`](doc/instalasi-hardware-reader.md) | Setup reader UHF |

---

## Verifikasi

```bash
# Backend tests
docker exec mosa-backend php artisan test

# Frontend build
cd frontend && npm run build

# Edge tests
cd edge-bridge && npm test

# Docker config check
docker compose config
```
