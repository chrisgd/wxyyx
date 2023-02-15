import {
  makeDictionary,
  getEntry,
  search,
  toString,
  searchSlow
} from './ZDictionary';

const z = require('./ZMachine');
const z1 = require('./zork1');

let bytes = new Uint8Array(new Uint16Array(z1.zork1bytes));
let zvm = z.makeZvm(bytes);
let zd = zvm.standardDictionary;

beforeEach(() => {});

test('dictionary entry tests', () => {
  expect(getEntry(zd, 0)).toBe('$ve');
  expect(getEntry(zd, 9)).toBe('again');
  expect(getEntry(zd, 19)).toBe('apply');
  expect(getEntry(zd, 29)).toBe('ax');
  expect(getEntry(zd, 39)).toBe('bat');
  expect(getEntry(zd, 49)).toBe('bird');
  expect(getEntry(zd, 59)).toBe('blue');
  expect(getEntry(zd, 69)).toBe('bookle');
  expect(getEntry(zd, 79)).toBe('brief');
  expect(getEntry(zd, 89)).toBe('but');
  expect(getEntry(zd, 200)).toBe('fcd#  ');
  expect(getEntry(zd, 696)).toBe('zzmgck');
  expect(() => getEntry(zd, 697)).toThrow();
});

test('dictionary search tests', () => {
  expect(searchSlow(zd, 'bookle')).toBe(0x3d0b);
  expect(searchSlow(zd, 'triden')).toBe(0x4c77);
  expect(searchSlow(zd, '.')).toBe(0x3b2f);
  expect(search(zd, '$ve')).toBe(0x3b28);

  expect(searchSlow(zd, 'zzmgck')).toBe(0x4e30);

  expect(search(zd, 'bookle')).toBe(0x3d0b);
  expect(search(zd, 'triden')).toBe(0x4c77);
  expect(search(zd, '.')).toBe(0x3b2f);
  expect(search(zd, '$ve')).toBe(0x3b28);
  expect(search(zd, 'zzmgck')).toBe(0x4e30);

  expect(search(zd, 'mailbox')).toBe(0x453f);
  expect(search(zd, 'fart')).toBe(0);
});
