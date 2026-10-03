# Role & Hak Akses — MOSA WMS RFID

Sistem menggunakan 3 role tetap. Role tidak bisa dikustomisasi per user.

## Definisi Role

| Role | Kode | Tanggung Jawab |
|:-----|:-----|:---------------|
| **Super Administrator** | `superadmin` | Administrasi sistem penuh. Bisa melakukan semua yang PM bisa, ditambah kelola user. |
| **Project Manager** | `pm` | Operasional harian: buat dokumen, approve, master data, laporan. |
| **PIC Lapangan** | `pic_lapangan` | Eksekusi lapangan: assign tag, selesaikan dokumen, scan opname. |

---

## Matriks Hak Akses per Endpoint

### Dokumen Barang

| Aksi | SA | PM | PIC |
|:-----|:--:|:--:|:---:|
| Lihat daftar dokumen | ✅ | ✅ | ✅ |
| Lihat detail dokumen | ✅ | ✅ | ✅ |
| Buat dokumen baru | ✅ | ✅ | ❌ |
| Approve dokumen | ✅ | ✅ | ❌ |
| Assign tag ke dokumen | ✅ | ✅ | ✅ |
| Selesaikan dokumen | ✅ | ❌ | ✅ |
| Batalkan dokumen | ✅ | ✅ | ❌ |
| Upload lampiran | ✅ | ✅ | ❌ |

### Master Data

| Aksi | SA | PM | PIC |
|:-----|:--:|:--:|:---:|
| Lihat katalog material | ✅ | ✅ | ✅ |
| Tambah/edit/hapus material | ✅ | ✅ | ❌ |
| Lihat gudang | ✅ | ✅ | ✅ |
| Tambah/edit gudang | ✅ | ✅ | ❌ |
| Kelola proyek | ✅ | ✅ | ❌ |

### RFID & Gate

| Aksi | SA | PM | PIC |
|:-----|:--:|:--:|:---:|
| Pendaftaran tag (enroll) | ✅ | ✅ | ❌ |
| Lihat daftar tag | ✅ | ✅ | ❌ |
| Monitor gate live | ✅ | ✅ | ✅ |
| Konfigurasi reader/device | ✅ | ✅ | ❌ |
| Pairing device | ✅ | ✅ | ❌ |

### Laporan

| Aksi | SA | PM | PIC |
|:-----|:--:|:--:|:---:|
| Audit Trail (read) | ✅ | ✅ | ✅ |
| Stock Opname | ✅ | ✅ | ✅ |
| Kartu Stok | ✅ | ✅ | ✅ |
| Dashboard KPI | ✅ | ✅ | ✅ |

### Kelola Pengguna

| Aksi | SA | PM | PIC |
|:-----|:--:|:--:|:---:|
| Lihat daftar user | ✅ | ✅ | ✅ |
| Buat user baru | ✅ | ❌ | ❌ |
| Edit user | ✅ | ❌ | ❌ |
| Hapus/nonaktifkan user | ✅ | ❌ | ❌ |

---

## Sidebar per Role

### Super Administrator (7 menu)
```
Dashboard · Dokumen Barang · Pendaftaran Tag · Master Data · RFID Gate · Laporan · Kelola Pengguna
```

### Project Manager (6 menu)
```
Dashboard · Dokumen Barang · Pendaftaran Tag · Master Data · RFID Gate · Laporan
```

### PIC Lapangan (4 menu)
```
Dashboard · Dokumen Barang · RFID Gate · Laporan
```

---

## Implementasi Teknis

Role disimpan di kolom `users.role` (VARCHAR). Validasi dilakukan di:

- **Backend** — method helper di [`User.php`](../backend/app/Models/User.php):
  - `isSuperAdmin()` → role = `superadmin`
  - `isPm()` → role = `pm` atau `superadmin`
  - `isPic()` → role = `pic_lapangan`
  - `isManagement()` → role = `superadmin` atau `pm`
- **Frontend** — filter `navItems` di [`App.jsx`](../frontend/src/App.jsx) berdasarkan `roles[]` array per nav item
- **Middleware** — `auth:sanctum` + role check per controller action
