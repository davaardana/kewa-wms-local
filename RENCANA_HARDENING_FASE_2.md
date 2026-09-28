# Sisa Pekerjaan Hardening Fase 2

Hanya pekerjaan yang belum selesai. Implementasi final terdokumentasi di [`doc/README.md`](doc/README.md) dan pengujian kode.

## Prioritas Pengerjaan

Urutan: P0 sebelum production, P1 sebelum acceptance operasional, P2 penyempurnaan UI. Audit statis belum membuktikan test atau deployment lulus.

### P0 — Keamanan dan Integritas Data

- **[DOC-01] Selesai:** Dokumentasi API/schema/arsitektur dikonsolidasikan; requirement awal diarsipkan; valuasi dipindahkan ke `doc/commercial/`.

- Kontrol WebSocket edge sudah memakai tiket HMAC 45 detik, scope user/gudang/command, pencegahan replay dalam proses, allowlist Origin, penolakan simulasi, allowlist mode/command, dan batas payload 4 KiB. Sisa deployment: pasang secret acak yang sama pada backend/edge, WSS, serta acceptance test jaringan nyata.
- Audit otorisasi transaksi selesai untuk instalasi: role PIC, relasi transaksi gerbang PIC–WO, scoping daftar/detail, serta batas saldo diterapkan. Delivery manual/approval tanpa EPC dinonaktifkan; visibilitas storeroom wajib assignment gudang.
- Validasi preparation, gate, kontrak sumber custody, serta atomicity mutasi tag selesai. Sisa concurrency MySQL nyata dan audit caller custody lanjutan.
- Accounting delivery manual tanpa EPC ditetapkan nonaktif; stok hanya diposting lewat rekonsiliasi EPC handheld.
- Rekonsiliasi retur kini memvalidasi serta memposting `STOCK_IN` per EPC; mismatch tidak membuat stok/ledger. Sisa uji saldo akhir kartu stok dan concurrency MySQL lintas transaksi.
- Perkuat append-only ledger terhadap query langsung dan efek foreign key yang menghapus/mengubah histori. Tetapkan kontrak koreksi sebelum fitur koreksi diaktifkan.
- Satukan konfigurasi HTTPS/WSS; verifikasi koneksi aman end-to-end pada deployment.

### P1 — Keandalan Operasional dan Acceptance

- Perbaiki visibilitas error login, pembersihan state autentikasi pada 401, dan sukses palsu eskalasi audit.
- Konsistenkan status reader di seluruh UI: bedakan koneksi bridge/reader, tampilkan umur data dan status stale/unknown. Telemetry dasar sudah tersedia.
- Jalankan regression test untuk assignment delivery manual, sumber custody, retur per EPC, dan proteksi append-only. Regression role PIC serta batas kuantitas instalasi sudah tersedia.
- Jalankan MySQL concurrency test, deployment smoke test, dan browser check pada lingkungan representatif.
- Jika hardware dipakai, integrasi serta acceptance test relay/CCTV dan commissioning fisik wajib selesai sebelum operasional.

### P2 — Penyempurnaan UI

- Lengkapi dialog, fokus keyboard, label, live region, touch target, dan tampilan 360 px. Masalah aksesibilitas yang menghalangi alur utama naik ke P1.

## Backend dan Data

- Kontrak sumber custody, gate, preparation, retur per EPC, dan mutasi tag sudah dilindungi; sisa audit caller serta concurrency MySQL.
- Delivery manual tanpa EPC dinonaktifkan; pertahankan accounting berbasis rekonsiliasi EPC.
- Tentukan kontrak bisnis event koreksi append-only.

## Edge dan Deployment

- Integrasi serta acceptance test relay/CCTV fisik bila hardware dipakai.
- Jalankan MySQL concurrency test, deployment smoke test, browser check, dan hardware commissioning.

## UI/UX

- Pastikan login error terlihat dan respons 401 membersihkan state autentikasi.
- Hapus notifikasi sukses palsu pada eskalasi audit.
- Tampilkan status reader aktual: online, offline, stale, unknown.
- Satukan konfigurasi HTTPS/WSS.
- Perbaiki dialog, fokus keyboard, label, live region, touch target, dan tampilan 360 px.

## Batasan

- Jangan menjalankan reset, seeder destruktif, atau simulator terhadap production.
- Jangan mengklaim fail-secure fisik atau anti-clone sebelum pengujian hardware nyata.
