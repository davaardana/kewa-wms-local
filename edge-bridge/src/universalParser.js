/**
 * Universal RFID Frame Parser
 * Auto-detects whether incoming TCP stream is:
 * - Electron HW-VX Series (HW-VX6346KL / HW-VX6330K)
 * - Electron EL-UHF-RC4 Series (EL-UHF-RC4-C1 / RC Protocol v1.1 & legacy)
 */

const HwVxParser = require('./hwVxParser');
const Rc4Parser = require('./rc4Parser');

class UniversalParser {
  /**
   * Parse incoming buffer with automatic protocol dispatch
   * @param {Buffer} buffer
   * @returns {{ frames: Array<{ epc: string, readerAddress: number, rssi: number, rawHex: string, protocol: string }>, remaining: Buffer }}
   */
  static parse(buffer) {
    if (!buffer || buffer.length === 0) {
      return { frames: [], remaining: Buffer.alloc(0) };
    }

    // 1. If buffer starts with or contains RC4 preamble 0xCF (Official v1.1) or 0xBB (Legacy)
    if (buffer[0] === 0xCF || buffer[0] === 0xBB || buffer.indexOf(0xCF) !== -1 || buffer.indexOf(0xBB) !== -1) {
      const rc4Result = Rc4Parser.parse(buffer);
      if (rc4Result.frames.length > 0 || rc4Result.needsReinventory) {
        return rc4Result;
      }
    }

    // 2. Try HW-VX parser (length-prefixed frame)
    const hwVxResult = HwVxParser.parse(buffer);
    if (hwVxResult.frames.length > 0) {
      return {
        frames: hwVxResult.frames.map((f) => ({ ...f, protocol: 'HW_VX' })),
        remaining: hwVxResult.remaining,
      };
    }

    // 3. Fallback: Try RC4 again
    const rc4Fallback = Rc4Parser.parse(buffer);
    if (rc4Fallback.frames.length > 0) {
      return rc4Fallback;
    }

    return hwVxResult;
  }
}

module.exports = UniversalParser;
