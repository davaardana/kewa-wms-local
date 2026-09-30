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
   * R-07: Removed redundant double-parse of RC4 — each parser is tried exactly once.
   * @param {Buffer} buffer
   * @returns {{ frames: Array<{ epc: string, readerAddress: number, rssi: number, rawHex: string, protocol: string }>, remaining: Buffer }}
   */
  static parse(buffer) {
    if (!buffer || buffer.length === 0) {
      return { frames: [], remaining: Buffer.alloc(0) };
    }

    // 1. If buffer contains RC4 preamble 0xCF or 0xBB, try RC4 first
    if (buffer.indexOf(0xCF) !== -1 || buffer.indexOf(0xBB) !== -1) {
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

    // R-07: No fallback re-parse of RC4 — if both parsers found nothing, return HW-VX result
    // (which contains the original remaining buffer for next chunk).
    return hwVxResult;
  }
}

module.exports = UniversalParser;
