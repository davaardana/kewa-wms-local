# MOSA WMS RFID — Kontrak REST API

> Snapshot implementasi: 13 September 2026. Source of truth routing: [`backend/routes/api.php`](../backend/routes/api.php); validasi dan otorisasi akhir berada pada controller. Prefix seluruh route: `/api`.

## Konvensi

- JSON, kecuali upload `multipart/form-data` dan stream SSE.
- Pengguna: `Authorization: Bearer <sanctum-token>` melalui `auth:sanctum`.
- Perangkat: bearer token melalui `auth.device`; token dicocokkan dengan hash SHA-256 perangkat aktif.
- Umum: validasi `422`, tidak terautentikasi `401`, tidak berwenang `403`, tidak ditemukan `404`, konflik state/idempotensi `409`.
- `auth-only` berarti controller tidak menegakkan role khusus. Ini adalah status implementasi, bukan rekomendasi keamanan.
- `superadmin` termasuk pada helper role PM, storeroom, dan PIC yang relevan.

## Autentikasi dan File

| Method | Path | Akses | Kontrak inti / side effect |
|---|---|---|---|
| POST | `/auth/login` | Publik | `{email,password}`; membuat token. Kredensial salah `422`, akun nonaktif `403`. |
| GET | `/auth/me` | Pengguna | Mengembalikan user aktif. |
| PUT | `/auth/profile` | Pengguna, semua role | Update profil diri `{name,email,phone?}`; email unik. Field role/status diabaikan. |
| PUT | `/auth/password` | Pengguna, semua role | `{current_password,password,password_confirmation}`; password baru minimal 8 karakter; salah/konfirmasi tidak cocok `422`. |
| POST | `/auth/logout` | Pengguna | Menghapus token saat ini. |
| POST | `/upload` | auth-only | File `jpg/jpeg/png/webp/pdf/doc/docx`, maks. 10 MB; folder allowlist; menyimpan ke `public/uploads`. |

## User dan RBAC

| Method | Path | Akses | Kontrak inti / side effect |
|---|---|---|---|
| GET | `/users` | auth-only | Filter `role`, `search`. |
| POST | `/users` | superadmin | Membuat user; password di-hash. |
| PUT | `/users/{id}` | superadmin | Update profil, role, status, password opsional. |
| DELETE | `/users/{id}` | superadmin | Menonaktifkan `is_active`; tidak menghapus record. |
| PATCH | `/users/{id}/toggle-status` | superadmin | Membalik status aktif. |
| GET | `/roles-permissions` | auth-only | Daftar role/matriks; dapat membuat default bila tabel kosong. |
| POST | `/roles` | superadmin | Membuat role kustom dan permission default. |
| PUT | `/roles/{id}` | superadmin | Update role/permission. |
| DELETE | `/roles/{id}` | superadmin | Menolak role sistem atau yang masih dipakai (`422`). |
| PATCH | `/roles/{id}/toggle-permission` | superadmin | Upsert permission modul. |

## Master Data

| Method | Path | Akses | Kontrak inti / side effect |
|---|---|---|---|
| GET/POST | `/principals` | GET auth-only; POST superadmin/pm/procurement | Kode principal unik. |
| GET/POST | `/projects` | GET auth-only; POST superadmin/pm | Status `active/on_hold/completed`; dapat sinkronkan `warehouse_ids`. |
| GET/POST | `/warehouses` | GET auth-only; POST superadmin/pm | Mode `DUAL_ANTENNA_AUTO/SINGLE_ANTENNA_SESSION`; mendukung `staff_user_ids` dan `project_ids`. |
| PUT | `/warehouses/{id}` | superadmin/pm | Update gudang dan sinkronisasi relasi yang dikirim. |
| GET/POST | `/items` | GET auth-only; POST superadmin/pm/procurement | Kategori `pole/cable/hardware/tools/accessories`; kode unik. POST dapat mengatur `epc_prefix` alfanumerik unik dan `epc_suffix_digits` 1-18. |
| GET/POST | `/vehicles` | GET auth-only; POST superadmin/pm/procurement | Plat unik; tipe kendaraan tervalidasi. |

## Perangkat, Telemetri, dan WebSocket

Heartbeat Edge default saat ini 10 detik dan configurable. Status server memakai umur heartbeat serta toleransi perangkat.

| Method | Path | Akses | Kontrak inti / side effect |
|---|---|---|---|
| POST | `/devices/heartbeat` | perangkat | Identitas gudang/perangkat berasal dari token; update heartbeat, metrics, status reader. |
| POST | `/devices/incidents` | perangkat | `{event_id UUID,component,status,reason?,observed_at}`; idempotent; `201` baru, `200` replay. |
| GET | `/devices/config` | perangkat | Config dan `authorized_transaction` hanya bila tepat satu sesi approved aktif. |
| GET | `/devices/status` | auth-only | Ringkasan Edge dan reader terpisah. |
| GET | `/devices/incidents` | auth-only | Filter `device_id`, `limit` 1–200. |
| GET | `/devices` | auth-only | Filter `warehouse_id`; `handheld_eligible=1` hanya mengembalikan meja enrollment dan Hybrid bila flag environment mengizinkan. |
| POST/PUT | `/devices`, `/devices/{id}` | superadmin/pm | Pair/update reader; token opsional min. 32 karakter, hanya hash disimpan; koneksi TCP diuji. |
| DELETE | `/devices/{id}` | superadmin/pm | Hard-delete konfigurasi perangkat. |
| POST | `/devices/test-connection` | auth-only | Uji TCP server-side; sukses `200`, gagal `422`. |
| POST | `/ws-control-ticket` | Pengguna aktif + assignment/permission | `{warehouse_id,device_id?,requested_commands[]}`; respons `{ticket,expires_at,edge_ws_url,device_id,warehouse_id}`, `Cache-Control: no-store`. Secret min. 32 karakter atau `503`. |

Command WS yang tersedia: `PING`, `GET_MODE`, `SET_MODE:GATE_SECURITY`, `SET_MODE:ENROLLMENT`. Ticket HMAC v2 terikat user, gudang, `device_code`, command, TTL, dan replay protection; Edge wajib mengatur `WS_DEVICE_CODE`. Tiket v1 ditolak, deploy backend/Edge bersamaan.

User management `POST/PUT /users`: hanya superadmin; `warehouse_ids` berupa array opsional berisi ID warehouse unik dan valid. Pada create, kosong/tidak dikirim berarti tanpa assignment. Pada update, field tidak dikirim mempertahankan assignment; array kosong mencabut semuanya. Superadmin selalu mengakses semua warehouse tanpa assignment.

Pairing `POST/PUT /devices`: `edge_ws_url` nullable, maksimum 2048 karakter, hanya `wss://` dengan host valid dan port 1–65535. Kredensial, query, fragmen, whitespace/control, backslash, karakter non-ASCII dan percent encoding ditolak. Field ini **terpisah** dari `ip_address`/`tcp_port` reader. Tulis/hapus konfigurasi memerlukan akun aktif superadmin atau PM dengan assignment gudang; pemindahan memerlukan akses gudang asal dan tujuan.

`device_role=hybrid_workstation` hanya diterima bila `ALLOW_HYBRID_DEVICE=true`; override Windows development mengaktifkannya untuk presentasi. Default/production menolak Hybrid. Scanner handheld fisik meminta mode `ENROLLMENT`; `gate_controller` tidak dapat dipakai sebagai handheld.

Resolusi tiket hanya perangkat aktif di gudang yang diotorisasi: nol/tidak cocok `404`; lebih dari satu tanpa `device_id` menghasilkan `409`; endpoint kosong/tidak valid `503`. Endpoint tidak boleh berasal dari request (`edge_ws_url`/`endpoint` ditolak `422`). Fallback pilot hanya `WS_CONTROL_PILOT_URL` WSS tervalidasi + `WS_CONTROL_PILOT_WAREHOUSE_ID` eksplisit dengan tepat satu perangkat aktif. Default tidak ada fallback. Seluruh pemanggil frontend memakai endpoint respons, bukan `VITE_WS_URL`; live preview pairing memilih perangkat eksplisit. Halaman tanpa pemilih perangkat gagal tertutup bila gudang ambigu.

## RFID Tag

| Method | Path | Akses | Kontrak inti / side effect |
|---|---|---|---|
| GET | `/tags` | auth-only | Filter item/status/gudang; pagination 50. |
| POST | `/tags/enroll` | superadmin/pm/procurement | EPC tunggal/array dinormalisasi dan dedup; identitas tag aktif, `last_warehouse_id=null`, ledger `TAG_ENROLLED` atas user personal. `warehouse_id` opsional hanya konteks reader/audit, bukan stok; tetap dapat dispatch principal; `201`. |
| POST | `/tags/reserve` | superadmin/pm/procurement | `{item_id,quantity,tag_type,notes?}`; quantity 1-1000. Menghasilkan sequence EPC atomik dari format item, menyimpan status `reserved`, lalu mengembalikan daftar untuk ekspor vendor; `201`. Tidak membentuk stok/custody. |
| GET | `/tags/{epc}` | auth-only | Detail tag dan custody history. |
| PATCH | `/tags/{epc}/status` | auth-only | Status `active/attached/defective/lost/decommissioned`; menulis event ledger. |
| DELETE | `/tags/{epc}` | superadmin | Decommission, bukan hard-delete; append `TAG_DECOMMISSIONED`. |
| POST | `/tags/{epc}/reactivate` | superadmin | Hanya dari decommissioned; append `TAG_REACTIVATED`. |
| POST | `/tags/bulk-delete` | superadmin | Decommission atomik daftar EPC; bukan hard-delete. |

TID, access password, lock, dan permalock belum menjadi kontrak API. Lihat [`keamanan-rfid-anti-clone.md`](keamanan-rfid-anti-clone.md).

## SPK dan Delivery

| Method | Path | Akses | Kontrak inti / side effect |
|---|---|---|---|
| GET | `/spks` | Scoped user | Filter principal/payment; visibility berdasarkan relasi/approval/role. |
| POST | `/spks` | auth-only | Membuat SPK, item, dan approval request; `201`. |
| GET | `/spks/{id}` | Scoped user | Detail dan approval history; akses salah `403`. |
| PATCH | `/spks/{id}/payment-status` | auth-only | Update payment status/terms/notes. |
| GET | `/deliveries` | Scoped user | Filter gudang/status; scoped dispatcher, receiver, approval, PM, assignment storeroom. |
| POST | `/deliveries/dispatch-scan` | Pembuat SPK/superadmin | Manifest item dan EPC wajib konsisten/unik; menerima tag `reserved` tanpa enrollment ulang, memvalidasi peruntukan item, membuat delivery `in_transit`, tag `attached`; `201`. |
| POST | `/deliveries/{id}/receiving-scan` | storeroom assigned/superadmin | Full EPC match memposting `STOCK_IN`; mismatch tidak menambah stok dan membuat/update approval anomaly. Bukti dispatch tetap pada `proof_photo_url`/`document_url`; bukti receiving pertama disimpan terpisah pada `receiving_proof_photo_url`/`receiving_document_url`. Nilai receiving yang sama boleh dikirim ulang; URL berbeda ditolak `409`. Receiving ulang setelah match `409`. |

### Route delivery dinonaktifkan

| Method | Path | Hasil |
|---|---|---|
| POST | `/deliveries` | `410 Gone`; delivery manual tanpa EPC dilarang. |
| POST | `/deliveries/{id}/approve` | `410 Gone`; approval manual tanpa EPC dilarang. |

## Work Order dan BOQ

| Method | Path | Akses | Kontrak inti / side effect |
|---|---|---|---|
| GET | `/work-orders` | Scoped user | Filter project/SPK/gudang/status; visibility berdasarkan role dan relasi. |
| POST | `/work-orders` | auth-only | Membuat WO/BOQ; PM/superadmin langsung approved, lainnya membuat approval request; `201`. |
| GET | `/work-orders/{id}` | Scoped user | Detail WO; akses salah `403`. |
| POST | `/work-orders/{id}/approve` | pm/superadmin | Mengunci WO approved dan menyelesaikan approval terkait. |
| POST | `/work-orders/{id}/report-prepared` | storeroom assigned/superadmin | Mengganti `prepared_qty`, tidak mengubah quota; append `PREPARED`. |
| PATCH | `/work-orders/{id}/report-installed` | PIC terkait/superadmin | Qty tidak boleh melebihi `withdrawn-returned-installed`; increment dan append `INSTALLED`. |

## Transaksi dan Event Gerbang

| Method | Path | Akses | Kontrak inti / side effect |
|---|---|---|---|
| GET | `/gate/transactions` | Scoped user | Filter status/gudang/type; request juga menandai sesi approved yang kedaluwarsa. |
| POST | `/gate/transactions` | auth-only | `{work_order_id,warehouse_id,type,items,...}`; satu sesi aktif per warehouse; sesi baru saat `pending_approval`/`approved` ditolak `409` dengan ID/nomor sesi aktif; membuat sesi rolling 15 menit; OUT dapat auto-approved. |
| POST | `/gate/transactions/{id}/approve` | pm/superadmin | Status awal wajib pending; approved 15 menit. |
| POST | `/gate/transactions/{id}/reject` | pm/superadmin | Menyimpan rejection reason. |
| POST | `/gate/transactions/{id}/cancel` | PIC pemilik/pm/management/superadmin | Completed tidak dapat dibatalkan. |
| POST | `/gate/transactions/{id}/adjust-items` | PIC pemilik/pm/management/superadmin | Hanya approved; tidak melewati sisa BOQ; item lama yang dihilangkan dari payload tidak otomatis dihapus. |
| POST | `/gate/transactions/{id}/finalize-partial` | Terdaftar, dinonaktifkan | Sesi approved selalu `422`; tidak memutasi BOQ, stok, atau ledger. |
| POST | `/gate/event` | perangkat | Event UUID, waktu, sequence, 1–100 EPC, transaction ID eksplisit. Server menentukan gudang/gate/arah; append event; full valid set menyelesaikan transaksi dan mutasi custody. Replay tidak membuka gate. |
| GET | `/gate/live-feed` | auth-only | Maks. 50 event terbaru. |
| GET | `/gate/stream` | auth-only | SSE polling 1,5 detik; koneksi menahan worker hingga sekitar 10 detik lalu client reconnect. |
| DELETE | `/gate/events/{id}` | Dinonaktifkan | Selalu `405`; immutable. |
| DELETE | `/gate/events` | Dinonaktifkan | Selalu `405`, `deleted_count=0`. |

### Invariant event gerbang

- `gate_transaction_id` wajib eksplisit; server tidak mencari sesi alternatif.
- Dual antenna: `A_TO_B=OUT`, `B_TO_A=IN`; direction klien bukan otoritas.
- Single antenna: arah berasal dari tipe sesi.
- Identitas warehouse/gate berasal dari perangkat terautentikasi.
- Event valid memperpanjang rolling idle; expired/terminal tidak dapat diperpanjang.
- Akumulasi hanya memakai EPC distinct dari event valid.
- Replay pasangan `(gate_device_id,event_id)` mengembalikan keputusan tersimpan dengan `unlock_gate=false`.

## Retur

| Method | Path | Akses | Kontrak inti / side effect |
|---|---|---|---|
| POST | `/returns/request` | pic_lapangan/superadmin | Membuat `IN_RETURN` auto-approved selama 4 jam; qty maksimal saldo `withdrawn-returned-installed`; append `FIELD_RETURN`; `201`. |
| POST | `/returns/{transactionId}/verify` | storeroom assigned/superadmin | Verifier berbeda dari PIC. Server menghitung match dari physical qty, `passed_qty`, event EPC, dan status tag. Match memposting BOQ/`STOCK_IN`; mismatch tidak memutasi stok. |

Klien tidak mengirim atau menentukan `is_matched`.

## Approval

| Method | Path | Akses | Kontrak inti / side effect |
|---|---|---|---|
| GET | `/approvals` | Scoped user | Filter module/status/project/gudang; pagination. |
| GET | `/approvals/{id}` | Pihak terkait/management/superadmin | Detail approval dan history. |
| POST | `/approvals/{id}/action` | Approver aktif/superadmin | Action `approved/rejected/revision_requested`; actor selalu user login; append history dan trigger modul. |
| GET/POST/PUT/DELETE | `/approval-templates[/{id}]` | auth-only | CRUD template dan ordered steps. Update mengganti seluruh step. |
| GET/POST | `/approval-configs` | auth-only | List atau upsert override project/gudang per modul. |
| DELETE | `/approval-configs/{id}` | auth-only | Hard-delete konfigurasi. |

> Endpoint template/config saat ini belum memiliki guard role khusus. Hardening otorisasi diperlukan sebelum exposure production.

## Laporan

| Method | Path | Akses | Kontrak inti / side effect |
|---|---|---|---|
| GET | `/reports/stocks` | auth-only | Stok tag aktif. `stock_qty` hanya untuk item serialized; batch mengembalikan `null`. |
| GET | `/reports/stock-card` | auth-only | Wajib gudang/item/periode; nonserialized `422`; basis `STOCK_IN` dan `GATE_OUT`. |
| GET | `/reports/audit-trail` | auth-only | Filter EPC/item/holder/action/gudang; pagination 50. |
| GET | `/reports/dashboard-kpis` | auth-only | KPI berdasarkan role dan event terbaru. |
| POST | `/reports/stock-opname` | auth-only | Membandingkan EPC scan dengan tag aktif gudang. Read-only: tidak menulis ledger/status dan belum membuat tiket eskalasi. |

## Gap Otorisasi Aktif

Sebelum production, review endpoint `auth-only` yang bermutasi: create SPK/WO, payment status, tag status, test TCP, approval template/config, dan stock opname. Matriks permission dinamis belum menjadi guard umum REST API.
