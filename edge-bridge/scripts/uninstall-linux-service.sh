#!/bin/bash
set -e

if [ "$EUID" -ne 0 ]; then
  echo "❌ Error: Skrip ini harus dijalankan dengan hak akses root (sudo)."
  exit 1
fi

SERVICE_NAME="mosa-edge-bridge"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo "🛑 Stopping and disabling $SERVICE_NAME..."
systemctl stop "$SERVICE_NAME" || true
systemctl disable "$SERVICE_NAME" || true

if [ -f "$SERVICE_FILE" ]; then
  rm -f "$SERVICE_FILE"
  systemctl daemon-reload
  echo "✅ Service $SERVICE_NAME berhasil dihapus."
else
  echo "ℹ️ Service $SERVICE_FILE tidak ditemukan."
fi
