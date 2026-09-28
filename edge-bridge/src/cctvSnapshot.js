/**
 * CCTV Snapshot Helper
 * Takes a timestamped snapshot reference for gate pass events.
 */

const fs = require('fs');
const path = require('path');

class CctvSnapshot {
  constructor(options = {}) {
    this.storageDir = options.storageDir || path.join(__dirname, '../snapshots');
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * Capture a snapshot for the current gate pass event.
   * @param {string} gateId
   * @param {'OUT'|'IN'} direction
   * @returns {string} Snapshot file path or relative URL
   */
  capture(gateId = 'GATE-01', direction = 'OUT') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `snapshot_${gateId}_${direction}_${timestamp}.jpg`;
    const fullPath = path.join(this.storageDir, filename);

    // In a real CCTV setup, ffmpeg or RTSP grabber pulls frame from IP camera.
    // We create a valid timestamp reference file here.
    fs.writeFileSync(fullPath, Buffer.from(`MOCK_CCTV_SNAPSHOT_${gateId}_${timestamp}`));

    console.log(`🧪 [SIMULATED CCTV] Created marker file only: ${filename}`);
    return `/storage/snapshots/${filename}`;
  }
}

module.exports = CctvSnapshot;
