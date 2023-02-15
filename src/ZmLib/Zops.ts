/**
 * Zops handles reading and parsing z-machine opcodes.
 */

import * as zf from './ZFile';

/* defines the enum types */
enum OperandType {
  LargeConstant = 0b00,
  SmallConstant = 0b01,
  Variable = 0b10,
  Ommited = 0b11
}

/* gets the bit at the given location */
export function getBit(num: number, bit: number) {
  return (num & (1 << bit)) >> bit;
}

/* returns a range of bits between min and max (inclusive) */
export function getBitRange(num: number, minBit: number, maxBit: number) {
  let acc = 0;
  for (let i = minBit; i <= maxBit; i++) {
    acc += Math.pow(2, i);
  }
  return (num & acc) >> minBit;
}

/* used to grab the opcode at a particular location in memory */
export function parseOpcode(memory: Uint8Array, addr: number) {
  let opcodeByte1 = memory[addr];

  // if it's this, then the opcode is the 'extended form' so we
  // have to do differen things than the usual
  if (zf.getVersionNum(memory) >= 5 && opcodeByte1 === 0xbe) {
  } else {
    // grab the topmost 2 bits
    let form = opcodeByte1 >> 6;
    switch (form) {
      case 0b10:
        console.log('short form');
        return parseShortOpcode(memory, addr);
      case 0b11:
        console.log('variable form');
        return parseVariableOpcode(memory, addr);
      default:
        console.log('long form');
        return parseLongOpcode(memory, addr);
    }
  }
}

export function parseShortOpcode(memory: Uint8Array, addr: number) {
  // at this point we know it's a short opcode, so we want bits 4 and 5
  let countBits = (memory[addr] & 0b00110000) >> 4;

  switch (countBits) {
    case 0b00:
      console.log('1 large constant');
      break;
    case 0b01:
      console.log('1 small consant');
      break;
    case 0b10:
      console.log('variable constants');
      break;
    case 0b11:
      console.log('no operands');
      break;
    default:
      throw Error('bad things!');
  }
  if (countBits === 0b11) {
    console.log('no operands');
  } else {
    console.log('operand cound is 1OP');
  }

  console.log('opcode is: ' + (memory[addr] & 0xf).toString(16));

  return 0;
}

export function parseLongOpcode(memory: Uint8Array, addr: number) {
  let fstOpType = getBit(memory[addr], 6);
  let sndOpType = getBit(memory[addr], 5);

  if (fstOpType === 0) {
    console.log('first operand is a small constant');
  } else {
    console.log('first operand is a variable');
  }

  if (sndOpType === 0) {
    console.log('second operand is a small constant');
  } else {
    console.log('second operand is a variable');
  }

  switch (getBitRange(memory[addr], 0, 5)) {
    case 0x0:
      console.log('null op');
      break;
    case 0x1:
      console.log('je a b ?(label)');
      break;
    case 0x2:
      console.log('jl a b ?(label)');
      break;
    case 0x3:
      console.log('jg a b ?(label)');
      break;
    default:
      throw Error('bad things!');
  }
}

export function parseVariableOpcode(memory: Uint8Array, addr: number) {
  let nextByte = memory[addr + 1];
  let opTypes = [];
  // get each of the op types
  let foundEnd = false;
  while (!foundEnd) {
    for (let i = 6; i >= 0; i -= 2) {
      switch (getBitRange(nextByte, i, i + 1)) {
        case 0b00:
          opTypes.push(OperandType.LargeConstant);
          break;
        case 0b01:
          opTypes.push(OperandType.SmallConstant);
          break;
        case 0b10:
          opTypes.push(OperandType.Variable);
          break;
        case 0b11:
          foundEnd = true;
          break;
        default:
          throw Error('bad things!');
      }
    }

    if (!foundEnd) {
      addr++;
      nextByte = memory[addr];
    }
  }

  console.log('found ' + opTypes.length + ' operand types');
}

/* this assumes you're addr is the byte of the operands for the branch */
export function parseBranchOffset(memory: Uint8Array, addr: number) {
  // grab the first byte
  let fstByte = memory[addr];

  let res = {
    branchIf: getBit(fstByte, 7) === 1,
    offset: getBitRange(fstByte, 0, 6),
    length: 1
  };

  // if bit 6 is 0, the offset is the lower 6 bits plus the byte following
  // so we left-shift offset by 8 bits and add the next byte to it, and
  // we also add one more byte to the total consumed by this action
  if (getBit(fstByte, 6) === 0) {
    res.offset = (res.offset << 8) | memory[addr + 1];
    res.length = 2;
  }

  return res;
}

//  export function longOpcode(byte: number)
//  {
//      switch (byte)
//      {
//         case 0:
//             return 5;
//      }
//  }
