# Struktur Kode MOSA WMS RFID

Penjelasan struktur folder dan file penting di setiap layer sistem.

---

## Root Project

```
Mosaik-WMS/
├── backend/                # Laravel 13 API
├── frontend/               # React 18 + Vite PWA
├── edge-bridge/            # Node.js 20 Edge
├── docker/                 # Nginx config, Dockerfiles
├── doc/                    # Dokumentasi
├── docker-compose.yml      # Dev/prod macOS/Linux
├── docker-compose.windows-dev.yml
├── docker-compose.windows-production.yml
├── .env                    # Secrets (jangan commit)
├── AGENTS.md               # Aturan AI agent
└── README.md               # Entry point dokumentasi
```

---

## Backend — Laravel 13

```
backend/
├── app/
│   ├── Http/Controllers/Api/
│   │   ├── AuthController.php          # Login, logout, me
│   │   ├── UserController.php          # CRUD user, toggle aktif
│   │   ├── ShippingDocumentController.php # Dokumen barang + assign tag
│   │   ├── TagController.php           # Daftar tag, detail, status
│   │   ├── TagEnrollmentController.php # Enroll tag baru (satuan/batch)
│   │   ├── GateEventController.php     # Terima event dari Edge Bridge
│   │   ├── GateTransactionController.php # Sesi gate, approve/reject
│   │   ├── MasterDataController.php    # Items, warehouses, projects, dll
│   │   ├── ReportController.php        # Dashboard KPI, audit trail, stocks
│   │   ├── FileUploadController.php    # Upload lampiran
│   │   └── DeviceController.php        # Pairing device, status
│   │
│   ├── Models/
│   │   ├── User.php                    # Role helpers: isSuperAdmin, isPm, isPic
│   │   ├── ShippingDocument.php        # Dokumen barang
│   │   ├── ShippingDocumentItem.php    # Item dalam dokumen
│   │   ├── ShippingDocumentTag.php     # Tag yang di-assign ke item
│   │   ├── RfidTag.php                 # Registry tag RFID
│   │   ├── CustodyLedger.php           # Append-only event log
│   │   ├── GateDevice.php              # Reader device
│   │   ├── GateTransaction.php         # Sesi perlintasan gate
│   │   ├── GatePassEvent.php           # Event pembacaan tag
│   │   ├── Warehouse.php               # Gudang
│   │   ├── Item.php                    # Material
│   │   └── ...
│   │
│   ├── Services/
│   │   ├── GateEngineService.php       # Logika validasi gate (fail-closed)
│   │   └── CustodyService.php          # Tulis event custody ledger
│   │
│   └── Http/Middleware/
│       └── (auth:sanctum via route group)
│
├── database/
│   ├── migrations/                     # Semua schema DB
│   └── seeders/
│       └── DemoSeeder.php              # Data demo (superadmin, pm, pic, warehouses, items)
│
├── routes/
│   └── api.php                         # Semua route REST API
│
└── .env                                # DB, APP_KEY, dll
```

---

## Frontend — React 18 + Vite

```
frontend/src/
├── App.jsx                     # Router utama, sidebar nav, auth flow
├── main.jsx                    # Entry point
│
├── pages/
│   ├── Dashboard.jsx           # KPI cards + grafik
│   ├── ShippingDocuments.jsx   # Dokumen barang (buat, approve, assign tag)
│   ├── TagEnrollment.jsx       # Enroll tag RFID (satuan/ziplock)
│   ├── MasterData.jsx          # Master data (5 tab: items, warehouses, dll)
│   ├── RfidGate.jsx            # Wrapper: Monitor Gate + Konfigurasi Reader
│   ├── GateMonitor.jsx         # Monitor perlintasan live
│   ├── DevicePairing.jsx       # Konfigurasi reader, pairing
│   ├── AuditTrail.jsx          # Laporan: Audit Trail + Stock Opname + Kartu Stok
│   ├── StockCard.jsx           # Stok per gudang + kartu mutasi
│   └── UserManagement.jsx      # CRUD user + toggle aktif/nonaktif
│
├── services/
│   ├── api.js                  # Axios instance + semua fungsi API call
│   └── edgeWebSocket.js        # WebSocket ke Edge Bridge (HMAC ticket auth)
│
└── components/
    ├── Toast.jsx               # Notifikasi toast
    ├── ConfirmDialog.jsx       # Dialog konfirmasi
    ├── GlobalLoading.jsx       # Loading bar global
    ├── Portal.jsx              # React portal untuk modal
    ├── ProfileModal.jsx        # Edit profil user
    └── InstallPwaModal.jsx     # Install PWA prompt
```

---

## Edge Bridge — Node.js 20

```
edge-bridge/
├── src/
│   ├── index.js                # Entry point, startup
│   ├── server.js               # WebSocket server + HTTP API
│   ├── readerParser.js         # TCP parser untuk reader UHF
│   ├── gateEngine.js           # Direction engine (A→B = OUT, B→A = IN)
│   ├── batcher.js              # Batch EPC sebelum kirim ke backend
│   ├── offlineQueue.js         # Antrian lokal jika backend tidak tersedia
│   ├── telemetry.js            # Heartbeat, health report
│   └── config.js               # Konfigurasi dari .env
│
├── test/                       # Unit test
└── .env                        # DEVICE_TOKEN, BACKEND_URL, READER_HOST
```

---

## Docker & Nginx

```
docker/
├── nginx/
│   └── default.conf            # Reverse proxy: / → frontend, /api → backend
│
backend/Dockerfile               # PHP 8.3 FPM + extensions
frontend/Dockerfile              # Node 20 build → Nginx static serve
edge-bridge/Dockerfile           # Node 20 runtime
```

---

## File Konfigurasi Penting

| File | Keterangan |
|:-----|:-----------|
| `.env` (root) | DB_PASSWORD, APP_KEY, EDGE_SECRET |
| `backend/.env` | DB host, APP_KEY, Sanctum, storage |
| `edge-bridge/.env` | DEVICE_TOKEN, BACKEND_URL, READER_HOST, READER_PORT |
| `docker-compose.yml` | Service definitions, port mapping, volumes |
| `docker/nginx/default.conf` | Routing `/api` → PHP-FPM, `/` → static |
| `backend/routes/api.php` | **Source of truth** semua REST endpoint |
| `backend/database/migrations/` | **Source of truth** schema DB |

---

## Alur Data Lengkap

```
User → browser (React PWA)
     → HTTP POST /api/shipping-documents (Sanctum token)
     → ShippingDocumentController@store
     → validate() → DB::transaction()
     → ShippingDocument::create()
     → return JSON 201

RFID Reader → TCP → Edge Bridge
           → parse EPC batch
           → POST /api/gate/event (device token)
           → GateEventController@handle
           → GateEngineService::evaluate()
           → CustodyService::recordEvent()
           → custody_ledger INSERT (append-only)
           → WebSocket push → browser live feed
```
