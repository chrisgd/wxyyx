import { ZObjTable } from './ZObjTable';

const zo = require('./ZObjTable');
const z = require('./ZMachine');
const z1 = require('./zork1');

var bytes;
var zvm: any;
var zot: any;
beforeEach(() => {
  bytes = new Uint8Array(new Uint16Array(z1.zork1bytes));
  zvm = z.makeZvm(bytes);
  zot = zvm.objectTable;
  //zot = zo.makeZObjTable(zvm);
  // console.log('zot address ' + zot.address.toString(16));
  // console.log('zot entries start ' + zot.entries.toString(16));
  // console.log('zot parents offset ' + zot.parentOffset.toString(16));
  // console.log('zot sibling offset: ' + zot.siblingOffset.toString(16));
  // console.log('zot child offset: ' + zot.childOffset.toString(16));
});

test('check objects', () => {
  // first entry--these are values from zork, infodump helped while we developed these tests
  // to ensure our table reading was working
  expect(zot.entrySize).toBe(9);
  expect(zo.isAttributeSet(zot, 1, 14)).toBe(true);
  expect(zo.isAttributeSet(zot, 1, 28)).toBe(true);

  expect(zo.getParent(zot, 1)).toBe(247);
  expect(zo.getSibling(zot, 1)).toBe(2);
  expect(zo.getChild(zot, 1)).toBe(0);
  expect(zo.getPropertiesAddr(zot, 1)).toBe(0xbb8);

  expect(zo.getParent(zot, 88)).toBe(82);
  expect(zo.getSibling(zot, 88)).toBe(75);
  expect(zo.getChild(zot, 88)).toBe(89);
  expect(zo.getPropertiesAddr(zot, 88)).toBe(0x1371);

  zo.setParent(zot, 88, 42);
  zo.setSibling(zot, 88, 42);
  zo.setChild(zot, 88, 42);

  expect(zo.getParent(zot, 88)).toBe(42);
  expect(zo.getSibling(zot, 88)).toBe(42);
  expect(zo.getChild(zot, 88)).toBe(42);

  zo.setParent(zot, 88, 82);
  zo.setSibling(zot, 88, 75);
  zo.setChild(zot, 88, 89);

  expect(zo.getParent(zot, 88)).toBe(82);
  expect(zo.getSibling(zot, 88)).toBe(75);
  expect(zo.getChild(zot, 88)).toBe(89);

  // now some middle entry
  expect(zo.isAttributeSet(zot, 120, 6)).toBe(true);
  expect(zo.isAttributeSet(zot, 120, 9)).toBe(true);
  expect(zo.getParent(zot, 120)).toBe(82);
  expect(zo.getSibling(zot, 120)).toBe(30);
  expect(zo.getChild(zot, 120)).toBe(121);
  expect(zo.getPropertiesAddr(zot, 120)).toBe(0x168c);

  // checking further attributes
  expect(zo.isAttributeSet(zot, 119, 17)).toBe(true);
  expect(zo.isAttributeSet(zot, 119, 26)).toBe(true);
  expect(zo.isAttributeSet(zot, 121, 28)).toBe(true);
  expect(zo.isAttributeSet(zot, 128, 13)).toBe(true);

  // some setting of attributes
  zo.setAttribute(zot, 128, 13, false);
  expect(zo.isAttributeSet(zot, 128, 13)).toBe(false);
  zo.setAttribute(zot, 128, 13, true);
  expect(zo.isAttributeSet(zot, 128, 13)).toBe(true);

  zo.setAttribute(zot, 120, 6, false);
  expect(zo.isAttributeSet(zot, 120, 6)).toBe(false);
  zo.setAttribute(zot, 128, 6, true);
  expect(zo.isAttributeSet(zot, 128, 6)).toBe(true);

  expect(zo.getObjectShortName(zot, 88)).toBe('Up a Tree');
  expect(zo.getObjectShortName(zot, 82)).toBe('');

  // now read short names in proprety tables
  expect(zo.getPropertyTableHeader(zot, 1).shortName).toBe('pair of hands');
  expect(zo.findPropertyAddr(zot, 1, 18).addr).toBe(0xbc2);
  expect(zo.findPropertyAddr(zot, 1, 16).addr).toBe(0xbc9);
  expect(zo.findPropertyAddr(zot, 1, 2).addr).toBe(0);

  // property addresses
  expect(zo.getObjFieldAddr(zot, 1));

  // now next property tests
  expect(zo.findNextProperty(zot, 87, 0)).toBe(18);
  expect(zo.findNextProperty(zot, 87, 18)).toBe(17);
  expect(zo.findNextProperty(zot, 87, 17)).toBe(16);
  expect(zo.findNextProperty(zot, 87, 16)).toBe(14);
  expect(zo.findNextProperty(zot, 87, 14)).toBe(13);
  expect(zo.findNextProperty(zot, 87, 13)).toBe(12);
  expect(zo.findNextProperty(zot, 87, 12)).toBe(10);
  expect(zo.findNextProperty(zot, 87, 10)).toBe(0);

  expect(() => {
    zo.findNextProperty(zot, 87, 15);
  }).toThrow();
  expect(() => {
    zo.findNextProperty(zot, 87, 5);
  }).toThrow();

  // various things around property blocks
  expect(zo.getPropertiesAddr(zot, 95)).toBe(0x1403);
  expect(zo.getPropertyTableHeader(zot, 95)).toEqual({
    len: 16,
    shortName: "ZORK owner's manual",
    firstPropertyAddress: 0x1414
  });
  let header = zo.getPropertyTableHeader(zot, 95);
  let info = zo.getPropertyBlockInfo(zot, header.firstPropertyAddress);
  expect(info).toEqual({ length: 6, addr: 0x1415, id: 18, sizeLen: 1 });
  expect(zo.getPropertyLengthFromAddr(zot, 0x1415)).toBe(6);

  expect(zo.findPropertyAddr(zot, 95, 16).addr).toBe(0x141c);
  expect(zo.findPropertyAddr(zot, 95, 16).length).toBe(3);
  expect(zo.getPropertyLengthFromAddr(zot, 0x141c)).toBe(3);
  // none of these test property addresses for a v4+ file,
  // need to do that
});

test('object property defaults', () => {
  expect(zo.getObjectDefaultProperty(zot, 0)).toBe(0);
  expect(zo.getObjectDefaultProperty(zot, 15)).toBe(5);
});
