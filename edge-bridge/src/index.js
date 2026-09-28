/**
 * MOSA IoT RFID Gate Bridge Service
 * Native Support for:
 * - Electron HW-VX Series (HW-VX6346KL / HW-VX6330K)
 * - Electron EL-UHF-RC4 Series (EL-UHF-RC4-C1 / Protocol v1.1 & legacy)
 *
 * Connection Modes:
 * 1. Direct TCP Client to Fixed Reader (e.g. 192.168.1.200:2022)
 * 2. Dual/Single Port TCP Server Listener (Ports 2077 & 2079)
 * 3. Real-time WebSocket Broadcaster for Dashboard (Port 2078)
 */

require('dotenv').config();
const net = require('net');
const { WebSocketServer, WebSocket } = require('ws');
const UniversalParser = require('./universalParser');
const Rc4Parser = require('./rc4Parser');
const DirectionEngine = require('./directionEngine');
const RelayController = require('./relayController');
const CctvSnapshot = require('./cctvSnapshot');
const LocalCache = require('./localCache');
const ApiClient = require('./apiClient');
const crypto = require('crypto');

class GateBridgeApp {
  constructor(config = {}) {
    this.warehouseId = config.warehouseId || parseInt(process.env.WAREHOUSE_ID || '1', 10);
    this.gateId = config.gateId || process.env.GATE_ID || 'GATE-01';
    this.apiBaseUrl = config.apiBaseUrl || process.env.API_BASE_URL || 'http://127.0.0.1:8000/api';
    this.deviceApiToken = config.deviceApiToken || process.env.DEVICE_API_TOKEN || null;
    this.tcpPort = config.tcpPort || parseInt(process.env.TCP_PORT || '2077', 10);
    this.tcpPortB = config.tcpPortB || (process.env.TCP_PORT_B ? parseInt(process.env.TCP_PORT_B, 10) : 2079);
    this.wsPort = config.wsPort || parseInt(process.env.WS_PORT || '2078', 10);
    this.wsAllowedOrigins = (config.wsAllowedOrigins ?? process.env.WS_ALLOWED_ORIGINS ?? '')
      .split(',').map((origin) => origin.trim()).filter(Boolean);
    this.wsControlSecret = config.wsControlSecret ?? process.env.WS_CONTROL_SECRET ?? '';
    this.wsDeviceCode = config.wsDeviceCode ?? process.env.WS_DEVICE_CODE ?? '';
    this.usedWsTicketIds = new Map();
    this.assignedAntenna = config.assignedAntenna || process.env.ASSIGNED_ANTENNA || null; // 'A' | 'B' | null (auto)
    this.gateMode = config.gateMode || process.env.GATE_MODE || null;
    this.authorizedTransaction = null;
    this.batchIdleMs = config.batchIdleMs || parseInt(process.env.BATCH_IDLE_MS || '2500', 10);
    this.batchDeadlineMs = config.batchDeadlineMs || parseInt(process.env.BATCH_DEADLINE_MS || '5000', 10);
    this.maxBatchSize = config.maxBatchSize || parseInt(process.env.MAX_BATCH_SIZE || '100', 10);
    this.heartbeatIntervalMs = config.heartbeatIntervalMs || parseInt(process.env.HEARTBEAT_INTERVAL_MS || '10000', 10);
    this.readerResponseTimeoutMs = config.readerResponseTimeoutMs || parseInt(process.env.READER_RESPONSE_TIMEOUT_MS || '5000', 10);

    // Direct Reader Connection (EL-UHF-RC4 / Fixed Network Reader)
    this.readerHost = config.readerHost || process.env.READER_HOST || '192.168.1.200';
    this.readerPort = config.readerPort || parseInt(process.env.READER_PORT || '2022', 10);
    this.enableDirectReader = config.enableDirectReader !== undefined 
      ? config.enableDirectReader 
      : (process.env.ENABLE_DIRECT_READER !== 'false');

    this.directionEngine = new DirectionEngine();
    this.relay = new RelayController();
    this.cctv = new CctvSnapshot();
    this.cache = new LocalCache();
    this.api = new ApiClient(this.apiBaseUrl, this.cache, this.deviceApiToken);

    // Batch buffer for multi-tag grouping
    this.batchCollector = {
      timer: null,
      direction: null,
      tags: new Set(),
      eventId: null,
      observedAt: null,
      deadlineTimer: null,
    };
    this.dispatchChain = Promise.resolve();

    this.activeClients = 0;
    this.wsClients = new Set();
    this.servers = [];
    this.directReaderSocket = null;
    this.directReaderReconnectTimer = null;
    this.directReaderRetryCount = 0;
    this.baseRetryDelayMs = 1500;
    this.maxRetryDelayMs = 15000;
    this.lastTagSeenAt = Date.now();
    this.readerLastResponseAt = null;
    this.readerStatus = this.enableDirectReader ? 'connecting' : 'disabled';
    this.readerStatusChangedAt = new Date().toISOString();
    this.readerError = null;
    this.isDeviceUnpaired = null;
    this.operationalMode = 'GATE_SECURITY'; // 'GATE_SECURITY' | 'ENROLLMENT'

    // Start WebSocket broadcaster
    this.startWebSocketServer();

    // Periodic buffer flusher
    this.flushTimer = setInterval(() => {
      this.api.flushOfflineBuffer();
      this.api.flushHealthIncidents();
    }, 15000);

    // Periodic Heartbeat Telemetry to Cloud (Every 30s)
    this.heartbeatTimer = setInterval(() => this._dispatchHeartbeat(), this.heartbeatIntervalMs);
    setImmediate(() => this._dispatchHeartbeat());

    // Watchdog check for socket health & RF loop refresh (Every 15s)
    this.watchdogTimer = setInterval(() => this._runWatchdogCheck(), 1000);
  }

  _setReaderStatus(status, reason = null) {
    if (status === this.readerStatus && reason === this.readerError) return;
    this.readerStatus = status;
    this.readerError = reason;
    this.readerStatusChangedAt = new Date().toISOString();
    const incident = { event_id: crypto.randomUUID(), component: 'reader', status, reason, observed_at: this.readerStatusChangedAt };
    console.log(`[READER HEALTH] ${status}${reason ? `: ${reason}` : ''}`);
    this.broadcast({ type: 'READER_HEALTH', ...incident });
    this.api.sendHealthIncident(incident);
    this._dispatchHeartbeat();
  }

  async _dispatchHeartbeat() {
    const memory = process.memoryUsage();
    const heapUsedMb = Math.round((memory.heapUsed / 1024 / 1024) * 10) / 10;
    const uptimeSec = Math.round(process.uptime());

    await this.api.sendHeartbeat({
      warehouse_id: this.warehouseId,
      device_code: this.syncedDeviceCode || `EDGE-${this.gateId}`,
      device_name: this.syncedDeviceName || `Gate Controller - ${this.gateId}`,
      device_model: 'UNIVERSAL_RFID_BRIDGE',
      tcp_port: this.tcpPort,
      metrics: {
        uptime_seconds: uptimeSec,
        heap_used_mb: heapUsedMb,
        active_tcp_connections: this.activeClients + (this.directReaderSocket ? 1 : 0),
        offline_buffer_count: this.cache ? this.cache.getPendingEvents().length : 0,
        reader_status: this.readerStatus,
        reader_last_response_at: this.readerLastResponseAt,
        reader_status_changed_at: this.readerStatusChangedAt,
        reader_error: this.readerError,
      },
    });
  }

  async syncGateConfig() {
    const config = await this.api.fetchGateConfig();
    const mode = config?.device?.warehouse?.gate_mode;
    if (!['DUAL_ANTENNA_AUTO', 'SINGLE_ANTENNA_SESSION'].includes(mode)) {
      this.gateMode = null;
      this.authorizedTransaction = null;
      return false;
    }
    this.gateMode = mode;
    this.authorizedTransaction = config.authorized_transaction || null;
    return true;
  }

  /**
   * Start native WebSocket Broadcaster for real-time frontend streaming
   */
  startWebSocketServer(port = this.wsPort) {
    try {
      this.wss = new WebSocketServer({
        port,
        maxPayload: 4096,
        verifyClient: ({ origin }) => this.wsAllowedOrigins.length === 0 || this.wsAllowedOrigins.includes(origin),
      });
      console.log(`🌐 [WEBSOCKET BROADCASTER] Real-time WS Server listening on ws://0.0.0.0:${port}`);

      this.wss.on('connection', (ws, req) => {
        const clientIp = req.socket.remoteAddress;
        const authTimer = setTimeout(() => ws.close(4001, 'Authentication required'), 5000);

        ws.on('message', (msg) => {
          try {
            const data = JSON.parse(msg.toString());
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
              ws.send(JSON.stringify({ type: 'ERROR', code: 'INVALID_COMMAND' }));
              return;
            }
            if (!ws.auth) {
              if (data.action !== 'AUTH') throw new Error('Authentication required');
              ws.auth = this.verifyWsControlTicket(data.ticket);
              clearTimeout(authTimer);
              this.wsClients.add(ws);
              console.log(`💻 [WS DASHBOARD AUTHENTICATED] User #${ws.auth.userId} from ${clientIp} (Active: ${this.wsClients.size})`);
              ws.send(JSON.stringify({ type: 'AUTH_OK', expires_at: ws.auth.expiresAt }));
              ws.send(JSON.stringify({
                type: 'HANDSHAKE', gate_id: this.gateId, warehouse_id: this.warehouseId,
                status: 'edge_online', reader_status: this.readerStatus, assigned_antenna: this.assignedAntenna,
                reader_target: this.isDeviceUnpaired ? null : `${this.readerHost}:${this.readerPort}`,
                device_paired: this.isDeviceUnpaired !== true,
                pairing_status: this.isDeviceUnpaired === true ? 'unpaired' : (this.isDeviceUnpaired === false ? 'paired' : 'unknown'),
                operational_mode: this.operationalMode,
                timestamp: new Date().toISOString(),
              }));
              return;
            }
            if (data.action === 'PING') {
              if (!this.isWsCommandAllowed(ws, 'PING')) throw new Error('Command forbidden');
              ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
            } else if (data.action === 'SET_MODE' && ['GATE_SECURITY', 'ENROLLMENT'].includes(data.mode)) {
              if (!this.isWsCommandAllowed(ws, `SET_MODE:${data.mode}`)) throw new Error('Command forbidden');
              this.operationalMode = data.mode;
              console.log(`🔄 [MODE SWITCHED] Reader Operational Mode set to: ${this.operationalMode}`);
              this.broadcast({ type: 'MODE_CHANGED', mode: this.operationalMode });
            } else if (data.action === 'GET_MODE') {
              if (!this.isWsCommandAllowed(ws, 'GET_MODE')) throw new Error('Command forbidden');
              ws.send(JSON.stringify({ type: 'MODE_INFO', mode: this.operationalMode }));
            } else if (data.action === 'SIMULATE_TAG' || data.action === 'TRIGGER_SCAN') {
              ws.send(JSON.stringify({ type: 'ERROR', code: 'SIMULATION_DISABLED' }));
            } else {
              ws.send(JSON.stringify({ type: 'ERROR', code: 'INVALID_COMMAND' }));
            }
          } catch (e) {
            ws.send(JSON.stringify({ type: 'ERROR', code: ws.auth ? 'FORBIDDEN' : 'AUTH_FAILED' }));
            if (!ws.auth) ws.close(4001, 'Authentication failed');
          }
        });

        ws.on('close', () => { clearTimeout(authTimer); this.wsClients.delete(ws); });
        ws.on('error', () => { clearTimeout(authTimer); this.wsClients.delete(ws); });
      });
    } catch (err) {
      console.warn(`⚠️ [WS BROADCASTER WARN] Could not start WebSocket server: ${err.message}`);
    }
  }

  verifyWsControlTicket(ticket) {
    if (this.wsControlSecret.length < 32) throw new Error('WS control secret is not configured');
    if (typeof ticket !== 'string') throw new Error('Invalid ticket');
    const parts = ticket.split('.');
    if (parts.length !== 2) throw new Error('Invalid ticket');
    const expected = crypto.createHmac('sha256', this.wsControlSecret).update(parts[0]).digest();
    const supplied = Buffer.from(parts[1], 'base64url');
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) throw new Error('Invalid signature');
    const claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (claims.v !== 2 || !this.wsDeviceCode || claims.device_code !== this.wsDeviceCode ||
      !Number.isInteger(claims.sub) || claims.warehouse_id !== this.warehouseId ||
      !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || claims.exp <= claims.iat || claims.exp - claims.iat > 60 ||
        !Array.isArray(claims.commands) || !claims.jti || claims.iat > now + 5 || claims.exp < now) throw new Error('Invalid claims');
    for (const [jti, exp] of this.usedWsTicketIds) if (exp < now) this.usedWsTicketIds.delete(jti);
    if (this.usedWsTicketIds.has(claims.jti)) throw new Error('Ticket replay');
    this.usedWsTicketIds.set(claims.jti, claims.exp);
    return { userId: claims.sub, commands: new Set(claims.commands), expiresAt: claims.exp };
  }

  isWsCommandAllowed(ws, command) {
    return ws.auth?.expiresAt >= Math.floor(Date.now() / 1000) && ws.auth.commands.has(command);
  }

  broadcast(data) {
    const message = JSON.stringify(data);
    for (const client of this.wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  /**
   * Connect as direct TCP Client to the physical RFID Reader (e.g. EL-UHF-RC4 at 192.168.1.200:2022)
   */
  async connectDirectReader() {
    if (!this.enableDirectReader) return;

    if (this.directReaderSocket) {
      try { this.directReaderSocket.destroy(); } catch (e) {}
      this.directReaderSocket = null;
    }
    if (this.inventoryPollTimer) {
      clearInterval(this.inventoryPollTimer);
      this.inventoryPollTimer = null;
    }
    if (this.directReaderInitTimer) {
      clearTimeout(this.directReaderInitTimer);
      this.directReaderInitTimer = null;
    }

    // Attempt to dynamically sync paired device IP/Port from API
    try {
      const devices = await this.api.fetchPairedDevices();
      if (!devices || devices.length === 0) {
        this.isDeviceUnpaired = true;
        this.syncedDeviceCode = null;
        this.syncedDeviceName = null;
        console.log(`ℹ️ [DEVICE SYNC] Belum ada perangkat reader yang dipasangkan di database (Unpaired). Berjalan dalam mode Streaming/Testing.`);
        this._setReaderStatus('unpaired', 'No paired RFID reader device found in backend');
        return;
      } else {
        const matchedDevice = devices.find(
          (d) => (d.warehouse?.id === this.warehouseId || d.device_code === `RC4-${this.gateId}` || d.device_code === this.gateId) && d.ip_address
        ) || devices.find((d) => d.ip_address);

        if (matchedDevice && matchedDevice.ip_address) {
          this.isDeviceUnpaired = false;
          this.syncedDeviceCode = matchedDevice.device_code;
          this.syncedDeviceName = matchedDevice.device_name;
          if (matchedDevice.warehouse?.id || matchedDevice.warehouse_id) {
            this.warehouseId = matchedDevice.warehouse?.id || matchedDevice.warehouse_id;
          }
          if (matchedDevice.device_code) {
            this.gateId = matchedDevice.device_code;
          }
          if (matchedDevice.device_role) {
            this.syncedDeviceRole = matchedDevice.device_role;
          }
          if (this.readerHost !== matchedDevice.ip_address || this.readerPort !== matchedDevice.tcp_port) {
            console.log(`🔄 [DEVICE PAIRING SYNC] Loaded Reader config from API: ${matchedDevice.device_name} (${matchedDevice.ip_address}:${matchedDevice.tcp_port}, Warehouse #${this.warehouseId})`);
            this.readerHost = matchedDevice.ip_address;
            this.readerPort = matchedDevice.tcp_port;
          }
        } else {
          this.isDeviceUnpaired = true;
          this._setReaderStatus('unpaired', 'No paired RFID reader with IP address found in backend');
          return;
        }
      }
    } catch (e) {
      // Fall back to current readerHost / readerPort
    }

    console.log(`📡 [DIRECT READER CLIENT] Connecting to EL-UHF-RC4 at ${this.readerHost}:${this.readerPort}...`);

    const socket = new net.Socket();
    this.directReaderSocket = socket;
    let streamBuffer = Buffer.alloc(0);

    // Keepalive to quickly detect sudden power-loss / disconnection
    socket.setKeepAlive(true, 2000);
    socket.setTimeout(this.readerResponseTimeoutMs);
    this._setReaderStatus('connecting');

    const sendInitCmd = () => {
      if (this.directReaderSocket && !this.directReaderSocket.destroyed && this.directReaderSocket.writable) {
        const initCmd = Rc4Parser.buildModuleInitCommand();
        this.directReaderSocket.write(initCmd);
      }
    };

    const sendInventoryCmd = () => {
      if (this.directReaderSocket && !this.directReaderSocket.destroyed && this.directReaderSocket.writable) {
        const startCmd = Rc4Parser.buildStartInventoryCommand();
        this.directReaderSocket.write(startCmd);
      }
    };

    socket.connect(this.readerPort, this.readerHost, () => {
      this.lastTagSeenAt = Date.now();
      console.log(`✅ [DIRECT READER CONNECTED] Successfully connected to EL-UHF-RC4 Reader at ${this.readerHost}:${this.readerPort}!`);
      
      // Step 1: Send MODULE_INIT (0x0050) to boot/wake RF baseband module after power loss / cold boot
      console.log(`⚡ [DIRECT READER INIT] Sending MODULE_INIT (CFFF0050000726) to wake up UHF RF Module...`);
      sendInitCmd();

      // Step 2: Allow 200ms for RF synthesis PLL lock, then launch continuous inventory
      if (this.directReaderInitTimer) clearTimeout(this.directReaderInitTimer);
      this.directReaderInitTimer = setTimeout(() => {
        sendInventoryCmd();
        console.log(`🚀 [DIRECT READER INIT] Start Inventory loop active (CFFF0001050000000000F5B5).`);
      }, 200);

      // Continuous poll every 500ms to maintain active reading loop
      this.inventoryPollTimer = setInterval(sendInventoryCmd, 500);
    });

    socket.on('data', (chunk) => {
      streamBuffer = Buffer.concat([streamBuffer, chunk]);
      const { frames, remaining, needsReinventory } = UniversalParser.parse(streamBuffer);
      streamBuffer = remaining;

      if (frames.length > 0 || needsReinventory) {
        this.readerLastResponseAt = new Date().toISOString();
        this.lastTagSeenAt = Date.now();
        this.directReaderRetryCount = 0;
        this._setReaderStatus('responsive');
      }

      if (frames.length > 0) {
        for (const frame of frames) {
          if (frame.isInitAck) {
            console.log(`✨ [DIRECT READER] Module Init ACK received: ${frame.status} (RF baseband online)`);
            continue;
          }
          if (!frame.epc) continue;

          let antenna = this.assignedAntenna || (frame.antenna === 2 ? 'B' : 'A');
          console.log(`🎯 [TAG DETECTED] EPC: ${frame.epc} | RSSI: ${frame.rssi}dBm | Antena: ${antenna} | Proto: ${frame.protocol}`);
          this.onTagDetected(frame.epc, antenna, frame.rssi);
        }
      }

      if (needsReinventory) {
        sendInventoryCmd();
      }
    });

    socket.on('error', (err) => {
      this._setReaderStatus('disconnected', err.message);
      console.warn(`⚠️ [DIRECT READER WARN] ${this.readerHost}:${this.readerPort} - ${err.message}`);
      socket.destroy();
    });

    socket.on('timeout', () => {
      this._setReaderStatus('unresponsive', `Tidak ada respons protokol selama ${this.readerResponseTimeoutMs} ms`);
      socket.destroy();
    });

    socket.on('close', () => {
      console.log(`🔌 [DIRECT READER DISCONNECTED] Connection to ${this.readerHost}:${this.readerPort} closed.`);
      this.directReaderSocket = null;
      if (this.readerStatus !== 'unresponsive') this._setReaderStatus('disconnected', 'Koneksi TCP reader tertutup');
      if (this.directReaderInitTimer) {
        clearTimeout(this.directReaderInitTimer);
        this.directReaderInitTimer = null;
      }
      if (this.inventoryPollTimer) {
        clearInterval(this.inventoryPollTimer);
        this.inventoryPollTimer = null;
      }
      
      // Exponential backoff reconnect with jitter (1.5s -> 15s max)
      this.directReaderRetryCount++;
      const exponentialDelay = Math.min(
        this.maxRetryDelayMs,
        this.baseRetryDelayMs * Math.pow(1.5, Math.min(this.directReaderRetryCount - 1, 8))
      );
      const jitter = Math.floor(Math.random() * 400);
      const reconnectDelay = Math.round(exponentialDelay + jitter);

      console.log(`⏳ [WATCHDOG] Mencoba menyambung kembali ke reader ${this.readerHost}:${this.readerPort} dalam ${(reconnectDelay / 1000).toFixed(1)}s (Percobaan #${this.directReaderRetryCount})...`);

      if (!this.directReaderReconnectTimer) {
        this.directReaderReconnectTimer = setTimeout(() => {
          this.directReaderReconnectTimer = null;
          this.connectDirectReader();
        }, reconnectDelay);
      }
    });
  }

  /**
   * Watchdog background health checker (proactively verifies socket status)
   */
  _runWatchdogCheck() {
    if (this.enableDirectReader && !this.directReaderSocket && !this.directReaderReconnectTimer) {
      console.log(`🛡️ [WATCHDOG PROBE] Reader socket terdeteksi mati tanpa antrean timer. Memulai penyambungan ulang otomatis...`);
      this.connectDirectReader();
      return;
    }

    if (this.directReaderSocket && !this.directReaderSocket.destroyed && this.directReaderSocket.writable) {
      const idleSec = Math.round((Date.now() - this.lastTagSeenAt) / 1000);
      if (idleSec >= 30) {
        try {
          const startCmd = Rc4Parser.buildStartInventoryCommand();
          this.directReaderSocket.write(startCmd);
        } catch (e) {}
      }
    }
  }

  /**
   * Create a TCP Listener on a designated port mapped to a default antenna identifier.
   */
  createTcpListener(port, defaultAntenna = 'A') {
    const server = net.createServer((socket) => {
      this.activeClients++;
      const clientAddr = `${socket.remoteAddress}:${socket.remotePort}`;
      console.log(`🔌 [RFID READER CONNECTED] Reader connected on Port ${port} (Default Antenna ${defaultAntenna}) from ${clientAddr}`);

      let streamBuffer = Buffer.alloc(0);

      socket.on('data', (chunk) => {
        streamBuffer = Buffer.concat([streamBuffer, chunk]);
        const { frames, remaining } = UniversalParser.parse(streamBuffer);
        streamBuffer = remaining;

        for (const frame of frames) {
          let antenna = this.assignedAntenna || defaultAntenna;
          if (!this.assignedAntenna && frame.readerAddress === 2) {
            antenna = 'B';
          }

          console.log(`📡 [TAG READ] EPC: ${frame.epc} | RSSI: ${frame.rssi}dBm | Antena: ${antenna} | Proto: ${frame.protocol || 'AUTO'}`);
          this.onTagDetected(frame.epc, antenna, frame.rssi);
        }
      });

      socket.on('error', (err) => {
        console.warn(`⚠️ [SOCKET WARN] Port ${port} - ${clientAddr}: ${err.message}`);
      });

      socket.on('close', () => {
        this.activeClients = Math.max(0, this.activeClients - 1);
        console.log(`🔌 [RFID READER DISCONNECTED] Reader on Port ${port} disconnected from ${clientAddr}`);
      });
    });

    server.listen(port, () => {
      console.log(`🎯 [EDGE BRIDGE] TCP Listener active on port ${port} -> Dedicated Antenna ${defaultAntenna} (HW-VX & RC4 Auto-Detect)`);
    });

    this.servers.push(server);
    return server;
  }

  startTcpServers() {
    // 1. Start Server Listeners
    this.createTcpListener(this.tcpPort, this.assignedAntenna || 'A');

    if (!this.assignedAntenna && this.tcpPortB && this.tcpPortB !== this.tcpPort && this.tcpPortB !== this.wsPort) {
      this.createTcpListener(this.tcpPortB, 'B');
    }

    // 2. Start Direct Reader Client Connection to Physical Reader (EL-UHF-RC4)
    this.connectDirectReader();
  }

  onTagDetected(epc, antenna = 'A', rssi = -60) {
    if (!epc) return;
    if (!this.deviceApiToken) {
      console.warn('🚫 [EDGE AUTH] TAG_READ ignored: DEVICE_API_TOKEN is required before processing reader scans.');
      this.broadcast({
        type: 'READER_HEALTH',
        component: 'reader',
        status: 'auth_required',
        reason: 'DEVICE_API_TOKEN is required before processing reader scans',
        observed_at: new Date().toISOString(),
      });
      return;
    }

    // 1. Broadcast raw tag read to authenticated UI clients (Monitor, Pairing, Enrollment, Handheld)
    this.broadcast({
      type: 'TAG_READ',
      epc,
      antenna,
      rssi,
      gate_id: this.gateId,
      warehouse_id: this.warehouseId,
      operational_mode: this.operationalMode,
      timestamp: new Date().toISOString(),
    });

    // 2. Evaluate movement direction through DirectionEngine
    const result = this.directionEngine.processTagRead(epc, antenna, rssi);

    // Suppress weak ghost signals for gate pass batch evaluation only
    if (result.reason === 'RSSI_BELOW_THRESHOLD') {
      return;
    }

    if (result.completed) {
      console.log(`🎯 [GATE SENSOR] Tag ${result.epc} passed dual sequence: ${result.direction} (Δt: ${result.timeDeltaMs}ms)`);
      this._accumulateBatch(result.epc, result.direction === 'B_TO_A' ? 'IN' : 'OUT');
    } else if (this.gateMode === 'SINGLE_ANTENNA_SESSION' && this.authorizedTransaction) {
      this._accumulateBatch(epc, this.authorizedTransaction.type === 'OUT_FULFILLMENT' ? 'OUT' : 'IN');
    }
  }

  _accumulateBatch(epc, direction = 'OUT') {
    if (!this.gateMode) return;
    if (!this.batchCollector.eventId) {
      this.batchCollector.eventId = crypto.randomUUID();
      this.batchCollector.observedAt = new Date().toISOString();
      this.batchCollector.deadlineTimer = setTimeout(() => this._queueDispatch(), this.batchDeadlineMs);
    }
    if (this.batchCollector.direction && this.batchCollector.direction !== direction) {
      this._queueDispatch();
    }
    this.batchCollector.direction = direction;
    this.batchCollector.tags.add(epc);

    if (this.batchCollector.timer) {
      clearTimeout(this.batchCollector.timer);
    }

    this.batchCollector.timer = setTimeout(() => this._queueDispatch(), this.batchIdleMs);
    if (this.batchCollector.tags.size >= this.maxBatchSize) this._queueDispatch();
  }

  _queueDispatch() {
    const batch = this._takeBatch();
    if (!batch) return this.dispatchChain;
    this.dispatchChain = this.dispatchChain.then(() => this._dispatchBatch(batch)).catch((error) => {
      console.error('🚨 [GATE FAIL-CLOSED] Batch dispatch failed:', error.message);
      this.relay.lock();
    });
    return this.dispatchChain;
  }

  _takeBatch() {
    const tagsArray = Array.from(this.batchCollector.tags);
    const direction = this.batchCollector.direction || 'OUT';
    const eventId = this.batchCollector.eventId;
    const observedAt = this.batchCollector.observedAt;

    this.batchCollector.tags.clear();
    this.batchCollector.direction = null;
    this.batchCollector.timer = null;
    if (this.batchCollector.deadlineTimer) clearTimeout(this.batchCollector.deadlineTimer);
    clearInterval(this.flushTimer);
    clearInterval(this.heartbeatTimer);
    clearInterval(this.watchdogTimer);
    this.batchCollector.deadlineTimer = null;
    this.batchCollector.eventId = null;
    this.batchCollector.observedAt = null;

    if (tagsArray.length === 0) return null;
    return { tagsArray, direction, eventId, observedAt };
  }

  async _dispatchBatch(batch) {
    const { tagsArray, direction, eventId, observedAt } = batch;

    // Check if Reader is in Enrollment / Registration Mode
    if (this.operationalMode === 'ENROLLMENT') {
      console.log(`ℹ️ [MODE MEJA PENDAFTARAN] ${tagsArray.length} tag terbaca untuk aktivasi tag baru. Evaluasi insiden gerbang DI-MUTE (Zero False Alarms).`);
      return;
    }

    // Log unpaired device status as informational without blocking gate event dispatch
    if (this.isDeviceUnpaired) {
      console.log(`ℹ️ [UNPAIRED READER] Perangkat belum tersinkron di database, memproses gate event dengan profil default.`);
    }

    console.log(`\n🚀 [GATE EVENT TRIGGER] Dispatching ${tagsArray.length} tags (Direction: ${direction}, Mode: Single/Dual Reader)`);

    await this.syncGateConfig();
    if (!this.gateMode || (this.gateMode === 'SINGLE_ANTENNA_SESSION' && !this.authorizedTransaction)) {
      console.warn('🚨 [GATE FAIL-CLOSED] Missing authoritative mode/session; event not authorized.');
      this.relay.lock();
      return;
    }

    const snapshotPath = this.cctv.capture(this.gateId, direction);
    const transactionId = this.authorizedTransaction?.id || null;
    const antennaSequence = this.gateMode === 'DUAL_ANTENNA_AUTO'
      ? (direction === 'OUT' ? 'A_TO_B' : 'B_TO_A')
      : 'SINGLE_ANTENNA';

    const payload = {
      warehouse_id: this.warehouseId,
      gate_id: this.gateId,
      event_id: eventId,
      observed_at: observedAt,
      antenna_sequence: antennaSequence,
      epc_list: tagsArray,
      cctv_snapshot_path: snapshotPath,
      gate_transaction_id: transactionId,
      raw_payload: {
        timestamp: observedAt,
        total_tags: tagsArray.length,
        device: this.syncedDeviceCode || 'ELECTRON_EL-UHF-RC4',
        device_name: this.syncedDeviceName || 'Default Reader',
        mode: 'SINGLE_READER',
      },
    };

    const response = await this.api.sendGateEvent(payload);

    this.broadcast({
      type: 'GATE_EVENT',
      payload,
      response,
      timestamp: new Date().toISOString(),
    });

    if (response && response.unlock_gate) {
      console.log(`🔓 [GATE CONTROLLER] Access APPROVED! Sinyal perlintasan valid.`);
      this.relay.unlock();
    } else {
      console.log(`🚨 [GATE CONTROLLER] Access DENIED / FLAGGED! Anomali terdeteksi, notifikasi terkirim.`);
      this.relay.lock();
    }
  }

  stop() {
    console.log('🛑 [EDGE BRIDGE] Stopping services...');
    for (const server of this.servers) {
      server.close();
    }
    if (this.directReaderSocket) {
      try { this.directReaderSocket.destroy(); } catch (e) {}
    }
    if (this.inventoryPollTimer) {
      clearInterval(this.inventoryPollTimer);
    }
    if (this.wss) {
      this.wss.close();
    }
    if (this.batchCollector.timer) clearTimeout(this.batchCollector.timer);
    if (this.batchCollector.deadlineTimer) clearTimeout(this.batchCollector.deadlineTimer);
  }
}

module.exports = GateBridgeApp;

if (require.main === module) {
  console.log('⚡ Starting MOSA RFID Gate Bridge Service (Universal Reader Mode: HW-VX & EL-UHF-RC4)...');
  const app = new GateBridgeApp();
  app.startTcpServers();

  const shutdown = (signal) => {
    console.log(`\n🛑 [SYSTEM ${signal}] Gracefully shutting down Edge Bridge Daemon...`);
    app.stop();
    setTimeout(() => process.exit(0), 500);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
