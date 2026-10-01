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
   * Build GET_BASIC_SETTINGS command (CMD 0x0072)
   * Ask reader to return its current BASIC_SET block (25 bytes)
   * so we can read current RF power and other settings.
   */
  static buildGetBasicSettingsCommand() {
    const base = Buffer.from([0xCF, 0xFF, 0x00, 0x72, 0x00]);
    const [crcMsb, crcLsb] = Rc4Parser.calculateChecksum(base);
    return Buffer.concat([base, Buffer.from([crcMsb, crcLsb])]);
  }

  /**
   * Build SET_BASIC_SETTINGS command (CMD 0x0071) with RF Power override.
   *
   * BASIC_SET layout (25 bytes):
   *  [0]  Addr          - 0x00 (broadcast default)
   *  [1]  Resv          - 0x01
   *  [2]  WorkMode      - 0x00 (auto-running)
   *  [3]  Interface     - 0x04 (TCP/IP)
   *  [4]  BaudRate      - 0x05 (115200)
   *  [5]  WG            - 0x00
   *  [6]  Resv          - 0x01
   *  [7-14] RFIDFreq    - 8 bytes (use 902-928MHz FHSS default)
   *  [15] RF Power      - 0x1E = 30 dBm (max), 0x1A = 26 dBm, etc.
   *  [16] MemBank       - 0x01 (EPC)
   *  [17] QValue        - 0x04
   *  [18] Session       - 0x00
   *  [19] AcsAddr       - 0x00
   *  [20] AcsDataLen    - 0x00
   *  [21] FilterTime    - 0x00
   *  [22] TriggerTime   - 0x00
   *  [23] BuzzerTime    - 0x00
   *  [24] PollingInterval - 0x00
   *
   * @param {number} rfPowerDbm - RF power in dBm (0-30). Default 30.
   * @param {Buffer|null} currentBasicSet - If provided (25 bytes from GET_BASIC_SETTINGS),
   *   only the RF Power byte is changed and all other settings preserved.
   */
  static buildSetRfPowerCommand(rfPowerDbm = 30, currentBasicSet = null) {
    const powerByte = Math.max(0, Math.min(30, Math.round(rfPowerDbm))) & 0xFF;

    let basicSet;
    if (currentBasicSet && currentBasicSet.length >= 25) {
      // Preserve existing settings, only change RF power byte (index 15)
      basicSet = Buffer.from(currentBasicSet.subarray(0, 25));
      basicSet[15] = powerByte;
    } else {
      // Default BASIC_SET for EL-UHF-RC4 TCP mode, max power
      basicSet = Buffer.from([
        0x00,                                           // [0]  Addr
        0x01,                                           // [1]  Resv
        0x00,                                           // [2]  WorkMode: Auto-running
        0x04,                                           // [3]  Interface: TCP
        0x05,                                           // [4]  BaudRate: 115200
        0x00,                                           // [5]  WG: none
        0x01,                                           // [6]  Resv
        0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // [7-14] RFID Freq: FHSS full range
        powerByte,                                       // [15] RF Power
        0x01,                                           // [16] MemBank: EPC
        0x04,                                           // [17] QValue
        0x00,                                           // [18] Session: S0
        0x00,                                           // [19] AcsAddr
        0x00,                                           // [20] AcsDataLen
        0x00,                                           // [21] FilterTime
        0x00,                                           // [22] TriggerTime
        0x00,                                           // [23] BuzzerTime
        0x00,                                           // [24] PollingInterval
      ]);
    }

    const header = Buffer.from([0xCF, 0xFF, 0x00, 0x71, basicSet.length]);
    const fullBody = Buffer.concat([header, basicSet]);
    const [crcMsb, crcLsb] = Rc4Parser.calculateChecksum(fullBody);
    return Buffer.concat([fullBody, Buffer.from([crcMsb, crcLsb])]);
  }

  // ── Feature #4: Write EPC to Tag ──────────────────────────────────

  /**
   * Build WRITE_EPC command (CMD 0x0003) to write new EPC data to a tag.
   * The tag must be in the RF field and accessible.
   *
   * @param {string} newEpcHex - New EPC value as hex string (e.g. 'E28068940000405A')
   * @param {string} accessPassword - 4-byte access password hex (default '00000000')
   * @returns {Buffer} Command buffer ready to send via TCP
   */
  static buildWriteEpcCommand(newEpcHex, accessPassword = '00000000') {
    const epcBuf = Buffer.from(newEpcHex, 'hex');
    const passBuf = Buffer.from(accessPassword, 'hex');
    if (passBuf.length !== 4) throw new Error('Access password must be 4 bytes (8 hex chars)');

    // Write EPC command payload:
    // [0-3] Access Password (4 bytes)
    // [4]   Memory Bank = 0x01 (EPC)
    // [5-6] Start Address = 0x0002 (word address, EPC starts at word 2)
    // [7]   Word Count = epcBuf.length / 2
    // [8..] EPC data bytes
    const wordCount = Math.ceil(epcBuf.length / 2);
    const payload = Buffer.concat([
      passBuf,                              // Access password
      Buffer.from([0x01]),                  // Memory bank: EPC
      Buffer.from([0x00, 0x02]),            // Start address: word 2 (EPC data start)
      Buffer.from([wordCount]),             // Word count
      epcBuf,                               // EPC data
    ]);

    const header = Buffer.from([0xCF, 0xFF, 0x00, 0x03, payload.length]);
    const fullBody = Buffer.concat([header, payload]);
    const [crcMsb, crcLsb] = Rc4Parser.calculateChecksum(fullBody);
    return Buffer.concat([fullBody, Buffer.from([crcMsb, crcLsb])]);
  }

  // ── Feature #5: Auto Q-Value / Anti-Collision Tuning ──────────────

  /**
   * Calculate optimal Q value based on expected tag population.
   * Q = ceil(log2(N)), clamped to [2, 8].
   * Lower Q = faster scan, fewer slots (good for few tags).
   * Higher Q = more slots, fewer collisions (good for many tags).
   *
   * @param {number} tagCount - Number of unique tags detected in last batch
   * @returns {number} Optimal Q value (2-8)
   */
  static calculateOptimalQValue(tagCount) {
    if (tagCount <= 0) return 4; // default
    const q = Math.ceil(Math.log2(Math.max(tagCount, 1)));
    return Math.max(2, Math.min(8, q));
  }

  /**
   * Build SET_BASIC_SETTINGS with custom Q value and RF power.
   * Preserves existing settings if currentBasicSet is provided.
   *
   * @param {number} rfPowerDbm - RF power (0-30 dBm)
   * @param {number} qValue - Anti-collision Q value (2-8)
   * @param {Buffer|null} currentBasicSet - Current 25-byte settings block
   * @returns {Buffer}
   */
  static buildSetPowerAndQCommand(rfPowerDbm = 30, qValue = 4, currentBasicSet = null) {
    const powerByte = Math.max(0, Math.min(30, Math.round(rfPowerDbm))) & 0xFF;
    const qByte = Math.max(0, Math.min(15, Math.round(qValue))) & 0xFF;

    let basicSet;
    if (currentBasicSet && currentBasicSet.length >= 25) {
      basicSet = Buffer.from(currentBasicSet.subarray(0, 25));
      basicSet[15] = powerByte; // RF Power
      basicSet[17] = qByte;    // QValue
    } else {
      basicSet = Buffer.from([
        0x00, 0x01, 0x00, 0x04, 0x05, 0x00, 0x01,
        0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        powerByte, 0x01, qByte, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);
    }

    const header = Buffer.from([0xCF, 0xFF, 0x00, 0x71, basicSet.length]);
    const fullBody = Buffer.concat([header, basicSet]);
    const [crcMsb, crcLsb] = Rc4Parser.calculateChecksum(fullBody);
    return Buffer.concat([fullBody, Buffer.from([crcMsb, crcLsb])]);
  }

  // ── Feature #6: Region Frequency Detection ────────────────────────

  /** Indonesia UHF RFID frequency range (920-925 MHz per SDPPI regulation) */
  static FREQ_INDONESIA = { minMHz: 920.0, maxMHz: 925.0, label: 'ID' };
  static FREQ_USA = { minMHz: 902.0, maxMHz: 928.0, label: 'US' };

  /**
   * Parse the frequency config from BASIC_SET bytes 7-14 and determine region.
   * @param {Buffer} basicSetData - 25-byte BASIC_SET block
   * @returns {{ minFreqMHz: number, maxFreqMHz: number, region: string, needsCorrection: boolean }}
   */
  static parseFrequencyRegion(basicSetData) {
    if (!basicSetData || basicSetData.length < 15) {
      return { minFreqMHz: 0, maxFreqMHz: 0, region: 'UNKNOWN', needsCorrection: false };
    }
    // Freq bytes at index 7-14 (8 bytes) represent frequency hopping table flags.
    // For simple detection: check if the full FHSS range 0xFFFF is set (USA default)
    const freqWord0 = (basicSetData[7] << 8) | basicSetData[8];

    let region = 'UNKNOWN';
    let needsCorrection = false;

    if (freqWord0 === 0xFFFF) {
      // Full FHSS range — likely USA default (902-928 MHz)
      region = 'US_DEFAULT';
      needsCorrection = true;
    } else {
      region = 'CUSTOM';
      needsCorrection = false;
    }

    return { freqWord0, region, needsCorrection };
  }

  /**
   * Build SET_BASIC_SETTINGS with Indonesia frequency range (920-925 MHz).
   * Sets freq hopping table bytes to restrict to Indonesian SDPPI allocation.
   *
   * @param {Buffer|null} currentBasicSet
   * @param {number} rfPowerDbm
   * @returns {Buffer}
   */
  static buildSetIndonesiaFreqCommand(currentBasicSet = null, rfPowerDbm = 30) {
    const powerByte = Math.max(0, Math.min(30, Math.round(rfPowerDbm))) & 0xFF;

    let basicSet;
    if (currentBasicSet && currentBasicSet.length >= 25) {
      basicSet = Buffer.from(currentBasicSet.subarray(0, 25));
      basicSet[15] = powerByte;
      // Set frequency bytes 7-14 to Indonesia range (920-925 MHz)
      // Restrict hopping channels to Indonesia allocation
      basicSet[7] = 0x00; basicSet[8] = 0xFC;  // Enable channels 920-925 MHz only
      basicSet[9] = 0x00; basicSet[10] = 0x00;
      basicSet[11] = 0x00; basicSet[12] = 0x00;
      basicSet[13] = 0x00; basicSet[14] = 0x00;
    } else {
      basicSet = Buffer.from([
        0x00, 0x01, 0x00, 0x04, 0x05, 0x00, 0x01,
        0x00, 0xFC, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Indonesia freq range
        powerByte, 0x01, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);
    }

    const header = Buffer.from([0xCF, 0xFF, 0x00, 0x71, basicSet.length]);
    const fullBody = Buffer.concat([header, basicSet]);
    const [crcMsb, crcLsb] = Rc4Parser.calculateChecksum(fullBody);
    return Buffer.concat([fullBody, Buffer.from([crcMsb, crcLsb])]);
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

    // Validate CRC-16/MCRF4XX before trusting any data in this frame
    const body = frameBytes.subarray(0, frameBytes.length - 2);
    const [expectedMsb, expectedLsb] = Rc4Parser.calculateChecksum(body);
    const actualMsb = frameBytes[frameBytes.length - 2];
    const actualLsb = frameBytes[frameBytes.length - 1];
    if (expectedMsb !== actualMsb || expectedLsb !== actualLsb) {
      return null; // Corrupted frame — discard silently
    }

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

    // Command 0x0072 (GET_BASIC_SETTINGS response)
    if (cmd === 0x0072) {
      return {
        isBasicSettingsResponse: true,
        status: status === 0x00 ? 'SUCCESS' : `ERROR_${status}`,
        readerAddress: address,
        cmd,
        // Basic settings payload starts after STATUS byte (index 1 of payload)
        basicSetData: payload.length >= 26 ? payload.subarray(1, 26) : null,
        rfPowerDbm: payload.length >= 17 ? payload[16] : null, // STATUS(1) + 15 bytes before power
        protocol: 'RC4_V11',
      };
    }

    // Command 0x0071 (SET_BASIC_SETTINGS ACK)
    if (cmd === 0x0071) {
      return {
        isSetBasicSettingsAck: true,
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
