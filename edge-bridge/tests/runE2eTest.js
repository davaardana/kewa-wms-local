const net = require('net');
const GateBridgeApp = require('../src/index');
const HwVxParser = require('../src/hwVxParser');

console.log('🧪 Starting End-to-End Test: HW-VX6346KL -> Edge Bridge -> Parser...');

const app = new GateBridgeApp({
  warehouseId: 1,
  gateId: 'GATE-01',
  tcpPort: 2088, // use dedicated test port
});

const server = app.createTcpListener(2088);

let tagCount = 0;
app.onTagDetected = (epc, antenna, rssi) => {
  tagCount++;
  console.log(`✅ [E2E SUCCESS] Edge Bridge received tag from TCP: ${epc} on Antena ${antenna} (RSSI: ${rssi}dBm)`);
};

setTimeout(() => {
  const client = new net.Socket();
  client.connect(2088, '127.0.0.1', () => {
    console.log('🔌 Simulated HW-VX6346KL connected to TCP 2088');

    const frame1 = HwVxParser.buildMockFrame('E28011606000020410000001', 0x01, 0xEE, 0x00, 58);
    const frame2 = HwVxParser.buildMockFrame('E28011606000020410000002', 0x01, 0xEE, 0x00, 62);

    client.write(Buffer.concat([frame1, frame2]));
  });

  setTimeout(() => {
    if (tagCount === 2) {
      console.log('🎉 E2E TEST PASSED! All 2 tags decoded from TCP stream successfully!');
      client.destroy();
      server.close();
      process.exit(0);
    } else {
      console.error(`❌ E2E TEST FAILED: expected 2 tags, got ${tagCount}`);
      client.destroy();
      server.close();
      process.exit(1);
    }
  }, 1000);
}, 500);
