// grab the exported things from zops to test
const zops = require('./Zops');

test('getBit tests', () => {
  expect(zops.getBit(0xaa, 7)).toBe(1);
  expect(zops.getBit(0xaa, 6)).toBe(0);
  expect(zops.getBit(0xaa, 5)).toBe(1);
  expect(zops.getBit(0xaa, 4)).toBe(0);
  expect(zops.getBit(0xaa, 3)).toBe(1);
  expect(zops.getBit(0xaa, 2)).toBe(0);
  expect(zops.getBit(0xaa, 1)).toBe(1);
  expect(zops.getBit(0xaa, 0)).toBe(0);
  expect(zops.getBit(0xaa, 0)).toBe(0);
});

test('getBitRange tests', () => {
  expect(zops.getBitRange(0xaa, 0, 2)).toBe(0b010);
  expect(zops.getBitRange(0xaa, 1, 3)).toBe(0b101);
  expect(zops.getBitRange(0xaa, 2, 4)).toBe(0b010);
  expect(zops.getBitRange(0xaa, 3, 5)).toBe(0b101);
  expect(zops.getBitRange(0xaa, 4, 6)).toBe(0b010);
  expect(zops.getBitRange(0xaa, 5, 7)).toBe(0b101);
  expect(zops.getBitRange(0xaa, 6, 8)).toBe(0b010);
  expect(zops.getBitRange(0xaa, 7, 9)).toBe(0b001);
  expect(zops.getBitRange(0xaa, 1, 5)).toBe(0b10101);
});

test('opcode parsing', () => {
  let mem = new Uint8Array([3, 0xc0, 0x80, 0xbe, 0x7e]);

  //expect(zops.parseOpcode(mem, 2)).toBe(1);
});
