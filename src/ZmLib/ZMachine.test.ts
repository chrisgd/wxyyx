/**
 * @jest-environment node
 */
//const zops = require('./Zops');
import * as z from './ZMachine';
const zf = require('./ZFile');
const z1 = require('./zork1');
const Stack = require('./StackUint16');

var bytes;
var zvm: any;
beforeEach(() => {
  bytes = new Uint8Array(new Uint16Array(z1.zork1bytes));
  zvm = z.makeZvm(bytes);
  //console.log('static memory is at ' + zvm.static)
});

test('zf tests to make sure the file is correct, just a few things', () => {
  expect(zf.getVersionNum(zvm.bytes)).toBe(3);
  expect(zf.getFileLength(zvm.bytes)).toBe(0x14b8c);
  expect(zf.getChecksum(zvm.bytes)).toBe(zf.calculateChecksum(zvm.bytes));
});

test('zMachine setup tests', () => {
  expect(zvm.dynamic).toBe(0);
  expect(zvm.static).toBe(zf.getBaseOfStaticMem(zvm.bytes));
  expect(zvm.high).toBe(zf.getBaseOfHighMemory(zvm.bytes));
  expect(zvm.globals).toBe(zf.getGlobalVarTable(zvm.bytes));
  expect(zvm.pc).toBe(zf.getInitialValuePC(zvm.bytes));
  expect(zvm.version).toBe(zf.getVersionNum(zvm.bytes));
});

test('zMachine routine tests', () => {
  // let's be sure the evaulation works properly
  z.evalNext(zvm).next();
  expect(zvm.pc).toBe(0x5479);
});

test('storing and loading from memeory', () => {
  // load it so we can restore it for later tests
  let loc = zvm.static - 0x20;
  var w = 0;
  beforeEach(() => {
    w = z.loadWord(zvm, loc, 0x5);
  });
  afterEach(() => {
    z.storeWord(zvm, loc, 0x5, w);
  });

  // storing and loading words
  z.storeWord(zvm, loc, 0x5, 0x2a2a);
  expect(z.loadWord(zvm, loc, 0x5)).toBe(0x2a2a);
  z.storeWord(zvm, loc, 0x5, w);
  expect(z.loadWord(zvm, loc, 0x5)).toBe(w);

  // storing and loading bytes
  z.storeByte(zvm, loc, 0x5, 42);
  expect(z.loadByte(zvm, loc, 0x5)).toBe(42);
  z.storeByte(zvm, loc, 0x5, w);
  expect(z.loadByte(zvm, loc, 0x5)).toBe(w);

  expect(() => z.storeWord(zvm, zvm.static, 0x10, 42)).toThrow();
  expect(() => z.storeByte(zvm, zvm.static, 0x10, 42)).toThrow();
  expect(() => z.storeWord(zvm, zvm.static - 1, 0, 42)).toThrow();
  expect(() => z.storeByte(zvm, zvm.static, 0, 42)).toThrow();
  // expect(() => z.loadWord(zvm, zvm.high, 0x10)).toThrow();
  // expect(() => z.loadByte(zvm, zvm.high, 0x10)).toThrow();
});

test('pushing to and popping from stack', () => {
  let loc = Stack.length(zvm.stack);
  //console.log('stack top is: ' + loc);
  z.pushUint31ToStack(zvm, 0xf0f0f0f0);
  expect(z.getUint31FromStack(zvm, loc)).toBe(0x70f0f0f0);
  z.pushUint31ToStack(zvm, 0x70f0f0f0);
  Stack.multiPop(zvm.stack, 2);
  expect(z.getUint31FromStack(zvm, loc)).toBe(0x70f0f0f0);
});

test('saving and restoring the zmachine', () => {
  let s = zf.convertToString(zvm.bytes, zvm.bytes.length);
  expect(zvm.bytes).toEqual(zf.convertFromString(s));

  let ds = z.dynamicBytesToString(zvm, 64);
  //console.log('s: ' + ds);
  expect(zvm.bytes.slice(0, 64)).toEqual(z.stringToDynamicBytes(zvm, ds));

  //let sg = z.makeSaveGame(zvm);
});
