const assert = require('assert');
const Rc4Parser = require('../src/rc4Parser');
const UniversalParser = require('../src/universalParser');

console.log('🧪 Testing Electron EL-UHF-RC4 Frame Parser & Module Init...');

// Test 1: Verify Module Init Command
const initCmd = Rc4Parser.buildModuleInitCommand();
assert.strictEqual(initCmd.toString('hex').toUpperCase(), 'CFFF0050000726', 'Module Init command must match CFFF0050000726');
console.log('✅ Test 1 Passed: buildModuleInitCommand generates exact binary frame (CFFF0050000726).');

// Test 2: Parse Module Init ACK from Reader
const ackFrame = Buffer.from('CF0000500100A8B1', 'hex');
const ackResult = UniversalParser.parse(ackFrame);
assert.strictEqual(ackResult.frames.length, 1);
assert.strictEqual(ackResult.frames[0].isInitAck, true);
assert.strictEqual(ackResult.frames[0].status, 'SUCCESS');
console.log('✅ Test 2 Passed: Module Init ACK decoded successfully:', ackResult.frames[0]);

// Test 3: Verify Start Inventory Command
const startCmd = Rc4Parser.buildStartInventoryCommand();
assert.strictEqual(startCmd.toString('hex').toUpperCase(), 'CFFF0001050000000000F5B5', 'Start Inventory must match CFFF0001050000000000F5B5');
console.log('✅ Test 3 Passed: buildStartInventoryCommand generates exact binary frame.');

// Test 4: Parse Live Tag Reading Frame
const liveTagFrame = Buffer.from('CF0000011200FE0201000CE280689400004035E34530F1B2B5', 'hex');
const tagResult = UniversalParser.parse(liveTagFrame);
assert.strictEqual(tagResult.frames.length, 1);
assert.strictEqual(tagResult.frames[0].epc, 'E280689400004035E34530F1');
assert.strictEqual(tagResult.frames[0].antenna, 1);
assert.strictEqual(tagResult.frames[0].protocol, 'RC4_V11');
console.log('✅ Test 4 Passed: Live RC4 Tag Reading frame decoded successfully:', tagResult.frames[0]);

console.log('\n🎉 ALL EL-UHF-RC4 PARSER TESTS PASSED 100%!');
