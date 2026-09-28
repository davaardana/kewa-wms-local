# MOSA WMS RFID — Agent Guidelines

## Source of truth

Kode aktual mengalahkan dokumentasi lama:

- API: `backend/routes/api.php` + controller.
- Schema: `backend/database/migrations`.
- Business enforcement: services, models, policies, tests.
- Edge runtime: `edge-bridge/src`.
- Deployment: `docker-compose.yml`, `docker/nginx/default.conf`, Dockerfiles.
- Documentation index: [`doc/README.md`](doc/README.md).

## Documentation integrity

Perubahan arsitektur, schema, gate logic, REST contract, business flow, atau fitur sistem wajib memperbarui Markdown terdampak pada turn yang sama. Bugfix lokal, CSS, dan refactor internal tanpa perubahan kontrak tidak wajib.

Jangan mengubah label `PARTIAL`, `PLANNED`, atau `KNOWN ISSUE` menjadi `IMPLEMENTED` tanpa bukti kode/test/commissioning.

## Safety

- Jangan menjalankan reset, `migrate:fresh`, `mosa:clean-init`, atau simulator terhadap production.
- Jangan commit token, password, credential DB, atau secret.
- Jangan mengklaim relay fisik, CCTV nyata, anti-clone, fail-secure hardware, atau append-only DB sebelum acceptance test yang sesuai.
- Pertahankan atribusi event pada user personal.
- Jangan update/delete `custody_ledger`; gunakan event koreksi baru.

## Runtime baseline

- Backend: PHP `^8.3`, Laravel `^13.17`.
- Frontend: React/Vite.
- Edge: Node.js 20 LTS.
- Validasi umum: backend `php artisan test`, frontend `npm run build`, Edge `npm test`, deployment `docker compose config`.

## Minimal-diff policy

Baca source-of-truth yang relevan saja. Hindari dependency baru, abstraksi, dan dokumentasi duplikat. Pertahankan `doc/README.md` sebagai indeks tunggal.
