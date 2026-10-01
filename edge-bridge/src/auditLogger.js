/**
 * Append-Only Audit Trail Logger
 * Writes one JSON line per gate event to a daily-rotated log file.
 * Files are append-only — never edited or deleted by the system.
 * Useful for forensic evidence, compliance audits, and database replay.
 */

const fs = require('fs');
const path = require('path');

class AuditLogger {
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(__dirname, '../audit_logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    this._currentDate = null;
    this._fd = null;
  }

  /**
   * Get or open the file descriptor for today's log file.
   * Rotates automatically at midnight.
   */
  _getFileDescriptor() {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    if (this._currentDate === today && this._fd !== null) {
      return this._fd;
    }
    // Close previous day's file
    if (this._fd !== null) {
      try { fs.closeSync(this._fd); } catch (_) {}
    }
    this._currentDate = today;
    const filePath = path.join(this.logDir, `gate_audit_${today}.jsonl`);
    this._fd = fs.openSync(filePath, 'a'); // append-only
    return this._fd;
  }

  /**
   * Append a gate event record to the audit log.
   * @param {string} eventType - 'GATE_PASS' | 'TAG_WRITE' | 'MODE_CHANGE' | 'SYSTEM'
   * @param {object} data - Event payload
   */
  log(eventType, data) {
    try {
      const record = {
        ts: new Date().toISOString(),
        event: eventType,
        ...data,
      };
      const line = JSON.stringify(record) + '\n';
      const fd = this._getFileDescriptor();
      fs.writeSync(fd, line);
    } catch (err) {
      console.warn(`⚠️ [AUDIT LOG] Write failed: ${err.message}`);
    }
  }

  /**
   * Flush and close file descriptor on shutdown.
   */
  close() {
    if (this._fd !== null) {
      try {
        fs.fsyncSync(this._fd);
        fs.closeSync(this._fd);
      } catch (_) {}
      this._fd = null;
    }
  }
}

module.exports = AuditLogger;
