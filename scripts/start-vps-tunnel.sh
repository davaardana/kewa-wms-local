#!/usr/bin/env bash
# ============================================================
# MOSA WMS — DEPRECATED: SSH Reverse Tunnel tidak diperlukan
#
# Edge-bridge sudah berjalan langsung di VPS sebagai container
# mosa-edge-bridge dengan WS terekspos via nginx location /ws-edge/.
#
# Arsitektur VPS saat ini:
#   Browser → ws://206.237.98.48/ws-edge/
#           → Sistem nginx (port 80)
#           → mosa-nginx container (port 8081)
#           → edge-bridge container (port 2078, internal network)
#
# TIDAK perlu SSH tunnel dari Mac lokal.
#
# Untuk mengelola edge-bridge di VPS:
#   ssh -p 2210 dava@206.237.98.48
#   cd /var/www/mosa
#   docker compose logs -f mosa-edge-bridge
#   docker compose restart mosa-edge-bridge
# ============================================================
echo "ℹ️  SSH tunnel tidak diperlukan — edge-bridge sudah berjalan di VPS."
echo "   WS URL: ws://206.237.98.48/ws-edge/"
echo "   Login VPS: ssh -p 2210 dava@206.237.98.48"

