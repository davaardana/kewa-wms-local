# RFID Flow — Mosaik WMS
VPS: `dava@206.237.98.48 -p 2210` | RFID Reader (LAN gudang): `192.168.2.200:2022` | Edge Bridge: PC lokal gudang

> **Known VPS State (Oktober 2026 — update 30 Oct):**
> - DB: 1 gate device `GATE-01` (`warehouse_id=1`, `edge_ws_url=ws://192.168.9.254:2078/`) — IP PC lokal 192.168.9.254 ✅
> - Tag terdaftar: **2 EPC** — E28069150000402D4160D5F2, E28069150000402D4160B9F2 — keduanya status=active, last_warehouse_id=null
> - `CACHE_STORE=database` (PostgreSQL) | `QUEUE_CONNECTION=database` | Queue: `broadcasts,default`
> - Tidak ada service Redis di `docker-compose.yml` — pakai database cache
> - Optimizations deployed: **Rec-1** (skip LAN IP di curl fallback), **Rec-3** (sighting bypass queue)
> - **Rec-Fix-Outbound** (Oktober 2026): `ShippingDocumentController` + `GateEngineService` diperbaiki — outbound kini validasi tag `attached`, GATE_OUT reset tag ke `active`+`last_warehouse_id=null`; FE `ShippingDocuments.jsx` diperbarui (empty-state outbound)
> - Pending: **Rec-4** Redis — butuh tambah service redis ke `docker-compose.yml` dulu
> - **Reader fisik aktif** — live test end-to-end sudah berjalan: reader 192.168.2.200:2022 → edge bridge → VPS sighting 200 OK ✅
> - **Fix-Routes (Oktober 2026):** `GET /api/edge/events` dan `GET /api/enrollment/stream` ditambahkan ke `routes/api.php` — edge-bridge kini terhubung SSE tanpa 404
> - **Fix-Models (Oktober 2026):** `Item`, `RfidTag`, `ShippingDocumentTag` — kolom `is_length_based`, `remaining_length_m`, `total_length_m`, `length_dispatched` ditambahkan ke `$fillable` + `$casts`
> - **Fix-Partial (Oktober 2026):** `GateEngineService` + `CustodyService` + `ShippingDocumentController` — partial withdrawal drum kabel sekarang **fully implemented**: 7/7 test pass
> - **Fix-ALLOW_HYBRID (30 Oct 2026):** VPS `.env` `ALLOW_HYBRID_DEVICE=true` ditambahkan — device `hybrid_workstation` kini tampil di FE enrollment device picker ✅
> - **Fix-Heartbeat-Validation (30 Oct 2026):** `DeviceTelemetryController::heartbeat()` — `reader_status` allowlist ditambah `connected`+`paired`; `reader_last_response_at`/`reader_status_changed_at` diubah ke `nullable|string|max:50` untuk terima epoch-ms maupun ISO8601 ✅
> - **VPS edge-bridge container** juga berjalan di VPS (ENABLE_DIRECT_READER=false, API_BASE_URL=http://nginx/api) — tidak punya reader fisik, hanya jaga SSE reverse channel ke VPS. Edge lokal PC gudang yang baca reader dan kirim sighting ke VPS.
> - **WS_ALLOWED_ORIGINS VPS:** `http://206.237.98.48,...` — browser dari VPS URL bisa connect WS ke edge lokal `ws://192.168.9.254:2078/` ✅

---

## Alur Singkat

```
RFID Reader (192.168.2.200:2022)
    → [TCP LAN] → Edge Bridge (PC gudang)
        → [HTTPS] → VPS Backend (206.237.98.48)
            → [SSE] → Browser user
```

**Local → VPS:** Edge Bridge di PC gudang baca data reader lewat TCP, lalu kirim ke VPS via HTTPS POST.

**VPS → Local:** VPS kirim perintah balik ke Edge Bridge via SSE (`GET /api/edge/events`), Edge Bridge teruskan ke browser lewat WebSocket lokal.

---

> **Source of truth:** kode aktual di `edge-bridge/src/index.js`, `edge-bridge/src/apiClient.js`,
> `backend/routes/api.php`, `backend/app/Http/Controllers/Api/EdgeStreamController.php`,
> `backend/app/Http/Controllers/Api/EnrollmentStreamController.php`,
> `backend/app/Http/Controllers/Api/GateEventController.php`,
> `backend/app/Http/Controllers/Api/ShippingDocumentController.php`,
> `backend/app/Services/GateEngineService.php`,
> `frontend/src/pages/TagEnrollment.jsx`, `frontend/src/pages/GateMonitor.jsx`,
> `frontend/src/pages/ShippingDocuments.jsx`.
>
> Snapshot: Oktober 2026. Label status: **IMPLEMENTED** / **PARTIAL** / **PLANNED**.

---

## Daftar Isi

1. [Gambaran Umum](#1-gambaran-umum)
2. [Komponen & Protokol](#2-komponen--protokol)
3. [Alur 1 — Tag Enrollment (Pendaftaran Tag)](#3-alur-1--tag-enrollment-pendaftaran-tag)
4. [Alur 2 — Gate Event INBOUND (Barang Masuk)](#4-alur-2--gate-event-inbound-barang-masuk)
5. [Alur 3 — Gate Event OUTBOUND (Barang Keluar)](#5-alur-3--gate-event-outbound-barang-keluar)
6. [Heartbeat & Device Health](#6-heartbeat--device-health)
7. [Channel Perintah: VPS ke Edge (SSE Reverse Channel)](#7-channel-perintah-vps-ke-edge-sse-reverse-channel)
8. [Transport Browser: WS LAN vs SSE VPS Fallback](#8-transport-browser-ws-lan-vs-sse-vps-fallback)
9. [Enrollment SSE Relay (Browser Luar LAN)](#9-enrollment-sse-relay-browser-luar-lan)
10. [Gate SSE Stream (GateMonitor)](#10-gate-sse-stream-gatemonitor)
11. [Nginx — Konfigurasi SSE & Routing](#11-nginx--konfigurasi-sse--routing)
12. [Docker — Topologi Kontainer](#12-docker--topologi-kontainer)
13. [Queue Worker — Async Broadcast](#13-queue-worker--async-broadcast)
14. [Batch Timing & Optimistic Local Decision (Gate)](#14-batch-timing--optimistic-local-decision-gate)
15. [Offline Queue & Retry](#15-offline-queue--retry)
16. [Autentikasi & Token](#16-autentikasi--token)
17. [Diagram Ringkas](#17-diagram-ringkas)
18. [Troubleshooting](#18-troubleshooting)
19. [Alur 4 — Shipping Document (RFID ke Progress Halaman)](#19-alur-4--shipping-document-rfid-ke-progress-halaman)
20. [Deployment Info & Build Guide](#20-deployment-info--build-guide)
21. [Audit Logger — Local Forensic Trail (Edge)](#21-audit-logger--local-forensic-trail-edge)
22. [MeshSync — Multi-Edge LAN Sync](#22-meshsync--multi-edge-lan-sync)
23. [Device Pairing & Reader Optimization](#23-device-pairing--reader-optimization)
24. [Environment Variables Lengkap (Edge Bridge)](#24-environment-variables-lengkap-edge-bridge)
25. [Alur 5 — Partial Withdrawal (Drum Kabel / Length-Based Item)](#25-alur-5--partial-withdrawal-drum-kabel--length-based-item)
26. [Optimization Changelog](#26-optimization-changelog)
27. [Tag-to-VPS Checklist & Known Issues](#27-tag-to-vps-checklist--known-issues)
28. [Database Schema Reference](#28-database-schema-reference)
29. [REST API Quick Reference](#29-rest-api-quick-reference)
30. [Role & Permission per Endpoint RFID](#30-role--permission-per-endpoint-rfid)
31. [State Machine Tag RFID](#31-state-machine-tag-rfid)

---

## 1. Gambaran Umum

RFID reader fisik berada di **jaringan LAN gudang** (tidak bisa diakses langsung dari internet).
Browser pengguna bisa berada di LAN yang sama **atau** di luar (akses VPS via HTTPS).

**Solusi arsitektur:**
- Edge Bridge di PC lokal LAN membaca reader via TCP, kirim ke VPS via HTTPS.
- Browser di LAN bisa langsung `ws://EDGE_IP:2078/` untuk real-time.
- Browser di luar LAN fallback ke SSE VPS: `/api/gate/stream` (GateMonitor) atau `/api/enrollment/stream` (TagEnrollment).
- VPS push perintah balik ke Edge via SSE reverse channel `/api/edge/events` — tanpa perlu tahu IP edge, bekerja di balik NAT.

**⚠️ Penting — Dua jenis POST dari Edge ke VPS, perilaku BERBEDA:**

| Jenis | Endpoint | VPS handler | Queue? | Latensi |
|---|---|---|---|---|
| **Tag sighting** (tiap tag terdeteksi) | `POST /api/gate/sighting` | `handleTagSighting()` | ❌ **Tidak** — langsung cache | < 5ms |
| **Gate event** (batch akhir, arah confirmed) | `POST /api/gate/event` | `handleGateEvent()` | ✅ Ya — `BroadcastToEdgeBridgeJob` | async |

> `handleTagSighting()` **tidak memanggil `notifyEdgeBridge()` dan tidak dispatch ke queue**.
> Dia langsung tulis dua cache key: `edge_sse_event:{deviceId}` (PATH 1) dan `enrollment_last_tag:{wh}` (PATH 2).
> `notifyEdgeBridge()` hanya dipanggil dari `handleGateEvent()` untuk GATE_EVENT dan TAG_READ konfirmasi.

---

## 2. Komponen & Protokol

| Komponen | Lokasi | Protokol masuk | Protokol keluar |
|---|---|---|---|
| **RFID Reader** (EL-UHF-RC4 / HW-VX) | LAN Gudang `192.168.2.200:2022` | — | TCP binary (EL-UHF-RC4 v1.1) |
| **Edge Bridge** (`index.js`, Node.js) | PC Lokal Gudang | TCP dari reader + WS dari browser LAN | HTTPS POST ke VPS; WS broadcast ke browser |
| **Nginx** | VPS container `mosa-nginx` | HTTP :80 | FastCGI ke PHP-FPM; static `dist/` |
| **Backend** (Laravel PHP-FPM) | VPS container `mosa-backend` | FastCGI dari Nginx | PostgreSQL; Cache (file); Queue |
| **Queue Worker** (`queue:work`) | VPS container `mosa-queue-worker` | DB queue jobs | Cache write; curl ke edge (fallback) |
| **PostgreSQL** | VPS container `mosa-postgres` `:5433` | TCP | — |
| **Browser** | Mana saja | HTTPS ke VPS / WS ke Edge | — |

**Port edge-bridge:**

| Port | Fungsi |
|---|---|
| `:2077` | TCP Server — RFID reader push ke edge (Antena A) |
| `:2079` | TCP Server — RFID reader push ke edge (Antena B) |
| `:2078` | WebSocket Server — browser LAN koneksi real-time |

---

## 3. Alur 1 — Tag Enrollment (Pendaftaran Tag)

**IMPLEMENTED**

### Tujuan
Menghubungkan EPC fisik pada tag RFID ke record `Item` di database. Tag yang belum terdaftar tidak akan dikenali oleh gate engine.

### Prasyarat
- User login sebagai `superadmin` atau `pm`.
- Halaman `TagEnrollment.jsx` terbuka di browser.
- RFID reader terhubung ke edge bridge.
- Warehouse dipilih.

---

### 3a. Setup Koneksi — Browser ke Edge Bridge

```
Browser (TagEnrollment.jsx)
  │
  ├─ 1. GET /api/devices?warehouse_id=X&handheld_eligible=1
  │       → Backend kembalikan list device aktif
  │         (role: enrollment_desktop / gate_controller / hybrid_workstation)
  │
  ├─ 2. User pilih device dari dropdown
  │
  └─ 3. openAuthenticatedEdgeSocket(warehouseId, commands, handlers, deviceId)
           │
           ├─ POST /api/ws-control-ticket
           │   payload: { warehouse_id, commands:['SET_MODE','READ_STATUS'], device_id }
           │   Backend buat HMAC-signed ticket (JWT-like v2, TTL 60s)
           │   response: { ticket, edge_ws_url:"ws://IP_EDGE:2078/", warehouse_id, device_id }
           │
           └─ new WebSocket(edge_ws_url)  → Browser buka WS ke edge bridge lokal
                onopen: send { action:"AUTH", ticket }
                edge verifyWsControlTicket → cek HMAC, claims v2, jti replay, TTL
                edge reply { type:"AUTH_OK" }
                browser handler onAuthenticated(socket) dipanggil
```

**Jika WS gagal (browser di luar LAN):**
- `connectTimer` 5 detik habis → `socket.close()` dipaksa.
- Handler `onClose/onError` di `TagEnrollment.jsx` → `openEnrollmentSseStream()` diaktifkan sebagai fallback.

---

### 3b. Aktivasi Mode Enrollment di Edge

```
Browser (sudah auth)
  └─ send { action:"SET_MODE", mode:"ENROLLMENT" }   via WS
        │
        └─ Edge index.js:
             ├─ enrollmentModeClients.add(ws)
             ├─ enrollmentPreviousMode = operationalMode  ('GATE_SECURITY')
             └─ _setOperationalMode('ENROLLMENT')
                  broadcast { type:'MODE_CHANGED', mode:'ENROLLMENT' } ke semua WS client
```

**Efek mode ENROLLMENT:**
- `_dedupThreshold` turun: 1000ms → **300ms** (tag baru lebih cepat terdeteksi).
- `_dispatchBatch` mode ENROLLMENT → **mute gate evaluation** (tidak ada POST /api/gate/event, tidak ada relay lock/unlock).
- Tag scan hanya di-broadcast sebagai `TAG_READ` tanpa efek pintu fisik.

---

### 3c. Pembacaan Tag RFID oleh Edge

```
Reader RFID (TCP 192.168.2.200:2022)
  └─ binary frame → Rc4Parser / UniversalParser
       frame.epc, frame.rssi, frame.antenna
          │
          └─ onTagDetected(epc, antenna, rssi)
               ├─ Update _tagStats (totalReads, uniqueEpcsEver, minuteReads)
               ├─ _updateTagHealth(epc, rssi)  ← tag health monitor
               │
               ├─ Dedup broadcast (threshold beda per mode):
               │   GATE_SECURITY: 1000ms threshold
               │   ENROLLMENT:    300ms threshold
               │
               │   jika belum di-broadcast dalam threshold:
               │     broadcast { type:'TAG_READ', epc, antenna, rssi, gate_id,
               │                 warehouse_id, operational_mode, timestamp }
               │     api.sendTagSighting(epc, antennaNr, rssi)
               │         POST /api/gate/sighting (timeout 2500ms) — SELALU dipanggil
               │         di semua mode (GATE_SECURITY maupun ENROLLMENT)
               │
               │   jika dalam window 200ms–threshold (belum TAG_READ):
               │     broadcast { type:'TAG_SIGHTING', epc, rssi, gate_id,
               │                 warehouse_id, timestamp }
               │     (lighter event, untuk instant FE feedback)
               │
               └─ _accumulateBatch tidak dipanggil di mode ENROLLMENT
```

---

### 3d. SSE Relay untuk Browser Luar LAN

```
api.sendTagSighting() → POST /api/gate/sighting
  └─ GateEventController::handleTagSighting()  [Rec-3: no queue]
       ├─ PATH 1 — SSE ke edge bridge:
       │    GateDevice::where(warehouse_id)->pluck('id')
       │    EdgeStreamController::pushToDevice(id, 'broadcast', payload)
       │      → Cache::put("edge_sse_event:{deviceId}", {type,data}, TTL 60s)
       │      → EdgeStreamController::stream() pull → emit SSE ke edge
       │      → Edge _onVpsEvent('broadcast') → broadcast ke WS clients LAN
       │
       └─ PATH 2 — Enrollment SSE relay (browser luar LAN):
            Cache::put("enrollment_last_tag:{warehouseId}", {
                epc, antenna, rssi, gate_id, warehouse_id,
                timestamp, received_at  (microsecond precision)
            }, TTL 30s)

Browser luar LAN (fetch SSE):
  GET /api/enrollment/stream?warehouse_id=X
  Authorization: Bearer <token>
    └─ EnrollmentStreamController::stream()
         Kirim "retry: 3000\n\n" ke browser (reconnect hint 3 detik)
         Loop polling setiap 100ms:
           Cache::get("enrollment_last_tag:{warehouseId}")
           jika tag ada:
             jika tag.epc !== lastTagEpc:
               reset lastReceivedAt = null  ← tag baru, paksa push
             jika tag.received_at !== lastReceivedAt:
               lastTagEpc = tag.epc
               lastReceivedAt = tag.received_at
               emit "event: tag_read\ndata: {...}\n\n"
         Heartbeat setiap 15s: ": heartbeat {time}\n\n"
         Max 55s → emit "event: reconnect\ndata:{reason:'scheduled'}"
                  → browser reconnect otomatis
```

> **Catatan detail push logic:** Controller cek perubahan **EPC** terlebih dahulu. Jika EPC berganti
> (tag baru terdeteksi), `lastReceivedAt` di-reset ke `null` agar push terjadi meski `received_at`
> belum berubah sejak reset. Ini mencegah tag baru terblokir oleh state EPC lama.

---

### 3e. Enroll ke Database

```
Browser menerima { type:'TAG_READ', epc, antenna, rssi }
  TagEnrollment.jsx:
    setLiveScannedTag() → UI update "Tag Terdeteksi: E200..."
    Ziplock mode: ziplockEpcs.push(epc)
    Single mode: enrollForm.epc = epc

User klik "Submit Enrollment":
  POST /api/tags/enroll
    { item_id, warehouse_id, tag_type, epc_list:[...], notes }
      └─ RfidTagController::enroll()
           validasi role superadmin/pm
           DB::transaction:
             RfidTag::upsert(rows, uniqueBy:['epc'])   ← bulk insert/update
             CustodyLedger::insert(custodyRows)          ← bulk audit TAG_ENROLLED
           response 201: { enrolled:N, updated:M, tags:[...] }
```

Tag status = `active`. Siap digunakan di gate.

---

### 3f. Restore Mode setelah Enrollment

```
Browser tutup → WS close → _releaseEnrollmentModeClient(ws)
  enrollmentModeClients.delete(ws)
  jika enrollmentModeClients.size === 0:
    enrollmentModeRestoreTimer = setTimeout(
      () => _setOperationalMode(enrollmentPreviousMode || 'GATE_SECURITY'),
      8000ms  ← grace period
    )
```

Grace 8 detik mencegah gate aktif kembali saat halaman di-refresh.

---



## 4. Alur 2 — Gate Event INBOUND (Barang Masuk)

**IMPLEMENTED**

### Konteks
Material datang dari luar, melintas gerbang masuk gudang. Arah fisik: Antena B (luar) ke Antena A (dalam).

### Prasyarat
- Shipping Document bertipe `inbound` status `approved` atau `in_progress`.
- Tag EPC sudah di-assign ke shipping document.
- Edge bridge mode `GATE_SECURITY`. `gateMode = DUAL_ANTENNA_AUTO` atau `SINGLE_ANTENNA_SESSION`.

---

### 4a. Deteksi Arah INBOUND

```
Material masuk melewati gerbang
  │
  ├─ Antena B (sisi LUAR) baca tag pertama
  │   directionEngine.processTagRead(epc,'B',rssi) → { completed:false }
  │
  └─ Antena A (sisi DALAM) baca tag kemudian (window 300ms-4000ms)
      directionEngine.processTagRead(epc,'A',rssi)
      → { completed:true, direction:'B_TO_A', timeDeltaMs, epc, rssiTrend }

  Arah B→A = MASUK (IN)
  _accumulateBatch(epc, 'IN', rssi)
```

**Mode SINGLE_ANTENNA_SESSION:**
```
Hanya 1 antena. DirectionEngine TIDAK dipakai untuk menentukan arah.
Setiap tag read langsung masuk batch — arah ditentukan dari tipe dokumen:
  authorizedDocument.type==='inbound'  → _accumulateBatch(epc, 'IN', rssi)
  authorizedDocument.type==='outbound' → _accumulateBatch(epc, 'OUT', rssi)

  Syarat: gateMode==='SINGLE_ANTENNA_SESSION' && authorizedDocument !== null
  Jika authorizedDocument null → GATE_FAIL_CLOSED (tidak ada sesi aktif)
```

---

### 4b. Batch Accumulation

```
_accumulateBatch(epc, 'IN', rssi):
  batchCollector.eventId = crypto.randomUUID()   (jika belum ada)
  batchCollector.deadlineTimer = setTimeout(_queueDispatch, BATCH_DEADLINE_MS)
  batchCollector.tags.set(epc, { rssi, count:1, firstSeen })
    jika EPC sudah ada: count++, rssi = max(existing, new)
  clear idleTimer lama, set baru:
    batchCollector.timer = setTimeout(_queueDispatch, BATCH_IDLE_MS)
  jika tags.size >= maxBatchSize(100) → _queueDispatch() segera
```

**Trigger dispatch:** idle `BATCH_IDLE_MS`, atau deadline `BATCH_DEADLINE_MS`, atau 100 tag, atau conflict arah.

---

### 4c. Optimistic Local Gate Decision

```
_dispatchBatch():
  mode ENROLLMENT → return (mute)

  cache.evaluateOptimistic(detectedEpcs)
    cek _authorizedDocCache (EPC Set, TTL 5 menit dari syncGateConfig)
    return { unlock, mismatch, reason, source:'local_cache' }

  jika cache valid → relay.unlock() SEGERA (< 50ms)
    broadcast { type:'GATE_DECISION', status:'OPTIMISTIC_LOCAL', unlock_gate }
  concurrent: lanjut POST ke VPS (timeout 6000ms)

  Jika VPS response berbeda dari optimistic → relay dikoreksi (override)
  broadcast { type:'GATE_DECISION', status:'VPS_CONFIRMED', unlock_gate }
```

> **Catatan relay:** `relay.unlock()` saat ini adalah **logika software saja** (state `isUnlocked=true`).
> Belum ada hardware adapter GPIO/serial terpasang. Log: *"Logical UNLOCK only; no hardware adapter configured."*
> `UNLOCK_DURATION_MS` (default 5000ms, env `UNLOCK_DURATION_MS`) — relay auto-lock kembali setelah 5 detik.
> Setiap perubahan status relay → broadcast `{ type:'RELAY_STATUS', status:'unlocked'/'locked' }` ke semua WS clients.

---

### 4d. POST ke VPS Backend

```
Edge → POST /api/gate/event
  Authorization: Bearer <DEVICE_API_TOKEN>
  Body: {
    warehouse_id, gate_id, event_id (UUID), observed_at,
    antenna_sequence:"B_TO_A",
    epc_list:[{ epc, rssi, read_count, first_seen }, ...],
    cctv_snapshot_path, shipping_document_id,
    raw_payload: { timestamp, total_tags, device, mode }
  }

Nginx :80 → PHP-FPM backend:9000
GateEventController::handleGateEvent()
  auth.device: cek DEVICE_API_TOKEN di gate_devices
  throttle:gate-events
  Merge warehouse_id, gate_id dari device record (bukan payload)
  Normalize epc_list uppercase, trim, filter empty
  Validate event_id UUID, antenna_sequence, epc hex
  GateEngineService::processGateEvent(validated, device)
```

---

### 4e. Gate Engine — Pemrosesan INBOUND

```
GateEngineService::processGateEvent() — DB::transaction:

  1. Idempotency: cek event_id duplikat → return stored decision jika replay
  2. Device binding: validasi warehouse_id, device_code, is_active
  3. Arah: antenna_sequence='B_TO_A' → direction='IN'
  4. RfidTag::whereIn(epc_list)->lockForUpdate()
  5. ShippingDocument: type='inbound', status approved/in_progress, prioritas
  6. EPC validation → mismatch_flag jika ada EPC tidak dikenal/tidak di-assign
     Semua match → unlock_gate=true, status='SUCCESS'
  7. INSERT gate_pass_events {
       event_id, gate_device_id, warehouse_id, shipping_document_id,
       direction='IN', antenna_sequence='B_TO_A',
       epc_list (JSON), total_tags_detected, cumulative_epcs (JSON),
       is_valid, mismatch_flag, mismatch_details, decision_result_json,
       cctv_snapshot_path, observed_at
     }
  8. recordGateCustody() jika dokumen match:
       custodyService.recordEvent(itemId, userId, 'GATE_IN', epc)
       ShippingDocumentTag.update(status='scanned', scanned_at=now)
       ShippingDocumentItem.increment('scanned_qty')
       RfidTag.update(status='attached', last_warehouse_id=warehouseId)
       shippingDoc.status → 'in_progress'
```

---

### 4f. Notifikasi Balik ke Edge & Browser

```
GateEventController setelah processGateEvent:
  notifyEdgeBridge({ type:'GATE_EVENT', direction:'IN', unlock_gate, status })
  foreach epc: notifyEdgeBridge({ type:'TAG_READ', epc, antenna:2, direction:'IN' })
  return JSON ke edge: { unlock_gate, status, direction, shipping_match }

notifyEdgeBridge() → BroadcastToEdgeBridgeJob (queue worker):
  PATH 1 PRIMARY:
    Cache::put("edge_sse_event:{deviceId}", { type:'broadcast', data }, TTL 60s)
    EdgeStreamController::stream() pull → emit SSE ke edge
    Edge _onVpsEvent('broadcast') → broadcast ke WS clients
  PATH 2 FALLBACK:
    curl POST edge_ws_url/broadcast (TIMEOUT 1200ms, jika edge_ws_url configured)

Edge terima response POST /api/gate/event:
  unlock_gate=true  → relay.unlock() (VPS confirmation)
  unlock_gate=false → relay.lock()
  broadcast { type:'GATE_DECISION', status:'VPS_CONFIRMED', unlock_gate }
```

---

### 4g. Tampilan di GateMonitor.jsx

```
Browser GateMonitor.jsx:
  PATH A — WS LAN (dalam LAN):
    ws://EDGE_IP:2078/ → terima broadcast GATE_DECISION, TAG_READ
    setEvents() → UI update real-time

  PATH B — SSE VPS (luar LAN):
    GET /api/gate/stream?warehouse_id=X&since_id=Y
    GateEventController::stream() poll DB tiap 1.5s:
      SELECT gate_pass_events WHERE id > lastId
      emit "event: gate_event\ndata:[...]\n\n"
    EventSource → append row ke tabel, badge Sesuai/Anomali
```

---


## 5. Alur 3 — Gate Event OUTBOUND (Barang Keluar)

**IMPLEMENTED**

### Konteks
Material keluar dari gudang. Arah fisik: Antena A (dalam) ke Antena B (luar).
Alur identik dengan INBOUND kecuali arah, tipe dokumen, dan efek custody.

---

### 5a. Deteksi Arah OUTBOUND

```
Material keluar:
  Antena A (DALAM) baca pertama → directionEngine: { completed:false }
  Antena B (LUAR)  baca kemudian → { completed:true, direction:'A_TO_B' }

  Arah A→B = KELUAR (OUT)
  _accumulateBatch(epc, 'OUT', rssi)
```

---

### 5b. Perbedaan Payload & Gate Engine OUTBOUND

```
POST /api/gate/event: antenna_sequence:"A_TO_B"

GateEngineService — OUTBOUND:
  direction = 'OUT'
  ShippingDocument: type='outbound', status approved/in_progress
  EPC validation: sama dengan INBOUND

  recordGateCustody() jika match:
    custodyService.recordEvent(itemId, userId, 'GATE_OUT', epc)
    ShippingDocumentTag.update(status='scanned')
    ShippingDocumentItem.increment('scanned_qty')
    RfidTag.update(last_warehouse_id=null)   ← tag keluar, clear warehouse
    shippingDoc.status → 'in_progress'
```

---

### 5c. Ringkasan INBOUND vs OUTBOUND

| Aspek | INBOUND | OUTBOUND |
|---|---|---|
| Arah antena | B ke A | A ke B |
| `antenna_sequence` | `B_TO_A` | `A_TO_B` |
| `direction` DB | `IN` | `OUT` |
| Tipe dokumen | `inbound` | `outbound` |
| Tag setelah | `attached`, `last_warehouse_id=X` | `last_warehouse_id=null` |
| Custody action | `GATE_IN` | `GATE_OUT` |

Broadcast, queue, SSE path — identik dengan §4f–§4g.

---

## 6. Heartbeat & Device Health

**IMPLEMENTED**

```
Edge setInterval(_dispatchHeartbeat, HEARTBEAT_INTERVAL_MS=10000ms):
  POST /api/devices/heartbeat  (auth.device)
  payload metrics: uptime_seconds, heap_used_mb,
    active_tcp_connections, offline_buffer_count,
    reader_status, reader_error, relay_status,
    total_reads_since_boot, unique_epcs_since_boot,
    reads_last_minute, unique_epcs_last_minute,
    direction_engine_tracked, tag_health_tracked

VPS DeviceTelemetryController::heartbeat():
  GateDevice.update({ status:'online', last_heartbeat_at:now(), metrics_json })
  Computed offline: last_heartbeat_at > internet_downtime_tolerance_seconds

Debounce: _setReaderStatus() → jika now-lastHeartbeat >= 5s → _dispatchHeartbeat()
  Mencegah cascade heartbeat saat reader flapping.

Watchdog (setInterval 1s):
  directionEngine.cleanupExpired()
  Jika directReaderSocket null & tidak ada reconnectTimer → connectDirectReader()
  Jika socket aktif & idle >= 30s (lastTagSeenAt) → kirim START_INVENTORY ke reader
    (keepalive idle; bukan watchdog yang kirim inventory command tiap detik —
     idle timer per-socket IDLE_INTERVAL_MS=15000ms juga kirim inventory secara mandiri)
  Prune wsAuthFailureMap & lastTagBroadcastAt (TTL 5 menit)

TCP reconnect strategy (connectDirectReader):
  Base delay 1500ms, max 15000ms, jitter random
  directReaderRetryCount tracking — setiap 5x gagal → log WARNING
```

Health incidents (reader disconnected/unresponsive): `POST /api/devices/incidents` → tabel `device_health_incidents`.

### Peta Lengkap Heartbeat & Keep-alive Antar Layer

```
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER              ARAH                MEKANISME           INTERVAL    │
├─────────────────────────────────────────────────────────────────────────┤
│  Edge → VPS         POST HTTPS          /api/devices/        10s        │
│  (device health)                        heartbeat            (HEARTBEAT  │
│                                         metrics JSON         _INTERVAL_MS│
├─────────────────────────────────────────────────────────────────────────┤
│  VPS → Edge         SSE comment         ": heartbeat         20s        │
│  (SSE keep-alive)   via /api/edge/      {time}\n\n"                     │
│                     events              (cegah Nginx/proxy              │
│                                         timeout idle)                   │
├─────────────────────────────────────────────────────────────────────────┤
│  VPS → Browser      SSE comment         ": heartbeat         15s        │
│  (Enrollment SSE)   via /api/           {time}\n\n"                     │
│                     enrollment/stream                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  VPS → Browser      SSE event           "event: ping\n\n"   setiap     │
│  (Gate SSE)         via /api/gate/      (bukan comment,      loop 1.5s  │
│                     stream              full SSE event)                 │
├─────────────────────────────────────────────────────────────────────────┤
│  Browser → Edge     WS command          { type:'PING' }      manual /   │
│  (WS LAN)           via ws://EDGE:2078  ← { type:'PONG' }   on-demand  │
│                                         (aplikasi level,               │
│                                          bukan WS protocol             │
│                                          ping frame)                   │
├─────────────────────────────────────────────────────────────────────────┤
│  Edge → Reader      TCP binary          START_INVENTORY      idle ≥30s  │
│  (TCP keepalive)    via socket          command              (watchdog)  │
│                                         + per-socket idle   + 15s      │
│                                         timer mandiri        (IDLE_     │
│                                                              INTERVAL_MS│
└─────────────────────────────────────────────────────────────────────────┘
```

**Kenapa SSE perlu heartbeat comment?**
Nginx (`fastcgi_read_timeout 120s`) dan proxy/load balancer akan menutup koneksi TCP yang idle.
SSE comment (`: heartbeat`) adalah byte yang dikirim tanpa trigger event di browser/edge — cukup untuk reset idle timer di Nginx tanpa mempengaruhi logika aplikasi.
Semua SSE route sudah di-set `fastcgi_buffering off` agar comment langsung flush ke client tanpa buffering.

**Max lifetime SSE (55s) → reconnect:**
Semua SSE stream (edge/events, enrollment/stream, gate/stream) dibatasi max **55 detik** lalu controller emit `event: reconnect` atau break loop.
Browser/edge reconnect otomatis. Ini mencegah PHP worker zombie dan memastikan config fresh saat reconnect.



---

## 7. Channel Perintah VPS ke Edge (SSE Reverse Channel)

**IMPLEMENTED**

```
Edge startup → api.openEventStream(callback)
  GET /api/edge/events  (auth.device, long-lived, tidak kena throttle)
  EdgeStreamController::stream():
    Emit "event: config\ndata:{device, authorized_document, gate_mode, epc_list}\n\n"

    Loop 400ms (usleep 400_000):
      event = Cache::pull("edge_sse_event:{device_id}")
      jika ada → emit "event: {type}\ndata:{data}\n\n"
    Heartbeat setiap 20s: ": heartbeat {time}\n\n"
    Max 55s → emit "event: reconnect\ndata:{reason:'scheduled_reconnect',retry_ms:100}"
              → edge reconnect otomatis

Edge SSE reconnect strategy (openEventStream):
  Jika SSE putus / reconnect event diterima:
    delay = min(1000ms × 1.5^retryCount + random(0-500ms), 30000ms)
    retryCount++ (reset ke 0 saat koneksi sukses)
    Bukan reconnect langsung 100ms — exponential backoff, max 30s

  Config juga disync secara periodic via HTTP polling:
    syncGateConfig() setiap CONFIG_SYNC_INTERVAL_MS (default 10000ms)
    GET /api/devices/config → authorized_document, epc_list, gate_mode
    In-memory cache TTL 1.5s (_configCache) mencegah burst request
    SSE 'config' event → invalidate cache → fetch ulang config

Edge _onVpsEvent():
  'config'    → update gateMode, authorizedDocument, cache.setAuthorizedDoc()
  'broadcast' → this.broadcast(data) ke semua WS clients
  'heartbeat' → no-op

BroadcastToEdgeBridgeJob::pushToDevice():
  Cache::put("edge_sse_event:{deviceId}", { type, data }, TTL 60s)
```

Nginx: `fastcgi_buffering off; gzip off; fastcgi_read_timeout 120;` untuk semua SSE routes.

---

## 8. Transport Browser: WS LAN vs SSE VPS Fallback

**IMPLEMENTED**

```
Browser buka halaman:
  1. Coba WS ke Edge:
     openAuthenticatedEdgeSocket()
       POST /api/ws-control-ticket → ticket + edge_ws_url
       new WebSocket(edge_ws_url)
       connectTimer 5s: jika belum OPEN → socket.close() → fallback

  2. Jika WS gagal:
     GateMonitor   → GET /api/gate/stream (SSE VPS)
     TagEnrollment → openEnrollmentSseStream() (SSE VPS)
```

Ticket WS: HMAC-SHA256, `WS_CONTROL_SECRET` >= 32 char, TTL 60s, jti replay protection, clock skew 48h.

---

## 9. Enrollment SSE Relay (Browser Luar LAN)

**IMPLEMENTED** — detail di §3d.

```
Edge POST /api/gate/sighting → Cache::put("enrollment_last_tag:{wh}", tag, TTL 30s)
Browser GET /api/enrollment/stream?warehouse_id=X (Bearer token atau ?token=)
  EnrollmentStreamController poll 100ms → emit jika received_at berubah
  Heartbeat 15s; Max 55s → reconnect
```

---

## 10. Gate SSE Stream (GateMonitor)

**IMPLEMENTED**

```
GET /api/gate/stream?warehouse_id=X&since_id=Y  (auth:sanctum)
GateEventController::stream():
  Initial: SELECT gate_pass_events WHERE id > since_id LIMIT 20
    emit "event: initial\ndata:[...]\n\n"
  Loop 1.5s: SELECT WHERE id > lastId LIMIT 50
    emit "event: gate_event\ndata:[...]\n\n" + "event: ping"
  Max 55s → break; EventSource reconnect otomatis
```

---


## 11. Nginx — Konfigurasi SSE & Routing

**IMPLEMENTED** — file: `docker/nginx/default.conf`

```
Nginx :80  (container mosa-nginx)
  │
  ├─ /assets/*.js|css|woff2|... → SPA dist/ + Cache-Control immutable 1 tahun
  ├─ /                          → SPA dist/index.html + Cache-Control no-store
  ├─ /storage                   → backend/storage/app/public + Cache 1 hari
  │
  ├─ SSE routes (fastcgi_buffering off, gzip off, fastcgi_read_timeout 120):
  │   /api/enrollment/stream    ← browser enrollment luar LAN
  │   /api/gate/stream          ← GateMonitor browser luar LAN
  │   /api/edge/events          ← edge bridge reverse channel
  │
  └─ /api  & *.php → FastCGI ke backend:9000
       fastcgi_read_timeout 300
       fastcgi_hide_header Date   ← cegah Date duplikat (SSE 500 error)
       gzip on (js/css/json/dll)
```

**Kenapa `fastcgi_buffering off`?**
Header `X-Accel-Buffering: no` dari PHP hanya bekerja di `proxy_pass`, bukan `fastcgi_pass`.
Untuk SSE via FastCGI, wajib set `fastcgi_buffering off` langsung di nginx.

---

## 12. Docker — Topologi Kontainer

**IMPLEMENTED** — file: `docker-compose.yml`

```
Network: mosa-network (bridge)
┌─────────────────────────────────────────────────────────────┐
│ VPS docker-compose                                          │
│                                                             │
│  mosa-nginx     :80 ─────────────────── FastCGI            │
│  mosa-backend   :9000 (PHP-FPM)                            │
│    volumes: backend/, docker/php/opcache.ini (JIT tracing) │
│    env: DB_HOST=postgres, CACHE_DRIVER=file                 │
│                                                             │
│  mosa-queue-worker (php artisan queue:work)                 │
│    queue: default + broadcasts                              │
│                                                             │
│  mosa-postgres  :5432 (host: :5433)                        │
│    synchronous_commit=local                                 │
│                                                             │
│  mosa-edge-bridge (Node.js — opsional di VPS)              │
│    :2077 TCP-A  :2079 TCP-B  :2078 WS                      │
│    BATCH_IDLE_MS=300  BATCH_DEADLINE_MS=3000               │
│                                                             │
│  mosa-frontend (Vite builder → dist/)                       │
│  mosa-adminer  (profile: adminer)                           │
│  mosa-cloudflared (profile: tunnel/full)                    │
└─────────────────────────────────────────────────────────────┘

PC Lokal Gudang (LAN) — edge bridge utama:
  Node.js edge-bridge (pm2 / systemd)
    TCP ke Reader 192.168.2.200:2022
    WS :2078 → browser LAN
    HTTPS → VPS 206.237.98.48
```

**depends_on chain:**
```
nginx          → backend (healthy) + frontend (started)
backend        → postgres (healthy)
queue-worker   → postgres (healthy) + backend (healthy)
edge-bridge    → nginx
```

**Health checks:** nginx wget, backend nc :9000, postgres pg_isready, edge-bridge nc :2078, queue-worker artisan queue:monitor.

---

## 13. Queue Worker — Async Broadcast

**IMPLEMENTED**

```
Container mosa-queue-worker:
  php artisan queue:work --sleep=3 --tries=3 --timeout=60 --queue=broadcasts,default

BroadcastToEdgeBridgeJob (tries=2, timeout=3):
  PATH 1 PRIMARY — SSE push:
    EdgeStreamController::pushToDevice(deviceId, 'broadcast', payload)
    Cache::put("edge_sse_event:{deviceId}", ..., TTL 60s)
    EdgeStreamController::stream() pull cache → emit SSE ke edge
    Edge _onVpsEvent('broadcast') → broadcast ke WS clients

  PATH 2 FALLBACK — curl (hanya jika edge_ws_url configured DAN IP publik):
    Skip otomatis jika edge_ws_url adalah private/LAN IP (192.168.x.x, 10.x.x.x, dll)
    → VPS tidak bisa akses LAN gudang, SSE path sudah handle  [Rec-1]
    curl POST http://edge_ws_url/broadcast  ← hanya untuk edge dengan IP publik
    CURLOPT_TIMEOUT_MS=1200, CURLOPT_CONNECTTIMEOUT=1
    HTTP 0 (unreachable) → log debug, SSE path sudah handle

  failed(): Log::debug (broadcast non-critical path)

notifyEdgeBridge() — digunakan HANYA untuk GATE_EVENT (bukan TAG_READ sighting):
  Dispatch BroadcastToEdgeBridgeJob ke queue (async, retry-safe)
  Fallback sinkron jika queue exception: curl ke http://edge-bridge:2078/broadcast 300ms

Rec-3 (DEPLOYED): handleTagSighting() bypass queue sepenuhnya
  TAG_READ sighting langsung push dua jalur cache di HTTP request handler:
    PATH 1 → EdgeStreamController::pushToDevice() per device aktif di warehouse
             Cache::put("edge_sse_event:{deviceId}") → edge SSE stream <5ms
    PATH 2 → Cache::put("enrollment_last_tag:{wh}") → EnrollmentStreamController SSE
  Queue broadcasts hanya untuk GATE_EVENT — tidak ada lagi sighting flooding queue.

QUEUE_CONNECTION=database (tabel jobs di PostgreSQL)
SESSION_DRIVER=database   (tabel sessions)
CACHE_STORE=file          (storage/framework/cache/data — 6 file aktif, 80KB)
```

---

## 14. Batch Timing & Optimistic Local Decision (Gate)

**IMPLEMENTED**

### Parameter Batch

| Parameter | Default Kode | Nilai di VPS (env) | Env var |
|---|---|---|---|
| `BATCH_IDLE_MS` | **700ms** | 300ms | `BATCH_IDLE_MS` |
| `BATCH_DEADLINE_MS` | **5000ms** | 3000ms | `BATCH_DEADLINE_MS` |
| `MAX_BATCH_SIZE` | 100 tag | 100 tag | `MAX_BATCH_SIZE` |
| `UNLOCK_DURATION_MS` | 5000ms | 5000ms | `UNLOCK_DURATION_MS` |
| `CONFIG_SYNC_INTERVAL_MS` | 10000ms | 10000ms | `CONFIG_SYNC_INTERVAL_MS` |
| `RF_POWER_DBM` | 30 dBm | 30 dBm | `RF_POWER_DBM` |

> Default kode = nilai jika env tidak di-set. VPS saat ini menjalankan BATCH\_IDLE\_MS=300, BATCH\_DEADLINE\_MS=3000 via `.env`.

### Timeline Tipikal (truk 20 tag, dual antenna)

```
t=0ms:   Tag pertama terbaca Antena A → directionEngine mulai
t=100ms: A→B confirmed → _accumulateBatch(), deadlineTimer=BATCH_DEADLINE_MS
         batchCollector.startedAt = Date.now()
t=100-400ms: 19 tag sisa masuk batch
t=400ms: BATCH_IDLE_MS (300ms) habis sejak tag pertama → batchAge >= batchIdleMs
         → dispatch LANGSUNG, tidak menunggu idle (anti-spam timer reset)
         cache.evaluateOptimistic() → relay.unlock() SEGERA
t=410ms: POST /api/gate/event dikirim
t=430ms: Backend response → relay confirmed
t=430ms: WS broadcast ke browser → UI update
```

### Anti-Spam Dispatch (batchAge cap)

Reader RFID sering mengirim reads berulang untuk tag yang sama dalam window singkat.
Sebelumnya setiap read me-**reset** idle timer → batch tertahan selama reader aktif.

Sekarang: `_accumulateBatch()` memeriksa `batchAge = Date.now() - batchCollector.startedAt`.
- `batchAge < BATCH_IDLE_MS` → reset idle timer seperti biasa (multi-tag normal)
- `batchAge >= BATCH_IDLE_MS` → **dispatch segera** tanpa menunggu idle timer berikutnya

Ini memastikan dispatch selalu terjadi dalam `2 × BATCH_IDLE_MS` dari tag pertama,
bukan menunggu reader berhenti spam (yang bisa mencapai `BATCH_DEADLINE_MS = 3000ms`).

### Optimistic Local Decision

```
localCache._authorizedDocCache:
  { docId, type, epcSet:Set<EPC>, cachedAt }
  TTL: 5 menit (invalidate jika Date.now()-cachedAt > 300_000ms)
  Di-set saat: syncGateConfig() atau _onVpsEvent('config')

evaluateOptimistic(detectedEpcs):
  jika cache null/expired/epcSet.size===0 → return null (fallback VPS)
  inDoc    = detectedEpcs.filter(epc => cache.epcSet.has(epc))
  notInDoc = detectedEpcs.filter(epc => !cache.epcSet.has(epc))
  allMatch = notInDoc.length===0 && inDoc.length>0
  return { unlock:allMatch, mismatch:notInDoc.length>0, source:'local_cache' }
```

---


## 15. Offline Queue & Retry

**IMPLEMENTED**

```
Skenario: VPS tidak reachable saat gate event
  ApiClient.sendGateEvent() throw error → catch:
    jika !payload.__queued → localCache.queueEvent(payload)
      → offline_buffer.json (debounce 2s write ke disk)
    return { unlock_gate:false, status:'OFFLINE_BUFFERED' }
    Edge: relay.lock() (fail-closed), broadcast GATE_FAIL_CLOSED

Buffer flush (setiap 15s via flushTimer):
  api.flushOfflineBuffer() → LocalCache.getPendingEvents()
    forEach event (FIFO, index 0 dulu):
      POST /api/gate/event (timeout 6000ms)
      sukses → removeEvent(0) → lanjut ke berikutnya
      gagal:
        incrementRetry(0, error)
        HTTP 4xx (client error) → quarantineFirst('HTTP 4xx') → dead-letter
        retryCount >= 5           → quarantineFirst('Max 5 retries reached') → dead-letter
        network error             → break (coba lagi flush berikutnya 15s)

Buffer limits:
  MAX_OFFLINE_BUFFER=500 (env)
  FIFO eviction: oldest → dead-letter saat buffer penuh (BUFFER_OVERFLOW)
  Dead-letter: offline_buffer.json.dead-letter (audit, tidak retry)

Health incidents: queueIncident() → incidentFile (immediate atomicSave, tidak debounce)
  flush tiap 15s via flushHealthIncidents()
```

---

## 16. Autentikasi & Token

**IMPLEMENTED**

### Device Auth (Edge Bridge ke VPS)

```
Header: Authorization: Bearer <DEVICE_API_TOKEN>
Middleware: auth.device
  GateDevice::where('api_token', hash(token))->first()
  Inject ke request: gate_device = GateDevice model

Throttle: throttle:gate-events untuk POST /api/gate/event, /gate/sighting, dll
/api/edge/events: TIDAK kena throttle (1 koneksi long-lived)
```

> ✅ **Bug RK-V2 (FIXED — Oktober 2026):** `bootstrap/app.php` baris 45 — rate limiter `gate-events`
> sebelumnya membaca `X-Device-Token` (non-standard). Sudah diperbaiki ke `bearerToken()`.
> Rate limit sekarang per-device-token (120 req/mnt per device) bukan per-IP lagi.

### User Auth (Browser ke VPS)

```
POST /api/auth/login → { token: sanctum_personal_access_token }
  Token → axios defaults headers + localStorage

Middleware: auth:sanctum (semua endpoint user)

/api/enrollment/stream: di luar group auth:sanctum
  → auth manual: cek Authorization header atau ?token= query param
  → PersonalAccessToken::findToken() → user
```

### WS Control Ticket

```
POST /api/ws-control-ticket → WsControlTicketController::store()
  payload: { warehouse_id, commands, device_id, purpose }
  response: { ticket:"base64url.sig", edge_ws_url, warehouse_id, device_id }

Ticket: HMAC-SHA256 signed dengan WS_CONTROL_SECRET (min 32 char)
Claims: { v:2, sub:userId, warehouse_id, device_code, commands:[], jti:uuid, iat, exp=iat+60 }

Edge verifyWsControlTicket():
  Cek HMAC signature (timingSafeEqual)
  Cek v===2, device_code, warehouse_id
  Cek exp-iat <= 60s
  Cek jti replay via usedWsTicketIds.has(jti)
  Clock skew: WS_CLOCK_SKEW_TOLERANCE_S=172800 (48h) untuk VM hypervisor skew
```

### WS Auth Timeout & CORS

```
WS_ALLOWED_ORIGINS env var (wajib di production):
  Contoh: WS_ALLOWED_ORIGINS=https://mosaik.app,http://192.168.2.10:3000
  Jika kosong di production → edge log WARNING dan tolak koneksi dari origin asing

WS Auth timeout:
  Edge buka koneksi WS → auth_timer = setTimeout(() => ws.close(4001,'Auth required'), 5000ms)
  Browser harus kirim { type:'AUTH', ticket:'<signed_ticket>' } dalam 5 detik
  Jika tidak → koneksi diputus kode 4001
  Setelah AUTH sukses → authTimer cleared
  Edge kirim HANDSHAKE: {
    type: 'HANDSHAKE', gate_id, warehouse_id, device_code, device_name,
    reader_status: 'connected'/'disconnected', pairing_status: 'paired'/'unpaired',
    operational_mode, relay_status
  }
```

### WS Command Protocol (Browser → Edge)

Setelah AUTH sukses, browser bisa kirim command berikut via WebSocket:

| Browser kirim | Edge respons | Keterangan |
|---|---|---|
| `{ type:'AUTH', ticket }` | `HANDSHAKE` | Auth wajib dalam 5s |
| `{ type:'PING' }` | `{ type:'PONG', ts }` | Liveness check |
| `{ type:'GET_MODE' }` | `{ type:'MODE_INFO', mode, gateMode, relayStatus }` | Status mode saat ini |
| `{ type:'SET_MODE', mode:'ENROLLMENT' }` | `MODE_CHANGED` broadcast ke semua | Butuh perintah di claims ticket |
| `{ type:'SET_MODE', mode:'GATE_SECURITY' }` | `MODE_CHANGED` broadcast ke semua | Butuh perintah di claims ticket |
| `{ type:'GET_STATS' }` | `{ type:'TAG_STATS', totalReads, uniqueEpcs, minuteReads, healthTracked }` | Statistik tag runtime |
| `{ type:'TEST_READER_CONNECTION' }` | `{ type:'READER_CONNECTION_TEST', connected, latencyMs }` | Probe TCP reader |
| `{ type:'WRITE_TAG', epc, data }` | `{ type:'WRITE_TAG_SENT', epc, success }` | Write memory bank ke tag |
| `{ type:'SIMULATE_TAG', epc }` | `{ type:'ERROR', code:'SIMULATION_DISABLED' }` | Disabled di production |

> `WRITE_TAG` membutuhkan perintah `WRITE_TAG` dalam claims ticket. Edge log event ke AuditLogger.



---

## 17. Diagram Ringkas

### Enrollment Flow

```
RFID Reader (TCP)
  → Edge onTagDetected()
      → broadcast WS → Browser LAN (TagEnrollment.jsx, liveScannedTag)
      → sendTagSighting() POST /api/gate/sighting
          → GateEventController::handleTagSighting()  [Rec-3: no queue]
              PATH 1: EdgeStreamController::pushToDevice(deviceId, 'broadcast', payload)
                       Cache::put("edge_sse_event:{deviceId}") → EdgeStreamController SSE
              PATH 2: Cache::put enrollment_last_tag:{wh}
  → EnrollmentStreamController SSE (poll 100ms)
      → Browser luar LAN fetch SSE → liveScannedTag
  → User Submit POST /api/tags/enroll
      → RfidTagController bulk upsert + CustodyLedger
```

### Gate INBOUND/OUTBOUND Flow

```
RFID Reader (TCP)
  → Edge onTagDetected()
      → DUAL_ANTENNA_AUTO:
          directionEngine.processTagRead() → arah dari sekuens antena A/B
      → SINGLE_ANTENNA_SESSION:
          arah dari authorizedDocument.type (doc.type=inbound→IN, outbound→OUT)
      → _accumulateBatch() [IDLE BATCH_IDLE_MS / DEADLINE BATCH_DEADLINE_MS]
      → Optimistic: cache.evaluateOptimistic() → relay.unlock() < 50ms (SIMULATED)
        broadcast RELAY_STATUS:'unlocked' → WS clients
        relay auto-lock setelah UNLOCK_DURATION_MS (5s default)
      → POST /api/gate/event (HTTPS, timeout 6000ms)
          → Nginx → PHP-FPM
          → GateEventController::handleGateEvent()
          → GateEngineService::processGateEvent() [DB::transaction]
              → Idempotency, device binding, EPC validation
              → INSERT gate_pass_events
              → recordGateCustody() → custody_ledger, rfid_tags, doc_tags
          → notifyEdgeBridge() → BroadcastToEdgeBridgeJob (queue)
              → PATH 1: Cache edge_sse_event → EdgeStreamController SSE
                  → Edge _onVpsEvent('broadcast') → WS clients
              → PATH 2: curl fallback (jika edge_ws_url configured)
          → response JSON → Edge relay override jika VPS berbeda dari optimistic
  → Browser WS LAN: GATE_DECISION, TAG_READ, RELAY_STATUS → UI update
  → Browser SSE VPS: gate/stream poll 1.5s → append row
```
```

---

## 18. Troubleshooting

> **⛔ FIRST CHECK — EDGE-LOC (Blocker Utama):**
> Container `mosa-edge-bridge` di VPS **tidak bisa** reach reader RFID di LAN gudang (192.168.2.200).
> **Produksi:** jalankan `node src/index.js` di **PC lokal gudang** — bukan di Docker VPS.
> Jika tidak ada data masuk dari reader, cek ini lebih dulu sebelum debug hal lain.
> Detail: §27e EDGE-LOC.

---

### Tag tidak terdeteksi di TagEnrollment

- **Cek edge lokasi:** Edge bridge berjalan di PC gudang (bukan VPS container)? Lihat EDGE-LOC di atas.
- **Cek WS:** DevTools Network → WS `ws://IP:2078/` terkoneksi? Mode `ENROLLMENT`?
- **Cek SSE fallback:** `enrollment/stream` status 200 + EventStream?
  - `401` → token expire. Logout-login.
  - `422` → `warehouse_id` tidak terkirim.
- **Cek Cache relay:** `enrollment_last_tag:1` ada data? Jika tidak → edge tidak POST `/api/gate/sighting`. Cek `DEVICE_API_TOKEN`.

---

### Gate tidak unlock saat barang lewat

1. **Cek EDGE-LOC** — edge berjalan di PC gudang? Reader reachable dari PC tsb?
2. `GET /api/devices/config` → `authorized_document` ada?
3. `GET /api/tags?search=EPC` → status `active` atau `attached`?
4. Shipping document status `approved` atau `in_progress`?
5. Tag sudah di-assign ke dokumen? (`shipping_document_tags`)
6. `gate_pass_events.mismatch_details` di DB — detail error apa?
6. `offline_buffer.json` — event tertahan karena offline?
7. Relay status — ada yang lock manual?

---

### SSE stream terputus / tidak ada event

- `fastcgi_read_timeout` harus > 55s (sudah 120s di config).
- PHP `set_time_limit(0)` di controller (sudah ada).
- Heartbeat PHP kirim setiap 15-20s — jika tidak ada → PHP exit dini.
- Pastikan SSE route masuk `location ~ ^/api/(enrollment/stream|gate/stream|edge/events)$`.

---

### Duplikat gate event

- Backend: `event_id` UUID di-cek per device → idempotent reply.
- Offline buffer: `__queued:true` flag mencegah double-queue.
- WS ticket: `usedWsTicketIds.has(jti)` cegah ticket reuse.

---

### `complete()` gagal meski semua scanned

- Pesan error menyebut EPC yang belum dalam bukti gate.
- Cek `GatePassEvent.raw_payload['cumulative_epcs']` dan arah event vs tipe dokumen.

---


## 21. Audit Logger — Local Forensic Trail (Edge)

**IMPLEMENTED**

Edge bridge menulis audit trail lokal ke disk secara append-only, **terpisah** dari database VPS.

```
File: audit_logs/gate_audit_YYYY-MM-DD.jsonl
  - Satu JSON object per baris (JSONL format)
  - Rotate harian (file baru setiap tengah malam)
  - Append-only: tidak pernah diedit atau dihapus oleh sistem
  - Dibuat di direktori kerja edge-bridge (biasanya edge-bridge/audit_logs/)

Event yang dicatat auditLogger.logEvent(eventType, data):
  GATE_PASS    — setiap batch dispatch berhasil (unlock_gate, epc_list, direction, doc_id)
  TAG_WRITE    — setiap WRITE_TAG command dari browser via WS
  MODE_CHANGE  — perubahan operational mode (ENROLLMENT ↔ GATE_SECURITY)
  AUTH_FAIL    — WS auth gagal (IP, reason)
  RELAY_CHANGE — setiap relay unlock/lock beserta trigger-nya

Format tiap baris:
  {
    "ts": "2026-10-22T08:15:32.441Z",
    "event": "GATE_PASS",
    "gate_id": "GD-001",
    "warehouse_id": 1,
    "data": { "unlock_gate": true, "direction": "IN", "epc_count": 20, ... }
  }
```

> Audit log lokal adalah safety net jika VPS tidak reachable saat kejadian gate.
> File `.jsonl` dapat di-`grep` untuk forensik tanpa akses DB.

---


## 22. MeshSync — Multi-Edge LAN Sync

**IMPLEMENTED** (aktif jika `MESH_ENABLED=true`)

```
Konfigurasi:
  MESH_ENABLED=true      (default: false)
  MESH_PORT=2090         (UDP broadcast port)
  MESH_TTL_MS=300000     (TTL sighting dari peer: 5 menit)

Mekanisme:
  Setiap edge di LAN yang sama:
    Startup → meshSync.init() → bind UDP socket port 2090

  Saat tag terbaca di gate A:
    meshSync.broadcastSighting({ epc, rssi, gate_id, ts }) → UDP broadcast LAN
    Edge lain → simpan ke _peerSightings Map

  Saat gate B evaluate tag:
    meshSync.getPeerSighting(epc) → cek apakah tag baru terlihat di peer (dalam TTL)
    Jika ya → bias direction engine atau log cross-gate detection

Topologi:
  [Reader A] → [Edge A: 192.168.2.10] ── UDP bcast ──→ [Edge B: 192.168.2.11]
  [Reader B] → [Edge B: 192.168.2.11] ── UDP bcast ──→ [Edge A: 192.168.2.10]
  Semua edge POST independen ke VPS (VPS tidak tahu soal mesh).

Catatan:
  - UDP fire-and-forget, bukan untuk keputusan kritis
  - Dipakai untuk cross-gate awareness / anomaly detection
  - MESH_ENABLED=false (default) → fitur dormant
```

---


## 23. Device Pairing & Reader Optimization

**IMPLEMENTED**

### Device Pairing Lifecycle

```
Edge startup → fetchPairedDevices()
  GET /api/devices/paired?device_code=XXXX  (auth.device)
  Response: { ip, port, name, role, warehouse_id }

  Jika ditemukan:
    syncedDeviceCode = device.code
    syncedDeviceName = device.name
    syncedDeviceRole = device.role
    READER_HOST override = device.ip   (kalahkan env READER_HOST)
    READER_PORT override = device.port
    isDeviceUnpaired = false
    → connectDirectReader()

  Jika tidak ditemukan (belum di-pair di VPS):
    isDeviceUnpaired = true
    Broadcast { type:'DEVICE_UNPAIRED' } ke WS clients
    Retry fetchPairedDevices() setiap 30 detik

  Jika VPS down saat startup:
    Fallback ke env READER_HOST / READER_PORT (tidak tunggu pairing)
```

### RF Reader Hardware Config

```
Saat pertama kali basic settings diterima dari reader:

1. Auto-Region Indonesia (sekali saja):
   buildSetIndonesiaFreqCommand() → set frekuensi 923–925 MHz (regulasi RI)
   Dikirim ke reader via TCP, _regionCorrected = true

2. RF Power (env RF_POWER_DBM, default 30 dBm):
   buildSetPowerAndQCommand(power, qValue) → dikirim ke reader

3. Auto Q-Value Tuning (setelah setiap batch dispatch):
   _autoTuneQValue(tagCount):
     <=5 tag  → Q=2 | <=15 → Q=3 | <=30 → Q=4 | >30 → Q=5
   buildSetPowerAndQCommand(currentPower, newQ) → dikirim ke reader
   Mengoptimalkan inventory slot count berdasarkan kepadatan tag

4. ASSIGNED_ANTENNA (env, opsional):
   Force-pin antena ke 'A' atau 'B' tanpa auto-detect
   Berguna untuk reader single-antenna via TCP server port berbeda
```

### Tag Health Monitor

```
_updateTagHealth(epc, rssi):
  _tagHealthHistory Map — max 500 EPC, max 20 readings per EPC (sliding window)
  { readings:[{rssi,ts}], avgRssi, peakRssi }
  EPC > 500 → hapus entry terlama

Dilaporkan di heartbeat: tag_health_tracked
Digunakan untuk: diagnostik sinyal, deteksi tag degradasi
```

---


## 24. Environment Variables Lengkap (Edge Bridge)

| Env Var | Default Kode | Keterangan |
|---|---|---|
| `READER_HOST` | `192.168.2.200` | IP RFID reader (override oleh pairing) |
| `READER_PORT` | `2022` | Port TCP reader |
| `WS_PORT` | `2078` | Port WebSocket lokal |
| `DEVICE_API_TOKEN` | *(wajib)* | Bearer token POST ke VPS |
| `VPS_BASE_URL` | *(wajib)* | Base URL VPS backend |
| `DEVICE_CODE` | *(wajib)* | Kode unik gate device |
| `GATE_ID` | *(wajib)* | ID gate untuk payload |
| `WAREHOUSE_ID` | *(wajib)* | ID warehouse untuk payload |
| `WS_CONTROL_SECRET` | *(wajib, ≥32 char)* | HMAC secret untuk WS ticket |
| `WS_ALLOWED_ORIGINS` | *(wajib di prod)* | CORS origins izin, comma-separated |
| `WS_CLOCK_SKEW_TOLERANCE_S` | `172800` (48h) | Toleransi skew jam VM hypervisor |
| `BATCH_IDLE_MS` | `700` | Idle window sebelum dispatch (ms) |
| `BATCH_DEADLINE_MS` | `5000` | Max waktu tunggu batch force-dispatch (ms) |
| `MAX_BATCH_SIZE` | `100` | Max tag per batch |
| `UNLOCK_DURATION_MS` | `5000` | Durasi relay unlock sebelum auto-lock (ms) |
| `CONFIG_SYNC_INTERVAL_MS` | `10000` | Interval HTTP polling config dari VPS (ms) |
| `RF_POWER_DBM` | `30` | Daya transmit RF reader (dBm) |
| `IDLE_INTERVAL_MS` | `15000` | Keepalive inventory per TCP socket (ms) |
| `HEARTBEAT_INTERVAL_MS` | `10000` | Interval POST heartbeat ke VPS (ms) |
| `MAX_OFFLINE_BUFFER` | `500` | Max event offline buffer sebelum eviction |
| `ASSIGNED_ANTENNA` | *(kosong)* | Force-pin antena: `'A'` atau `'B'` |
| `MESH_ENABLED` | `false` | Aktifkan UDP mesh sync antar edge |
| `MESH_PORT` | `2090` | Port UDP mesh broadcast |
| `LOG_LEVEL` | `info` | `debug`=log setiap tag; `info`=event penting saja |

---


## 19. Alur 4 — Shipping Document (RFID ke Progress Halaman)

**IMPLEMENTED**

### Lifecycle Shipping Document

```
PM/SA: POST /api/shipping-documents               → status:'draft'
PM/SA/PIC: POST /shipping-documents/{id}/assign-tags
           → insert shipping_document_tags (boleh dari draft/approved/in_progress)
           → untuk item is_length_based, sertakan length_dispatched (meter)

Gate event masuk pertama kali:
  GateEngineService::recordGateCustody() → shippingDoc.status='in_progress'

PM/SA: POST /api/shipping-documents/{id}/approve
  → Jika status='draft': ubah ke status='approved' (siap untuk scan gate)
  → Jika status='in_progress' (sudah ada gate pass): ubah ke 'completed'
     (validasi: semua tag harus sudah scanned + ada GatePassEvent valid)
  → Tidak bisa approve dari status selain 'draft' atau 'in_progress'

PIC/PM/SA: POST /api/shipping-documents/{id}/assign-tags
  → Boleh dari draft/approved/in_progress
  → Jika assign berhasil dan status masih draft/approved → otomatis ke 'in_progress'
  → Inbound: tag harus status='active' + last_warehouse_id=null
  → Outbound: tag harus status='attached' + last_warehouse_id=warehouse_id dokumen

PIC: POST /api/shipping-documents/{id}/complete
  Validasi: semua tag assigned sudah punya bukti gate pass
  status='completed'
  CustodyLedger: DOCUMENT_COMPLETED

PM/SA: POST /api/shipping-documents/{id}/cancel → status='cancelled'
  (tidak bisa cancel jika sudah ada GatePassEvent is_valid=true)

Note: Status flow normal: draft → in_progress (saat assign-tags) → completed (saat approve dari in_progress).
Status 'approved' (intermediate) hanya terjadi jika approve dipanggil dari draft sebelum ada gate pass.
```

### Progress Real-time di ShippingDocuments.jsx

```
Browser:
  GET /api/shipping-documents/{id} → detail + tags, scanned_qty
  Progress bar: N/Total tag scanned

Setelah gate scan:
  GateEngineService update scanned_qty di shipping_document_items
  Browser polling/refresh → GET /api/shipping-documents/{id} → update UI

Inbound stock reconciliation:
  GET /api/shipping-documents/{id}/stock-reconciliation  (preview)
  POST /api/shipping-documents/{id}/stock-reconciliation (apply)
    → update item stock / custody ledger
```

### Prioritas Dokumen untuk Gate

```
DUAL_ANTENNA_AUTO:
  ShippingDocument WHERE status IN ['approved','in_progress']
    ORDER BY updated_at DESC LIMIT 1

SINGLE_ANTENNA_SESSION:
  ShippingDocument WHERE status IN ['draft','approved','in_progress']
    ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, id
    LIMIT 2
  1 dokumen → pakai itu
  >1 dokumen, beda status → ambil prioritas tertinggi (in_progress)
  >1 dokumen, status sama → ambil id terkecil (first)
```

---

## 20. Deployment Info & Build Guide

### Batas Tanggung Jawab Per Lokasi

| Komponen | Lokasi Fisik | Cara Deploy |
|---|---|---|
| **Backend Laravel** (PHP-FPM) | VPS `206.237.98.48:2210` | SCP + restart backend |
| **Frontend React** (Vite) | VPS | Wajib rebuild image setelah ubah `.jsx` |
| **Edge-Bridge** (Node.js) | **PC lokal gudang** (LAN) | Copy `index.js` + restart pm2/systemd |

> Edge-bridge **tidak berjalan di VPS** kecuali testing. Instance aktif ada di PC lokal gudang.

### VPS Info

| Parameter | Nilai |
|---|---|
| **Host** | `206.237.98.48` |
| **SSH Port** | `2210` |
| **SSH User** | `dava` |
| **SSH Key** | `~/.ssh/id_ed25519` |
| **Project Path** | `/var/www/mosa` |
| **Nginx (internal)** | `127.0.0.1:8081 → :80` |
| **PostgreSQL (internal)** | `127.0.0.1:5433 → :5432` |

### Build & Deploy — Backend PHP

```bash
# Upload file (volume mount, langsung aktif)
scp -i ~/.ssh/id_ed25519 -P 2210 \
  backend/app/Http/Controllers/Api/GateEventController.php \
  dava@206.237.98.48:/var/www/mosa/backend/app/Http/Controllers/Api/GateEventController.php

# Restart backend (PHP-FPM reload)
ssh -i ~/.ssh/id_ed25519 -p 2210 dava@206.237.98.48 \
  'cd /var/www/mosa && docker compose restart backend'

# Setelah ubah .env — wajib clear config cache:
ssh -i ~/.ssh/id_ed25519 -p 2210 dava@206.237.98.48 \
  'cd /var/www/mosa && docker compose exec backend php artisan config:clear \
   && php artisan config:cache'

# Cek .env permission (www-data harus bisa baca):
# chmod 644 backend/.env
# File -rw------- (owner 1000) → env() return null → fallback database cache
```

### Build & Deploy — Frontend React

```bash
# Upload JSX
scp -i ~/.ssh/id_ed25519 -P 2210 \
  frontend/src/pages/ShippingDocuments.jsx \
  dava@206.237.98.48:/var/www/mosa/frontend/src/pages/ShippingDocuments.jsx

# Rebuild image (wajib setelah ubah .jsx)
ssh -i ~/.ssh/id_ed25519 -p 2210 dava@206.237.98.48 \
  'cd /var/www/mosa && docker compose build --no-cache frontend 2>&1 | tail -5'

# Extract dist dari image baru ke /tmp, lalu copy ke host via container
# (perlu karena bind mount ./frontend/dist menimpa isi image saat run)
ssh -i ~/.ssh/id_ed25519 -p 2210 dava@206.237.98.48 'bash -s' <<'ENDSSH'
  set -e
  docker rm -f mosa-fe-extract 2>/dev/null || true
  docker create --name mosa-fe-extract mosa-frontend
  mkdir -p /tmp/fe-assets
  docker cp mosa-fe-extract:/var/www/frontend/dist/assets/. /tmp/fe-assets/
  docker cp mosa-fe-extract:/var/www/frontend/dist/index.html /tmp/new-index.html
  docker rm mosa-fe-extract
  # Copy ke host via running container (memiliki akses write ke bind mount)
  docker cp /tmp/fe-assets/. mosa-frontend:/tmp/new-assets/
  docker cp /tmp/new-index.html mosa-frontend:/tmp/new-index.html
  docker exec mosa-frontend sh -c '
    cp /tmp/new-assets/* /var/www/frontend/dist/assets/
    cp /tmp/new-index.html /var/www/frontend/dist/index.html
  '
  echo "FE deploy done"
ENDSSH

# Start frontend + restart nginx (agar health check lewat)
ssh -i ~/.ssh/id_ed25519 -p 2210 dava@206.237.98.48 \
  'cd /var/www/mosa && docker compose up -d frontend && docker compose restart nginx'
```

> **Kenapa tidak cukup `docker compose up -d frontend`?**
> Build terjadi di layer Docker image (`/app/dist`). Saat container berjalan,
> `/var/www/frontend/dist` adalah bind mount dari host `/var/www/mosa/frontend/dist`
> yang **menimpa** isi image. File baru harus di-copy manual dari image ke host.
> File lama dengan hash berbeda boleh dibiarkan (SPA lazy-load); atau hapus manual.


### Deploy — Edge-Bridge PC Lokal Gudang

```bash
cp edge-bridge/src/index.js /path/to/edge-bridge/src/index.js

# PM2:
pm2 restart edge-bridge

# systemd:
sudo systemctl restart edge-bridge

# Manual:
# Ctrl+C, lalu: node src/index.js
```

### Optimasi Runtime yang Sudah Diterapkan (VPS Oktober 2026)

| Optimasi | Detail | Status |
|---|---|---|
| `CACHE_STORE=file` | `.env` chmod 644 → `www-data` bisa baca → file cache aktif | Active |
| OPcache JIT `tracing` | `docker/php/opcache.ini` — 64MB buffer, 192MB memory, revalidate_freq=60 | Active |
| `BATCH_IDLE_MS=300` | Dikurangi dari default kode 700ms via `.env` VPS | Active |
| `BATCH_DEADLINE_MS=3000` | Dikurangi dari default kode 5000ms via `.env` VPS | Active |
| Anti-spam batchAge cap | `_accumulateBatch`: dispatch langsung jika `batchAge >= BATCH_IDLE_MS` — mencegah idle timer reset terus saat reader spam, waktu respons OUT turun dari ≤3000ms → ≤600ms | Active |
| `synchronous_commit=local` | PostgreSQL — commit tidak tunggu WAL ke disk penuh | Active |

*Dokumen ini mencerminkan implementasi aktual kode per Oktober 2026.
Perubahan kontrak endpoint, field payload, atau logika transport wajib diperbarui di sini
pada turn yang sama. Lihat [`arsitektur.md`](arsitektur.md) untuk konteks sistem penuh.*



---

## 25. Alur 5 — Partial Withdrawal (Drum Kabel / Length-Based Item)

**Status: IMPLEMENTED** (Oktober 2026 — 7/7 test pass, semua layer: GateEngine, Controller, Model, FE)

### Konsep

Drum kabel atau material panjang lainnya (selang, pipa) dapat dipasang **satu RFID tag per drum**, namun dikeluarkan **berkali-kali** dalam jumlah meter yang berbeda sampai drum habis.

Item dikonfigurasi `is_length_based = true`. Setiap tag drum menyimpan:
- `total_length_m` — panjang total drum saat dipasang tag (tidak berubah)
- `remaining_length_m` — sisa panjang yang belum diambil (berkurang tiap GATE_OUT)

### State Machine Tag Drum

```
INBOUND (GATE_IN)
    → status='attached', last_warehouse_id=wh, remaining_length_m=total
        │
        ▼ OUTBOUND partial (remaining > dispatched)
    status='attached' ← tag TETAP di gudang, remaining -= dispatched
    CustodyLedger action='PARTIAL_OUT'
        │
        ▼ OUTBOUND final (remaining <= dispatched)
    status='active', last_warehouse_id=null, remaining=0
    CustodyLedger action='GATE_OUT'
```

### Alur Assignment (assignTags)

1. PM/PIC buat `ShippingDocument` type=`outbound`
2. `POST /api/shipping-documents/{id}/assign-tags` dengan payload:
   ```json
   {
     "tags": [
       {
         "epc": "AABBCCDD00000001",
         "document_item_id": 42,
         "length_dispatched": 50.0
       }
     ]
   }
   ```
3. `ShippingDocumentController::assignTags` validasi:
   - `length_dispatched` **wajib** jika item is_length_based
   - `length_dispatched <= remaining_length_m` (mencegah over-withdrawal)
4. Tersimpan ke `shipping_document_tags.length_dispatched`

### Alur Gate OUTBOUND Drum

```
Edge → POST /api/gate/event (epc_list, shipping_document_id)
    → GateEngineService::evaluateEpcMismatch()
        → Drum boleh pass jika is_length_based && remaining > 0 && di warehouse ini
        → Tag TIDAK ditolak meski status='attached' (partial drum sah)
    → GateEngineService::recordGateCustody()
        → Baca length_dispatched dari shipping_document_tags
        → remaining_new = max(0, remaining - dispatched)
        → Update rfid_tags.remaining_length_m = remaining_new
        → Jika remaining_new > 0: action=PARTIAL_OUT, tag tetap attached
        → Jika remaining_new == 0: action=GATE_OUT, tag → active, last_warehouse_id=null
        → CustodyLedger dicatat dengan notes "[qty:Xm] Gate OUT..."
```

### Validasi Mismatch Gate (evaluateEpcMismatch)

Untuk OUTBOUND, tag dianggap valid jika:
1. `status='attached'` DAN `last_warehouse_id = warehouseId` (flow normal), ATAU
2. `item.is_length_based=true` DAN `remaining_length_m > 0` DAN `last_warehouse_id = warehouseId` (partial drum)

Tag drum di warehouse berbeda tetap DENIED.

### Custody Actions

| Action | Kondisi | Keterangan |
|:-------|:--------|:-----------|
| `PARTIAL_OUT` | remaining > 0 setelah dispatch | Drum masih ada di gudang |
| `GATE_OUT` | remaining = 0 (last pull) | Drum habis, tag keluar penuh |

Notes format: `[qty:50.0m] Gate OUT via GATE-01 - Dokumen #DOC-OUT-...`

### Constraints & Catatan

- Drum harus di-INBOUND dulu (GATE_IN) sebelum bisa OUTBOUND
- `length_dispatched` harus > 0 dan ≤ `remaining_length_m`
- Dokumen lama yang assign drum tidak boleh melebihi sisa
- Tag drum yang `remaining=0` tidak bisa exit lagi (diblok oleh evaluateEpcMismatch)
- Satu tag bisa muncul di **multiple** shipping document outbound (berbeda per partial)
- Test: `backend/tests/Feature/PartialWithdrawalGateFlowTest.php` (7 test)

---

## 26. Optimization Changelog

Bagian ini mencatat semua optimasi performa/arsitektur yang sudah diterapkan ke VPS production.
**Jangan ubah label menjadi DEPLOYED tanpa verifikasi kode aktual di VPS.**

---

### Rec-1 — Skip curl fallback ke LAN IP `[DEPLOYED Oktober 2026]`

**File:** `backend/app/Jobs/BroadcastToEdgeBridgeJob.php`

**Masalah:** `tryCurlFallback()` mencoba curl ke `edge_ws_url` (mis. `ws://192.168.1.106:2078/`) meski VPS tidak bisa akses LAN gudang. Setiap job timeout 1.2 detik → queue flooding 42k stale jobs.

**Fix:** Tambah method `isPrivateIp(string $host): bool` — gunakan `FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE`. Jika host adalah RFC 1918 / loopback → skip curl, log debug, lanjut.

**Kode kunci (baris 98–102):**
```php
$host = parse_url($broadcastUrl, PHP_URL_HOST);
if ($host && self::isPrivateIp($host)) {
    \Log::debug("[EdgeBroadcast] skip curl to LAN IP {$host} — SSE path handles this");
    continue;
}
```

**Efek:** Job sighting yang sebelumnya 1.2 detik (TCP timeout) → selesai < 5ms.

**Verifikasi VPS:**
```bash
grep -n 'isPrivateIp\|skip curl' /var/www/mosa/backend/app/Jobs/BroadcastToEdgeBridgeJob.php
# → baris 99–101 ✅
```

---

### Rec-2 — Dedup TAG_READ di `notifyEdgeBridge()` `[DIGANTIKAN oleh Rec-3]`

**File:** `backend/app/Http/Controllers/Api/GateEventController.php`

**Masalah:** Reader scan 1 tag 30x dalam 2 detik → 30 job identik dispatch ke queue.

**Fix awal:** Cache flag `broadcast_dedup:{wh}:{epc}` TTL 2 detik di `notifyEdgeBridge()`. Skip dispatch jika flag ada.

**Status:** ~~DEPLOYED~~ → **DIHAPUS** saat Rec-3 diterapkan. `handleTagSighting()` tidak lagi memanggil `notifyEdgeBridge()`, sehingga dedup di sana tidak relevan. Kode dedup sudah tidak ada di VPS.

---

### Rec-3 — `handleTagSighting()` bypass queue total `[DEPLOYED Oktober 2026]`

**File:** `backend/app/Http/Controllers/Api/GateEventController.php`

**Masalah:** TAG_READ sighting lewat queue → worker sleep 0–3 detik → latensi tinggi padahal data tidak butuh retry/async.

**Analisis:** Sighting punya dua consumer:
1. Edge bridge via SSE → baca `edge_sse_event:{deviceId}` dari cache
2. Browser luar LAN via enrollment SSE → baca `enrollment_last_tag:{wh}` dari cache

Keduanya adalah cache write — tidak perlu queue.

**Fix:** `handleTagSighting()` tidak lagi panggil `notifyEdgeBridge()`. Langsung:
```php
// PATH 1: push ke edge SSE
$deviceIds = GateDevice::where('warehouse_id', $warehouseId)->where('is_active', true)->pluck('id');
foreach ($deviceIds as $id) {
    EdgeStreamController::pushToDevice($id, 'broadcast', $sightingPayload);
}
// PATH 2: enrollment relay
Cache::put("enrollment_last_tag:{$warehouseId}", [...], 30);
```

`notifyEdgeBridge()` sekarang **hanya dipanggil dari `handleGateEvent()`** (GATE_EVENT + TAG_READ konfirmasi).

**Efek:**
- Latensi sighting: 0–3 detik → < 5ms
- Queue `broadcasts` hanya berisi GATE_EVENT nyata
- Tidak ada lagi queue flooding dari sighting

**Verifikasi VPS:**
```bash
grep -n 'Rec-3\|sightingPayload\|pushToDevice' /var/www/mosa/backend/app/Http/Controllers/Api/GateEventController.php
# → baris 92, 108, 126 ✅
docker exec mosa-postgres psql -U mosa_user -d mosa_wms -c 'SELECT queue, COUNT(*) FROM jobs GROUP BY queue;'
# → (0 rows) — queue bersih ✅
```

---

### Rec-4 — Ganti `CACHE_STORE=file` → Redis `[PENDING — belum diimplementasi]`

**Prasyarat yang belum terpenuhi:**
1. Tidak ada service `redis` di `docker-compose.yml`
2. `.env` VPS: `REDIS_HOST=127.0.0.1` (loopback — tidak valid di Docker network)

**Yang perlu dilakukan sebelum implement:**
```yaml
# docker-compose.yml — tambah service:
redis:
  image: redis:7-alpine
  container_name: mosa-redis
  restart: unless-stopped
  networks:
    - mosa-network
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 3s
    retries: 5
```
```bash
# .env VPS — ubah:
REDIS_HOST=redis          # ← nama service docker, bukan 127.0.0.1
CACHE_STORE=redis
```
```bash
# deploy:
docker compose up -d redis && docker compose restart backend queue-worker
```

**Manfaat:** Cache read/write 10–100× lebih cepat, `Cache::pull()` atomic via Redis `GETDEL`, tidak ada disk I/O untuk `enrollment_last_tag` yang ditulis 10–50×/detik.

**Risiko:** Jika Redis gagal start → semua `Cache::` operasi error → SSE stream mati. Deploy bertahap, pastikan Redis healthy sebelum restart backend.

---

### Ringkasan Status Optimasi

| Rec | Deskripsi | Status | File |
|---|---|---|---|
| Rec-1 | Skip curl ke LAN IP di `tryCurlFallback()` | ✅ DEPLOYED | `BroadcastToEdgeBridgeJob.php` |
| Rec-2 | Dedup TAG_READ TTL 2s di `notifyEdgeBridge()` | ~~DEPLOYED~~ → dihapus Rec-3 | `GateEventController.php` |
| Rec-3 | `handleTagSighting()` bypass queue, direct cache | ✅ DEPLOYED | `GateEventController.php` |
| Rec-4 | `CACHE_STORE=file` → Redis | ⏳ PENDING | `docker-compose.yml` + `.env` |

---

## 27. Tag-to-VPS Checklist & Known Issues

Bagian ini adalah **checklist hidup** — semua kondisi yang harus terpenuhi agar tag RFID fisik
terbaca dari reader LAN ke edge bridge ke VPS ke browser. Lengkap dengan known issues dan status verifikasi aktual.

### 27a. Checklist

```
LAPISAN 1 — RFID Reader fisik
  [ ] Reader menyala, antena terhubung, RF power >= 20 dBm (VPS env: RF_POWER_DBM=30)
  [ ] Reader bisa di-reach dari PC edge: telnet 192.168.2.200 2022 → terhubung
  [ ] Reader terdaftar di gate_devices: ip_address=192.168.2.200, tcp_port=2022, is_active=true
      DB saat ini: GATE-01 | ip=192.168.2.200 | port=2022 | active=true | has_token=true

LAPISAN 2 — Edge Bridge (harus jalan di PC lokal gudang, BUKAN container VPS)
  [ ] node index.js berjalan di PC LAN gudang dengan env yang benar
  [ ] DEVICE_API_TOKEN di-set → edge kirim: Authorization: Bearer {token}
  [ ] ENABLE_DIRECT_READER=true → connectDirectReader() dipanggil
  [ ] fetchPairedDevices() → GET /api/devices/config → dapat ip_address=192.168.2.200:2022
      Log: "Loaded Reader config from API: GATE-01 (192.168.2.200:2022, Warehouse #1)"
  [ ] TCP connect ke 192.168.2.200:2022 berhasil
      Log: "Direct reader connected"
  [ ] SSE ke VPS terkoneksi: "Connected to VPS event stream"
      (reconnect setiap ~55s = normal, bukan error)

  !! KNOWN ISSUE — EDGE-LOC: container mosa-edge-bridge di VPS TIDAK bisa akses LAN gudang
     Container berjalan di 206.237.98.48 — tidak bisa reach 192.168.2.200 (LAN internal gudang)
     → Container VPS hanya untuk testing/staging tanpa reader fisik
     → PRODUKSI: jalankan edge bridge di PC lokal gudang (node index.js)

LAPISAN 3 — Autentikasi Device ke VPS (auth.device middleware)
  [ ] DEVICE_API_TOKEN edge = token yang SHA-256-nya ada di gate_devices.api_token_hash
  [ ] Middleware: bearerToken() → hash('sha256', token) → lookup gate_devices → 200
  [ ] Jika token salah → 401 → edge log "sendTagSighting failed"

  ✅ FIXED — RK-V2 (Oktober 2026): Rate limiter 'gate-events' diperbaiki
     bootstrap/app.php baris 45: LAMA: $request->header('X-Device-Token') ?? $request->ip()
                                 BARU: $request->bearerToken() ?? $request->ip()
     Edge kirim: Authorization: Bearer {token}  ← sekarang di-baca dengan benar
     Efek sebelum fix: rate limit per-IP (share semua device di IP sama)
     Efek setelah fix: rate limit per-device-token (120 req/mnt per device)

LAPISAN 4 — VPS menerima POST /api/gate/sighting
  [ ] Edge sendTagSighting() timeout 2500ms — cukup untuk VPS response
  [ ] Dedup edge: ENROLLMENT=300ms / GATE=1000ms per EPC (in-memory Map)
  [ ] VPS tulis dua cache (Rec-3, no queue):
        Cache::put("edge_sse_event:1", ..., TTL 60s)    ← PATH 1
        Cache::put("enrollment_last_tag:1", ..., TTL 30s) ← PATH 2
  [ ] Response 200 OK dalam < 50ms

LAPISAN 5 — Edge SSE stream menerima dari VPS → forward ke browser LAN
  [ ] EdgeStreamController::stream() loop pull "edge_sse_event:1" tiap ~500ms
  [ ] Edge _onVpsEvent('broadcast') → this.broadcast(data) ke WS clients
  [ ] Browser LAN terima TAG_READ via ws://192.168.1.106:2078/

LAPISAN 6 — Browser luar LAN menerima via Enrollment SSE
  [ ] GET /api/enrollment/stream?warehouse_id=1 + Authorization: Bearer {user_token}
  [ ] Poll 100ms: Cache::get("enrollment_last_tag:1") → emit jika received_at berubah
  [ ] Heartbeat setiap 15s, reconnect setiap 55s

LAPISAN 7 — UI TagEnrollment.jsx / GateMonitor.jsx update
  [ ] liveScannedTag di-set dari WS event TAG_READ (browser LAN)
  [ ] atau dari SSE event tag_read (browser luar LAN)
  [ ] EPC tampil → user klik Enroll → POST /api/tags/enroll
```

---

### 27b. Alur Sighting End-to-End dengan Latensi

```
Reader fisik scan tag EPC
    │
    ▼ TCP (LAN, < 1ms)
Edge onTagDetected(epc, antenna, rssi)
    │ dedup in-memory: ENROLLMENT=300ms / GATE=1000ms per EPC
    ├─ broadcast TAG_READ ke WS clients LAN               < 5ms
    ▼
    sendTagSighting() POST /api/gate/sighting              timeout 2500ms
    │
    ▼ HTTPS (Internet, 30-100ms RTT ke VPS)
VPS handleTagSighting()                                    < 5ms total
    ├─ PATH 1: Cache::put("edge_sse_event:1")              < 1ms
    │   EdgeStreamController::stream() pull loop           ≤ 500ms
    │   → SSE emit ke edge → edge broadcast WS             < 5ms
    │
    └─ PATH 2: Cache::put("enrollment_last_tag:1")         < 1ms
        EnrollmentStreamController poll 100ms              ≤ 100ms
        → SSE emit ke browser luar LAN                     < 5ms

Estimasi total tag terdeteksi → browser luar LAN:
  Reader → Edge: < 5ms (TCP LAN)
  Edge → VPS:  30-100ms (HTTPS Internet)
  VPS cache write + SSE poll: ≤ 150ms
  ─────────────────────────────────────
  Total: ~150–300ms  (vs sebelumnya 2–4 detik via queue)
```

---

### 27c. Kondisi yang Bikin Tag TIDAK Terbaca

| # | Kondisi | Gejala | Perintah cek | Fix |
|---|---|---|---|---|
| 1 | Reader mati / tidak connect | Tidak ada TAG_READ sama sekali | `telnet 192.168.2.200 2022` timeout | Nyalakan reader, cek kabel antena |
| 2 | Edge jalan di VPS container (bukan PC gudang) | Edge tidak bisa TCP ke 192.168.2.200 | `docker logs mosa-edge-bridge \| grep -i reader` → tidak ada "connected" | Jalankan `node index.js` di PC LAN gudang |
| 3 | DEVICE_API_TOKEN salah / kosong | HTTP 401, edge log error | `docker logs mosa-edge-bridge \| grep 401` | Set env DEVICE_API_TOKEN = token yang hash-nya ada di DB |
| 4 | Rate limit 120/mnt terlampaui | HTTP 429 saat rapid-fire | `docker logs mosa-backend \| grep 429` | Rate limit per device-token (RK-V2 FIXED). Jika masih 429: cek 1 token tidak dipakai >120 req/mnt |
| 5 | `enrollment_last_tag:1` tidak diperbarui | Browser SSE tidak emit event | `php artisan tinker --execute "dump(Cache::get('enrollment_last_tag:1'));"` | Cek DEVICE_API_TOKEN + VPS log POST sighting |
| 6 | SSE EdgeStream tidak aktif | Edge tidak terima broadcast VPS | `docker logs mosa-edge-bridge \| grep SSE` | Restart edge, cek nginx SSE config |
| 7 | Mode bukan ENROLLMENT | dedupThreshold 1000ms (lambat) | Log edge: `operational_mode` | Ganti mode ke ENROLLMENT via WS control |
| 8 | EPC belum enrolled di DB | Tag terdeteksi tapi gate DENIED | `SELECT * FROM rfid_tags WHERE epc='EPC';` | Enroll tag dulu via TagEnrollment.jsx |

---

### 27d. Perintah Verifikasi Cepat (dari VPS)

```bash
# 1. Semua container healthy?
docker ps --format 'table {{.Names}}\t{{.Status}}'

# 2. SSE edge terkoneksi ke VPS?
docker logs mosa-edge-bridge --tail=10 | grep SSE

# 3. Queue bersih? (0 rows = bagus)
docker exec mosa-postgres psql -U mosa_user -d mosa_wms \
  -c 'SELECT queue, COUNT(*) FROM jobs GROUP BY queue;'

# 4. Gate device terdaftar + token ada?
docker exec mosa-postgres psql -U mosa_user -d mosa_wms \
  -c 'SELECT device_code, is_active, ip_address, tcp_port, api_token_hash IS NOT NULL as has_token FROM gate_devices;'

# 5. Cache sighting ada data? (jalankan saat reader aktif scan)
docker exec mosa-backend php artisan tinker --execute \
  "dump(Cache::get('enrollment_last_tag:1'));"

# 6. Test endpoint sighting manual (ganti TOKEN dan DOMAIN)
curl -s -X POST https://DOMAIN/api/gate/sighting \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"epc":"E28069150000402D4160D5F2","antenna":1,"rssi":-60}' | jq .
```

---

### 27e. Known Issues

| ID | Status | Masalah | File & Baris | Dampak | Fix |
|---|---|---|---|---|---|
| **RK-V2** | ✅ **FIXED** | Rate limiter `gate-events` baca `X-Device-Token` tapi edge kirim `Authorization: Bearer` | `bootstrap/app.php` baris 45 | Rate limit per-IP bukan per-device | Diganti `bearerToken()` — Oktober 2026 |
| **EDGE-LOC** | 🔴 **OPEN** | `mosa-edge-bridge` container VPS tidak bisa TCP ke LAN gudang 192.168.2.200 | `docker-compose.yml` | Tidak ada live read dari container VPS | Jalankan edge di PC gudang, bukan container VPS |
| **REC-4** | 🔴 **OPEN** | `CACHE_STORE=file` — disk I/O lambat saat enrollment rapid-fire | `.env` + `docker-compose.yml` | Latensi naik saat beban tinggi | Tambah Redis service, ganti CACHE_STORE=redis |

---

## 28. Database Schema Reference

Schema lengkap tabel yang relevan dengan alur RFID — diambil langsung dari PostgreSQL VPS production.
Koneksi: `mosa-postgres` container, DB `mosa_wms`, user `mosa_user`.

> **Data aktual (Oktober 2026):**
> `rfid_tags` = **2 tag** | `gate_pass_events` = **23.192 event** | `custody_ledger` = 3 entri | `gate_devices` = 1 device | `shipping_documents` = **56 dokumen** (update Oktober 2026)

---

### 28a. `rfid_tags` — Registri semua tag RFID fisik

```
Tujuan: satu baris per tag fisik. EPC adalah natural unique key.
Tag harus ada di sini sebelum bisa melewati gate atau di-enroll ke dokumen.

 Kolom               | Tipe                    | Keterangan
 ────────────────────┼─────────────────────────┼────────────────────────────────────────
 id                  | bigint PK               | auto-increment
 epc                 | varchar(64) UNIQUE      | EPC tag fisik, contoh: E28069150000402D4160D5F2
 item_id             | bigint FK→items         | item yang dikaitkan (CASCADE DELETE)
 tag_type            | varchar(50)             | default: 'anti_metal'
 status              | varchar(50)             | 'active'|'attached'|'lost'|'retired'
 last_warehouse_id   | bigint FK→warehouses    | gudang terakhir tag terdeteksi (nullable)
 last_read_at        | timestamp               | waktu terakhir tag terbaca reader
 notes               | text                    | catatan manual
 project_id          | bigint FK→projects      | proyek pemilik (nullable)
 total_length_m      | numeric(12,3)           | panjang total drum kabel (nullable)
 remaining_length_m  | numeric(12,3)           | sisa panjang setelah partial withdrawal
 created_at/updated_at | timestamp             | standard Laravel

Indexes: epc UNIQUE, (item_id,status), (status,last_warehouse_id)

Contoh data aktual:
 id=1 | epc=E28069150000402D4160D5F2 | item_id=1 | status=active | last_warehouse_id=null
 id=2 | epc=E28069150000402D4160B9F2 | item_id=1 | status=active | last_warehouse_id=null
 (Oktober 2026 — setelah siklus inbound+outbound selesai)
```

```sql
-- Semua tag terdaftar
SELECT epc, status, last_warehouse_id, last_read_at FROM rfid_tags;
-- Cari by EPC
SELECT * FROM rfid_tags WHERE epc = 'E28069150000402D4160D5F2';
-- Tag aktif di gudang 1
SELECT rt.epc, i.name, rt.status FROM rfid_tags rt
JOIN items i ON i.id = rt.item_id
WHERE rt.last_warehouse_id = 1 AND rt.status = 'active';
```

---

### 28b. `gate_devices` — Registri edge bridge dan reader

```
Tujuan: satu baris per gate device. Menyimpan IP reader, port TCP, token auth, heartbeat.

 Kolom                               | Tipe                | Keterangan
 ────────────────────────────────────┼─────────────────────┼────────────────────────────────────────────
 id                                  | bigint PK           |
 warehouse_id                        | bigint FK           | gudang yang dilayani
 device_code                         | varchar(50) UNIQUE  | contoh: 'GATE-01'
 device_name                         | varchar(100)        | nama display
 ip_address                          | varchar(50)         | IP reader di LAN gudang (192.168.2.200)
 tcp_port                            | integer             | port TCP reader (produksi: 2022)
 status                              | varchar(20)         | 'online'|'offline'|'degraded'
 last_heartbeat_at                   | timestamp           | heartbeat terakhir dari edge bridge
 metrics_json                        | json                | snapshot metrik edge (tag rate, uptime)
 is_active                           | boolean             | default true
 device_role                         | varchar(30)         | 'gate_controller'|'enrollment_only'
 api_token_hash                      | varchar(64) UNIQUE  | SHA-256 dari DEVICE_API_TOKEN
 internet_downtime_tolerance_seconds | integer             | default 90s (offline buffer)
 edge_ws_url                         | varchar(2048)       | ws://LAN-IP:2078/ (VPS→edge push)

Data aktual:
 GATE-01 | ip=192.168.2.200 | tcp_port=2022 | wh=1 | active=true
 edge_ws_url=ws://192.168.1.106:2078/
```

```sql
-- Status + berapa lama tidak heartbeat
SELECT device_code, status, ip_address, tcp_port,
       api_token_hash IS NOT NULL AS has_token,
       ROUND(EXTRACT(EPOCH FROM (NOW()-last_heartbeat_at))/60) AS menit_lalu
FROM gate_devices;
```

---

### 28c. `gate_pass_events` — Log semua GATE_EVENT (append-only)

```
Tujuan: setiap GATE_EVENT dari edge tersimpan di sini. Berisi EPC + keputusan ALLOW/DENY.

 Kolom                | Tipe         | Keterangan
 ─────────────────────┼──────────────┼──────────────────────────────────────────────
 id                   | bigint PK    |
 warehouse_id         | bigint FK    | gudang asal
 gate_id              | varchar(50)  | device_code (default 'GATE-01')
 direction            | varchar(20)  | 'IN'|'OUT'|'UNKNOWN'
 antenna_sequence     | varchar(20)  | 'A→B' (OUT) | 'B→A' (IN) | 'A' (single)
 tag_epcs_json        | json         | array EPC terdeteksi dalam event
 total_tags_detected  | integer      | jumlah tag
 is_valid             | boolean      | false jika event diabaikan
 mismatch_flag        | boolean      | true jika ada tag di luar dokumen
 mismatch_details     | text         | penjelasan mismatch
 event_id             | uuid UNIQUE  | dedup key dari edge per gate_device_id
 observed_at          | timestamp    | waktu di edge (bukan waktu VPS terima)
 decision_result_json | json         | ALLOW/DENY + alasan + tag list
 shipping_document_id | bigint FK→shipping_documents | dokumen divalidasi (nullable)
 gate_device_id       | bigint FK→gate_devices       |

Indexes: (gate_device_id,event_id) UNIQUE, (mismatch_flag,created_at),
         shipping_document_id, (warehouse_id,id DESC)

Data aktual: **23.192 event** (Oktober 2026)
```

```sql
-- 10 event terakhir
SELECT id, gate_id, direction, total_tags_detected, mismatch_flag, observed_at
FROM gate_pass_events ORDER BY id DESC LIMIT 10;
-- Mismatch hari ini
SELECT id, gate_id, direction, tag_epcs_json, mismatch_details
FROM gate_pass_events WHERE mismatch_flag = true AND created_at >= CURRENT_DATE;
```

---

### 28d. `custody_ledger` — Audit trail pergerakan aset (IMMUTABLE)

```
PENTING: Tabel ini TIDAK PERNAH di-UPDATE atau DELETE.
Koreksi = baris event koreksi baru, bukan edit baris lama.

 Kolom          | Keterangan
 ───────────────┼──────────────────────────────────────────────────────────────
 tag_epc        | EPC tag (nullable untuk item non-RFID)
 item_id FK     | item yang berpindah custody
 holder_user_id | user yang memegang / menerima aset
 action         | 'CHECKOUT'|'CHECKIN'|'TRANSFER'|'AUDIT'
 ref_type       | 'GatePassEvent'|'ShippingDocument'|dll
 ref_id         | ID referensi sesuai ref_type
 warehouse_id   | gudang asal aksi (nullable)
 quantity_value | untuk length-based item (meter, nullable)
 created_at     | CURRENT_TIMESTAMP — immutable saat insert

Indexes: holder_user_id, (item_id,created_at), tag_epc,
         (warehouse_id,action,created_at), (ref_type,ref_id)

Data aktual: 3 entri
```

---

### 28e. `shipping_documents` + `shipping_document_tags`

```
shipping_documents — header dokumen pengiriman (**56 dokumen aktual**, Oktober 2026)
 document_number UNIQUE | nomor dokumen
 type                   | 'DO'|'SJ'|'BAST'|dll
 status                 | 'draft'|'approved'|'archived'
 warehouse_id FK        | gudang asal
 attachments jsonb      | file lampiran

shipping_document_tags — tag RFID dalam dokumen
 tag_epc                   | EPC tag (mandatory)
 rfid_tag_id FK→rfid_tags  | nullable (SET NULL jika tag dihapus)
 shipping_document_item_id | item baris dalam dokumen
 status                    | 'expected'|'scanned'|'missing'|'extra'
 scanned_at                | waktu konfirmasi scan di gate
 length_dispatched         | panjang dikirim meter (drum kabel)
UNIQUE: (shipping_document_id, rfid_tag_id)
```

---

### 28f. `items` — Master data barang

```
 Kolom             | Keterangan
 ──────────────────┼──────────────────────────────────────────────────────
 code UNIQUE       | kode barang internal
 is_metal          | true = perlu casing anti-metal
 is_reusable       | true = tag bisa dilepas dan dipakai ulang
 is_serialized_tag | true = satu tag per unit (default true)
 is_length_based   | true = drum kabel, pakai partial withdrawal
 epc_prefix UNIQUE | prefix auto-generate EPC
 epc_suffix_digits | panjang suffix (default 14 digit)
 epc_next_sequence | counter urutan EPC berikutnya (increment saat enroll)
```

---

### 28g. `device_health_incidents` — Log kesehatan edge bridge

```
 Kolom          | Keterangan
 ───────────────┼────────────────────────────────────────────────────────
 event_id UNIQUE| dedup UUID dari edge
 component      | 'reader'|'internet'|'sse'|'websocket'
 status         | 'connected'|'disconnected'|'degraded'|'auth_required'
 reason         | pesan penjelasan (maks 500 char)
 observed_at    | waktu kejadian di edge
 received_at    | waktu VPS terima laporan
```

---

### 28h. Relasi Antar Tabel

```
warehouses
  ├── gate_devices           (warehouse_id)
  ├── rfid_tags              (last_warehouse_id, nullable)
  ├── gate_pass_events       (warehouse_id)
  ├── shipping_documents     (warehouse_id)
  └── custody_ledger         (warehouse_id, nullable)

items
  ├── rfid_tags              (item_id, CASCADE DELETE)
  ├── gate_transaction_items (item_id)
  └── custody_ledger         (item_id)

rfid_tags
  └── shipping_document_tags (rfid_tag_id, SET NULL on delete)

gate_devices
  ├── gate_pass_events       (gate_device_id, RESTRICT delete)
  └── device_health_incidents(gate_device_id, CASCADE)

shipping_documents
  ├── shipping_document_items(CASCADE)
  ├── shipping_document_tags (CASCADE)
  └── gate_pass_events       (SET NULL)
```

---

### 28i. `shipping_document_items` — Baris item dalam dokumen

```
Tujuan: satu baris per item per dokumen. Progress dihitung dari expected_qty vs scanned_qty.
UNIQUE: (shipping_document_id, item_id) — satu item tidak boleh duplikat dalam 1 dokumen.

 Kolom               | Tipe        | Keterangan
 ────────────────────┼─────────────┼──────────────────────────────────────────────────
 id                  | bigint PK   |
 shipping_document_id| bigint FK   | dokumen induk (CASCADE DELETE)
 item_id             | bigint FK   | barang (CASCADE DELETE)
 expected_qty        | integer     | jumlah unit yang direncanakan dikirim
 scanned_qty         | integer     | jumlah unit yang sudah terkonfirmasi scan di gate

Relasi ke bawah:
  shipping_document_tags.shipping_document_item_id → CASCADE DELETE
  (setiap tag RFID terhubung ke baris item ini)
```

```sql
-- Progress scanning per dokumen
SELECT sdi.id, i.name, sdi.expected_qty, sdi.scanned_qty,
       ROUND(sdi.scanned_qty * 100.0 / NULLIF(sdi.expected_qty, 0), 1) AS pct
FROM shipping_document_items sdi
JOIN items i ON i.id = sdi.item_id
WHERE sdi.shipping_document_id = 1;
```

---

### 28j. `gate_transactions` — Otorisasi keluar barang via Work Order

```
Tujuan: otorisasi internal proyek untuk pengeluaran material berdasarkan Work Order.
Berbeda dari shipping_documents (pengiriman eksternal). Data aktual: 0 transaksi.

 Kolom                | Tipe           | Keterangan
 ─────────────────────┼────────────────┼────────────────────────────────────────────
 id                   | bigint PK      |
 transaction_number   | varchar UNIQUE | nomor transaksi auto-generate
 work_order_id        | bigint FK      | WO dasar otorisasi (CASCADE DELETE)
 warehouse_id         | bigint FK      | gudang asal (CASCADE DELETE)
 pic_user_id          | bigint FK      | PIC yang buat transaksi (RESTRICT)
 type                 | varchar(50)    | 'OUT_FULFILLMENT' (default) | 'RETURN'
 status               | varchar(50)    | pending_approval|approved|rejected|completed
 is_auto_approved     | boolean        | true = tidak butuh approval manual
 approved_by_user_id  | bigint FK      | approver (RESTRICT, nullable)
 approved_at          | timestamp      | nullable
 rejection_reason     | text           | nullable
 valid_until          | timestamp      | batas waktu otorisasi (nullable)
 vehicle_id           | bigint FK      | kendaraan (SET NULL, nullable)
 plate_number_snapshot| varchar(50)    | nomor polisi saat transaksi

Relasi ke bawah: gate_transaction_items (gate_transaction_id) CASCADE DELETE
```

---

## 29. REST API Quick Reference

Semua endpoint diambil dari `backend/routes/api.php` aktual VPS. Source of truth: file tersebut.

---

### 29a. Grup Device Auth (`Authorization: Bearer DEVICE_API_TOKEN`)

Middleware: `auth.device` | Throttle: `throttle:gate-events` (120 req/mnt per device-token — RK-V2 FIXED Oktober 2026)

| Method | Path | Controller#method | Throttle | Keterangan |
|---|---|---|---|---|
| `GET` | `/api/edge/events` | `EdgeStreamController#stream` | ❌ | SSE reverse channel VPS→edge: push config & broadcast |
| `POST` | `/api/gate/event` | `GateEventController#handleGateEvent` | ✅ | GATE_EVENT — simpan DB, keputusan ALLOW/DENY/STANDBY |
| `POST` | `/api/gate/sighting` | `GateEventController#handleTagSighting` | ✅ | Sighting ringan — 2 cache key, no queue, <5ms |
| `POST` | `/api/devices/heartbeat` | `DeviceTelemetryController#heartbeat` | ✅ | Heartbeat tiap 10s — update `last_heartbeat_at` |
| `POST` | `/api/devices/incidents` | `DeviceTelemetryController#storeIncident` | ✅ | Laporan insiden hardware |
| `GET` | `/api/devices/config` | `DeviceTelemetryController#config` | ✅ | Config gate + dokumen aktif + IP reader |

---

### 29b. Grup Publik (tanpa auth)

| Method | Path | Controller#method | Keterangan |
|---|---|---|---|
| `POST` | `/api/auth/login` | `AuthController#login` | Login → Sanctum token. Throttle: 10/mnt per IP |
| `GET` | `/api/enrollment/stream` | `EnrollmentStreamController#stream` | SSE relay sighting. Auth manual via `?token=` atau `Authorization: Bearer` |

---

### 29c. Grup User Auth (Sanctum) — Tag RFID & Gate Events

Middleware: `auth:sanctum` + `throttle:api` (300/mnt per user)

| Method | Path | Role | Keterangan |
|---|---|---|---|
| `GET` | `/api/gate/stream` | SA,PM,PIC | SSE live feed gate events — GateMonitor |
| `GET` | `/api/gate/live-feed` | SA,PM,PIC | Polling fallback recent gate events |
| `POST` | `/api/gate/simulate` | SA,PM | Simulasi gate event (tidak disimpan sebagai bukti) |
| `DELETE` | `/api/gate/events/{id}` | SA ⚠️ | Hapus satu event (tidak ada role check eksplisit) |
| `DELETE` | `/api/gate/events` | SA ⚠️ | Clear semua history (tidak ada role check eksplisit) |
| `GET` | `/api/tags` | SA,PM | Daftar semua tag RFID |
| `POST` | `/api/tags/enroll` | SA,PM | Enroll EPC baru (`status=active`) |
| `POST` | `/api/tags/reserve` | SA,PM | Reserve EPC dari prefix item |
| `POST` | `/api/tags/bulk-delete` | SA | Bulk decommission |
| `GET` | `/api/tags/{epc}` | SA,PM | Detail satu tag |
| `PATCH` | `/api/tags/{epc}/status` | SA,PM,PIC | Update status: `active\|attached\|defective\|lost` |
| `POST` | `/api/tags/{epc}/reactivate` | SA | `decommissioned` → `active` |
| `DELETE` | `/api/tags/{epc}` | SA | Soft decommission |
| `DELETE` | `/api/tags/{epc}/hard-delete` | SA | Hard delete (hanya dari `decommissioned`) |


---

### 29d. Grup User Auth — Shipping Documents

| Method | Path | Role | Keterangan |
|---|---|---|---|
| `GET` | `/api/shipping-documents` | SA,PM,PIC | Daftar dokumen (filter: status, type, archived) |
| `POST` | `/api/shipping-documents` | SA,PM | Buat dokumen baru (`status=draft`) |
| `GET` | `/api/shipping-documents/{id}` | SA,PM,PIC | Detail + items + tags |
| `PUT` | `/api/shipping-documents/{id}` | SA,PM | Edit (hanya saat draft/approved) |
| `DELETE` | `/api/shipping-documents/{id}` | SA | Arsipkan (soft archive) |
| `POST` | `/api/shipping-documents/{id}/approve` | SA,PM | Draft → approved |
| `POST` | `/api/shipping-documents/{id}/assign-tags` | SA,PM,PIC | Assign tag RFID ke item dokumen |
| `POST` | `/api/shipping-documents/{id}/scan-tag` | SA,PM,PIC | Manual scan satu tag |
| `POST` | `/api/shipping-documents/{id}/batch-scan` | SA,PM,PIC | Batch scan multiple tag |
| `POST` | `/api/shipping-documents/{id}/complete` | SA,PIC | Selesaikan dokumen setelah semua tag gate |
| `POST` | `/api/shipping-documents/{id}/cancel` | SA,PM | Batalkan dokumen |
| `GET` | `/api/shipping-documents/{id}/stock-reconciliation` | SA,PM,PIC | Preview rekonsiliasi stok |
| `POST` | `/api/shipping-documents/{id}/stock-reconciliation` | SA,PM,PIC | Commit rekonsiliasi stok inbound |

---

### 29e. Grup User Auth — Devices, Auth, Reports

| Method | Path | Keterangan |
|---|---|---|
| `GET` | `/api/devices` | Daftar gate devices |
| `POST` | `/api/devices` | Daftarkan device baru (SA,PM) — `device_token` → `sha256(token)` |
| `PUT` | `/api/devices/{id}` | Edit device config (SA,PM) |
| `DELETE` | `/api/devices/{id}` | Hapus device (SA,PM) |
| `POST` | `/api/devices/test-connection` | Probe TCP ke IP:port reader |
| `GET` | `/api/devices/status` | Status + metrics semua device aktif |
| `GET` | `/api/devices/incidents` | Riwayat insiden kesehatan device |
| `POST` | `/api/ws-control-ticket` | Generate WS control ticket (HMAC signed, TTL 60s) |
| `GET` | `/api/reports/stocks` | Ringkasan stok per item per gudang |
| `GET` | `/api/reports/stock-card` | Kartu stok — riwayat masuk/keluar per item |
| `GET` | `/api/reports/audit-trail` | Audit trail `custody_ledger` |
| `GET` | `/api/reports/dashboard-kpis` | KPI (total tag, event hari ini, mismatch rate) |
| `POST` | `/api/auth/login` | Login → Sanctum token |
| `GET` | `/api/auth/me` | Profil user yang sedang login |
| `PUT` | `/api/auth/profile` | Update profil |
| `PUT` | `/api/auth/password` | Ganti password |
| `POST` | `/api/auth/logout` | Invalidate Sanctum token |

---

### 29f. Payload & Response Kunci

**POST `/api/gate/event`** — dari edge bridge:
```json
{
  "event_id": "uuid-v4",
  "observed_at": "2026-10-22T08:00:00+07:00",
  "antenna_sequence": "A_TO_B",
  "direction": "OUT",
  "epc_list": ["E28069150000402D4160D5F2"],
  "shipping_document_id": 12,
  "raw_payload": {}
}
```
Response (gate terbuka): `{ "unlock_gate": true, "status": "SUCCESS", "pass_event_id": 2209, ... }`
Response (standby): `{ "unlock_gate": false, "status": "STANDBY", "is_undercount": true, ... }`
Response (ditolak): `{ "unlock_gate": false, "status": "DENIED", "mismatch": true, "mismatch_details": [...] }`

**POST `/api/gate/sighting`** — sighting ringan:
```json
{ "epc": "E28069150000402D4160D5F2", "antenna": 1, "rssi": -60 }
```
Response: `{ "ok": true }`

**POST `/api/devices`** — daftarkan device dengan token:
```json
{ "warehouse_id": 1, "device_code": "GATE-01", "ip_address": "192.168.2.200",
  "tcp_port": 2022, "device_token": "plaintext-min-32-chars" }
```
> `device_token` → backend simpan `sha256(token)` ke `api_token_hash`. Plaintext tidak tersimpan.


---

## 30. Role & Permission per Endpoint RFID

Sumber: kode controller aktual VPS.

---

### 30a. Role yang Ada

| Role | Kode | Deskripsi |
|---|---|---|
| Super Administrator | `superadmin` | Akses penuh semua endpoint |
| Project Manager | `pm` | Operasional: buat/approve dokumen, master data |
| PIC Lapangan | `pic_lapangan` | Eksekusi: assign/scan tag, complete dokumen, monitor |

> Role disimpan di `users.role` (VARCHAR). Tidak ada FK ke tabel roles — dijaga per controller.

---

### 30b. Matriks Permission (dari kode aktual)

| Endpoint | SA | PM | PIC | Catatan kode |
|---|:---:|:---:|:---:|---|
| `GET /api/tags` | ✅ | ✅ | ❌ | `!in_array(role,['superadmin','pm'])` → 403 |
| `POST /api/tags/enroll` | ✅ | ✅ | ❌ | Same |
| `PATCH /api/tags/{epc}/status` | ✅ | ✅ | ✅ | `['superadmin','pm','pic_lapangan']` |
| `DELETE /api/tags/{epc}` | ✅ | ❌ | ❌ | Hanya `superadmin` |
| `POST /api/tags/bulk-delete` | ✅ | ❌ | ❌ | Hanya `superadmin` |
| `POST /api/tags/{epc}/reactivate` | ✅ | ❌ | ❌ | Hanya `superadmin` |
| `GET /api/gate/stream` | ✅ | ✅ | ✅ | Semua role |
| `POST /api/gate/simulate` | ✅ | ✅ | ✅ | Hanya `auth:sanctum` — tidak ada role check ⚠️ |
| `DELETE /api/gate/events` | ✅ | ✅ | ✅ | Tidak ada role check eksplisit ⚠️ |
| `POST /api/devices` | ✅ | ✅ | ❌ | `['superadmin','pm']` |
| `POST /api/shipping-documents` | ✅ | ✅ | ❌ | `['pm','superadmin']` |
| `POST /api/shipping-documents/{id}/approve` | ✅ | ✅ | ❌ | Same |
| `POST /api/shipping-documents/{id}/assign-tags` | ✅ | ✅ | ✅ | `['pic_lapangan','pm','superadmin']` |
| `POST /api/shipping-documents/{id}/complete` | ✅ | ❌ | ✅ | `['pic_lapangan','superadmin']` |
| `DELETE /api/shipping-documents/{id}` | ✅ | ❌ | ❌ | Hanya `superadmin` |

> ⚠️ **Gap:** `DELETE /api/gate/events` dan `POST /api/gate/simulate` tidak ada role check eksplisit. Dilindungi hanya oleh `auth:sanctum` — semua user yang login bisa akses.

---

### 30c. Cara Rotate `DEVICE_API_TOKEN`

```bash
# 1. Generate token baru (min 32 char)
openssl rand -hex 40

# 2. Update device via API (login PM/SA dulu)
curl -s -X PUT https://DOMAIN/api/devices/1 \
  -H "Authorization: Bearer SANCTUM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"device_token": "token-plaintext-baru"}' | jq .
# Backend simpan sha256(token) → api_token_hash. Plaintext tidak tersimpan di DB.

# 3. Update .env di PC gudang: DEVICE_API_TOKEN=token-plaintext-baru

# 4. Restart edge: pm2 restart edge-bridge

# 5. Verifikasi heartbeat masuk
docker exec mosa-postgres psql -U mosa_user -d mosa_wms \
  -c 'SELECT device_code, last_heartbeat_at FROM gate_devices;'
```

---

## 31. State Machine Tag RFID

Sumber: `RfidTagController.php` + `GateEngineService.php` aktual VPS.

---

### 31a. Nilai Status dan Semantiknya

| Status | Artinya | Boleh Gate? | Diset Oleh |
|---|---|:---:|---|
| `active` | Tag terdaftar / sudah keluar gudang, siap untuk inbound baru | ✅ | Enroll baru; GATE_OUT (barang keluar gudang); reactivate |
| `attached` | Barang sudah GATE_IN — ada di dalam gudang, siap untuk outbound | ✅ | GateEngineService.recordGateCustody() saat direction=IN |
| `reserved` | EPC di-reserve tapi belum ditempel fisik | ❌ | `POST /tags/reserve` |
| `defective` | Tag rusak fisik | ❌ | `PATCH /tags/{epc}/status` → `defective` |
| `lost` | Tag hilang | ❌ | `PATCH /tags/{epc}/status` → `lost` |
| `decommissioned` | Dinonaktifkan permanen | ❌ | `DELETE /tags/{epc}` atau bulk-delete |

> **GateEngine rule (GateEngineService.php ~baris 295):** status BUKAN `active` atau `attached` → `mismatch_flag=true`. Untuk outbound juga verifikasi `status=attached`+`last_warehouse_id=wh dokumen` (~baris 320–326); inbound verifikasi `status=active`+`last_warehouse_id=null` (~baris 327–329).

---

### 31b. Diagram Transisi

```
  POST /tags/enroll
  POST /tags/{epc}/reactivate (SA only)
         |
         v
     [ active ]  ---------> GATE_IN / direction=IN ----------->  [ attached ]
         ^                  (barang masuk gudang)                      |
         |                  rfid_tags.status = attached                |
         |                  last_warehouse_id = warehouse_id           |
         |                                                             |
         <--------- GATE_OUT / direction=OUT (dokumen outbound) <------+
                    (barang keluar gudang)
                    rfid_tags.status = active
                    last_warehouse_id = null

  [ active / attached ]
       | PATCH /status (SA, PM, PIC)
       +---> [ defective ]
       +---> [ lost ]
                | DELETE /tags/{epc} atau bulk-delete (SA)
                v
         [ decommissioned ] ---> reactivate (SA) ---> [ active ]

  [ reserved ] ---> enroll manual ulang ---> [ active ]
```

### 31c. Status vs Gate Decision

```
OUTBOUND (direction=OUT, dokumen outbound):
  attached + last_warehouse_id = wh dokumen  →  ✅ ALLOW
  active   + last_warehouse_id = wh dokumen  →  ❌ DENY (belum masuk gudang via gate)
  status not in ['active','attached']         →  ❌ DENY (preliminary check)
  EPC tidak ada di rfid_tags                 →  ❌ DENY
  EPC tidak ada di shipping_document_tags    →  ❌ DENY (tidak di-assign ke dokumen)

INBOUND (direction=IN, dokumen inbound):
  active + last_warehouse_id = null          →  ✅ ALLOW (stok baru)
  active + last_warehouse_id ≠ null          →  ❌ DENY (sudah di gudang lain)
  EPC tidak ada di rfid_tags                →  ❌ DENY

Setelah ALLOW (GateEngineService::recordGateCustody):
  direction=IN  (INBOUND)  → rfid_tags.status='attached', last_warehouse_id = warehouse_id
  direction=OUT (OUTBOUND) → rfid_tags.status='active',   last_warehouse_id = null

  Siklus penuh: enroll→active(wh=null) → GATE_IN→attached(wh=1) → GATE_OUT→active(wh=null)
```

---

### 31d. Aturan Bisnis Penting

1. **Enroll** selalu `status='active'` — tidak ada status lain saat enroll pertama.
2. **`reserved`** ≠ enroll aktif — tidak boleh melewati gate. Harus enroll ulang.
3. **`decommissioned`** bersifat terminal — hanya SA yang bisa reactivate.
4. **`attached`** adalah **syarat utama** tag untuk outbound** — tag yang sudah GATE_IN berstatus `attached`. Tag `active` (belum masuk gudang) justru **ditolak** untuk outbound. Siklus: enroll→active → GATE_IN→attached → GATE_OUT→active.
5. **Tidak ada auto-transisi** `lost` → `active`. Harus decommission → reactivate (SA).
6. **`shipping_document_tags.status`** (`expected/scanned/missing/extra`) adalah status tag **dalam konteks 1 dokumen** — terpisah dari `rfid_tags.status` global.

