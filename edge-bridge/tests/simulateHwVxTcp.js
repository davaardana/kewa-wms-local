/**
 * Simulated Electron HW-VX6346KL Hardware TCP Client
 * Connects to edge-bridge TCP Server (Port 2077) and streams binary tag frames
 */

const net = require('net');
const HwVxParser = require('../src/hwVxParser');

const TCP_PORT = 2077;
const TCP_HOST = '127.0.0.1';

console.log('🚀 [SIMULATOR] Launching Simulated Electron HW-VX6346KL Reader...');

const client = new net.Socket();

client.connect(TCP_PORT, TCP_HOST, async () => {
  console.log(`✅ Connected to Edge Bridge on ${TCP_HOST}:${TCP_PORT}`);

  const tagPoles = [
    'E28011606000020410000001',
    'E28011606000020410000002',
  ];

  console.log('\n📦 [TRUCK PASSING GATE] Streaming binary tag frames for 2 FO Poles...');

  for (const epc of tagPoles) {
    // Step 1: Detect on Antenna A
    const frameA = HwVxParser.buildMockFrame(epc, 0x01, 0xEE, 0x00, 55);
    client.write(frameA);
    console.log(`📡 Sent binary frame: ${epc} via Antenna A`);
  }

  // Delay simulation (time taken for truck to pass between sensors)
  await new Promise((r) => setTimeout(r, 600));

  for (const epc of tagPoles) {
    // Step 2: Detect on Antenna B
    const frameB = HwVxParser.buildMockFrame(epc, 0x02, 0xEE, 0x00, 52);
    client.write(frameB);
    console.log(`📡 Sent binary frame: ${epc} via Antenna B`);
  }

  console.log('\n⏳ Waiting 2.5s for edge-bridge batching and API dispatch...');
  setTimeout(() => {
    console.log('🏁 [SIMULATION FINISHED] Closing client socket.');
    client.end();
    process.exit(0);
  }, 2500);
});

client.on('error', (err) => {
  console.error('❌ Connection error:', err.message);
  process.exit(1);
});
