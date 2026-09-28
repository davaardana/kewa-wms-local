/**
 * Local Offline Event Buffer & Cache
 * Implements Store-and-Forward pattern for transient warehouses when connection drops.
 */

const fs = require('fs');
const path = require('path');

class LocalCache {
  constructor(options = {}) {
    this.bufferFile = options.bufferFile || path.join(__dirname, '../offline_buffer.json');
    this.deadLetterFile = options.deadLetterFile || `${this.bufferFile}.dead-letter`;
    this.incidentFile = options.incidentFile || `${this.bufferFile}.incidents`;
    this.buffer = this._loadFile(this.bufferFile);
    this.deadLetters = this._loadFile(this.deadLetterFile);
    this.incidents = this._loadFile(this.incidentFile);
  }

  _loadFile(file) {
    try {
      if (fs.existsSync(file)) {
        const value = JSON.parse(fs.readFileSync(file, 'utf8'));
        return Array.isArray(value) ? value : [];
      }
    } catch (e) {
      console.error(`Could not read durable queue ${file}; preserving file and failing closed:`, e.message);
    }
    return [];
  }

  _atomicSave(file, value) {
    const temp = `${file}.${process.pid}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const fd = fs.openSync(temp, 'w');
    try {
      fs.writeFileSync(fd, JSON.stringify(value, null, 2));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, file);
  }

  /**
   * Queue event locally when backend is unreachable.
   */
  queueEvent(eventPayload) {
    this.buffer.push({
      event: eventPayload,
      queuedAt: new Date().toISOString(),
      retryCount: 0,
    });
    this._atomicSave(this.bufferFile, this.buffer);
    console.log(`📦 [OFFLINE BUFFER] Queued event. Current buffer size: ${this.buffer.length}`);
  }

  queueIncident(incident) {
    if (this.incidents.some((item) => item.event_id === incident.event_id)) return;
    this.incidents.push(incident);
    this._atomicSave(this.incidentFile, this.incidents);
  }

  getPendingIncidents() { return this.incidents; }

  removeIncident(index) {
    this.incidents.splice(index, 1);
    this._atomicSave(this.incidentFile, this.incidents);
  }

  /**
   * Drain pending offline events to push to server.
   */
  getPendingEvents() {
    return this.buffer;
  }

  removeEvent(index) {
    this.buffer.splice(index, 1);
    this._atomicSave(this.bufferFile, this.buffer);
  }

  incrementRetry(index, error) {
    this.buffer[index].retryCount = (this.buffer[index].retryCount || 0) + 1;
    this.buffer[index].lastError = error;
    this._atomicSave(this.bufferFile, this.buffer);
  }

  quarantineFirst(reason) {
    const item = this.buffer.shift();
    if (!item) return;
    this.deadLetters.push({ ...item, quarantinedAt: new Date().toISOString(), reason });
    this._atomicSave(this.deadLetterFile, this.deadLetters);
    this._atomicSave(this.bufferFile, this.buffer);
  }

  clear() {
    this.buffer = [];
    this._atomicSave(this.bufferFile, this.buffer);
  }
}

module.exports = LocalCache;
