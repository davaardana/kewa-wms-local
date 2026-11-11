/**
 * API Client to communicate with Laravel Backend API
 *
 * Percepatan:
 *  #3 — HTTP Keep-Alive: persistent TCP connection, eliminasi TCP+TLS handshake per request
 *  #1 — SSE stream: edge membuka long-lived GET ke VPS, VPS push config & events real-time
 *  #4 — Reverse channel: VPS tidak perlu curl ke edge, gunakan SSE stream yang sudah terbuka
 */

const http  = require('http');
const https = require('https');
const axios = require('axios');

// #3: Persistent agents — satu koneksi TCP untuk semua request ke backend
const keepAliveAgent = new http.Agent({
  keepAlive:        true,
  maxSockets:       4,    // max simultaneous connections ke VPS
  maxFreeSockets:   2,    // idle connections di-pool
  timeout:          60000,
  freeSocketTimeout: 30000,
});
const keepAliveAgentHttps = new https.Agent({
  keepAlive:        true,
  maxSockets:       4,
  maxFreeSockets:   2,
  timeout:          60000,
  freeSocketTimeout: 30000,
});

class ApiClient {
  constructor(baseUrl = 'http://127.0.0.1:8000/api', localCache = null, deviceToken = null) {
    this.baseUrl        = baseUrl;
    this.localCache     = localCache;
    this.deviceToken    = deviceToken;
    this.flushPromise   = null;
    this.incidentFlushPromise = null;
    this._configCache         = null;
    this._configCacheExpiresAt = 0;

    // #1/#4: SSE stream state
    this._sseReq             = null;
    this._sseReconnectTimer  = null;
    this._sseConnected       = false;
    this._sseRetryCount      = 0;
    this._sseBuffer          = '';
    this._onSseEvent         = null; // callback(type, data)
  }

  /** Build request config with Keep-Alive agent and auth header. */
  mutationConfig(timeout) {
    if (!this.deviceToken) throw new Error('DEVICE_API_TOKEN is required');
    const isHttps = this.baseUrl.startsWith('https');
    return {
      timeout,
      httpAgent:  isHttps ? undefined : keepAliveAgent,
      httpsAgent: isHttps ? keepAliveAgentHttps : undefined,
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${this.deviceToken}`,
      },
    };
  }

  /**
   * Dispatch gate event to Laravel backend API.
   */
  async sendGateEvent(payload) {
    if (!this.deviceToken) {
      return { unlock_gate: false, status: 'AUTH_CONFIG_ERROR', message: 'DEVICE_API_TOKEN is required', mismatch: true };
    }
    try {
      const response = await axios.post(`${this.baseUrl}/gate/event`, payload, this.mutationConfig(6000));
      console.log('📡 [API CLIENT] Gate Event Response:', response.data);
      return response.data;
    } catch (error) {
      console.warn('⚠️ [API CLIENT] Could not reach backend API:', error.message);
      if (this.localCache && !payload.__queued) {
        this.localCache.queueEvent(payload);
      }
      return {
        unlock_gate: false,
        status:      'OFFLINE_BUFFERED',
        message:     'Saved to local buffer due to network timeout.',
        mismatch:    true,
      };
    }
  }

  /**
   * Flush pending events from local buffer to server.
   */
  async flushOfflineBuffer() {
    if (!this.localCache || !this.deviceToken) return;
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this._flushOfflineBuffer();
    try { return await this.flushPromise; } finally { this.flushPromise = null; }
  }

  async _flushOfflineBuffer() {
    const pending = this.localCache.getPendingEvents();
    if (pending.length === 0) return;
    console.log(`🔄 [API CLIENT] Attempting to flush ${pending.length} offline events...`);

    while (pending.length > 0) {
      const item = pending[0];
      try {
        await axios.post(`${this.baseUrl}/gate/event`, item.event, this.mutationConfig(6000));
        this.localCache.removeEvent(0);
        console.log('✅ [API CLIENT] Flushed oldest buffered event');
      } catch (e) {
        this.localCache.incrementRetry(0, e.message);
        const isClientError    = e.response && e.response.status >= 400 && e.response.status < 500;
        const maxRetriesReached = item.retryCount >= 5;
        if (isClientError || maxRetriesReached) {
          const reason = isClientError ? `HTTP ${e.response.status}` : 'Max 5 retries reached';
          this.localCache.quarantineFirst(reason);
          console.warn(`⚠️ [API CLIENT] Quarantined failed event (${reason})`);
        } else {
          console.warn(`❌ [API CLIENT] FIFO flush paused (Attempt ${item.retryCount}/5): ${e.message}`);
          break;
        }
      }
    }
  }

  /** Send heartbeat telemetry to Central Dashboard. */
  async sendHeartbeat(payload) {
    if (!this.deviceToken) return null;
    try {
      const response = await axios.post(`${this.baseUrl}/devices/heartbeat`, payload, this.mutationConfig(3000));
      return response.data;
    } catch (error) {
      if (error.response?.status === 422) {
        console.warn('⚠️ [HEARTBEAT] 422 validation error:', JSON.stringify(error.response.data));
      }
      return null;
    }
  }

  async sendHealthIncident(payload) {
    try {
      await axios.post(`${this.baseUrl}/devices/incidents`, payload, this.mutationConfig(3000));
      return true;
    } catch (error) {
      if (this.localCache) this.localCache.queueIncident(payload);
      return false;
    }
  }

  async flushHealthIncidents() {
    if (!this.localCache || !this.deviceToken || this.incidentFlushPromise) return this.incidentFlushPromise;
    this.incidentFlushPromise = (async () => {
      const pending = this.localCache.getPendingIncidents();
      while (pending.length) {
        try {
          await axios.post(`${this.baseUrl}/devices/incidents`, pending[0], this.mutationConfig(3000));
          this.localCache.removeIncident(0);
        } catch (error) { break; }
      }
    })();
    try { await this.incidentFlushPromise; } finally { this.incidentFlushPromise = null; }
  }

  /** Shared cached fetcher for /devices/config (TTL: 1.5s). */
  async _fetchConfigCached() {
    const now = Date.now();
    if (this._configCache && now < this._configCacheExpiresAt) {
      return this._configCache;
    }
    const response = await axios.get(`${this.baseUrl}/devices/config`, this.mutationConfig(3000));
    this._configCache = response.data;
    this._configCacheExpiresAt = now + 1500;
    return this._configCache;
  }

  /** Fetch registered devices configuration from Central API. */
  async fetchPairedDevices() {
    if (!this.deviceToken) return [];
    try {
      const data = await this._fetchConfigCached();
      return data?.device ? [data.device] : [];
    } catch (error) {
      return [];
    }
  }

  async fetchGateConfig() {
    if (!this.deviceToken) return null;
    try {
      return await this._fetchConfigCached();
    } catch (error) {
      this._configCache = null;
      return null;
    }
  }

  /** Send lightweight tag sighting to central API. */
  async sendTagSighting(epc, antenna = 1, rssi = -60, observedAt = new Date().toISOString()) {
    if (!this.deviceToken) return null;
    try {
      const response = await axios.post(`${this.baseUrl}/gate/sighting`, {
        epc,
        antenna,
        rssi,
        observed_at: observedAt,
      }, this.mutationConfig(2500)); // #9: naik dari 1000 → 2500ms
      return response.data;
    } catch (e) {
      const code = e?.code || e?.response?.status || 'ERR';
      const msg  = e?.response?.data?.error || e?.message || 'unknown';
      console.warn(`⚠️ [SIGHTING] POST /gate/sighting failed (${code}): ${msg} — epc=${epc}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // #1 / #4 — SSE Stream: edge-bridge membuka long-lived connection ke VPS
  //           VPS push config changes & broadcasts real-time tanpa perlu tahu
  //           IP/port edge (works behind NAT).
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Open Server-Sent Events stream to VPS backend.
   * VPS pushes gate config changes, doc approvals, and decisions directly.
   * Edge reconnects automatically with exponential backoff.
   *
   * @param {function(type: string, data: object): void} onEvent - called on each SSE event
   */
  openEventStream(onEvent) {
    if (!this.deviceToken) return;
    this._onSseEvent = onEvent;
    this._sseConnect();
  }

  _sseConnect() {
    if (!this.deviceToken || !this._onSseEvent) return;

    const url  = new URL(`${this.baseUrl}/edge/events`);
    const isHttps = url.protocol === 'https:';
    const lib  = isHttps ? https : http;
    const agent = isHttps ? keepAliveAgentHttps : keepAliveAgent;

    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method:   'GET',
      agent,
      headers: {
        Authorization:  `Bearer ${this.deviceToken}`,
        Accept:         'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection:     'keep-alive',
      },
      timeout: 65000, // lebih lama dari server-side 55s max stream
    };

    console.log(`📡 [SSE] Connecting to VPS event stream: ${url.origin}${url.pathname}`);

    const req = lib.request(options, (res) => {
      if (res.statusCode !== 200) {
        console.warn(`⚠️ [SSE] Server returned ${res.statusCode} — akan retry`);
        res.resume(); // drain
        this._sseScheduleReconnect();
        return;
      }

      this._sseConnected  = true;
      this._sseRetryCount = 0;
      this._sseBuffer     = '';
      console.log('✅ [SSE] Connected to VPS event stream');

      res.setEncoding('utf8');
      res.on('data', (chunk) => this._sseParse(chunk));
      res.on('end',  () => {
        this._sseConnected = false;
        console.log('🔁 [SSE] Stream ended — reconnecting...');
        this._sseScheduleReconnect();
      });
      res.on('error', (err) => {
        this._sseConnected = false;
        console.warn(`⚠️ [SSE] Stream error: ${err.message}`);
        this._sseScheduleReconnect();
      });
    });

    req.on('error', (err) => {
      this._sseConnected = false;
      // Jangan log setiap error jika VPS unreachable — akan retry otomatis
      if (this._sseRetryCount < 2) {
        console.warn(`⚠️ [SSE] Connection error: ${err.message}`);
      }
      this._sseScheduleReconnect();
    });

    req.on('timeout', () => {
      req.destroy();
    });

    req.end();
    this._sseReq = req;
  }

  /** Parse incoming SSE chunks — accumulate buffer and emit complete events. */
  _sseParse(chunk) {
    this._sseBuffer += chunk;
    const parts = this._sseBuffer.split('\n\n');
    // Last part may be incomplete — keep in buffer
    this._sseBuffer = parts.pop() || '';

    for (const block of parts) {
      if (!block.trim()) continue;
      let eventType = 'message';
      let dataLines = [];

      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
        // Ignore 'id:', 'retry:', and comment lines (':')
      }

      if (dataLines.length === 0) continue;

      try {
        const data = JSON.parse(dataLines.join('\n'));
        if (this._onSseEvent) this._onSseEvent(eventType, data);
      } catch (_) {
        // Not JSON (e.g. heartbeat comment) — ignore
      }
    }
  }

  /** Reconnect SSE with exponential backoff (max 30s). */
  _sseScheduleReconnect() {
    if (this._sseReq) {
      try { this._sseReq.destroy(); } catch (_) {}
      this._sseReq = null;
    }
    if (this._sseReconnectTimer) return;

    this._sseRetryCount++;
    const baseDelay = Math.min(30000, 1000 * Math.pow(1.5, Math.min(this._sseRetryCount - 1, 8)));
    const jitter    = Math.floor(Math.random() * 500);
    const delay     = Math.round(baseDelay + jitter);

    this._sseReconnectTimer = setTimeout(() => {
      this._sseReconnectTimer = null;
      this._sseConnect();
    }, delay);
  }

  /** Close SSE stream (called on shutdown). */
  closeSse() {
    if (this._sseReconnectTimer) {
      clearTimeout(this._sseReconnectTimer);
      this._sseReconnectTimer = null;
    }
    if (this._sseReq) {
      try { this._sseReq.destroy(); } catch (_) {}
      this._sseReq = null;
    }
    this._sseConnected = false;
  }
}

module.exports = ApiClient;
