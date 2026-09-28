# MOSA WMS RFID

WMS untuk material rollout fiber optic dengan registri EPC, rekonsiliasi delivery dua handheld, kuota BOQ, gate transaction, dan custody reporting.

## Status

Snapshot 12 September 2026. Sistem berada pada tahap implementation/hardening campuran.

- Dispatch/receiving berbasis EPC: tersedia.
- Gate dual/single, idempotensi, dan session authorization: tersedia dengan gap otorisasi yang terdokumentasi.
- Custody append-only: model/API terlindungi; enforcement DB belum mutlak.
- Anti-clone TID/password/lock/permalock: belum tersedia.
- Relay fisik dan CCTV nyata: belum diintegrasikan; simulasi logis/marker.
- Edge offline reliability: known issue pada timer setelah batch pertama.
- HTTPS/WSS production: perlu hardening deployment.

## Quick start development

### Backend

```bash
cd backend
composer install
copy .env.example .env
php artisan key:generate
php artisan migrate
php artisan serve --port=8000 --no-reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Edge Bridge

```bash
cd edge-bridge
npm install
npm test
npm start
```

### Docker

```bash
docker compose config
docker compose up -d --build
```

`mosa:clean-init` melakukan reset/truncate. Gunakan hanya pada database development baru; jangan jalankan pada production.

## Dokumentasi

Indeks lengkap: [`doc/README.md`](doc/README.md).

- [`doc/prd.md`](doc/prd.md) — scope dan status.
- [`doc/arsitektur.md`](doc/arsitektur.md) — komponen dan topologi.
- [`doc/api-spec.md`](doc/api-spec.md) — kontrak API.
- [`doc/schema.md`](doc/schema.md) — database.
- [`doc/rules.md`](doc/rules.md) — aturan bisnis.
- [`doc/penggunaan.md`](doc/penggunaan.md) — SOP operator.
- [`RENCANA_HARDENING_FASE_2.md`](RENCANA_HARDENING_FASE_2.md) — backlog hardening.

## Verification

```bash
cd backend
php artisan test

cd ..\frontend
npm run build

cd ..\edge-bridge
npm test
```

Hasil test/build harus dijalankan ulang pada environment saat ini; README tidak menyimpan angka hasil lama.
