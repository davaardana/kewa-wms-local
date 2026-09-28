/**
 * Web Bluetooth API Integration for Mobile RFID Sled Reader (EL-UHF-RS01)
 * Compatible with Chromium browsers on Android/Desktop.
 */

class BleReaderService {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.isConnected = false;
    this.onTagScannedCallback = null;
    this.onStatusChangeCallback = null;
  }

  isSupported() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  /**
   * Request pairing with Bluetooth RFID Sled Reader
   */
  async connect() {
    if (!this.isSupported()) {
      throw new Error('Web Bluetooth API tidak didukung pada browser ini. Harap gunakan Chrome di Android atau Desktop.');
    }

    try {
      this._updateStatus('Connecting...');

      // Request bluetooth device with standard SPP / Serial GATT services or acceptAllDevices
      this.device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', '0000ffe0-0000-1000-8000-00805f9b34fb', '0000fff0-0000-1000-8000-00805f9b34fb'],
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        this.isConnected = false;
        this._updateStatus('Disconnected');
      });

      this.server = await this.device.gatt.connect();
      this.isConnected = true;
      this._updateStatus(`Connected to ${this.device.name || 'RFID Sled'}`);

      return {
        success: true,
        deviceName: this.device.name,
      };
    } catch (error) {
      this.isConnected = false;
      this._updateStatus('Connection Failed');
      throw error;
    }
  }

  disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.isConnected = false;
    this._updateStatus('Disconnected');
  }

  onTagScanned(callback) {
    this.onTagScannedCallback = callback;
  }

  onStatusChange(callback) {
    this.onStatusChangeCallback = callback;
  }

  _updateStatus(status) {
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(status, this.isConnected);
    }
  }

  /**
   * Helper simulator for testing in browsers without physical Bluetooth hardware
   */
  simulateScan(epc) {
    if (this.onTagScannedCallback) {
      this.onTagScannedCallback(epc.toUpperCase());
    }
  }
}

export const bleReader = new BleReaderService();
export default bleReader;
