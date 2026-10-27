const assert = require('assert');
const axios = require('axios');
const ApiClient = require('../src/apiClient');

(async () => {
  const client = new ApiClient('http://127.0.0.1:1/api');
  const result = await client.sendGateEvent({});
  assert.strictEqual(result.unlock_gate, false);
  assert.strictEqual(result.status, 'AUTH_CONFIG_ERROR');
  assert.throws(() => client.mutationConfig(1000), /DEVICE_API_TOKEN is required/);

  const originalGet = axios.get;
  const originalNow = Date.now;
  let now = 1000;
  let configRequests = 0;
  Date.now = () => now;
  axios.get = async () => ({ data: { device: { device_code: `EDGE-${++configRequests}` } } });
  try {
    const configClient = new ApiClient('http://config.test/api', null, 'test-device-token');
    assert.strictEqual((await configClient.fetchGateConfig()).device.device_code, 'EDGE-1');
    now += 1499;
    assert.strictEqual((await configClient.fetchPairedDevices())[0].device_code, 'EDGE-1');
    assert.strictEqual(configRequests, 1);
    now += 2;
    assert.strictEqual((await configClient.fetchGateConfig()).device.device_code, 'EDGE-2');
    assert.strictEqual(configRequests, 2);
  } finally {
    axios.get = originalGet;
    Date.now = originalNow;
  }

  console.log('ApiClient auth and config refresh tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});