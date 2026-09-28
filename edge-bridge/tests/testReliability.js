const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const LocalCache = require('../src/localCache');
const DirectionEngine = require('../src/directionEngine');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mosa-edge-'));
const bufferFile = path.join(dir, 'queue.json');
let cache = new LocalCache({ bufferFile });
cache.queueEvent({ event_id: 'first' });
cache.queueEvent({ event_id: 'second' });
cache.incrementRetry(0, 'HTTP 422');
cache.quarantineFirst('HTTP 422');
cache = new LocalCache({ bufferFile });
assert.deepStrictEqual(cache.getPendingEvents().map((x) => x.event.event_id), ['second']);
assert.strictEqual(cache.deadLetters[0].event.event_id, 'first');
cache.queueIncident({ event_id: 'incident-1', status: 'unresponsive' });
cache.queueIncident({ event_id: 'incident-1', status: 'unresponsive' });
cache = new LocalCache({ bufferFile });
assert.strictEqual(cache.getPendingIncidents().length, 1);
cache.removeIncident(0);
assert.strictEqual(cache.getPendingIncidents().length, 0);

let now = 1000;
const realNow = Date.now;
Date.now = () => now;
const engine = new DirectionEngine({ minTimeWindowMs: 300, maxTimeWindowMs: 4000 });
assert.strictEqual(engine.processTagRead('EPC', 'A', -50).completed, false);
now += 350;
assert.strictEqual(engine.processTagRead('EPC', 'B', -50).direction, 'A_TO_B');
Date.now = realNow;

fs.rmSync(dir, { recursive: true, force: true });
console.log('Edge reliability tests passed.');