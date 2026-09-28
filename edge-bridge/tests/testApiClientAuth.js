const assert = require('assert');
const ApiClient = require('../src/apiClient');

(async () => {
  const client = new ApiClient('http://127.0.0.1:1/api');
  const result = await client.sendGateEvent({});
  assert.strictEqual(result.unlock_gate, false);
  assert.strictEqual(result.status, 'AUTH_CONFIG_ERROR');
  assert.throws(() => client.mutationConfig(1000), /DEVICE_API_TOKEN is required/);
  console.log('ApiClient device auth tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});