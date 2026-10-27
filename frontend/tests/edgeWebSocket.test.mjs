import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Load the helper with a stub API: no browser, network, or extra test dependency.
const source = (await readFile(new URL('../src/services/edgeWebSocket.js', import.meta.url), 'utf8'))
  .replace("import { wsControlApi } from './api';", 'const wsControlApi = globalThis.testApi;')
  .replace("import api from './api';", 'const api = { defaults: { baseURL: \'/api\', headers: { common: {} } } };');
let response;
let calls = 0;
globalThis.testApi = { issueTicket: async (...args) => {
  assert.deepEqual(args, [4, ['PING'], 7, undefined]);
  return { data: response };
} };
globalThis.WebSocket = class {
  constructor(url) { this.url = url; calls++; }
  send(message) { this.sent = JSON.parse(message); }
};
globalThis.localStorage = { getItem: () => '' };
const { openAuthenticatedEdgeSocket } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
response = { edge_ws_url: 'wss://branch.example.test/ws', warehouse_id: 4, device_id: 7, ticket: 'signed' };
const socket = await openAuthenticatedEdgeSocket(4, ['PING'], {}, 7);
assert.equal(socket.url, response.edge_ws_url);
socket.onopen();
assert.deepEqual(socket.sent, { action: 'AUTH', ticket: 'signed' });
for (const edge_ws_url of ['ws://branch.test', 'wss://user:pass@branch.test', 'wss://branch.test/#', 'wss://branch.test/?x=1', 'wss://branch.test/%2f']) {
  response = { ...response, edge_ws_url };
  await assert.rejects(openAuthenticatedEdgeSocket(4, ['PING'], {}, 7));
}
response = { ...response, edge_ws_url: 'wss://branch.test', warehouse_id: 5 };
await assert.rejects(openAuthenticatedEdgeSocket(4, ['PING'], {}, 7));
assert.equal(calls, 1, 'Rejected endpoints must not receive a ticket');

const enrollmentSource = await readFile(new URL('../src/pages/TagEnrollment.jsx', import.meta.url), 'utf8');
assert.match(enrollmentSource, /handheld_eligible:\s*1/);
assert.match(enrollmentSource, /openAuthenticatedEdgeSocket\([\s\S]*selectedReaderId/);
assert.doesNotMatch(enrollmentSource, /\['SET_MODE:GATE_SECURITY', 'SET_MODE:ENROLLMENT'\]/);
console.log('Server-selected Edge socket checks passed');