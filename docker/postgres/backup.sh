#!/bin/sh
set -eu

: "${DB_USERNAME:?DB_USERNAME must be exported}"
: "${DB_DATABASE:?DB_DATABASE must be exported}"

output_dir="${BACKUP_DIR:-./backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output_file="${output_dir}/mosa_wms_${timestamp}.dump"

mkdir -p "$output_dir"

docker compose \
  --env-file "${COMPOSE_ENV_FILE:-.env.production}" \
  -f docker-compose.production.yml \
  exec -T postgres \
  pg_dump --format=custom --no-owner --no-acl \
  --username "$DB_USERNAME" \
  --dbname "$DB_DATABASE" > "$output_file"

chmod 600 "$output_file"
printf 'Backup written to %s\n' "$output_file"
