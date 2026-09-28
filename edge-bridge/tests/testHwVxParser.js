const assert = require('assert');
const HwVxParser = require('../src/hwVxParser');

console.log('🧪 Testing Electron HW-VX6346KL Frame Parser...');

// Test 1: Build mock frame and decode it
const testEpc = 'E28011606000020410000001';
const mockFrame = HwVxParser.buildMockFrame(testEpc, 0x01, 0xEE, 0x00, 68);

const parsed = HwVxParser.decodeFrame(mockFrame);
assert(parsed !== null, 'Failed to decode mock frame');
assert.strictEqual(parsed.epc, testEpc, `EPC should match ${testEpc}`);
assert.strictEqual(parsed.readerAddress, 1, 'Reader address should be 1');
assert.strictEqual(parsed.rssi, -68, 'RSSI should be -68 dBm');

console.log('✅ Test 1 Passed: Single frame successfully decoded:', parsed);

// Test 2: Stream parsing with buffer concatenation
const mockFrame2 = HwVxParser.buildMockFrame('E28011606000020410000002', 0x02, 0xEE, 0x00, 72);
const streamBuffer = Buffer.concat([mockFrame, mockFrame2]);

const streamResult = HwVxParser.parse(streamBuffer);
assert.strictEqual(streamResult.frames.length, 2, 'Should parse exactly 2 frames');
assert.strictEqual(streamResult.frames[0].epc, testEpc);
assert.strictEqual(streamResult.frames[1].epc, 'E28011606000020410000002');
assert.strictEqual(streamResult.remaining.length, 0, 'No remaining buffer');

console.log('✅ Test 2 Passed: Stream buffer of multiple frames parsed correctly.');

console.log('\n🎉 ALL HW-VX6346KL PARSER TESTS PASSED 100%!');
