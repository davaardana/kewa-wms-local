# Backend Agent Rules

Ikuti [`../AGENTS.md`](../AGENTS.md).

- Runtime: PHP `^8.3`, Laravel `^13.17`; lihat `composer.json`.
- Jangan memasang/mengubah dependency tanpa kebutuhan tugas. Laravel Boost sudah dependency development.
- Pertahankan transaksi DB pada mutasi custody, tag, gate, delivery, return, dan BOQ.
- Jangan update/delete `custody_ledger`; koreksi memakai event baru.
- Perubahan route, payload, status code, schema, atau invariant wajib menyinkronkan dokumentasi terkait.
- Validasi dengan `php artisan test`; jangan menjalankan reset/seeder destruktif pada production.
