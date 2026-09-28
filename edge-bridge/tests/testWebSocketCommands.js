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
    ws.send(JSON.stringify({ action: 'AUTH', ticket: makeTicket(['PING', 'GET_MODE', 'SET_MODE:ENROLLMENT']) }));
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
    assert.equal((await request('{"action":"GET_MODE"}')).mode, 'GATE_SECURITY');
    assert.equal((await request('{"action":"SET_MODE","mode":"GATE_SECURITY"}')).code, 'FORBIDDEN');
    const modeChanged = once(ws, 'message');
    ws.send('{"action":"SET_MODE","mode":"ENROLLMENT"}');
    assert.equal(JSON.parse((await modeChanged)[0]).mode, 'ENROLLMENT');
    assert.equal(app.wss.options.maxPayload, 4096);
    console.log('WebSocket command checks passed');
  } finally {
    ws.terminate();
    for (const client of app.wsClients) client.terminate();
    await new Promise((resolve) => app.wss.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });