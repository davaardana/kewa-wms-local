# Dokumentasi MOSA WMS RFID

Indeks dokumentasi sistem. Status mengikuti implementasi aktual kode, bukan target desain.

---

## Panduan Utama

| Dokumen | Isi |
|:--------|:----|
| [`cara-penggunaan.md`](cara-penggunaan.md) | Panduan lengkap alur & tombol per role |
| [`alur-sistem.md`](alur-sistem.md) | Alur material, state machine, keputusan gate |
| [`roles-permissions.md`](roles-permissions.md) | Matriks hak akses per role (SA/PM/PIC) |
| [`struktur-kode.md`](struktur-kode.md) | Struktur folder backend, frontend, edge |

## Referensi Teknis

| Dokumen | Isi |
|:--------|:----|
| [`arsitektur.md`](arsitektur.md) | Komponen, topologi, trust boundary |
| [`rfid-flow.md`](rfid-flow.md) | Alur lengkap RFID: reader → edge → VPS → browser, SSE, WS, enrollment, gate |
| [`schema.md`](schema.md) | Skema database & ERD |
| [`api-spec.md`](api-spec.md) | Kontrak REST API lengkap |
| [`rules.md`](rules.md) | Aturan bisnis dengan label enforcement |
| [`prd.md`](prd.md) | PRD & status fitur implementasi |

## Instalasi & Deployment

| Dokumen | Isi |
|:--------|:----|
| [`instalasi-docker-dan-domain.md`](instalasi-docker-dan-domain.md) | Deploy production Ubuntu + domain |
| [`instalasi-docker-windows-cloudflare-dev.md`](instalasi-docker-windows-cloudflare-dev.md) | Development Windows + tunnel |
| [`instalasi-edge-bridge-client-windows.md`](instalasi-edge-bridge-client-windows.md) | Edge Bridge di PC gudang Windows |
| [`instalasi-hardware-reader.md`](instalasi-hardware-reader.md) | Setup & wiring reader RFID UHF |
| [`contoh-pemasangan-tag.md`](contoh-pemasangan-tag.md) | Pemasangan tag di material tiang |
| [`command-docker-presentasi-windows.md`](command-docker-presentasi-windows.md) | Command operasional presentasi |

---

## Source of Truth

Kode aktual mengalahkan dokumentasi lama:

- API → `backend/routes/api.php` + controllers
- Schema → `backend/database/migrations/`
- Business logic → services, models, policies, tests
- Edge runtime → `edge-bridge/src/`
- Deployment → `docker-compose.yml`, `docker/nginx/default.conf`

## Aturan Penggunaan Dokumen

1. Kode mengalahkan Markdown — selalu cek source sebelum percaya dokumen.
2. Label `PARTIAL`, `PLANNED`, `KNOWN ISSUE` tidak boleh dipromosikan ke `IMPLEMENTED` tanpa bukti test/commissioning.
3. Perubahan kontrak API, schema, arsitektur, gate, atau alur bisnis wajib update dokumen terkait pada turn yang sama.
4. Bugfix lokal, CSS, refactor internal tanpa perubahan kontrak tidak wajib update dokumen.
