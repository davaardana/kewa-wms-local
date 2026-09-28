#!/bin/bash
set -e

echo "=============================================================================="
echo "  MOSA RFID Edge Bridge - Linux / Raspberry Pi Systemd Service Installer"
echo "=============================================================================="

if [ "$EUID" -ne 0 ]; then
  echo "❌ Error: Skrip ini harus dijalankan dengan hak akses root (sudo)."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_NAME="mosa-edge-bridge"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
NODE_PATH="$(which node || echo "/usr/bin/node")"

echo "📂 App Directory: $APP_DIR"
echo "🟢 Node.js Path: $NODE_PATH"

# Buat file service dinamis dengan path aktual
cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=MOSA WMS IoT RFID Gate Bridge Service (Universal Reader Mode)
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$APP_DIR
ExecStart=$NODE_PATH $APP_DIR/src/index.js
Restart=always
RestartSec=3s
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production
Environment=PORT=2077
Environment=WS_PORT=2078

[Install]
WantedBy=multi-user.target
EOF

echo "⚙️ Reloading systemd daemon..."
systemctl daemon-reload

echo "🚀 Enabling and starting $SERVICE_NAME service..."
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo ""
echo "=============================================================================="
echo "  ✅ BERHASIL: Service $SERVICE_NAME telah aktif dan berjalan di background!"
echo ""
echo "  Perintah Pemantauan:"
echo "    - Cek Status:  sudo systemctl status $SERVICE_NAME"
echo "    - Cek Log:     sudo journalctl -u $SERVICE_NAME -f"
echo "    - Restart:     sudo systemctl restart $SERVICE_NAME"
echo "    - Stop:        sudo systemctl stop $SERVICE_NAME"
echo "=============================================================================="
