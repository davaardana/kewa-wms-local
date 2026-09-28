# MOSA Backend

Laravel 13 / PHP 8.3 REST API untuk WMS, approval, RFID gate, custody, dan reporting.

## Setup development

```bash
composer install
copy .env.example .env
php artisan key:generate
php artisan migrate
php artisan serve --port=8000 --no-reload
```

`--no-reload` tidak otomatis menjamin jumlah worker tertentu. Konfigurasikan runtime sesuai environment.

## Test

```bash
php artisan test
```

## Inisialisasi data

`php artisan mosa:clean-init` melakukan reset/truncate. Gunakan hanya pada database baru atau development setelah backup terverifikasi; jangan jalankan pada production berisi data.

```bash
php artisan mosa:clean-init --only-users
php artisan mosa:clean-init --master-only
php artisan mosa:clean-init --staging-ready
php artisan mosa:clean-init --dev
```

Semua mode non-`--only-users` menghasilkan data dasar yang sama: user operasional, principal, gudang, master barang, dan template approval. EPC, project, SPK, delivery, WO, transaksi gate, armada, serta pairing device tidak di-seed.

Kontrak: [`../doc/api-spec.md`](../doc/api-spec.md), [`../doc/schema.md`](../doc/schema.md), [`../doc/rules.md`](../doc/rules.md).
