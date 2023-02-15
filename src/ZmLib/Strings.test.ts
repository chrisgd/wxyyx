import * as z from './ZMachine';

const zstr = require('./Strings');
const z1 = require('./zork1');

// set up the zmachine
var zvm: z.zMachine;
var bytes;
beforeEach(() => {
  bytes = new Uint8Array(new Uint16Array(z1.zork1bytes));
  zvm = z.makeZvm(bytes);
});

test('reading strings ', () => {
  expect(zstr.zToString(zvm, 0x40, 2).str).toBe('the ');
  expect(zstr.zToString(zvm, 0x19a, 4).str).toBe('impossible ');
  expect(zstr.zToString(zvm, 0x6ee4, 0xff).str).toEqual(
    'ZORK I: The Great Underground Empire\nCopyright (c) 1981, 1982, 1983 Infocom, Inc. '
  );
  expect(zstr.zToString(zvm, 0x40a0, 5).str).toEqual('fcd#  ');
});

test('stringtozstring ', () => {
  expect(zstr.stringToZstr(zstr.zToString(zvm, 0x19a, 0xff).str, 7)).toEqual(
    new Uint8Array([105, 109, 112, 111, 115, 115, 0])
  );
});

test('conversion back and forth', () => {
  expect(
    zstr.convertZBytesToString(zvm, zstr.zEncodeStr('hi theres', 9), 0, 9).str
  ).toBe('hi theres');
  expect(
    zstr.convertZBytesToString(zvm, zstr.zEncodeStr('nitty-gri', 9), 0, 9).str
  ).toBe('nitty-gr');
});
