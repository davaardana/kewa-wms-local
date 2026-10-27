/**
 * set-reader-ip.js
 * Ubah IP reader RFID Electron EL-UHF-RC4 via TCP port 2022
 * tanpa buka software Electron RC GUI.
 *
 * Usage:
 *   node scripts/set-reader-ip.js <reader-ip-sekarang> <ip-baru> [netmask] [gateway]
 *
 * Contoh:
 *   node scripts/set-reader-ip.js 192.168.1.200 192.168.2.200 255.255.255.0 192.168.2.1
 */

const net = require('net');

const HEADER = 0xCF;
const BROADCAST_ADDRESS = 0xFF;
const CMD_SET_GET_NETWORK = 0x005F;
const OPTION_GET = 0x02;
const OPTION_SET = 0x01;

function ipToBytes(ipStr) {
  return ipStr.split('.').map(Number);
}

function calculateChecksum(data) {
  let value = 0xFFFF;
  for (const byte of data) {
    value ^= byte;
    for (let i = 0; i < 8; i++) {
      value = (value & 0x0001) ? ((value >> 1) ^ 0x8408) : (value >> 1);
      value &= 0xFFFF;
    }
  }
  return [(value >> 8) & 0xFF, value & 0xFF];
}

function buildCommand(cmdCode, data = []) {
  const base = [HEADER, BROADCAST_ADDRESS, (cmdCode >> 8) & 0xFF, cmdCode & 0xFF, data.length, ...data];
  return Buffer.from([...base, ...calculateChecksum(base)]);
}

function parseResponse(buf) {
  if (!buf || buf.length < 5 || buf[0] !== HEADER) return null;
  const length = buf[4];
  const body = buf.slice(5, 5 + length);
  return { cmdCode: (buf[2] << 8) | buf[3], status: body[0], body };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const [,, readerIpNow, ipBaru, netmask = '255.255.255.0', gateway] = process.argv;

if (!readerIpNow || !ipBaru) {
  console.log('Usage: node scripts/set-reader-ip.js <reader-ip-sekarang> <ip-baru> [netmask] [gateway]');
  console.log('Contoh: node scripts/set-reader-ip.js 192.168.1.200 192.168.2.200 255.255.255.0 192.168.2.1');
  process.exit(1);
}

const gwFinal = gateway || (ipBaru.split('.').slice(0, 3).join('.') + '.1');
const READER_PORT = 2022;
const TIMEOUT_MS = 8000;

console.log(`\n🔌 Konek ke reader : ${readerIpNow}:${READER_PORT}`);
console.log(`📡 IP baru         : ${ipBaru}`);
console.log(`🔧 Netmask         : ${netmask}`);
console.log(`🔧 Gateway         : ${gwFinal}\n`);

const client = new net.Socket();
let step = 'get';
let recvBuf = Buffer.alloc(0);

const timeout = setTimeout(() => {
  console.error(`\n⏰ Timeout ${TIMEOUT_MS}ms — reader tidak merespons.`);
  console.error('   Pastikan PC satu subnet dengan reader dan port 2022 terbuka.');
  client.destroy();
  process.exit(1);
}, TIMEOUT_MS);

client.connect(READER_PORT, readerIpNow, () => {
  console.log('✅ Terhubung ke reader.\n');
  console.log('📥 Step 1: GET network settings dari reader...');
  client.write(buildCommand(CMD_SET_GET_NETWORK, [OPTION_GET]));
});

client.on('data', (chunk) => {
  recvBuf = Buffer.concat([recvBuf, chunk]);

  if (step === 'get') {
    if (recvBuf.length < 10) return;
    const resp = parseResponse(recvBuf);
    if (!resp || resp.status !== 0x00) {
      console.error('❌ GET network settings gagal:', recvBuf.toString('hex'));
      clearTimeout(timeout); client.destroy(); process.exit(1);
    }

    const mac = Array.from(resp.body.slice(1, 7)).map(b => b.toString(16).padStart(2, '0')).join(':');
    console.log(`   MAC saat ini    : ${mac}`);
    console.log(`   IP saat ini     : ${Array.from(resp.body.slice(7, 11)).join('.')}`);
    console.log(`   Netmask saat ini: ${Array.from(resp.body.slice(11, 15)).join('.')}`);
    console.log(`   Gateway saat ini: ${Array.from(resp.body.slice(15, 19)).join('.')}\n`);

    step = 'set';
    console.log(`📤 Step 2: SET IP baru → ${ipBaru} ...`);
    const setData = [OPTION_SET, ...resp.body.slice(1, 7), ...ipToBytes(ipBaru), ...ipToBytes(netmask), ...ipToBytes(gwFinal)];
    recvBuf = Buffer.alloc(0);
    client.write(buildCommand(CMD_SET_GET_NETWORK, setData));

  } else if (step === 'set') {
    if (recvBuf.length < 8) return;
    const resp = parseResponse(recvBuf);
    if (resp && resp.status === 0x00) {
      console.log('✅ Berhasil! Reader sedang reboot...\n');
      console.log('📝 Langkah selanjutnya:');
      console.log(`   1. Tunggu ~5 detik sampai reader online di IP baru`);
      console.log(`   2. Edit edge-bridge/.env → READER_HOST=${ipBaru}`);
      console.log('   3. Restart edge-bridge');
    } else {
      const code = resp ? `0x${resp.status.toString(16)}` : 'unknown';
      console.error(`❌ SET gagal. Status: ${code}`);
      console.error('   Kemungkinan reader seri ini tidak support ubah IP via command (hanya EL-UHF-RC4 yang support).');
    }
    clearTimeout(timeout); client.destroy();
    process.exit(resp && resp.status === 0x00 ? 0 : 1);
  }
});

client.on('error', (err) => {
  clearTimeout(timeout);
  console.error(`\n❌ Koneksi gagal: ${err.message}`);
  console.error('   Pastikan PC satu subnet dengan reader dan reader menyala.');
  process.exit(1);
});
