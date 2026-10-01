# Dokumentasi MOSA WMS RFID

Indeks dokumentasi. Status mengikuti implementasi aktual, bukan target desain.

## Source of truth

| Informasi | Dokumen kanonik |
|---|---|
| Scope dan status produk | [`prd.md`](prd.md) |
| Invariants dan enforcement | [`rules.md`](rules.md) |
| Kontrak REST API | [`api-spec.md`](api-spec.md) + routes/controllers |
| Skema database | [`schema.md`](schema.md) + migrations |
| Batas arsitektur dan topologi | [`arsitektur.md`](arsitektur.md) |
| SOP operator | [`penggunaan.md`](penggunaan.md) |
| Runtime Edge | [`../edge-bridge/README.md`](../edge-bridge/README.md) |
| Edge Windows | [`instalasi-edge-bridge-client-windows.md`](instalasi-edge-bridge-client-windows.md) |
| Hardware/RF | [`instalasi-hardware-reader.md`](instalasi-hardware-reader.md) |
| Deployment Ubuntu/domain | [`instalasi-docker-dan-domain.md`](instalasi-docker-dan-domain.md) |
| Development Windows/tunnel | [`instalasi-docker-windows-cloudflare-dev.md`](instalasi-docker-windows-cloudflare-dev.md) |
| Command presentasi Windows | [`command-docker-presentasi-windows.md`](command-docker-presentasi-windows.md) |
| Backlog hardening | [`../RENCANA_HARDENING_FASE_2.md`](../RENCANA_HARDENING_FASE_2.md) |

## Dokumen aktif

- [`prd.md`](prd.md) — kebutuhan produk dan status implementasi.
- [`arsitektur.md`](arsitektur.md) — komponen, trust boundary, alur, deployment, gap.
- [`api-spec.md`](api-spec.md) — seluruh route aktif, disabled, akses, side effect.
- [`schema.md`](schema.md) — ringkasan migration, FK, index, risiko data.
- [`rules.md`](rules.md) — aturan bisnis dengan label enforcement.
- [`penggunaan.md`](penggunaan.md) — SOP operator; bukan panduan developer/seeder.
- [`keamanan-rfid-anti-clone.md`](keamanan-rfid-anti-clone.md) — proposal, belum implementasi.

## Deployment dan hardware

- [`instalasi-docker-dan-domain.md`](instalasi-docker-dan-domain.md) — baseline Ubuntu; hardening production masih diperlukan.
- [`instalasi-docker-windows-cloudflare-dev.md`](instalasi-docker-windows-cloudflare-dev.md) — development-only.
- [`command-docker-presentasi-windows.md`](command-docker-presentasi-windows.md) — command operasional presentasi Windows, Adminer, database, dan tunnel.
- [`instalasi-edge-bridge-client-windows.md`](instalasi-edge-bridge-client-windows.md) — pilot Edge Windows; acceptance service masih diperlukan.
- [`instalasi-hardware-reader.md`](instalasi-hardware-reader.md) — wiring, RF, dan commissioning.
- [`contoh-pemasangan-tag.md`](contoh-pemasangan-tag.md) — metode dan ilustrasi pemasangan tag RFID pada tiang besi bulat.

## Arsip dan komersial

- [`archive/requirements-initial.md`](archive/requirements-initial.md) — requirement discovery awal; superseded.
- [`commercial/estimasi-valuasi-proyek.md`](commercial/estimasi-valuasi-proyek.md) — estimasi internal; bukan source teknis.

## Aturan penggunaan

- Kode, migration, routes, dan controller mengalahkan klaim lama pada Markdown.
- Label `PARTIAL`, `PLANNED`, dan `KNOWN ISSUE` tidak boleh dipromosikan menjadi `IMPLEMENTED` tanpa bukti test/commissioning.
- Perubahan kontrak API, schema, arsitektur, gate, atau alur bisnis wajib memperbarui dokumen terkait pada turn yang sama.
