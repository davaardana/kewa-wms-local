# Command Docker Presentasi Windows

Panduan menjalankan MOSA WMS, MySQL berisi data awal, Adminer, dan Cloudflare Tunnel pada Windows.

## Prasyarat

- Docker Desktop aktif.
- Jalankan PowerShell.
- File `.env` root berisi `CLOUDFLARE_TUNNEL_TOKEN` yang valid.
- Route Cloudflare untuk `wms.jeungdevelopment.my.id` mengarah ke `http://nginx:80`.

Masuk ke root proyek sebelum menjalankan command:

```powershell
Set-Location C:\Code\WMS\Mosaik-WMS
```

## 1. Menjalankan pertama kali

Command ini build image, menjalankan MySQL, migrasi, seeder data awal, Adminer, dan Cloudflare Tunnel:

```powershell
docker compose -f docker-compose.yml -f docker-compose.windows-dev.yml -f docker-compose.windows-dev-no-edge.yml --profile tunnel --profile adminer up -d --build --wait
```

Build Composer pertama dapat memerlukan beberapa menit. Jangan dibatalkan selama output masih bergerak. Jangan gunakan `--no-cache` untuk penggunaan normal.

## 2. Menjalankan harian

Tanpa rebuild:

```powershell
docker compose -f docker-compose.yml -f docker-compose.windows-dev.yml -f docker-compose.windows-dev-no-edge.yml --profile tunnel --profile adminer up -d --wait
```

## 3. Setelah perubahan kode

```powershell
docker compose -f docker-compose.yml -f docker-compose.windows-dev.yml -f docker-compose.windows-dev-no-edge.yml --profile tunnel --profile adminer up -d --build --wait
```

## 4. Memeriksa status

```powershell
docker compose -f docker-compose.yml -f docker-compose.windows-dev.yml -f docker-compose.windows-dev-no-edge.yml --profile tunnel --profile adminer ps
```

Target:

- `backend`: `healthy`
- `mysql`: `healthy`
- `nginx`: `Up`
- `frontend`: `Up`
- `cloudflared`: `Up`
- `adminer`: `Up`

## 5. Memeriksa log

Semua service:

```powershell
docker compose logs --tail=100
```

Service tertentu:

```powershell
docker compose logs --tail=100 backend
docker compose logs --tail=100 nginx
docker compose logs --tail=100 cloudflared
```

Pantau real-time:

```powershell
docker compose logs -f backend nginx cloudflared
```

Tekan `Ctrl+C` untuk berhenti memantau. Container tetap berjalan.

## 6. Alamat dan akun presentasi

### WMS

- URL: `https://wms.jeungdevelopment.my.id`
- Email: `superadmin@mosa.id`
- Password awal: `password123`

### Adminer

- URL: `http://127.0.0.1:8081`
- System: `MySQL`
- Server: `mysql`
- Username: `mosa_user`
- Password: nilai `DB_PASSWORD` pada `.env`; default development `mosa_dev_password`
- Database: `mosa_wms`

> Akun dan password awal hanya untuk development/presentasi. Jangan gunakan untuk production.

## 7. Verifikasi backend dan database

```powershell
docker compose exec -T backend php artisan about
docker compose exec -T backend php artisan migrate:status
docker compose exec -T backend sh -c "test -f vendor/autoload.php && echo vendor-ok || echo vendor-missing"
```

## 8. Stop sementara

Data database tetap tersimpan:

```powershell
docker compose -f docker-compose.yml -f docker-compose.windows-dev.yml -f docker-compose.windows-dev-no-edge.yml --profile tunnel --profile adminer stop
```

Hidupkan kembali:

```powershell
docker compose -f docker-compose.yml -f docker-compose.windows-dev.yml -f docker-compose.windows-dev-no-edge.yml --profile tunnel --profile adminer start
```

## 9. Menghapus container tanpa menghapus database

```powershell
docker compose -f docker-compose.yml -f docker-compose.windows-dev.yml -f docker-compose.windows-dev-no-edge.yml --profile tunnel --profile adminer down
```

Jangan memakai `docker compose down -v`; opsi `-v` menghapus volume database.

## 10. Backup database

Sesuaikan password root bila `MYSQL_ROOT_PASSWORD` pada `.env` berbeda:

```powershell
docker compose exec -T mysql mysqldump -u root -pmosa_dev_root_password mosa_wms > mosa_wms_backup.sql
```

## 11. Restore database

Backup database sebelum restore. Restore dapat menimpa record dengan primary key sama.

```powershell
Get-Content .\mosa_wms_backup.sql -Raw | docker compose exec -T mysql mysql -u root -pmosa_dev_root_password mosa_wms
```

## Troubleshooting singkat

Backend:

```powershell
docker compose logs --tail=150 backend
```

Tunnel:

```powershell
docker compose logs --tail=150 cloudflared
```

Nginx:

```powershell
docker compose logs --tail=150 nginx
```

Respons lokal:

```powershell
curl.exe -I http://127.0.0.1/
```

Respons publik:

```powershell
curl.exe -I https://wms.jeungdevelopment.my.id/
```
