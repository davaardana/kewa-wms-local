/**
 * Direction Engine for RFID Gate
 * Supports:
 * 1. DUAL_ANTENNA_AUTO:
 *    - Antena A = Sisi DALAM gudang
 *    - Antena B = Sisi LUAR gudang
 *    - A -> B: KELUAR (OUT / FULFILLMENT)
 *    - B -> A: MASUK (IN / RETURN)
 * 2. SINGLE_ANTENNA_SESSION with RSSI Delta Trend:
 *    - Menganalisis gradien perubahan RSSI (ΔRSSI = RSSI_akhir - RSSI_awal)
 *    - ΔRSSI menguat (+5 dBm): Objek bergerak MENDEKATI gerbang (APPROACHING)
 *    - ΔRSSI melemah (-5 dBm): Objek bergerak MENJAUHI gerbang (DEPARTING)
 */

class DirectionEngine {
  constructor(options = {}) {
    this.minTimeWindowMs = options.minTimeWindowMs || 300; // 0.3s
    this.maxTimeWindowMs = options.maxTimeWindowMs || 4000; // 4.0s
    this.rssiThreshold = options.rssiThreshold || -75; // dBm minimum signal strength
    this.tagReadHistory = new Map(); // EPC -> Array of { antenna, timestamp, rssi }
  }

  /**
   * Process raw tag read event from reader antenna.
   * @param {string} epc - RFID EPC Hex String
   * @param {'A'|'B'} antenna - Antenna Identifier
   * @param {number} rssi - Signal strength in dBm (e.g. -60)
   * @returns {{ completed: boolean, direction?: 'A_TO_B'|'B_TO_A'|'SINGLE_ANTENNA', epc?: string, rssiTrend?: 'APPROACHING'|'DEPARTING'|'STATIC' }}
   */
  processTagRead(epc, antenna, rssi = -60) {
    if (rssi < this.rssiThreshold) {
      // Ignore weak signals (ghost reads from nearby warehouse shelves)
      return { completed: false, reason: 'RSSI_BELOW_THRESHOLD' };
    }

    const now = Date.now();
    let history = this.tagReadHistory.get(epc) || [];

    // Purge records older than maxTimeWindowMs
    history = history.filter((record) => (now - record.timestamp) <= this.maxTimeWindowMs);

    // Append current read
    history.push({ antenna, timestamp: now, rssi });
    this.tagReadHistory.set(epc, history);

    // 1. Dual Antenna Sequence Evaluation (A <-> B)
    const firstRead = history[0];
    const latestRead = history[history.length - 1];

    if (firstRead.antenna !== latestRead.antenna) {
      const timeDelta = latestRead.timestamp - firstRead.timestamp;
      if (timeDelta >= this.minTimeWindowMs && timeDelta <= this.maxTimeWindowMs) {
        const sequence = (firstRead.antenna === 'A' && latestRead.antenna === 'B') ? 'A_TO_B' : 'B_TO_A';

        // Clear history for this EPC after successful completion
        this.tagReadHistory.delete(epc);

        return {
          completed: true,
          epc,
          direction: sequence,
          timeDeltaMs: timeDelta,
          firstAntenna: firstRead.antenna,
          secondAntenna: latestRead.antenna,
          rssiTrend: this.calculateRssiTrend(history),
        };
      }
    }

    // 2. Single Antenna RSSI Trend Evaluation
    // If multiple reads detected on the same antenna within time window
    if (history.length >= 3) {
      const trend = this.calculateRssiTrend(history);
      return {
        completed: false,
        epc,
        reason: 'SINGLE_ANTENNA_MONITORING',
        antenna: latestRead.antenna,
        rssiTrend: trend.trend,
        deltaRssi: trend.deltaRssi,
      };
    }

    return { completed: false, reason: 'WAITING_SEQUENCE' };
  }

  /**
   * Calculate RSSI gradient over readings
   * @param {Array<{ timestamp: number, rssi: number }>} history
   */
  calculateRssiTrend(history) {
    if (!history || history.length < 2) {
      return { trend: 'STATIC', deltaRssi: 0 };
    }

    const firstRssi = history[0].rssi;
    const lastRssi = history[history.length - 1].rssi;
    const deltaRssi = lastRssi - firstRssi;

    let trend = 'STATIC';
    if (deltaRssi >= 4) {
      trend = 'APPROACHING'; // Sinyal makin kuat -> Mendekati
    } else if (deltaRssi <= -4) {
      trend = 'DEPARTING'; // Sinyal makin lemah -> Menjauhi
    }

    return { trend, deltaRssi };
  }

  /**
   * Flush expired tag readings older than maxTimeWindowMs
   */
  cleanupExpired() {
    const now = Date.now();
    for (const [epc, history] of this.tagReadHistory.entries()) {
      const valid = history.filter((r) => now - r.timestamp <= this.maxTimeWindowMs);
      if (valid.length === 0) {
        this.tagReadHistory.delete(epc);
      } else {
        this.tagReadHistory.set(epc, valid);
      }
    }
  }
}

module.exports = DirectionEngine;

