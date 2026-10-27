# Alur Kerja Sistem MOSA WMS RFID

## Role Pengguna

| Role | Kode | Tugas Utama |
|------|------|-------------|
| **Superadmin** | `superadmin` | Kelola user, perangkat RFID, data master (item, gudang) |
| **Project Manager** | `pm` | Buat & approve dokumen barang masuk/keluar, lihat laporan |
| **PIC Lapangan** | `pic_lapangan` | Tempel tag RFID ke barang, lewatkan ke gate reader, selesaikan dokumen |

---

## 1. Alur Barang MASUK (Inbound)

> Barang datang dari vendor → masuk gudang melalui gate RFID reader.

```
TAHAP 1 — PM INPUT DOKUMEN
  PM membuat Shipping Document (type: inbound)
  Isi dokumen:
    - Daftar item & jumlah yang diharapkan masuk
    - Upload file lampiran (foto, Word, PDF dari vendor)
    - Pilih gudang tujuan
  Status: DRAFT
      ↓
TAHAP 2 — PM APPROVE DOKUMEN
  PM mereview dan menyetujui dokumen.
  Status: APPROVED
      ↓
TAHAP 3 — PIC LAPANGAN: TEMPEL TAG RFID
  Barang fisik tiba di area penerimaan.
  PIC Lapangan:
    - Tempel sticker/tag RFID ke setiap item barang
    - Assign tag (EPC) ke item pada dokumen di sistem
    - Jumlah assignment harus tepat sama dengan expected_qty
    - Tag inbound harus active dan belum memiliki gudang
  Status: IN_PROGRESS
      ↓
TAHAP 4 — BARANG LEWAT GATE READER
  Barang dengan tag RFID dilewatkan ke gate reader.
  Sistem otomatis:
    - Baca EPC setiap tag
    - Cocokkan EPC exact dengan assignment, item, qty, gudang, dan arah IN
    - Lintasan parsial → STANDBY tanpa progress/custody
    - Set lengkap valid → GATE_IN dan progress 100% ✅
    - EPC/arah/gudang mismatch → DENIED, progress tidak berubah ⚠️
      ↓
TAHAP 5 — PIC LAPANGAN: SELESAIKAN DOKUMEN
  Setelah semua barang terbaca (progress 100%),
  PIC Lapangan menyelesaikan dokumen.
  Backend mencatat STOCK_IN per EPC dan mengaktifkan stok
  pada gudang tujuan.
  Status: COMPLETED ✅
```

---

## 2. Alur Barang KELUAR (Outbound)

> Barang keluar dari gudang — **wajib ada persetujuan PM terlebih dahulu**.

```
TAHAP 1 — PM INPUT DOKUMEN KELUAR
  PM membuat Shipping Document (type: outbound)
  Isi dokumen:
    - Jenis barang yang boleh keluar
    - Jumlah masing-masing item
    - Upload file lampiran pendukung
    - Gudang asal
  Status: DRAFT
      ↓
TAHAP 2 — PM APPROVE DOKUMEN KELUAR
  PM approve → barang boleh dikeluarkan sesuai dokumen.
  Tanpa approval PM → barang TIDAK BOLEH keluar.
  Status: APPROVED
      ↓
TAHAP 3 — PIC LAPANGAN: SIAPKAN & TAG BARANG
  PIC Lapangan menyiapkan barang yang akan keluar.
  Assign tag RFID ke setiap item dalam dokumen.
  Tag harus active di gudang asal; assignment tepat expected_qty.
  Status: IN_PROGRESS
      ↓
TAHAP 4 — BARANG LEWAT GATE READER (KELUAR)
  Barang dilewatkan ke gate reader saat keluar gudang.
  Sistem otomatis:
    - Baca EPC setiap tag
    - Cocokkan EPC exact dengan assignment, item, qty, gudang, dan arah OUT
    - Lintasan parsial → STANDBY tanpa progress/custody
    - Set lengkap valid → GATE_OUT dan stok gudang berkurang ✅
    - Mismatch/arah salah/tanpa dokumen → DITOLAK; progress dan stok tetap ⛔
      ↓
TAHAP 5 — PIC LAPANGAN: SELESAIKAN DOKUMEN
  PIC Lapangan menyelesaikan dokumen setelah semua EPC
  assignment terverifikasi oleh gate (100%).
  Status: COMPLETED ✅
```

---

## 3. Status Dokumen

```
DRAFT → APPROVED → IN_PROGRESS → COMPLETED
              ↘
               CANCELLED  (hanya PM / SA, tidak bisa cancel COMPLETED)
```

| Status | Aktor |
|--------|-------|
| `draft` | Dibuat oleh PM |
| `approved` | Disetujui oleh PM |
| `in_progress` | Otomatis saat PIC assign tag pertama |
| `completed` | Diselesaikan oleh PIC |
| `cancelled` | PM / Superadmin |

---

## 4. Hak Akses per Role

### Shipping Document

| Aksi | SA | PM | PIC |
|------|:--:|:--:|:---:|
| Buat dokumen | ✅ | ✅ | ❌ |
| Upload lampiran | ✅ | ✅ | ❌ |
| Approve dokumen | ✅ | ✅ | ❌ |
| Assign RFID tag ke item | ✅ | ✅ | ✅ |
| Scan tag di gate | ✅ | ✅ | ✅ |
| Selesaikan dokumen | ✅ | ❌ | ✅ |
| Cancel dokumen | ✅ | ✅ | ❌ |

### Manajemen Sistem

| Aksi | SA | PM | PIC |
|------|:--:|:--:|:---:|
| Kelola user | ✅ | ❌ | ❌ |
| Kelola perangkat RFID | ✅ | ❌ | ❌ |
| Kelola item / gudang | ✅ | ✅ | ❌ |
| Enrollment tag RFID | ✅ | ✅ | ❌ |
| Lihat laporan | ✅ | ✅ | ✅ |
| Monitor gate live | ✅ | ✅ | ✅ |

---

## 5. Komponen Teknis

### Backend
- **Laravel 13 / PHP 8.3**
- **GateEngineService** — memproses event gate, cocokkan EPC dengan dokumen aktif
- **CustodyService** — catat setiap perpindahan barang ke ledger audit

### Frontend
- **React + Vite**
- Halaman: Dashboard, Shipping Documents, Gate Monitor, Tag Enrollment, User Management, Audit Trail

### Edge Bridge
- **Node.js 20** — jembatan antara hardware RFID reader dan API backend

### Database
- **PostgreSQL**
- Tabel utama: `shipping_documents`, `shipping_document_items`, `shipping_document_tags`, `rfid_tags`, `gate_pass_events`, `custody_ledger`

---

## 6. Modul yang Dihapus

Fitur berikut **tidak sesuai alur bisnis** dan akan dihapus:

- ~~Principal~~ — tidak ada entitas perantara, PM langsung input dokumen
- ~~SPK (Surat Perintah Kerja)~~ — tidak dipakai
- ~~Delivery module~~ — tidak dipakai
- ~~Work Order + BOQ~~ — tidak dipakai
- ~~Return / Retur barang~~ — tidak dipakai
- ~~Approval multi-step template~~ — tidak dipakai

**Alur yang berlaku:** PM buat dokumen → PM approve → PIC tempel tag & lewatkan ke gate → sistem validasi otomatis → PIC complete
