/**
 * Relay Controller for Electromagnetic Door Lock
 * Defaults to LOCKED (Relay OFF).
 * When unlocked, pulses Relay ON for unlockDurationMs, then auto-locks.
 */

class RelayController {
  constructor(options = {}) {
    // R-18: UNLOCK_DURATION_MS configurable via env var
    this.unlockDurationMs = options.unlockDurationMs
      || parseInt(process.env.UNLOCK_DURATION_MS || '5000', 10);
    this.isUnlocked = false;
    this.timer = null;
    this.onStatusChange = options.onStatusChange || null; // R-08: callback for status broadcasts
  }

  /**
   * Unlock gate momentarily for authorized pass.
   */
  unlock() {
    this.isUnlocked = true;
    console.log(`🧪 [SIMULATED GATE RELAY] Logical UNLOCK only. Auto-locking in ${this.unlockDurationMs}ms; no hardware adapter configured.`);

    if (this.timer) clearTimeout(this.timer);

    // R-08: notify caller of status change
    if (this.onStatusChange) this.onStatusChange('unlocked');

    this.timer = setTimeout(() => {
      this.lock();
    }, this.unlockDurationMs);
  }

  /**
   * Lock gate immediately.
   */
  lock() {
    const wasUnlocked = this.isUnlocked;
    this.isUnlocked = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    console.log('🧪 [SIMULATED GATE RELAY] Logical LOCKED; no physical lock assertion.');

    // R-08: only notify on actual state change to avoid duplicate broadcasts
    if (wasUnlocked && this.onStatusChange) this.onStatusChange('locked');
  }

  getStatus() {
    return { isUnlocked: this.isUnlocked };
  }
}

module.exports = RelayController;
