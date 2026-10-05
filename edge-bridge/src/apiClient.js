/**
 * API Client to communicate with Laravel Backend API
 */

const axios = require('axios');

class ApiClient {
  constructor(baseUrl = 'http://127.0.0.1:8000/api', localCache = null, deviceToken = null) {
    this.baseUrl = baseUrl;
    this.localCache = localCache;
    this.deviceToken = deviceToken;
    this.flushPromise = null;
    this.incidentFlushPromise = null;
    this._configCache = null;           // cached /devices/config response (#8)
    this._configCacheExpiresAt = 0;    // TTL timestamp for cache (#8)
  }

  mutationConfig(timeout) {
    if (!this.deviceToken) throw new Error('DEVICE_API_TOKEN is required');
    return {
      timeout,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.deviceToken}`,
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
      const response = await axios.post(`${this.baseUrl}/gate/event`, payload, this.mutationConfig(4000));

      console.log('📡 [API CLIENT] Gate Event Response:', response.data);
      return response.data;
    } catch (error) {
      console.warn('⚠️ [API CLIENT] Could not reach backend API:', error.message);

      if (this.localCache && !payload.__queued) {
        this.localCache.queueEvent(payload);
      }

      return {
        unlock_gate: false,
        status: 'OFFLINE_BUFFERED',
        message: 'Saved to local buffer due to network timeout.',
        mismatch: true,
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
        await axios.post(`${this.baseUrl}/gate/event`, item.event, this.mutationConfig(4000));
        this.localCache.removeEvent(0);
        console.log('✅ [API CLIENT] Flushed oldest buffered event');
      } catch (e) {
        this.localCache.incrementRetry(0, e.message);
        const isClientError = e.response && e.response.status >= 400 && e.response.status < 500;
        const maxRetriesReached = item.retryCount >= 5;

        if (isClientError || maxRetriesReached) {
          const reason = isClientError ? `HTTP ${e.response.status}` : 'Max 5 retries reached';
          this.localCache.quarantineFirst(reason);
          console.warn(`⚠️ [API CLIENT] Quarantined failed event (${reason})`);
        } else {
          console.warn(`❌ [API CLIENT] FIFO flush paused (Attempt ${item.retryCount}/5): ${e.message}`);
          break; // Server down or transient issue, retry next cycle
        }
      }
    }
  }

  /**
   * Send heartbeat telemetry to Central Dashboard.
   */
  async sendHeartbeat(payload) {
    if (!this.deviceToken) return null;
    try {
      const response = await axios.post(`${this.baseUrl}/devices/heartbeat`, payload, this.mutationConfig(3000));
      return response.data;
    } catch (error) {
      // Silent fail on heartbeat to not pollute logs
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

  /**
   * Shared cached fetcher for /devices/config (TTL: 30s).
   * Both fetchPairedDevices and fetchGateConfig use this to avoid double API hits (#8).
   */
  async _fetchConfigCached() {
    const now = Date.now();
    if (this._configCache && now < this._configCacheExpiresAt) {
      return this._configCache;
    }
    const response = await axios.get(`${this.baseUrl}/devices/config`, this.mutationConfig(3000));
    this._configCache = response.data;
    this._configCacheExpiresAt = now + 30000; // 30s TTL
    return this._configCache;
  }

  /**
   * Fetch registered devices configuration from Central API.
   */
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
      this._configCache = null; // invalidate on error so next call retries
      return null;
    }
  }

  /**
   * Send lightweight tag sighting to central API for instant live UI telemetry (<100ms).
   */
  async sendTagSighting(epc, antenna = 1, rssi = -60, observedAt = new Date().toISOString()) {
    if (!this.deviceToken) return null;
    try {
      const response = await axios.post(`${this.baseUrl}/gate/sighting`, {
        epc,
        antenna,
        rssi,
        observed_at: observedAt,
      }, this.mutationConfig(1000));
      return response.data;
    } catch (e) {
      return null;
    }
  }
}

module.exports = ApiClient;
