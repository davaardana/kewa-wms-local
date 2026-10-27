const assert = require('node:assert/strict');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const GateBridgeApp = require('../src/index');
const crypto = require('node:crypto');

(async () => {
  // No constructor: no reader, backend, heartbeat, or persistent cache access.
  const app = Object.create(GateBridgeApp.prototype);
  const secret = 'test-ws-control-secret-32-characters';
  Object.assign(app, {
    wsClients: new Set(), operationalMode: 'GATE_SECURITY', wsAllowedOrigins: ['https://wms.example.test'],
    enrollmentModeClients: new Set(), enrollmentPreviousMode: null,
    enrollmentModeGraceMs: 10,
    wsControlSecret: secret, usedWsTicketIds: new Map(), warehouseId: 1, isDeviceUnpaired: true,
    wsDeviceCode: 'EDGE-TEST',
  });
  const makeTicket = (commands, overrides = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
      v: 2, sub: 7, warehouse_id: 1, device_code: 'EDGE-TEST', commands, iat: now, exp: now + 45,
      jti: crypto.randomUUID(), ...overrides,
    })).toString('base64url');
    return `${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('base64url')}`;
  };
  app.directionEngine = { processTagRead: () => ({ direction: 'UNKNOWN' }) };
  app.directReaderSocket = { destroyed: false };
  app.readerStatus = 'responsive';
  app.readerHost = 'reader.test';
  app.readerPort = 2022;
  app.readerLastResponseAt = '2026-10-07T06:00:00.000Z';
  for (const overrides of [{ v: 1 }, { device_code: 'OTHER' }, { warehouse_id: 2 }, { exp: '9999999999' }]) {
    assert.throws(() => app.verifyWsControlTicket(makeTicket(['PING'], overrides)), /Invalid claims/);
  }
  const replay = makeTicket(['PING']);
  app.verifyWsControlTicket(replay);
  assert.throws(() => app.verifyWsControlTicket(replay), /Ticket replay/);
  app.deviceApiToken = null;
  app.startWebSocketServer(0);
  await once(app.wss, 'listening');
  const wsUrl = `ws://127.0.0.1:${app.wss.address().port}`;
  const rejected = new WebSocket(wsUrl, { origin: 'https://evil.example.test' });
  rejected.on('error', () => {});
  const rejectedResponse = once(rejected, 'unexpected-response');
  assert.equal((await rejectedResponse)[1].statusCode, 401);
  const ws = new WebSocket(wsUrl, { origin: 'https://wms.example.test' });
  let secondWs;
  let expiringWs;
  try {
    await once(ws, 'open');
    const request = async (payload) => {
      const response = once(ws, 'message');
      ws.send(payload);
      return JSON.parse((await response)[0].toString());
    };
    const authenticated = [];
    const authComplete = new Promise((resolve) => {
      const collect = (message) => {
        authenticated.push(JSON.parse(message.toString()));
        if (authenticated.length === 2) { ws.off('message', collect); resolve(); }
      };
      ws.on('message', collect);
    });
    ws.send(JSON.stringify({ action: 'AUTH', ticket: makeTicket(['PING', 'GET_MODE', 'SET_MODE:ENROLLMENT', 'TEST_READER_CONNECTION']) }));
    await authComplete;
    assert.deepEqual(authenticated.map(({ type }) => type), ['AUTH_OK', 'HANDSHAKE']);
    assert.equal(authenticated[1].pairing_status, 'unpaired');
    assert.equal(authenticated[1].reader_target, null);
    for (const action of ['SIMULATE_TAG', 'TRIGGER_SCAN']) {
      assert.equal((await request(JSON.stringify({ action }))).code, 'SIMULATION_DISABLED');
    }
    const health = once(ws, 'message');
    app.onTagDetected('E28011606000020410000001', 'A', -55);
    assert.equal(JSON.parse((await health)[0].toString()).status, 'auth_required');
    for (const payload of ['null', '[]', '{', '{}', '{"action":"SET_MODE","mode":"INVALID"}']) {
      assert.ok(['INVALID_COMMAND', 'FORBIDDEN'].includes((await request(payload)).code));
    }
    assert.equal(app.operationalMode, 'GATE_SECURITY');
    assert.equal((await request('{"action":"PING"}')).type, 'PONG');
    const readerTest = await request('{"action":"TEST_READER_CONNECTION"}');
    assert.equal(readerTest.type, 'READER_CONNECTION_TEST');
    assert.equal(readerTest.success, true);
    assert.equal(readerTest.reader_host, 'reader.test');
    assert.equal(readerTest.reader_port, 2022);
    app.directReaderSocket.destroyed = true;
    const disconnectedReaderTest = await request('{"action":"TEST_READER_CONNECTION"}');
    assert.equal(disconnectedReaderTest.success, false, JSON.stringify(disconnectedReaderTest));
    assert.equal((await request('{"action":"GET_MODE"}')).mode, 'GATE_SECURITY');
    assert.equal((await request('{"action":"SET_MODE","mode":"GATE_SECURITY"}')).code, 'FORBIDDEN');
    const modeChanged = once(ws, 'message');
    ws.send('{"action":"SET_MODE","mode":"ENROLLMENT"}');
    assert.equal(JSON.parse((await modeChanged)[0]).mode, 'ENROLLMENT');

    const sentGateEvents = [];
    const singleAntennaDispatcher = Object.create(GateBridgeApp.prototype);
    Object.assign(singleAntennaDispatcher, {
      operationalMode: 'GATE_SECURITY',
      isDeviceUnpaired: false,
      gateMode: 'SINGLE_ANTENNA_SESSION',
      authorizedDocument: { id: 18, type: 'inbound' },
      warehouseId: 1,
      gateId: 'EDGE-TEST',
      _tagStats: {},
      cctv: { capture: () => null },
      api: { sendGateEvent: async (payload) => { sentGateEvents.push(payload); return { unlock_gate: false, status: 'STANDBY' }; } },
      broadcast: () => {},
      auditLogger: { log: () => {} },
      meshSync: { broadcastSighting: () => {} },
      relay: { lock: () => {}, unlock: () => {} },
    });
    await singleAntennaDispatcher._dispatchBatch({
      tagsArray: [{ epc: 'E28011606000020410000001', rssi: -55 }],
      direction: 'IN',
      eventId: crypto.randomUUID(),
      observedAt: new Date().toISOString(),
    });
    assert.equal(sentGateEvents[0].direction, 'IN');
    assert.equal(sentGateEvents[0].shipping_document_id, 18);
    singleAntennaDispatcher.operationalMode = 'ENROLLMENT';
    await singleAntennaDispatcher._dispatchBatch({
      tagsArray: [{ epc: 'E28011606000020410000002', rssi: -55 }],
      direction: 'IN',
      eventId: crypto.randomUUID(),
      observedAt: new Date().toISOString(),
    });
    assert.equal(sentGateEvents.length, 1);

    secondWs = new WebSocket(wsUrl, { origin: 'https://wms.example.test' });
    await once(secondWs, 'open');
    const secondAuthMessages = [];
    const secondAuthComplete = new Promise((resolve) => {
      const collect = (message) => {
        secondAuthMessages.push(JSON.parse(message.toString()));
        if (secondAuthMessages.length === 2) { secondWs.off('message', collect); resolve(); }
      };
      secondWs.on('message', collect);
    });
    secondWs.send(JSON.stringify({ action: 'AUTH', ticket: makeTicket(['GET_MODE', 'SET_MODE:ENROLLMENT']) }));
    await secondAuthComplete;
    secondWs.send('{"action":"SET_MODE","mode":"ENROLLMENT"}');
    const secondModeResponse = once(secondWs, 'message');
    secondWs.send('{"action":"GET_MODE"}');
    assert.equal(JSON.parse((await secondModeResponse)[0]).mode, 'ENROLLMENT');

    const enrollmentSocket = [...app.enrollmentModeClients][0];
    const serverCloseComplete = once(enrollmentSocket, 'close');
    const closeComplete = once(ws, 'close');
    ws.close();
    await closeComplete;
    await serverCloseComplete;
    assert.equal(app.enrollmentModeClients.size, 1);
    assert.equal(app.operationalMode, 'ENROLLMENT');

    const lastEnrollmentSocket = [...app.enrollmentModeClients][0];
    const lastServerCloseComplete = once(lastEnrollmentSocket, 'close');
    const lastCloseComplete = once(secondWs, 'close');
    const modeRestored = new Promise((resolve) => {
      const watcher = {
        readyState: WebSocket.OPEN,
        send: (raw) => {
          const message = JSON.parse(raw);
          if (message.type === 'MODE_CHANGED' && message.mode === 'GATE_SECURITY') resolve(watcher);
        },
      };
      app.wsClients.add(watcher);
    });
    secondWs.close();
    await lastCloseComplete;
    await lastServerCloseComplete;
    const watcher = await modeRestored;
    app.wsClients.delete(watcher);
    assert.equal(app.enrollmentModeClients.size, 0);
    assert.equal(app.operationalMode, 'GATE_SECURITY');

    assert.equal(app.wss.options.maxPayload, 4096);
    console.log('WebSocket command checks passed');
  } finally {
    if (ws.readyState !== WebSocket.CLOSED) ws.terminate();
    if (secondWs && secondWs.readyState !== WebSocket.CLOSED) secondWs.terminate();
    for (const client of app.wsClients) client.terminate();
    await new Promise((resolve) => app.wss.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });