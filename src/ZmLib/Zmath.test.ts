import * as zmath from './Zmath';

test('add with modulo', () => {
  expect(zmath.add(2, 3)).toBe(5);
  expect(zmath.add(0xffff, 1)).toBe(0);
  expect(zmath.add(0x7fff, 1)).toBe(0x8000);
});

test('sub with modulo', () => {
  expect(zmath.sub(2, 3)).toBe(0xffff);
  expect(zmath.sub(0xffff, 1)).toBe(0xfffe);
  expect(zmath.sub(5, 3)).toBe(2);
  expect(zmath.sub(2, 5)).toBe(zmath.convertTo16(-3));
  // be sure overflow is dealt with
  expect(zmath.sub(0x10000, 1)).toBe(0xffff);
  expect(zmath.sub(0x8000, 1)).toBe(0x7fff);
});

test('mult with modulo', () => {
  expect(zmath.mul(2, 3)).toBe(6);
  expect(zmath.mul(0xffff, 1)).toBe(0xffff);
  expect(zmath.mul(0xffff, 2)).toBe(0xfffe);
  // maybe unexpected, but correct, don't multiply big negative
  // numbers by another negative, but at least you get a positive value out
  expect(zmath.mul(0xffff, -2)).toBe(2);
});

test('div with modulo', () => {
  expect(zmath.div(2, 3)).toBe(0);
  expect(zmath.div(6, 2)).toBe(3);
  expect(zmath.div(5, 3)).toBe(1);
  expect(zmath.div(6, zmath.convertTo16(-2))).toBe(zmath.convertTo16(-3));
  // well integer division isn't well defined, so in languages like python,
  // we get -1, so I'm just not sure what the architecture should do really,
  // here we round towards -infinity, so it becomes -1, instead of +infinity
  // which would make it 0. Javascripts Math.floor rounds to -infinity so we
  // get this python-like result--will this affect games?!
  expect(zmath.div(0xffff, 5)).toBe(zmath.convertTo16(-1));
});

test('convertToNum', () => {
  expect(zmath.convertToNum(0x8000)).toBe(-32768);
  expect(zmath.convertToNum(zmath.add(0x7fff, 1))).toBe(-32768);
  expect(zmath.convertToNum(0xfffe)).toBe(-2);
});

test('comparisons', () => {
  expect(zmath.eq(1, 1)).toBe(true);
  expect(zmath.gt(2, 1)).toBe(true);
  expect(zmath.lt(1, 2)).toBe(true);
  expect(zmath.ge(2, 1)).toBe(true);
  expect(zmath.ge(2, 2)).toBe(true);
  expect(zmath.le(1, 2)).toBe(true);
  expect(zmath.le(1, 1)).toBe(true);

  /* some negatives to be sure that's working */
  expect(zmath.eq(1, -1)).toBe(false);
  expect(zmath.gt(2, -1)).toBe(true);
  expect(zmath.lt(-1, 2)).toBe(true);
  expect(zmath.ge(2, -1)).toBe(true);
  expect(zmath.ge(2, 0xfffe)).toBe(true);
  expect(zmath.le(0, 2)).toBe(true);
  expect(zmath.le(-1, -1)).toBe(true);
  expect(zmath.lt(0xffff, 0)).toBe(true);
});

test('random', () => {
  zmath.switchToSeeded(12340981);
  expect(zmath.random()).toBe(-6262);
});

test('bitwise ops', () => {
  expect(zmath.or(0xff, 0xff00)).toBe(0xffff);
  expect(zmath.and(0xff, 0xff00)).toBe(0);
  expect(zmath.not(0xff00)).toBe(0xff);
  expect(zmath.not(0xff)).toBe(0xff00);
  expect(zmath.not(0x5555)).toBe(0xaaaa);
});

test('14 bit tests', () => {
  expect(zmath.convert14BitToNum(1)).toBe(1);
  expect(zmath.convert14BitToNum(0)).toBe(0);
  expect(zmath.convert14BitToNum(0x3fff)).toBe(-1);
  expect(zmath.convert14BitToNum(0x3fff - 1)).toBe(-2);
  expect(zmath.convert14BitToNum(0x3fff - 5)).toBe(-6);
  expect(zmath.convert14BitToNum(0x1fff)).toBe(0x1fff);
});

test('16 bit signed conversion tests', () => {
  expect(zmath.convertToNum(0)).toBe(0);
  expect(zmath.convertToNum(1)).toBe(1);
  expect(zmath.convertToNum(0xffff)).toBe(-1);
  expect(zmath.convertToNum(0xffff - 1)).toBe(-2);
  expect(zmath.convertToNum(0xffff - 1)).toBe(-2);
  expect(zmath.convertToNum(0x7fff)).toBe(0x7fff);
});

test('byteCompare', () => {
  let a1 = new Uint8Array([253, 245, 231, 200]);
  let a2 = new Uint8Array([123, 245, 231, 201]);
  expect(zmath.compareBytes(a1, 0, a2, 0, 4)).toBe(1);
  expect(zmath.compareBytes(a1, 1, a2, 1, 3)).toBe(-1);
  expect(zmath.compareBytes(a1, 1, a2, 1, 2)).toBe(0);
});
