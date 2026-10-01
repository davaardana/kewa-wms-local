/**
 * Edge-to-Edge Mesh Sync
 * Enables peer discovery and tag sighting sharing between multiple gate
 * edge-bridge instances on the same LAN via UDP broadcast.
 *
 * Use case: Gudang dengan 2+ gerbang — jika tag X sudah tercatat MASUK
 * di gerbang depan, lalu muncul di gerbang belakang → otomatis dianggap KELUAR.
 *
 * Enable via env: MESH_ENABLED=true, MESH_PORT=2090
 */

const dgram = require('dgram');

class MeshSync {
  constructor(options = {}) {
    this.enabled = options.enabled || (process.env.MESH_ENABLED === 'true');
    this.port = options.port || parseInt(process.env.MESH_PORT || '2090', 10);
    this.gateId = options.gateId || process.env.GATE_ID || 'GATE-01';
    this.warehouseId = options.warehouseId || parseInt(process.env.WAREHOUSE_ID || '1', 10);

    // Recent tag sightings from ALL peers (including self): epc -> { gateId, direction, timestamp }
    this.peerSightings = new Map();
    this._peerSightingTtlMs = options.ttlMs || 300000; // 5 minutes

    this.socket = null;
    this.onPeerSighting = options.onPeerSighting || null; // callback(sighting)

    if (this.enabled) {
      this._startListener();
    }
  }

  _startListener() {
    try {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('message', (msg, rinfo) => {
        try {
          const data = JSON.parse(msg.toString('utf8'));
          if (data.warehouse_id !== this.warehouseId) return; // ignore other warehouses
          if (data.gate_id === this.gateId) return; // ignore own broadcasts

          // Store peer sighting
          for (const tag of (data.tags || [])) {
            const sighting = {
              epc: tag.epc,
              gateId: data.gate_id,
              direction: tag.direction,
              timestamp: data.timestamp,
              peerIp: rinfo.address,
            };
            this.peerSightings.set(tag.epc, sighting);
            if (this.onPeerSighting) this.onPeerSighting(sighting);
          }
        } catch (_) {}
      });

      this.socket.on('error', (err) => {
        console.warn(`⚠️ [MESH SYNC] UDP error: ${err.message}`);
      });

      this.socket.bind(this.port, () => {
        this.socket.setBroadcast(true);
        console.log(`🔗 [MESH SYNC] Listening for peer gates on UDP port ${this.port}`);
      });
    } catch (err) {
      console.warn(`⚠️ [MESH SYNC] Could not start: ${err.message}`);
    }
  }

  /**
   * Broadcast tag sightings to all peers on the LAN.
   * Called after a gate event dispatch.
   * @param {Array<{epc: string, direction: string}>} tags
   */
  broadcastSighting(tags) {
    if (!this.enabled || !this.socket) return;
    const message = JSON.stringify({
      warehouse_id: this.warehouseId,
      gate_id: this.gateId,
      timestamp: new Date().toISOString(),
      tags,
    });
    try {
      this.socket.send(message, this.port, '255.255.255.255');
    } catch (_) {}
  }

  /**
   * Check if a tag was recently seen at another gate.
   * @param {string} epc
   * @returns {{ gateId: string, direction: string, timestamp: string } | null}
   */
  getPeerSighting(epc) {
    const sighting = this.peerSightings.get(epc);
    if (!sighting) return null;
    // Check TTL
    const age = Date.now() - new Date(sighting.timestamp).getTime();
    if (age > this._peerSightingTtlMs) {
      this.peerSightings.delete(epc);
      return null;
    }
    return sighting;
  }

  /**
   * Purge expired peer sightings.
   */
  cleanup() {
    const now = Date.now();
    for (const [epc, sighting] of this.peerSightings) {
      const age = now - new Date(sighting.timestamp).getTime();
      if (age > this._peerSightingTtlMs) {
        this.peerSightings.delete(epc);
      }
    }
  }

  close() {
    if (this.socket) {
      try { this.socket.close(); } catch (_) {}
      this.socket = null;
    }
  }
}

module.exports = MeshSync;
