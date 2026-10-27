# Deploy SSE Fallback Fix — VPS Instructions

Jalankan perintah ini di VPS (SSH ke server, lalu paste):

```bash
cd /root/Mosaik-WMS   # atau path repo di VPS Anda

# ── 1. Tarik semua perubahan dari git (jika pakai git) ──────────────────────
git pull

# ── 2. Rebuild frontend di VPS ──────────────────────────────────────────────
docker compose run --rm frontend sh -c "cd /app && npm ci && npm run build" 2>&1 | tail -20
# ATAU jika Anda upload dist manual dari lokal:
#   scp -r frontend/dist/ user@vps:/root/Mosaik-WMS/frontend/

# ── 3. Restart edge-bridge agar pakai index.js baru ─────────────────────────
docker compose restart edge-bridge

# ── 4. Verifikasi assets baru sudah ada ─────────────────────────────────────
ls -la frontend/dist/assets/ | grep -E 'TagEnrollment|edgeWebSocket|index-'

# ── 5. Cek edge-bridge log memastikan tidak ada error ───────────────────────
docker compose logs --tail=20 edge-bridge
```

## Jika upload manual dari Windows (tanpa git)

```powershell
# Di Windows PowerShell (dari direktori Mosaik-WMS):
$VPS = "root@206.237.98.48"   # ganti dengan IP/user VPS Anda
$VPATH = "/root/Mosaik-WMS"

# Upload dist
scp frontend/dist/index.html "${VPS}:${VPATH}/frontend/dist/index.html"
scp frontend/dist/assets/* "${VPS}:${VPATH}/frontend/dist/assets/"

# Upload edge index.js yang sudah diperbaiki
scp edge-bridge/src/index.js "${VPS}:${VPATH}/edge-bridge/src/index.js"

# Restart edge-bridge
ssh $VPS "cd $VPATH && docker compose restart edge-bridge"
```

## Setelah deploy: cara test

1. Buka browser VPS (atau dari luar LAN): `https://your-domain/`
2. Login → buka **Pendaftaran Tag RFID**
3. Pilih Gudang + Reader → klik Set
4. **Di browser console** (F12) harus muncul:
   ```
   [TagEnrollment] WS tidak bisa reach edge LAN — beralih ke SSE fallback via VPS
   ```
5. Status indikator harus berubah jadi "terhubung" (hijau)  
6. Scan tag RFID fisik → EPC muncul di UI dalam ~1 detik via SSE

## Perubahan yang dibuat

### `frontend/src/pages/TagEnrollment.jsx`
- Tambah flag `wsEverAuthenticated` per sesi koneksi WS
- `onClose`: jika WS **belum pernah auth** → `startSseFallback()` bukan retry
- `onError`: jika WS **belum pernah auth** → `startSseFallback()`
- `handleTagRead`: terima event SSE (type=`TAG_READ` atau tanpa type)

### `edge-bridge/src/index.js`  
- Hapus guard `operationalMode === 'ENROLLMENT'`
- `sendTagSighting()` dipanggil untuk **setiap** tag read (bukan hanya saat mode ENROLLMENT)
- Backend/SSE endpoint yang filter per warehouse — edge tidak perlu tahu mode browser

### Tidak berubah (sudah benar)
- `GateMonitor.jsx`: sudah punya `onClose → startSseFallback()` ✅
- `EnrollmentStreamController.php`: sudah push `TAG_READ` event via SSE ✅  
- `GateEventController::handleTagSighting`: sudah tulis ke Cache ✅
- `edgeWebSocket.js / openEnrollmentSseStream`: sudah siap ✅
