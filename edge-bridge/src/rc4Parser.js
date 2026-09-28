/**
 * Electron EL-UHF-RC4 Series Binary Frame Parser
 * Reference: Electron EL-UHF-RC Series Protocol v1.1 & EL-UHF-RC4 Datasheet
 *
 * Supports:
 * 1. Electron RC Protocol v1.1 (Header 0xCF)
 * 2. RC4 Legacy Frame (Header 0xBB)
 */

class Rc4Parser {
  /**
   * Calculate CRC-16/MCRF4XX Checksum
   * @param {Buffer|Uint8Array} data
   * @returns {[number, number]} [crc_msb, crc_lsb]
   */
  static calculateChecksum(data) {
    let value = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
      value ^= data[i];
      for (let j = 0; j < 8; j++) {
        value = (value & 0x0001) ? ((value >> 1) ^ 0x8408) : (value >> 1);
      }
    }
    const crcMsb = (value >> 8) & 0xFF;
    const crcLsb = value & 0xFF;
    return [crcMsb, crcLsb];
  }

  /**
   * Build Module Init command buffer for EL-UHF-RC4
   * Reference: CommandRequest.MODULE_INIT = 0x0050 in Electron RC Series Protocol
   * Format: [0xCF, 0xFF, 0x00, 0x50, 0x00, CRC_MSB, CRC_LSB]
   * Result: CFFF0050000726
   */
  static buildModuleInitCommand() {
    const base = Buffer.from([0xCF, 0xFF, 0x00, 0x50, 0x00]);
    const [crcMsb, crcLsb] = Rc4Parser.calculateChecksum(base);
    return Buffer.concat([base, Buffer.from([crcMsb, crcLsb])]);
  }

  /**
   * Build Start Continuous Inventory command buffer for EL-UHF-RC4
   * Format: [0xCF, 0xFF, 0x00, 0x01, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, CRC_MSB, CRC_LSB]
   * Result: CFFF0001050000000000F5B5
   */
  static buildStartInventoryCommand() {
    const base = Buffer.from([0xCF, 0xFF, 0x00, 0x01, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const [crcMsb, crcLsb] = Rc4Parser.calculateChecksum(base);
    return Buffer.concat([base, Buffer.from([crcMsb, crcLsb])]);
  }

  /**
   * Build Stop Inventory command buffer
   */
  static buildStopInventoryCommand() {
    const base = Buffer.from([0xCF, 0xFF, 0x00, 0x02, 0x00]);
    const [crcMsb, crcLsb] = Rc4Parser.calculateChecksum(base);
    return Buffer.concat([base, Buffer.from([crcMsb, crcLsb])]);
  }

  /**
   * Parse incoming buffer chunk from TCP socket.
   * Handles frame demarcation and extraction of EPC & RSSI.
   *
   * @param {Buffer} buffer
   * @returns {{ frames: Array<{ epc: string, readerAddress: number, rssi: number, rawHex: string, protocol: 'RC4' }>, remaining: Buffer, needsReinventory?: boolean }}
   */
  static parse(buffer) {
    const frames = [];
    let index = 0;
    let needsReinventory = false;

    while (index < buffer.length) {
      const cfIndex = buffer.indexOf(0xCF, index);
      const bbIndex = buffer.indexOf(0xBB, index);

      let headerIndex = -1;
      let isCfHeader = false;

      if (cfIndex !== -1 && bbIndex !== -1) {
        if (cfIndex <= bbIndex) {
          headerIndex = cfIndex;
          isCfHeader = true;
        } else {
          headerIndex = bbIndex;
          isCfHeader = false;
        }
      } else if (cfIndex !== -1) {
        headerIndex = cfIndex;
        isCfHeader = true;
      } else if (bbIndex !== -1) {
        headerIndex = bbIndex;
        isCfHeader = false;
      } else {
        break;
      }

      index = headerIndex;

      if (isCfHeader) {
        // Minimum Protocol v1.1 frame: [0xCF, Address, CmdMSB, CmdLSB, Length, Status, ChecksumMSB, ChecksumLSB] = 8 bytes
        if (index + 7 > buffer.length) {
          break; // wait for more bytes
        }

        const dataLen = buffer[index + 4]; // Length is status + data[]
        const packetLength = 5 + dataLen + 2; // Header(5) + Payload(dataLen) + Checksum(2)
        const frameEnd = index + packetLength;

        if (frameEnd > buffer.length) {
          break; // incomplete frame
        }

        const frameBytes = buffer.subarray(index, frameEnd);
        const decoded = Rc4Parser.decodeCfFrame(frameBytes);
        if (decoded) {
          if (decoded.epc || decoded.isInitAck) {
            frames.push(decoded);
          } else if (decoded.status === 0x12) {
            needsReinventory = true;
          }
        }

        index = frameEnd;
      } else {
        // Legacy 0xBB format: [0xBB, Type, Cmd, LenMSB, LenLSB, ...Data, Checksum]
        if (index + 7 > buffer.length) {
          break;
        }

        const len = (buffer[index + 3] << 8) | buffer[index + 4];
        const packetLength = 5 + len + 1;
        const frameEnd = index + packetLength;

        if (frameEnd > buffer.length || packetLength === 0) {
          break;
        }

        const frameBytes = buffer.subarray(index, frameEnd);
        const decoded = Rc4Parser.decodeBbFrame(frameBytes);
        if (decoded && decoded.epc) {
          frames.push(decoded);
        }

        index = frameEnd;
      }
    }

    const remaining = buffer.subarray(index);
    return { frames, remaining, needsReinventory };
  }

  /**
   * Decode Electron RC Protocol v1.1 frame (Header 0xCF)
   * @param {Buffer} frameBytes
   */
  static decodeCfFrame(frameBytes) {
    if (!frameBytes || frameBytes.length < 7) return null;
    if (frameBytes[0] !== 0xCF) return null;

    const address = frameBytes[1];
    const cmd = (frameBytes[2] << 8) | frameBytes[3];
    const len = frameBytes[4];

    // Payload starts at index 5
    const payload = frameBytes.subarray(5, 5 + len);
    if (payload.length < 1) return null;

    const status = payload[0];

    // Status 0x12: Cycle completed / no tag in round
    if (status === 0x12) {
      return { status: 0x12, address, cmd };
    }

    // Command 0x0050 (Module Init ACK)
    if (cmd === 0x0050) {
      return {
        isInitAck: true,
        status: status === 0x00 ? 'SUCCESS' : `ERROR_${status}`,
        readerAddress: address,
        cmd,
        protocol: 'RC4_V11',
      };
    }

    // Command 0x0001 (Inventory Response) with Status 0x00 (Success)
    if (cmd === 0x0001 && status === 0x00) {
      if (payload.length < 6) return null;

      // RSSI is 2 bytes signed big-endian, unit 0.1 dBm
      const rawRssi = payload.readInt16BE(1);
      const rssi = Math.round(rawRssi / 10);

      const antenna = payload[3] || 1; // Antenna number
      const channel = payload[4];
      const epcLen = payload[5];

      if (payload.length < 6 + epcLen || epcLen < 2) return null;

      const epcBytes = payload.subarray(6, 6 + epcLen);
      const epcHex = epcBytes.toString('hex').toUpperCase();

      return {
        epc: epcHex,
        readerAddress: address,
        antenna: antenna,
        rssi: rssi < 0 ? rssi : -rssi,
        protocol: 'RC4_V11',
        rawHex: frameBytes.toString('hex').toUpperCase(),
      };
    }

    return null;
  }

  /**
   * Decode legacy 0xBB frame
   * @param {Buffer} frameBytes
   */
  static decodeBbFrame(frameBytes) {
    if (!frameBytes || frameBytes.length < 6) return null;
    if (frameBytes[0] !== 0xBB) return null;

    const type = frameBytes[1];
    const command = frameBytes[2];
    const dataLen = (frameBytes[3] << 8) | frameBytes[4];
    const payload = frameBytes.subarray(5, 5 + dataLen);

    if (payload.length < 3) return null;

    // Payload: RSSI (1B) + PC (2B) + EPC (NB)
    let rssi = -60;
    const rawRssi = payload[0];
    rssi = rawRssi > 127 ? -(256 - rawRssi) : -rawRssi;
    if (rssi > 0) rssi = -rssi;

    const epcBytes = payload.subarray(3);
    if (epcBytes.length < 2) return null;
    const epcHex = epcBytes.toString('hex').toUpperCase();

    return {
      epc: epcHex,
      readerAddress: 1,
      antenna: 1,
      command,
      status: type,
      rssi,
      protocol: 'RC4_LEGACY',
      rawHex: frameBytes.toString('hex').toUpperCase(),
    };
  }

  /**
   * Helper to construct a mock RC4 frame for simulation/testing
   */
  static buildMockFrame(epcHex, rssiDbm = -55, antenna = 1) {
    const epcBuf = Buffer.from(epcHex, 'hex');
    const rawRssi = Math.round(rssiDbm * 10);
    const rssiBuf = Buffer.alloc(2);
    rssiBuf.writeInt16BE(rawRssi, 0);

    const payload = Buffer.concat([
      Buffer.from([0x00]), // Status 0x00
      rssiBuf,             // RSSI (2B)
      Buffer.from([antenna, 0x1A, epcBuf.length]), // Antenna, Channel, EPCLen
      epcBuf,
    ]);

    const header = Buffer.from([0xCF, 0x00, 0x00, 0x01, payload.length]);
    const fullBody = Buffer.concat([header, payload]);
    const [crcMsb, crcLsb] = Rc4Parser.calculateChecksum(fullBody);

    return Buffer.concat([fullBody, Buffer.from([crcMsb, crcLsb])]);
  }
}

module.exports = Rc4Parser;
