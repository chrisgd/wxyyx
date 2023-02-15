/**
 *  This module simply implements math the way the zmachine expects, which
 *  is mostly like JavaScript, except that actual integers are used.
 */

import * as Rnd from 'seedrandom';

/**
 * returns integer division of x by y
 * @param x numerator
 * @param y divisor (denominator)
 */
export function div(x: number, y: number): number {
  if (y === 0) {
    throw Error('Divide by zero');
  }
  return convertTo16(convertToNum(x) / convertToNum(y));
}

/**
 * returns the remainder (modulus) of x / y using integer division
 * @param x numerator
 * @param y divisor (denominator)
 */
export function mod(x: number, y: number): number {
  if (y === 0) {
    throw Error('Divide (modulus) by zero');
  }
  return convertTo16(x % y);
}

/**
 * Returns the 16-bit x + y integer addition (i.e., modulo 0x10000)
 * @param x left operand to add
 * @param y right operand to add
 */
export function add(x: number, y: number): number {
  let res = Math.floor(x) + Math.floor(y);
  return res % 0x10000;
}

/**
 * Returns the 16-bit x - y integer subtraction (i.e., modulo 0x10000)
 * @param x left operand to subtract
 * @param y right operand to subtract
 */
export function sub(x: number, y: number): number {
  let res = Math.floor(x) - Math.floor(y);
  return convertTo16(res);
}

/**
 * Returns the 16-bit x * y integer multiplication (i.e., modulo 0x10000)
 * @param x left operand to multiply
 * @param y right operand to multiply
 */
export function mul(x: number, y: number): number {
  let res = convertToNum(x) * convertToNum(y);
  return convertTo16(res);
}

/**
 * Performs bitwise and on the values, x & y
 * @param x left operand for bitwise and
 * @param y right operand for bitwise and
 */
export function and(x: number, y: number): number {
  return x & y;
}

/**
 * Performs bitwise or on the values, x | y
 * @param x left operand for bitwise or
 * @param y right operand for bitwise or
 */
export function or(x: number, y: number): number {
  return x | y;
}

/**
 * Performs bitwise or on the values, ^x
 * @param x value to perform bitwise not on
 */
export function not(x: number): number {
  return convertTo16(~x);
}

/**
 * Returns the 16-bit equality comparison x === y (i.e., modulo 0x10000)
 * @param x left operand to compare
 * @param y right operand to compare
 */
export function eq(x: number, y: number): boolean {
  return Math.floor(x) % 0x10000 === Math.floor(y) % 0x10000;
}

/**
 * Converts a javascript number to a 16-bit representation. Note,
 * this handles negatives just fine.
 * @param x javascript number to convert to 16-bits
 */
export function convertTo16(x: number): number {
  let newx = Math.floor(x) % 0x10000;
  if (newx < 0) return 65536 + newx;
  else return newx;
}

/**
 * This is useful because a negative 16-bit value will just look like
 * a positive value in javascript. This ensures the sign of the 16-bit
 * value carries over.
 * @param x 16-bit value to convert to a javascript number
 */
export function convertToNum(x: number): number {
  let newx = x;
  // if this bit is set, it's a negative 14-bit value
  if (newx & 0x8000) {
    newx &= 0x7fff;
    newx |= ~0x7fff;
  }
  return newx;
  // let newx = Math.floor(x) % 0x10000;
  // if (newx & 0x8000) {
  //     let res = -(65536 - newx);
  //     return res;
  // } else {
  //     return newx;
  // }
}

/**
 * This is used by routines like branch that have a 14-bit offset--well,
 * this 14-bit value is signed, so we have to figure out what the equivalent
 * javascript number is
 * @param x the number to convert
 */
export function convert14BitToNum(x: number): number {
  let newx = x;
  // if this bit is set, it's a negative 14-bit value
  if (newx & 0x2000) {
    newx &= 0x1fff;
    newx |= ~0x1fff;
  }
  return newx;
}

/**
 * Returns the 16-bit greater-than comparison x > y (i.e., modulo 0x10000)
 * @param x left operand to compare
 * @param y right operand to compare
 */
export function gt(x: number, y: number): boolean {
  return convertToNum(x) > convertToNum(y);
}

/**
 * Returns the 16-bit < comparison (x < y) (i.e., modulo 0x10000)
 * @param x left operand to compare
 * @param y right operand to compare
 */
export function lt(x: number, y: number): boolean {
  return convertToNum(x) < convertToNum(y);
}

/**
 * Returns the 16-bit >= comparison (x >= y) (i.e., modulo 0x10000)
 * @param x left operand to compare
 * @param y right operand to compare
 */
export function ge(x: number, y: number): boolean {
  return convertToNum(x) >= convertToNum(y);
}

/**
 * Returns the 16-bit <= comparison (x <= y) (i.e., modulo 0x10000)
 * @param x left operand to compare
 * @param y right operand to compare
 */
export function le(x: number, y: number): boolean {
  return convertToNum(x) <= convertToNum(y);
}

/* the z-machine requires a seeded and non-seeded version of a random
   number generator--this provides it internally */
let now = new Date();
var rndGen = Rnd.alea(now.toString() + now.getTime());

/**
 * Turns the normal random number generator into a seeded one with the
 * given seed n
 * @param n the seed for the rng
 */
export function switchToSeeded(n: number): void {
  rndGen = Rnd.alea(n.toString());
}

/**
 * Switches the RNG back to a regular random one (vs being seeded)
 */
export function switchToRandom(): void {
  rndGen = Rnd.alea(now.toString() + now.getTime());
}

/**
 * Returns a random number in the range of -32768 to 32767
 */
export function random(): number {
  // 32768 is the minimum 16-bit integer
  let res = Math.floor(rndGen() * 0xffff) - 32768;
  //console.log('random: ' + res);
  return res;
}

export function randomRange(range: number) {
  let res = Math.floor(rndGen() * (range - 1)) + 1;
  return res;
}

/**
 * This compares two sequences of bytes as if they were big-endian
 * numbers, so the first byte is the highest byte, while the last
 * byte is the least significant. It returns 0 if they are the same,
 * 1 if arr1 > arr2, and -1 if arr1 < arr2. Both arrays must have a
 * number of bytes > len (which indicates how many bytes to compare)
 * @param arr1 the left-hand side of the comparison
 * @param a1Start the starting byte of arr1 to compare
 * @param arr2 the right-hand side of the comparison
 * @param a2Start the starting byte of arr2 to compare
 * @param len the number of bytes to compare
 */
export function compareBytes(
  arr1: Uint8Array,
  a1Start: number,
  arr2: Uint8Array,
  a2Start: number,
  len: number
) {
  for (let i = 0; i < len; i++) {
    if (arr1[a1Start + i] > arr2[a2Start + i]) return 1;
    else if (arr1[a1Start + i] < arr2[a2Start + i]) return -1;
  }
  return 0;
}
