/**
 * Electron HW-VX Series (HW-VX6346KL / HW-VX6330K) Binary Frame Parser
 * Reference: https://electron.id/protocol/hw-vx-ip-protocol/ & https://electron.id/tutorial/hw-vx-tcp-client-remote-ip/
 */

class HwVxParser {
  /**
   * Parse incoming buffer chunk from TCP socket.
   * A single buffer may contain partial frames or multiple concatenated frames.
   *
   * @param {Buffer} buffer
   * @returns {{ frames: Array<{ epc: string, readerAddress: number, rssi: number, rawHex: string }>, remaining: Buffer }}
   */
  static parse(buffer) {
    const frames = [];
    let index = 0;

    while (index < buffer.length) {
      const length = buffer[index];
      const frameEnd = index + length + 1; // +1 to include the length byte itself

      // Check if frame is incomplete
      if (frameEnd > buffer.length) {
        break;
      }

      const frameBytes = buffer.subarray(index, frameEnd);
      const parsed = HwVxParser.decodeFrame(frameBytes);
      if (parsed) {
        frames.push(parsed);
      }

      index = frameEnd;
    }

    const remaining = buffer.subarray(index);
    return { frames, remaining };
  }

  /**
   * Decode a single validated frame bytes
   */
  static decodeFrame(frameBytes) {
    if (frameBytes.length < 6) return null;

    const length = frameBytes[0];
    const readerAddress = frameBytes[1];
    const command = frameBytes[2];
    const status = frameBytes[3];
    // Payload is from byte 4 to (length - 1) before the 2-byte checksum
    const dataBytes = frameBytes.subarray(4, frameBytes.length - 2);

    if (dataBytes.length === 0) return null;

    let epcHex = '';
    let rssi = -60;

    // Pattern 1: Standard Active Inventory Frame
    // Format: [EPC Length (1 byte), EPC Bytes (N bytes), RSSI (optional 1 byte)]
    const epcLengthByte = dataBytes[0];
    if (epcLengthByte > 0 && epcLengthByte <= dataBytes.length - 1) {
      const epcBuffer = dataBytes.subarray(1, 1 + epcLengthByte);
      epcHex = epcBuffer.toString('hex').toUpperCase();

      // If there's an extra byte after EPC, it represents RSSI in -dBm
      if (dataBytes.length > 1 + epcLengthByte) {
        const rawRssi = dataBytes[1 + epcLengthByte];
        rssi = rawRssi > 127 ? -(256 - rawRssi) : -rawRssi;
      }
    } else {
      // Pattern 2: Direct 12-byte (24-hex) EPC stream (Standard EPC Gen2)
      if (dataBytes.length >= 12) {
        epcHex = dataBytes.subarray(0, 12).toString('hex').toUpperCase();
        if (dataBytes.length > 12) {
          const rawRssi = dataBytes[12];
          rssi = rawRssi > 127 ? -(256 - rawRssi) : -rawRssi;
        }
      } else {
        epcHex = dataBytes.toString('hex').toUpperCase();
      }
    }

    if (!epcHex || epcHex.length < 4) return null;

    return {
      epc: epcHex,
      readerAddress,
      command,
      status,
      rssi: rssi || -60,
      rawHex: frameBytes.toString('hex').toUpperCase(),
    };
  }

  /**
   * Helper to build a mock frame for unit testing / simulation
   */
  static buildMockFrame(epcHex, readerAddress = 0x01, command = 0xEE, status = 0x00, rssi = 65) {
    const epcBuf = Buffer.from(epcHex, 'hex');
    const dataBuf = Buffer.concat([
      Buffer.from([epcBuf.length]),
      epcBuf,
      Buffer.from([rssi]),
    ]);

    // length byte = reader_addr(1) + cmd(1) + status(1) + dataBuf.length + checksum(2)
    const length = 1 + 1 + 1 + dataBuf.length + 2;
    const frameHeader = Buffer.from([length, readerAddress, command, status]);
    const checksum = Buffer.from([0xAA, 0xBB]); // dummy crc

    return Buffer.concat([frameHeader, dataBuf, checksum]);
  }
}

module.exports = HwVxParser;
