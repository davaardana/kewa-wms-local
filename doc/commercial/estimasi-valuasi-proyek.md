# Estimasi Valuasi Proyek MOSA WMS RFID

> **Status: COMMERCIAL / NON-TECHNICAL SOURCE OF TRUTH**
>
> Snapshot 12 September 2026. Nilai di bawah adalah estimasi internal, bukan quotation final. Validasi scope, hardware, pajak, deployment, UAT, support, dan commissioning sebelum ditawarkan ke klien.

## Batasan Penting

- Relay magnetic lock fisik dan CCTV nyata belum diimplementasikan/commissioning.
- Anti-clone berbasis TID, access password, lock, dan permalock belum tersedia pada aplikasi.
- Custody ledger append-only belum dijamin mutlak pada level DB.
- HTTPS/WSS dan deployment production memerlukan hardening per environment.
- Harga hardware, cloud, instalasi RF, kalibrasi, transport, pajak, dan integrasi vendor harus dihitung terpisah.

## Estimasi Awal

| Model | Estimasi | Catatan |
|---|---:|---|
| Custom enterprise software | Rp 120.000.000–Rp 250.000.000 | Validasi ulang berdasarkan status fitur aktual. |
| Software + hardware + deployment | Rp 350.000.000–Rp 650.000.000+ | Tidak otomatis berarti relay/CCTV sudah terintegrasi; wajib ada acceptance scope. |
| SaaS per gudang | Rp 5.000.000–Rp 15.000.000/bulan | Di luar hardware, tag, instalasi, dan pajak. |
| Source code / white-label | Rp 75.000.000–Rp 150.000.000 | Lisensi, support, dan hak distribusi perlu kontrak terpisah. |

## Cost-to-Build Awal

| Komponen | Durasi | Estimasi |
|---|---:|---:|
| Lead full-stack engineer | 2,5 bulan | Rp 37.500.000–Rp 50.000.000 |
| IoT/edge engineer | 2 bulan | Rp 30.000.000–Rp 36.000.000 |
| Frontend/UI | 1,5 bulan | Rp 15.000.000–Rp 21.000.000 |
| QA/integration | 1 bulan | Rp 8.000.000–Rp 12.000.000 |
| PM/system analyst | 1 bulan | Rp 12.000.000–Rp 16.000.000 |
| **Total engineering langsung** |  | **Rp 102.500.000–Rp 135.000.000** |

Angka ini tidak menggantikan estimasi delivery berdasarkan acceptance criteria, jumlah gudang, jumlah reader, hardware vendor, dan kebutuhan support.

## Sumber Teknis

- Scope dan status: [`../prd.md`](../prd.md)
- Arsitektur: [`../arsitektur.md`](../arsitektur.md)
- API: [`../api-spec.md`](../api-spec.md)
- Deployment: [`../instalasi-docker-dan-domain.md`](../instalasi-docker-dan-domain.md)

Dokumen komersial tidak boleh dipakai untuk menyimpulkan fitur `IMPLEMENTED` tanpa rujukan ke source-of-truth teknis.
