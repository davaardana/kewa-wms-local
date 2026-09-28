# MOSA WMS RFID — Aturan Bisnis, Keamanan & Invariants (Rules)

Dokumen ini memisahkan aturan yang sudah ditegakkan backend/Edge dari target UI/hardware. Label: **ENFORCED**, **PARTIAL**, **UI-ONLY**, **PLANNED**. Kontrak faktual endpoint mengikuti [`api-spec.md`](api-spec.md).

---

## 1. Aturan Pemisahan Wewenang (Segregation of Duties)

| Peran | Hak Terhadap Kuota BOQ | Hak Otorisasi Gerbang | Batasan Khusus |
|---|---|---|---|
| **Project Manager (PM)** | **Full Access** (Buat, Edit, Lock Kuota) | Menyetujui anomali & penarikan malam | Tidak boleh merangkap sebagai PIC penerima fisik di gerbang. |
| **Storeroom Staff** | **STRICTLY READ-ONLY** | Tidak ada hak otorisasi | **DILARANG KERAS** mengubah angka `quota_qty`. Hanya boleh mengisi `prepared_qty`. |
| **PIC Lapangan (Mandor)** | **Read-Only** | Mengajukan permohonan sesi gerbang | Wajib login dengan akun personal sebelum meminta akses gerbang. |
| **Procurement** | Mengelola SPK & Pembayaran | Tidak ada hak otorisasi | Bertanggung jawab atas pencocokan Surat Jalan Principal vs SPK. |
| **Super Administrator** | **Full Access** ke seluruh modul | Akses penuh & konfigurasi | Mengelola master data, registri tag, & telemetri hardware. |

> [!IMPORTANT]
> **Aturan Kuota (Rule-SOD-01):**  
> Sistem **TIDAK MENGIZINKAN** pengeluaran barang melebihi sisa kuota:
> $$\text{Sisa Kuota} = \text{quota\_qty} - \text{withdrawn\_qty} + \text{returned\_qty}$$
> Permintaan yang melebihi sisa kuota akan **DITOLAK OTOMATIS (SHORTAGE REJECTED)** dan memicu eskalasi ke PM.

> [!IMPORTANT]
> **Aturan Hak Akses Menu RBAC (Rule-RBAC-01):**
> **Status: PARTIAL.** Navigasi FE disaring, tetapi REST API masih memakai campuran guard role hard-coded dan `auth-only`; permission dinamis belum menjadi middleware umum. Gap aktif tercantum di [`api-spec.md`](api-spec.md).
> * **Mandor Lapangan (`pic_lapangan`):** Hanya dapat mengakses layar PWA Lapangan (Checkout Truk, Retur, dan Cek Scanner Handheld). Seluruh menu backoffice dan master data disembunyikan.
> * **Storeroom Staff (`storeroom`):** Hanya dapat mengakses modul operasional fisik gudang: Receiving Truk (Handheld 2), Penyiapan WO (`prepared_qty`), Verifikasi Fisik Retur, Monitor Sensor Pintu Gudang, Stok & Kartu Stok, Audit Trail baca-saja, dan Stock Opname Yard. **Dilarang keras** mengelola Master Data (Gudang/Armada), Pairing Hardware Gerbang, maupun Pendaftaran Tag RFID baru (backend me-return HTTP 403 Forbidden).
> * **Procurement (`procurement`):** Hanya dapat mengakses SPK, Dispatch Truk (Handheld 1), Pendaftaran Tag RFID baru, Katalog Material, Armada Truk, dan Pelacakan Audit Trail.
> * **Project Manager (`pm`):** Memiliki akses monitoring menyeluruh, approval kuota BOQ, approval anomali, inisiasi proyek, kelola gudang transit, pairing reader RFID, dan audit trail.
> * **Direksi / Top Management (`management`):** Memiliki akses pemantauan eksekutif (Executive Dashboard, Analitik Shrinkage, Status Armada, Audit Trail CoC) serta sign-off approval transaksi bernilai tinggi.
> * **Super Administrator (`superadmin`):** Memiliki akses penuh ke seluruh modul, konfigurasi reader RFID, user management, dan fitur simulasi preview role.

> * **Reader Handheld:** hanya perangkat `enrollment_desktop`, atau `hybrid_workstation` saat `ALLOW_HYBRID_DEVICE=true`, yang dapat masuk mode `ENROLLMENT`. Hybrid wajib nonaktif pada production; `gate_controller` tidak boleh dialihkan menjadi scanner handheld.
> * **Administrasi Identitas:** Seluruh endpoint perubahan pengguna dan role hanya dapat dijalankan pengguna Sanctum terautentikasi dengan role `superadmin` (HTTP 403 untuk role lain).
> * **Saldo Persediaan:** Saldo aktual berasal dari tag RFID `active` dengan `last_warehouse_id`. Kuantitas hanya ditampilkan untuk material serialized (`is_serialized_tag=true`, 1 tag = 1 unit). Material batch/non-serialized menampilkan kuantitas tidak tersedia. Kartu stok memakai `STOCK_IN` sebagai masuk dan `GATE_OUT` sebagai keluar; event custody lain tidak mengubah saldo kartu stok.
> 
> *Segregation of Duties (SoD) Anti-Shrinkage:*
> Pihak yang memuat truk (*Procurement / Yard Dispatcher*) **DILARANG** melakukan konfirmasi bongkar truk di gudang transit (*Storeroom Staff*). Aksi "Bongkar Truk (Handheld 2)" hanya dapat diakses dan dieksekusi oleh `storeroom` dan `superadmin`. Backend memvalidasi peran ini dengan HTTP 403 Forbidden.

> [!IMPORTANT]
> **Aturan Penguncian Transaksi Belum Disetujui (Rule-APPR-01):**
> * **Identitas Aktor Approval:** Pelaku aksi approval selalu berasal dari pengguna Sanctum yang sedang login. `user_id` dari body request tidak diterima sebagai identitas aktor, sehingga approval tidak dapat diatribusikan atas nama pengguna lain.
> * **Kontrak SPK:** Tombol muat truk (*Dispatch Handheld 1*) otomatis **TERKUNCI (DISABLED)** jika SPK masih berstatus pending/dalam antrean review bertingkat. Backend memvalidasi integritas ini dan menolak pencatatan surat jalan untuk SPK non-approved.
> * **Work Order & Kuota BOQ:** Storeroom **TIDAK DAPAT** menyiapkan barang fisik di rak jika Work Order belum disetujui (Approved) oleh PM.
> * **Sesi Gerbang Lapangan (PWA):** Mandor hanya dapat memilih dan mengajukan izin gerbang untuk Work Order yang telah berstatus Approved/In-Progress.

> [!IMPORTANT]
> **Aturan Pembatasan Visibilitas Data Transaksi & Approval (Rule-VISIBILITY-01):**
> Data transaksi privat, SPK, Work Order, dan permohonan persetujuan bertingkat menerapkan *Data Scoping Access*:
> * **Super Administrator & Top Management / Direksi (`management`):** Memiliki hak **Global View** tanpa batasan untuk melihat seluruh data transaksi dan inbox approval di semua proyek/gudang.
> * **Pengguna Operasional (PM, Procurement, Storeroom, Mandor):** Secara *default* hanya dapat melihat data yang terkait langsung dengan dirinya:
>   1. **Originator / Pembuat Data:** Data/dokumen yang diajukan atau dibuat sendiri (`created_by_user_id`, `pm_user_id`, `requester_user_id`, `pic_user_id`).
>   2. **Rantai Approval:** Permohonan di mana user bertindak sebagai reviewer aktif (`current_approver_user_id`), reviewer di tahapan template/snapshot, atau pernah mengambil tindakan persetujuan di riwayat approval.
>   3. **Kebutuhan Operasional Eksekusi:** Untuk SPK/WO yang telah berstatus *Approved*, Storeroom di gudang tujuan dan Mandor di lapangan dapat melihat dokumen terkait untuk keperluan penyiapan material dan penarikan di gerbang.

---

> [!IMPORTANT]
> **Aturan Identitas Perangkat Gerbang (Rule-DEVICE-AUTH-01):**
> * Ingest event, heartbeat, dan pembacaan konfigurasi Edge wajib memakai Bearer token unik milik `gate_devices` yang aktif.
> * Backend menyimpan hanya hash SHA-256 (`api_token_hash`) dan menetapkan `warehouse_id`, `device_code`, serta `gate_id` dari perangkat terautentikasi; payload Edge tidak boleh mengganti identitas tersebut.
> * Status Edge dan reader wajib terpisah. TCP tersambung bukan bukti reader responsif; respons inventory valid tanpa tag adalah bukti responsif. Edge offline membuat kondisi reader `unknown`, bukan otomatis `mati`.
> * Toleransi heartbeat dapat diatur per device; default 90 detik. Riwayat transisi memakai UUID idempotent serta waktu observasi asli.
> * Token hilang/tidak valid atau perangkat nonaktif ditolak dengan HTTP 401. Token pengguna Sanctum dan token perangkat tidak saling menggantikan.

## 2. Aturan Logistik 2 Handheld (In-Transit Chain of Custody)

1. **Rule-LOG-01 (Pencatatan Origin Dispatch — Handheld 1):**
   * Sebelum truk pengangkut keluar dari Yard Principal (MyRepublic/Biznet), seluruh material yang dimuat **WAJIB** telah ditempel tag RFID anti-metal dan di-scan menggunakan Handheld 1.
   * Eksekusi muat truk (*Dispatch Scan*) pada sebuah SPK dibatasi secara ketat hanya dapat dilakukan oleh **Originator / Pembuat SPK** bersangkutan (`created_by_user_id`) atau Super Administrator. Pengguna lain yang membuka kontrak tersebut tidak diizinkan melakukan muat (tombol *Disabled/Bukan Pembuat* dan API backend mengembalikan `403 Forbidden`).
   * Daftar EPC yang tersimpan di `dispatch_epcs_json` mengunci manifest keberangkatan dan mengubah status pengiriman menjadi `in_transit`.
   * EPC/item manifest wajib distinct; total kuantitas harus sama dengan jumlah EPC. Dispatch belum menjadi stok gudang; lokasi tag tetap `NULL` selama transit.
2. **Rule-LOG-02 (Pencocokan Receiving — Handheld 2):**
   * Saat truk tiba di loading bay gudang transit, staf gudang wajib melakukan *Receiving Scan* menggunakan Handheld 2.
   * Sistem otomatis membandingkan:
     $$\text{Missing In-Transit} = \text{dispatch\_epcs} \setminus \text{received\_epcs}$$
    * `STOCK_IN` hanya terbentuk setelah full match dan jumlah EPC distinct per item sesuai manifest. Receiving ulang setelah matched ditolak `409`; mismatch tidak menambah stok.
   * Jika terdapat tag yang hilang di jalan ($\text{Missing In-Transit} > 0$), status pengiriman **OTOMATIS DITANDAI MISMATCH SHORTAGE (FLAGGED)** dan stok tidak boleh masuk ke inventaris aktif sebelum ada investigasi dan *approval manual* dari PM.
3. **Rule-LOG-03 (Lampiran Dokumen & Foto Bukti Fisik):**
   * Setiap proses *Dispatch Scan* (muat di Principal) dan *Receiving Scan* (bongkar di Gudang) wajib mendukung pelampiran foto fisik muatan truk serta dokumen surat jalan bertanda tangan (`proof_photo_url`, `document_url`) untuk memperkuat integritas pembuktian saat audit.
4. **Rule-LOG-04 (Penyelesaian Kuota SPK & Penonaktifan Tombol Muat):**
   * Tombol "Muat" (*Dispatch Handheld 1*) pada kontrak SPK **HANYA AKTIF** selama sisa kuota material SPK masih tersedia:
     $$\text{Sisa Kuota Item} = \text{target\_qty} - \sum \text{delivered\_qty (Sudah Dimuat)}$$
   * Ketika total akumulasi barang yang dimuat telah mencapai atau melebihi 100% dari target kontrak ($\ge \text{target\_qty}$):
     * Tombol **"Muat"** otomatis menghilang/berganti menjadi badge hijau **"Selesai (100% Kuota Terkirim)"**.
     * Pada formulir Handheld 1, SPK tersebut otomatis dinonaktifkan *(disabled)* dalam *dropdown* pilihan kontrak dengan label `(✓ 100% Kuota Selesai Terkirim)`.
     * API backend (`DeliveryController@recordDispatchScan`) memvalidasi kuota dan secara tegas menolak muatan berlebih dengan pesan kesalahan HTTP 422 Unprocessable Entity.

5. **Rule-LOG-05 (Status Akhir Pengiriman / Terminal Delivery State):**
   * Pengiriman truk yang telah berhasil dibongkar dan disetujui (*Status: `approved` / Rekonsiliasi: `matched`*) berada pada **Status Terminal (Final)**.
   * Truk/Surat Jalan yang telah berstatus terminal **DILARANG DIPROSES ULANG**:
     * Pada tabel daftar pengiriman, tombol **"Bongkar"** otomatis hilang.
     * Pada formulir Handheld 2 (*Receiving Scan*), nomor surat jalan tersebut otomatis dinonaktifkan *(disabled)* dalam *dropdown* dengan label `(✓ Selesai / Restocked)`.
     * Tombol aksi submit rekonsiliasi terkunci dengan keterangan *"Pengiriman Selesai (Telah Masuk Stok Gudang)"*.
   * API backend (`DeliveryController@recordReceivingScan`) memvalidasi status dan menolak pemindaian ulang dengan HTTP `409 Conflict`.

---

## 3. Aturan Siklus Hidup Work Order (Work Order Terminal Lifecycle)

1. **Rule-WO-01 (Penyelesaian Kuota BOQ & Penutupan Penarikan Gerbang):**
   * Work Order yang seluruh kuota materialnya telah selesai ditarik ke lapangan ($\sum \text{withdrawn\_qty} \ge \sum \text{quota\_qty}$ dan $\text{Sisa Kuota} = 0$):
     * Otomatis berstatus **COMPLETED (100%)** pada tabel Work Order.
     * Tombol aksi *"Siapkan"* bagi staf gudang otomatis terkunci menjadi badge **"Selesai"**.
     * Pada aplikasi lapangan (PWA Mandor), Work Order yang telah habis kuotanya otomatis ditandai `(✓ Kuota BOQ Habis / 100% Selesai)` dan tombol *"Ajukan Izin Keluar"* terkunci.
     * Backend Quota Engine (`validateWithdrawalQuota`) menolak pengajuan izin gerbang baru yang melebihi sisa kuota dengan HTTP 422.

## 4. Aturan Sensor Gerbang & Mode Operasional (Gate Rules)

Sistem mendukung 2 mode operasional gerbang per gudang:

### A. Mode 2 Antena (`DUAL_ANTENNA_AUTO`)
* **Rule-GATE-01A (Arah Keluar):** Tag terdeteksi pada **Antena A $\to$ Antena B** dalam rentang $0.3\text{s} \le \Delta t \le 4.0\text{s} \implies$ **Arah KELUAR (OUT)**.
* **Rule-GATE-01B (Arah Masuk):** Tag terdeteksi pada **Antena B $\to$ Antena A** dalam rentang $0.3\text{s} \le \Delta t \le 4.0\text{s} \implies$ **Arah MASUK (IN)**.
* **Rule-GATE-01C (Urutan Lengkap):** Pembacaan satu antena belum menjadi event lintas gerbang. Server menurunkan arah dari `antenna_sequence`; `direction` kiriman Edge tidak dipercaya pada mode dual.

### B. Mode 1 Antena (`SINGLE_ANTENNA_SESSION`)
* **Rule-GATE-02A (Resolusi Sesi):** Arah pergerakan diselesaikan berdasarkan konteks sesi aktif yang diajukan oleh PIC yang terautentikasi di aplikasi (`OUT_FULFILLMENT` atau `IN_RETURN`).
* **Rule-GATE-02B (Binding Ketat):** Event wajib membawa ID transaksi eksplisit. Token perangkat menetapkan gate/gudang; perangkat, gudang transaksi, dan gudang WO wajib identik. Tidak ada fallback lintas gudang.
* **Rule-GATE-02C (TTL & Terminal):** Hanya sesi `approved` yang belum melewati `valid_until` dapat dipakai. Sesi expired/terminal tidak dapat dihidupkan atau diperpanjang.
* **Rule-GATE-02D (Arah Server):** Pada mode single, arah diturunkan dari tipe `gate_transaction_id` terotorisasi server, bukan inferensi RSSI atau input arah mandiri.
* **Rule-GATE-02E (Single Active Session per Warehouse):** Untuk mencegah pencampuran EPC pada satu portal fisik, satu warehouse hanya boleh memiliki satu sesi `pending_approval` atau `approved` yang belum kedaluwarsa. Pengajuan baru ditolak `409`; sesi terminal/expired tidak mengunci.

### C. Reliabilitas Event Edge
* **Rule-GATE-IDEMPOTENCY:** `event_id` UUID stabil unik per perangkat dan `observed_at` asli wajib dikirim. Replay tidak memutasi stok/custody/kuota dan tidak pernah membuka relay (`unlock_gate=false`).
* **Rule-GATE-QUEUE:** Batch dibatasi idle, deadline, dan ukuran; dispatch terserialisasi. Replay offline wajib FIFO/single-flight/tahan restart; kegagalan permanen masuk dead-letter melalui penyimpanan atomik.

### D. Aturan Validasi Sensor & Notifikasi Ketidaksesuaian
1. **Rule-GATE-ALERT (PARTIAL — Notifikasi Anomali Sensor):**
   * Apabila sensor mendeteksi ketidaksesuaian (perlintasan tanpa sesi izin, kelebihan muatan tag dari izin, atau tag tidak terdaftar), sistem **WAJIB LANGSUNG MEMICU NOTIFIKASI DARURAT**:
   * Menampilkan mismatch pada dashboard. Sirene fisik belum diintegrasikan.
   * Mencoba mengirim WhatsApp secara non-blocking bila service dikonfigurasi; delivery tidak dijamin.
     * Mencatat bendera `mismatch_flag = true` beserta kronologi pelanggaran di database.
2. **Rule-GATE-UNDERCOUNT (Muatan Bertahap, Akumulasi Multi-Pass & Penyelesaian Fisik Aktual):**
   * **Akumulasi Multi-Pass (Bawa Bertahap / 1 per 1):**  
   Sistem menggabungkan EPC distinct dari event terdahulu yang diterima (`is_valid=true`) dengan batch saat ini. Event ditolak tidak pernah menjadi bukti kumulatif berikutnya.
   * **Status Standby Sementara:**  
     Selama total akumulasi tag masih kurang dari kuantitas yang diajukan ($\sum \text{cumulative\_tags} < \text{requested\_qty}$), pintu gerbang berstatus `STANDBY` (Amber Notice) dan **TIDAK MEMICU SIRINE ALARM ANOMALI / PENCURIAN**.
   * **Partial Finalization Dinonaktifkan:**
       `POST /api/gate/transactions/{id}/finalize-partial` menolak sesi approved dengan HTTP `422`; tidak memutasi BOQ, stok, custody, atau status. Penyelesaian hanya melalui set EPC lengkap tervalidasi.
   * **Batas Waktu Tidak Aktif (Rule-GATE-TIMEOUT — Rolling 15-Minute Idle Window):**  
      Setiap sesi izin gerbang aktif memiliki jendela batas waktu tidak aktif (*inactivity idle timeout*) selama **15 menit**:
      * Saat sesi disetujui, sesi memiliki masa aktif awal 15 menit untuk mulai memuat barang.
      * Setiap kali ada tag sah yang melintas di sensor gerbang (saat proses muat bertahap / bawa 1-1), timer **otomatis diperpanjang (di-reset) kembali +15 menit ke depan**.
      * Setelah `valid_until` terlewati, event ditolak dan timer tidak diperpanjang. Status persisten tidak otomatis diubah menjadi `expired` oleh ingest saat ini.
      * Event standby belum diposting ke Custody Ledger; hanya penyelesaian set lengkap yang melakukan posting.
3. **Rule-GATE-RSSI (Penyaringan Ghost Read):**
   * Sinyal tag dengan $\text{RSSI} < -75\text{ dBm}$ wajib diabaikan untuk mencegah tag di rak dekat pintu terpicu tanpa sengaja.
4. **Catatan Hardware Lanjutan:**
   * Integrasi fisik kunci elektromagnetik (*Fail-Secure 5s auto-relock*) dan kamera CCTV snapshot dapat diimplementasikan sebagai ekstensi hardware sekunder setelah alur sensor dan notifikasi stabil.

---

## 5. Matriks Keputusan Persetujuan Transaksi (Approval Matrix)

| Kondisi Permintaan | Ketersediaan Fisik di Rak | Waktu Transaksi | Status Kuota | Keputusan Sistem |
|---|---|---|---|---|
| Permintaan Valid oleh PIC | `prepared_qty >= requested_qty` (Sudah disiapkan Storeroom) | Jam Kerja (07:00 – 18:00) | $\le$ Sisa Kuota BOQ | **AUTO-APPROVED** (Gerbang Buka) |
| Permintaan Valid oleh PIC | `prepared_qty < requested_qty` (Belum disiapkan / Shortage) | Kapan Saja | $\le$ Sisa Kuota BOQ | **PENDING STOREROOM / PM** (Eskalasi Manual) |
| Permintaan Valid oleh PIC | Kapan Saja | Di Luar Jam Kerja / Malam | $\le$ Sisa Kuota BOQ | **PENDING PM APPROVAL** (Eskalasi Manual) |
| Permintaan Melebihi Kuota | Kapan Saja | Kapan Saja | $>$ Sisa Kuota BOQ | **REJECTED / SHORTAGE FLAGGED** |
| Tag Terdeteksi Melintas | Kapan Saja | Kapan Saja | Tanpa Sesi Transaksi | **ALARM TRIGGERED** (Gerbang Tetap Terkunci) |

> [!IMPORTANT]
> **Aturan Validasi Fisik Storeroom (Rule-VAL-PREPARED):**
> Sistem tidak akan memberikan Auto-Approval gerbang jika Storeroom belum melaporkan kesiapan fisik barang di rak (`prepared_qty < requested_qty`), guna mencegah mandor membawa material yang belum dialokasikan secara fisik.
> Pelaporan hanya boleh dilakukan Storeroom yang ditugaskan ke gudang WO (Superadmin dikecualikan). Item wajib unik dan termasuk BOQ; mutasi `prepared_qty` dan ledger `PREPARED` berjalan atomik.

> **Aturan Commit Gerbang (Rule-GATE-COMMIT):**
> Saat keputusan pass dibuat, row EPC dan BOQ dikunci serta status/lokasi tag dan sisa kuota divalidasi ulang. EPC yang sudah berpindah atau kuota yang telah terpakai sesi lain wajib `DENIED`; mismatch kritis tidak boleh turun menjadi `STANDBY` hanya karena undercount.

> **Aturan Sumber Custody (Rule-CUSTODY-SOURCE):**
> Action ledger memakai allowlist kontrak EPC dan tipe referensi. Pasangan `ref_type`/`ref_id` wajib lengkap serta record referensi wajib ada. EPC wajib terdaftar dan `item_id` harus cocok. Update tag serta insert ledger berlangsung dalam satu transaksi dengan row lock.

> **Aturan Mutasi Tag (Rule-TAG-ATOMIC):**
> Enrollment batch, perubahan status, decommission, bulk decommission, dan reactivation bersifat atomik. Bulk gagal seluruhnya bila satu EPC hilang. Decommission berulang dan reactivation tag yang belum decommissioned ditolak.
> Enrollment semua role yang diizinkan hanya mendaftarkan identitas: tag `active`, `last_warehouse_id=null`, event `TAG_ENROLLED` dengan user personal. Gudang pilihan adalah konteks reader/audit, bukan penerimaan; tidak membentuk `STOCK_IN` atau saldo stok. Tag tetap dapat dimuat lewat manifest SPK yang memenuhi validasi dispatch. Tag live yang telanjur tercatat stok tidak dikoreksi otomatis.

> Generate custom EPC mereservasi identitas `reserved` berdasarkan prefix dan sequence jenis barang. Batch tidak membentuk stok atau custody. Saat muat di principal, handheld memvalidasi peruntukan EPC lalu mengubahnya menjadi `attached`; registrasi ulang tag fisik tidak diperlukan. EPC tetap perlu dipindai atau diimpor ke manifest untuk mengikat fisik barang.

---

## 6. Aturan Alur Retur, Instalasi & Rekonsiliasi (Return, Install & Opname)

0. **Rule-DEL-00 (Larangan Accounting Delivery Manual Tanpa EPC):**  
   Endpoint pembuatan dan approval delivery manual dinonaktifkan. Hanya rekonsiliasi `dispatch-scan` dan `receiving-scan` berbasis EPC yang boleh menambah `received_qty` serta mencatat `STOCK_IN`. Storeroom tanpa assignment gudang tidak boleh melihat delivery gudang lain.
1. **Rule-RET-01 (Batas Kuantitas Retur):**  
   Jumlah retur tidak boleh melebihi outstanding server: `withdrawn_qty - returned_qty - installed_qty`. Item request/verifikasi wajib unik.
2. **Rule-RET-02 (Pemisahan Verifikasi Retur):**  
   Pengajuan/gate-in belum menambah stok aktif. Storeroom berbeda dari PIC, ditugaskan ke gudang transaksi, memverifikasi sesi `IN_RETURN` yang `completed`. Match dihitung server dari `passed_qty` versus fisik; input client tidak dipercaya. Full match juga wajib cocok dengan EPC valid, item, jumlah fisik, dan status tag `attached`; kemudian `STOCK_IN` dicatat satu kali per EPC. Mismatch tidak mengubah stok, tag, BOQ, atau custody ledger. Posting tepat sekali: `return_verified` atau `return_mismatch`.
3. **Rule-INST-01 (Laporan Pemasangan Lapangan):**  
   Hanya PIC/Mandor lapangan yang memiliki transaksi gerbang pada WO tersebut yang boleh melihat WO dan melaporkan progres pemasangan fisik. Item wajib unik dan termasuk BOQ WO. Penambahan tidak boleh melebihi saldo lokasi: `withdrawn_qty - returned_qty - installed_qty`; validasi dan mutasi dikunci atomik. Pelaporan valid menginkremen `installed_qty` dan mencatat mutasi `INSTALLED` di Custody Ledger.
4. **Rule-WH-01 (Struktur Organisasi Gudang):**  
   Setiap gudang transit wajib memiliki tepat 1 Kepala Gudang / PIC Utama (`pic_user_id`) dan dapat memiliki banyak staf operasional terdaftar (`warehouse_staff`) untuk pembagian shift dan tanggung jawab loading bay.
5. **Rule-WH-02 (Shared Multi-Project Warehouse & Cross-Project Gate Defense):**  
   * **Multi-Project Support:** 1 Gudang fisik/ruko dapat ditugaskan untuk melayani $N$ Proyek Rollout sekaligus (Shared Hub) melalui tabel pivot `project_warehouses`.
   * **Project Tag Segregation:** Setiap tag RFID material membawa metadata kepemilikan proyek (`rfid_tags.project_id`).
   * **Cross-Project Gate Lock:** Sensor gerbang RFID **WAJIB MEMICU ALARM ANOMALI & MENAHAN GERBANG TERKUNCI** jika terdeteksi material milik Proyek B ikut terbawa dalam perlintasan sesi Work Order Proyek A.
6. **Rule-OPN-01 (ENFORCED READ-ONLY — Rekonsiliasi Stock Opname):**  
   Hasil *bulk-scan* mengklasifikasikan missing/unexpected EPC tanpa menghapus atau memutasi data. Persistence tiket investigasi masih direncanakan.
7. **Rule-SEC-04 (PARTIAL — Non-Destructive Decommission):**  
   * User dan tag dinonaktifkan/decommission melalui API; gate event tidak dapat dihapus. Device, approval template/config, dan sejumlah FK domain masih dapat hard-delete/cascade sehingga aturan belum berlaku global.
   * Penghapusan user berarti deaktivasi. `custody_ledger` dan `gate_pass_events` immutable; model ledger menolak update/delete, endpoint delete event mengembalikan `405`.
   * **Mandatory Audit Trail:** Setiap aksi disable atau reactivate tag **WAJIB** mencatat riwayat mutasi baru ke dalam `custody_ledger` (`TAG_DECOMMISSIONED` / `TAG_REACTIVATED`) dengan nama aktor personal, timestamp presisi, dan alasan audit.
   * **Eksklusif Super Administrator:** Seluruh aksi penonaktifan (disable), aktivasi ulang (reactivate), atau modifikasi data kritis di semua menu **HANYA DAPAT DILAKUKAN OLEH ROLE `superadmin`**. Staf biasa/mandor tidak memiliki izin dan tombol aksi tersebut otomatis disembunyikan.
8. **Rule-DEV-01 (Isolasi Peran Perangkat & Peredaman Alarm Meja Pendaftaran):**  
   * **Isolasi Lingkup Antar Gudang:** Setiap data pembacaan membawa `device_code` dan `warehouse_id`. Penyetelan reader di Gudang A (misal: mode pendaftaran meja) tidak berdampak pada kesiagaan sensor gerbang di Gudang B/C/D.
   * **Peredaman Alarm Pendaftaran (Enrollment Suppression):** Jika suatu perangkat memiliki peran `enrollment_desktop` atau edge bridge sedang dialihkan ke `operational_mode = 'ENROLLMENT'`, aliran data tag RFID hanya disiarkan ke antarmuka registrasi UI (WebSocket) dan **DILARANG** diproses sebagai pelanggaran perlintasan gerbang (bypass anomaly incident).
   * **Dukungan Single Reader Hybrid:** Memungkinkan 1 reader fisik (seperti EL-UHF-RC4) difungsikan secara bergantian antara pengawasan gerbang utama dan meja pendaftaran tag tanpa memerlukan pembelian perangkat ganda di fase awal rollout.

9. **Rule-REC-01 (UI-ONLY — Preview Sebelum Rekonsiliasi):**  
   * Seluruh tombol dan proses rekonsiliasi lintas modul (**Bongkar Muat Handheld 2**, **Stock Opname Fisik Yard**, dan **Verifikasi Retur Sisa**) **WAJIB MENAMPILKAN PRATINJAU (PREVIEW MODAL/CARD) TERLEBIH DAHULU**.
   * Preview diterapkan oleh UI; API belum memakai preview token/confirm phase dan akan commit saat endpoint mutasi dipanggil.
   * Pratinjau wajib menyajikan komparasi transparan antara data sistem/manifest vs fisik nyata di lapangan (jumlah tag terbaca, tag cocok, selisih kurang/susut, dan tag asing).

10. **Rule-REC-02 (PARTIAL — Aksi Kontekstual):**  
    Setiap antarmuka pratinjau rekonsiliasi wajib menyediakan opsi aksi yang jelas untuk melanjutkan alur bisnis:
    * **Aksi Koreksi / Scan Ulang:** Memungkinkan operator menutup pratinjau dan menyisir ulang fisik tanpa kehilangan data input dan tanpa mengotori database.
    * **Aksi Konfirmasi Full Match:** Apabila 100% cocok, mengeksekusi mutasi inventaris, memperbarui status pengiriman/retur, dan memulihkan kuota Work Order.
   * **Aksi Berita Acara & Eskalasi Mismatch:** Delivery mismatch dipersistensikan. Eskalasi stock-opname/return mismatch belum lengkap pada backend.

---

## 7. Aturan Penulisan Kode & Governance Dokumentasi

1. **Aturan Update Dokumentasi (.MD):**  
   Perubahan arsitektur, skema, logika gerbang, kontrak API, alur bisnis, atau fitur sistem wajib memperbarui dokumen terdampak pada turn yang sama. Bugfix lokal, CSS, atau refactor internal tanpa perubahan kontrak tidak wajib.
2. **Rule-UI-01 (Prinsip UX Pengguna Lapangan):**  
   Seluruh halaman PWA Lapangan wajib mempertahankan target sentuh besar ($\ge 56\text{px}$), kontras tinggi untuk visibilitas di bawah sinar matahari, feedback audio beep, dan menggunakan bahasa Indonesia lugas tanpa jargon IT.
3. **Backend (Laravel):**  
   Gunakan `DB::transaction()` pada setiap mutasi yang melibatkan `custody_ledger` dan perubahan status transaksi.
4. **IoT Edge Bridge (Node.js):**  
   Wajib menerapkan *store-and-forward queue* (`localCache.js`) untuk menjamin ketahanan saat offline.
