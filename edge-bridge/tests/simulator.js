/**
 * Hardware RFID Gate Simulator
 * Simulates physical items passing through Antennas A & B.
 * Tests:
 * 1. Dual Antenna A -> B (Keluar)
 * 2. Dual Antenna B -> A (Masuk)
 * 3. RC4 Protocol Frame Emulation & Universal Parser Validation
 * 4. Single Antenna RSSI Gradient Trend Analysis (Approaching / Departing)
 */

const GateBridgeApp = require('../src/index');
const Rc4Parser = require('../src/rc4Parser');
const HwVxParser = require('../src/hwVxParser');
const UniversalParser = require('../src/universalParser');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSimulation() {
  console.log('=====================================================');
  console.log('🏁 STARTING MOSA UNIVERSAL RFID GATE SIMULATION');
  console.log('=====================================================\n');

  // Test 1: Parser Auto-Detection Unit Test
  console.log('>>> 🔬 TEST 0: Validasi Parser Biner Otomatis (HW-VX vs RC4)...');
  const hwVxRaw = HwVxParser.buildMockFrame('E28011606000020410000001', 1, 0xEE, 0x00, 55);
  const parsedHwVx = UniversalParser.parse(hwVxRaw);
  console.log(`✓ HW-VX Frame parsed: EPC=${parsedHwVx.frames[0]?.epc} | Proto=${parsedHwVx.frames[0]?.protocol} | RSSI=${parsedHwVx.frames[0]?.rssi}dBm`);

  const rc4Raw = Rc4Parser.buildMockFrame('E28011606000020410000099', -48);
  const parsedRc4 = UniversalParser.parse(rc4Raw);
  console.log(`✓ RC4 Frame parsed:   EPC=${parsedRc4.frames[0]?.epc} | Proto=${parsedRc4.frames[0]?.protocol} | RSSI=${parsedRc4.frames[0]?.rssi}dBm\n`);

  const app = new GateBridgeApp({
    warehouseId: 1,
    gateId: 'GATE-01',
    apiBaseUrl: 'http://127.0.0.1:8000/api',
  });

  const tagTiang1 = 'E28011606000020410000001';
  const tagTiang2 = 'E28011606000020410000002';
  const tagSplicer = 'E28011606000020420000001';

  console.log('>>> 📍 SIMULASI 1: Pekerja membawa 2 Tiang FO KELUAR Gudang (Antena A -> Antena B)');
  console.log('1. Tag terbaca di Antena A (Sisi Dalam Gudang)...');
  app.onTagDetected(tagTiang1, 'A', -55);
  app.onTagDetected(tagTiang2, 'A', -58);

  console.log('2. Pekerja berjalan melintasi gerbang (delay 700ms)...');
  await sleep(700);

  console.log('3. Tag terbaca di Antena B (Sisi Luar Gudang)...');
  app.onTagDetected(tagTiang1, 'B', -52);
  app.onTagDetected(tagTiang2, 'B', -54);

  console.log('Menunggu batch aggregation & evaluasi access...\n');
  await sleep(2000);

  console.log('-----------------------------------------------------');
  console.log('>>> 📍 SIMULASI 2: Pekerja mengembalikan 1 Splicer MASUK Gudang (Antena B -> Antena A)');
  console.log('1. Tag terbaca di Antena B (Sisi Luar Gudang)...');
  app.onTagDetected(tagSplicer, 'B', -50);

  console.log('2. Pekerja masuk ke gudang (delay 600ms)...');
  await sleep(600);

  console.log('3. Tag terbaca di Antena A (Sisi Dalam Gudang)...');
  app.onTagDetected(tagSplicer, 'A', -53);

  console.log('Menunggu batch aggregation & evaluasi access...\n');
  await sleep(2000);

  console.log('-----------------------------------------------------');
  console.log('>>> 📍 SIMULASI 3: Mode SINGLE ANTENNA dengan Evaluasi Tren RSSI (EL-UHF-RC4)');
  const tagPeralatan = 'E28011606000020430000001';
  console.log('1. Tag terbaca saat truk jauh (RSSI: -72 dBm)...');
  app.onTagDetected(tagPeralatan, 'A', -72);
  await sleep(200);
  console.log('2. Truk mendekat ke portal (RSSI: -63 dBm)...');
  app.onTagDetected(tagPeralatan, 'A', -63);
  await sleep(200);
  console.log('3. Truk tepat di bawah sensor (RSSI: -50 dBm)...');
  app.onTagDetected(tagPeralatan, 'A', -50);

  await sleep(1500);

  console.log('=====================================================');
  console.log('✨ SIMULASI SELESAI DENGAN SUKSES!');
  console.log('=====================================================');
  process.exit(0);
}

runSimulation().catch(console.error);

