# Alur Sistem MOSA WMS RFID

Penjelasan lengkap alur bisnis dan teknis sistem.

---

## Alur Material Utama

### A. Penerimaan Barang (Inbound)

```
PM buat Dokumen Inbound (draft)
       │
       ▼
PM approve dokumen → status: approved
       │
       ▼
PIC assign tag RFID ke setiap item dokumen
       │
       ▼
Tag inbound harus active tanpa gudang; jumlah assignment
harus tepat sama dengan expected_qty per item
       │
       ▼
Sopir/truk tiba di gate gudang
       │
       ▼
Reader UHF baca tag → Edge Bridge kirim ke backend
       │
       ▼
Backend validasi: EPC assigned, item, qty, gudang,
dan arah IN sesuai?
       │
Mismatch/arah/gudang salah → DENIED, notifikasi;
progress dan custody tidak berubah
       │
       ▼
Muatan parsial valid → STANDBY; EPC diakumulasi,
belum ada progress/custody
       │
       ▼
Set EPC lengkap valid → gate menerima, GATE_IN dicatat,
progress dokumen menjadi 100%
       │
       ▼
PIC menyelesaikan → STOCK_IN dicatat; tag menjadi active
di gudang tujuan; status COMPLETED
```

---

### B. Pengiriman Barang (Outbound)

```
PM buat Dokumen Outbound (draft)
       │
       ▼
PM approve dokumen → status: approved
       │
       ▼
PIC/Storeroom assign tag ke item
Tag harus active di gudang asal; assignment tepat expected_qty
       │
       ▼
Barang dimuat ke kendaraan
       │
       ▼
Kendaraan lewat gate → Reader baca tag
       │
       ▼
Backend: EPC assigned, item, qty, gudang, arah OUT cocok?
       │
Mismatch/arah/gudang salah → DENIED; progress dan stok tetap
       │
       ▼
Muatan parsial valid → STANDBY; EPC diakumulasi,
belum ada progress/custody
       │
       ▼
Set EPC lengkap valid → GATE_OUT, stok gudang berkurang,
progress dokumen menjadi 100%
       │
       ▼
PIC menyelesaikan dokumen → status COMPLETED
```

---

### C. Stock Opname Fisik

```
Petugas bawa handheld scanner ke gudang
       │
       ▼
Scan semua tag yang ada secara fisik
       │
       ▼
Paste daftar EPC ke Stock Opname tab
       │
       ▼
Sistem bandingkan: scan fisik vs saldo buku sistem
       │
   ┌───┴───┐
MATCH   MISMATCH
  │        │
  ▼        ▼
100%   Tampilkan tag
cocok  yang hilang
  │        │
  ▼        ▼
Cetak   Eskalasi ke PM /
BAP     cetak BAP + investigasi
```

---

## Alur Teknis Sistem

```
Browser/PWA
    │  HTTPS + Bearer Token (Sanctum)
    ▼
Laravel API (backend)
    │  Query / Write
    ▼
PostgreSQL DB
    
RFID Reader (HW-VX / RC4 / WZ-Y258)
    │  TCP LAN (port 6000)
    ▼
Edge Bridge (Node.js per gudang)
    │  HTTPS + Device Token
    ▼
Laravel API → validasi gate → custody event

Browser ←── WebSocket (wss://) ──→ Edge Bridge
         Real-time live feed
```

---

## State Machine Dokumen

```
         ┌──────────┐
         │  draft   │◄──── PM buat
         └────┬─────┘
              │ PM approve
              ▼
         ┌──────────┐
         │ approved │
         └────┬─────┘
              │ PIC assign tag
              ▼
         ┌──────────┐
         │ in_process│
         └────┬─────┘
              │ PIC selesaikan
              ▼
         ┌──────────┐
         │completed │
         └──────────┘
         
    (dari mana saja) ──PM/SA cancel──► cancelled
```

---

## State Machine Tag RFID

```
(baru scan) → reserved → active → in_transit → returned → cancelled
```

| Status | Keterangan |
|:-------|:-----------|
| `reserved` | EPC di-generate, belum diaktifkan |
| `active` | Tag aktif di gudang |
| `in_transit` | Tag sedang dalam pengiriman |
| `returned` | Tag dikembalikan |
| `cancelled` | Tag dibatalkan/rusak |

---

## Komponen Sistem

```
┌─────────────────────────────────────────────────┐
│                   MOSA WMS RFID                 │
│                                                 │
│  ┌───────────┐   ┌────────────┐  ┌───────────┐ │
│  │  Frontend │   │  Backend   │  │   Edge    │ │
│  │ React/Vite│◄──│ Laravel 13 │──│  Bridge   │ │
│  │   PWA     │   │  PHP 8.3   │  │  Node 20  │ │
│  └───────────┘   └─────┬──────┘  └─────┬─────┘ │
│                        │               │        │
│                   ┌────▼────┐    ┌─────▼──────┐ │
│                   │Postgres │    │ RFID Reader │ │
│                   │   DB    │    │ UHF TCP LAN │ │
│                   └─────────┘    └────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## Custody Event yang Dicatat

Semua event dicatat di `custody_ledger` (append-only):

| Event | Trigger | Stok berubah? |
|:------|:--------|:-------------|
| `TAG_ENROLLED` | Aktivasi tag baru | Tidak |
| `STOCK_IN` | Barang masuk gudang | Ya (+) |
| `PREPARED` | Barang disiapkan | Tidak |
| `GATE_OUT` | Barang keluar gate | Ya (−) |
| `FIELD_RECEIVED` | Diterima PIC lapangan | Tidak |
| `INSTALLED` | Terpasang di proyek | Tidak |
| `FIELD_RETURN` | Diajukan retur | Tidak |
| `GATE_IN` | Retur masuk gate | Ya (+) |

---

## Keputusan Gate (Fail-Closed)

Gate **ditolak** (terkunci) jika:
- Tidak ada sesi transaksi aktif
- Sesi sudah expired atau terminal
- Device/gudang tidak cocok dengan transaksi
- Arah EPC salah (misal tag out tapi sesi inbound)
- EPC asing (tidak terdaftar dalam dokumen)
- Jumlah tag tidak lengkap (undercount → STANDBY)

Gate **diizinkan** jika:
- Sesi aktif dan valid
- Semua EPC cocok dengan dokumen
- Arah sesuai tipe sesi (OUT_FULFILLMENT / IN_RETURN)
- Jumlah lengkap (full set)
