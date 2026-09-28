/**
 * Relay Controller for Electromagnetic Door Lock
 * Defaults to LOCKED (Relay OFF).
 * When unlocked, pulses Relay ON for unlockDurationMs, then auto-locks.
 */

class RelayController {
  constructor(options = {}) {
    this.unlockDurationMs = options.unlockDurationMs || 5000; // 5 seconds open window
    this.isUnlocked = false;
    this.timer = null;
  }

  /**
   * Unlock gate momentarily for authorized pass.
   */
  unlock() {
    this.isUnlocked = true;
    console.log(`🧪 [SIMULATED GATE RELAY] Logical UNLOCK only. Auto-locking in ${this.unlockDurationMs}ms; no hardware adapter configured.`);

    if (this.timer) clearTimeout(this.timer);

    this.timer = setTimeout(() => {
      this.lock();
    }, this.unlockDurationMs);
  }

  /**
   * Lock gate immediately.
   */
  lock() {
    this.isUnlocked = false;
    if (this.timer) clearTimeout(this.timer);
    console.log('🧪 [SIMULATED GATE RELAY] Logical LOCKED; no physical lock assertion.');
  }

  getStatus() {
    return { isUnlocked: this.isUnlocked };
  }
}

module.exports = RelayController;
