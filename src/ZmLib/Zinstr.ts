/* This module implements instructions on the zMachine, really it's just so
 * we don't end up with one gigantic file.
 */
import * as zop from './Zops';
import * as Zm from './ZMachine';
import { zMachine, InfoStr } from './ZMachine';
import * as zot from './ZObjTable';
import * as zstr from './Strings';
import * as zmath from './Zmath';
import * as Stack from '../StackUint16/StackUint16';
import * as Zf from './ZFile';

export const BIT_0 = 1 << 0;
export const BIT_1 = 1 << 1;
export const BIT_2 = 1 << 2;
export const BIT_3 = 1 << 3;
export const BIT_4 = 1 << 4;
export const BIT_5 = 1 << 5;
export const BIT_6 = 1 << 6;
export const BIT_7 = 1 << 7;

export const BITS_67 = 0xc0;
export const BITS_45 = 0x30;
export const BITS_23 = 0x0c;
export const BITS_01 = 0x03;
export const BITS_0TO4 = 0x1f;
export const BITS_0TO3 = 0x0f;
export const BITS_0TO5 = 0x1f;

export const LARGE_CONSTANT_TYPE = 0;
export const SMALL_CONSTANT_TYPE = 1;
export const VARIABLE_TYPE = 2;
export const END_TYPE = 3;

/**
 * returns a string representation of the operand
 * @param opty the operand type
 */
export function tyToStr(opty: number, val: number) {
  switch (opty) {
    case LARGE_CONSTANT_TYPE:
      return '#' + val.toString(16) + ' ';
    case SMALL_CONSTANT_TYPE:
      return '#' + val.toString(16) + ' ';
    case VARIABLE_TYPE:
      return '(' + varToString(val) + ') ';
    case END_TYPE:
      return 'END TYPE';
    default:
      return 'INVALID TYPE';
  }
}
/**
 * This takes a byte address where the variable is stored, which will
 * be 1-byte long, 0x00 to 0xFF, and then it resolves its location and
 * returns the value. Note, this also advances the program counter!
 * @param zvm the zMachine we are working with
 * @param loc the loction in memory to read the variable from
 */
export function readVariable(zvm: zMachine) {
  // it's an indirect call at the given variable, which is a byte
  let varLoc = Zm.readByte(zvm); //zvm.bytes[zvm.pc];
  let varVal = Zm.getVariable(zvm, varLoc);
  //Zm.debugMsg(zvm, 'local at ' + varLoc.toString(16) + ' is ' + varVal.toString(16));
  return varVal;
}

/**
 * Read operand takes an opType and assumes the PC is in the right location,
 * so it determines how many bytes to read and advances the PC. It returns null
 * and doesn't advance if the opType turns out to be 0b11.
 * @param zvm the zMachine we are working with
 * @param opType the type of the operand, 0b00, 0b01, 0b10, or 0b11
 */
export function readOperand(
  zvm: zMachine,
  opType: number,
  info?: { str: string },
  opcode?: number,
  byRef: boolean = false
) {
  let opVal = null;
  switch (opType) {
    // first operand is a long constant
    case LARGE_CONSTANT_TYPE:
      // read the large constant, which advances the PC
      opVal = Zm.readWord(zvm);
      if (info) {
        switch (opcode) {
          case 0x11:
          case 0x12:
          case 0x13:
          case 0x0a:
          case 0x0b:
          case 0x0c:
          case 0x0e:
            // this is for objects
            info.str +=
              '"' +
              zot.getObjectShortName(zvm.objectTable, opVal) +
              '" (#' +
              opVal.toString(16) +
              ') ';
            break;
          case 0x19:
          case 0x1a:
            info.str +=
              Zm.calculatePackedRoutineAddress(zvm, opVal).toString(16) + ' ';
            break;
          default:
            info.str += '#' + opVal.toString(16) + ' ';
            break;
        }
      }
      if (info && zvm.standardDictionary.entriesByAddr[opVal] !== undefined) {
        info.str +=
          '"' + zvm.standardDictionary.entriesByAddr[opVal].str + '" ';
      }
      return opVal;
    case SMALL_CONSTANT_TYPE:
      // read the small constant
      opVal = Zm.readByte(zvm);
      // record info differently if it was opcode 0xD
      if (info) {
        if (opcode === 0xd) {
          info.str +=
            varToString(opVal) + ' (' + Zm.peekVariable(zvm, opVal) + ') ';
        } else {
          info.str += '#' + opVal.toString(16) + ' ';
        }
      }
      if (info && zvm.standardDictionary.entriesByAddr[opVal] !== undefined) {
        info.str +=
          '"' + zvm.standardDictionary.entriesByAddr[opVal].str + '" ';
      }
      return opVal;
    case VARIABLE_TYPE:
      // read a variable, no need to increment program counter because readVariable does it for us
      opVal = readVariable(zvm);

      // if this is byRef, which 7 instructions do, then opVal actually refers to the variable
      // we want to read, it's not opVal itself, so we have one more indirection to do
      if (byRef) {
        if (info) {
          info.str += '[' + varToString(opVal) + '] ';
        }
        // indirect references to the stack don't push or pop it
        if (opVal === 0) {
          opVal = Stack.top(zvm.stack);
        } else {
          // otherwise, just get the variable
          opVal = Zm.getVariable(zvm, opVal);
        }

        if (info) {
          info.str += '(' + varToString(opVal) + ') ';
        }
      } else if (info) {
        // now convert it as necessary
        switch (opcode) {
          case 0x19:
          case 0x1a:
            info.str +=
              varToString(Zm.getByte(zvm, zvm.pc - 1)) +
              ' (' +
              Zm.calculatePackedRoutineAddress(zvm, opVal).toString(16) +
              ') ';
            break;
          default:
            info.str +=
              varToString(Zm.getByte(zvm, zvm.pc - 1)) +
              ' (' +
              opVal.toString(16) +
              ') ';
            break;
        }
      }
      if (info && zvm.standardDictionary.entriesByAddr[opVal] !== undefined) {
        info.str +=
          '"' + zvm.standardDictionary.entriesByAddr[opVal].str + '" ';
      }
      return opVal;
    case END_TYPE:
      return null;
    default:
      // in this case, we are done with reading ops
      throw Error(
        'unexpected type when reading operand at ' + zvm.pc.toString(16)
      );
  }
}

/**
 *
 * @param zvm the z-machine we are working with
 * @param opType the type of the opreand
 */
export function readOperandExact(
  zvm: zMachine,
  opType: number,
  info?: { str: string },
  opcode?: number,
  byRef: boolean = false
) {
  let op = readOperand(zvm, opType, info, opcode, byRef);
  if (op !== null) {
    return op;
  } else {
    throw Error('expected a non-null operand');
  }
}

/**
 * A var type has a byte which represents the types of the operands. Typically it
 * has less than 4 operands, and since one byte represents up to 4 operand types,
 * a single call using this byte and the possible operands will extract those types.
 * @param opByte the operand type byte--really only for VAR forms of instructions
 * @param ops a structure to hold all the ops so they're passed in by reference
 */
export function getVarTypes(
  opByte: number,
  ops: { op1: number; op2: number; op3: number; op4: number }
) {
  ops.op1 = (opByte & BITS_67) >> 6;
  ops.op2 = (opByte & BITS_45) >> 4;
  ops.op3 = (opByte & BITS_23) >> 2;
  ops.op4 = opByte & BITS_01;
}

/**
 * This function is for reading the operands for version 5 and later for special two byte var functions
 * @param zvm the zMachine we are working with
 */
export function readOperandsV5(zvm: zMachine): number[] {
  let opTys = [];

  // get the byte and the types
  let op1ty = 0;
  let op2ty = 0;
  let op3ty = 0;
  let op4ty = 0;
  do {
    // read the byte, see if there are more
    let opByte = Zm.readByte(zvm);
    op1ty = (opByte & BITS_67) >> 6;
    op2ty = (opByte & BITS_45) >> 4;
    op3ty = (opByte & BITS_23) >> 2;
    op4ty = opByte & BITS_01;

    // then conditionally push them to the array
    if (op1ty !== END_TYPE) opTys.push(op1ty);
    if (op2ty !== END_TYPE) opTys.push(op2ty);
    if (op3ty !== END_TYPE) opTys.push(op3ty);
    if (op4ty !== END_TYPE) opTys.push(op4ty);
  } while (op4ty !== END_TYPE);

  // at this point, the bytes will have all been read
  let operands = opTys.map(ty => {
    return readOperand(zvm, ty);
  });

  // we are coercing here since we're sure it won't return a null operand
  return operands as number[];
}

/**
 * Implements the call_1s function call, which calls a function with one argument,
 * and this argument will be the routine address
 * @param zvm the z-machine we are working with
 * @param addr the address we are calling
 */
export function call1(
  zvm: zMachine,
  op1: number,
  store: boolean,
  info?: { str: string }
) {
  let funAddr = Zm.calculatePackedRoutineAddress(zvm, op1);
  if (info) {
    info.str += '(' + funAddr.toString(16) + ') ';
  }

  let storeLoc = -1;
  // get the storage location if there is one
  if (store) {
    storeLoc = Zm.readByte(zvm);
    if (info) {
      info.str += ' -> ' + varToString(storeLoc);
    }
  }

  // now push the stack frame
  let count = Zm.pushStackFrame(zvm, funAddr, storeLoc);

  // and then update the program counter, which is the 1 byte for the
  // local count and count * 2 since they are 16-bit words)
  zvm.pc = funAddr + 1 + count * 2;
}

export function call2Var(
  zvm: zMachine,
  store: boolean,
  opcode: number,
  info?: { str: string }
) {
  // get the type
  let [op1, op2] = read2OP(zvm, info, opcode);

  call2(zvm, op1, op2, store, info);
}

export function call2(
  zvm: zMachine,
  op1: number,
  op2: number,
  store: boolean,
  info?: { str: string }
) {
  let funAddr = Zm.calculatePackedRoutineAddress(zvm, op1);

  let storeLoc = -1;
  // get the storage location if there is one
  if (store) {
    storeLoc = Zm.readByte(zvm);
    if (info) {
      info.str += ' -> ' + varToString(storeLoc);
    }
  }

  // now push the stack frame
  let count = Zm.pushStackFrame(zvm, funAddr, storeLoc);

  // and we have just one argument
  Zm.storeVariable(zvm, 1, op2);

  // and then update the program counter, which is the 1 byte for the
  // local count and count * 2 since they are 16-bit words)
  zvm.pc = funAddr + 1 + count * 2;

  Zm.debugMsg(zvm, 'frame: ' + Zm.getStackFrameAsString(zvm));
}

/**
 * This function, like call_vn2, has a 2nd byte of information for arguments
 * so that the function can take up to 8 total arguments.
 * @param zvm the z-machine we are working with
 */
export function call_vs2(
  zvm: zMachine,
  store: boolean,
  info?: { str: string }
) {
  let op1Byte = Zm.readByte(zvm);
  let op2Byte = Zm.readByte(zvm);

  let funAddrTy = (op1Byte & BITS_67) >> 6;
  let funAddrBase = readOperandExact(zvm, funAddrTy, info);
  let funAddr = Zf.calculatePackedAddress(zvm.bytes, funAddrBase, true, false);
  if (info) {
    info.str += '[' + funAddr.toString(16) + '] ';
  }

  // well, try to parse the args as needed
  let args = [];
  args.push(readOperand(zvm, (op1Byte & BITS_45) >> 4, info));
  args.push(readOperand(zvm, (op1Byte & BITS_23) >> 2, info));
  args.push(readOperand(zvm, op1Byte & BITS_01, info));
  args.push(readOperand(zvm, (op2Byte & BITS_67) >> 6, info));
  args.push(readOperand(zvm, (op2Byte & BITS_45) >> 4, info));
  args.push(readOperand(zvm, (op2Byte & BITS_23) >> 2, info));
  args.push(readOperand(zvm, op2Byte & BITS_01, info));

  // now grab the byte for storage if needed
  let storageByte = -1;
  if (store) {
    storageByte = Zm.readByte(zvm);
    if (info) {
      info.str += '-> ' + varToString(storageByte);
    }
  }

  // if the funAddr is 0, then just store false if needed
  if (funAddr === 0) {
    // just store 'false' wherever the instruction was coded to drop the result
    if (store) {
      Zm.storeVariable(zvm, storageByte, 0);
    }
    return;
  }

  // now push the stack frame, which needs the address of this function to fill
  // out variables and the
  let count = Zm.pushStackFrame(zvm, funAddr, storageByte);

  for (let i = 0; i < args.length; i++) {
    if (args[i] === null) break;
    // otherwise, store it in the stack frame
    Zm.storeVariable(zvm, i + 1, args[i] as number);
  }

  // print out a frame msg
  Zm.debugMsg(zvm, 'frame: ' + Zm.getStackFrameAsString(zvm));

  // and now set the program counter to our new address, which should be one
  // byte after the procedure start (since the first byte is the number of
  // local variables for the procedure). In addition, it's 2 * the number of
  // locals since these are stored in the routine itself. One exception:
  // the function call to address 0 does nothing--hahaha.

  zvm.pc = funAddr + 1 + count * 2;
  //Zm.debugMsg(zvm, 'new PC is: ' + zvm.pc.toString(16));
}

/**
 * Evaluates a call instruction, note that only call_vs2 and call_vn2 have more than
 * for arguments, so we never need more than that, but we do expect up to 4 arguments
 * @param zvm the z-machine we are working with
 */
export function call(zvm: zMachine) {
  // call takes 0 to 4 arguments, which are in the next 8 bits, 2 bits each
  let callAddr = zvm.pc - 1;
  //Zm.debugMsg(zvm, 'op is ' + op.toString(16) + ' at address ' + callAddr.toString(16));
  let opByte = Zm.readByte(zvm);
  // operands could start at this byte, possibly

  let funAddrTy = (opByte & BITS_67) >> 6;
  let op1ty = (opByte & BITS_45) >> 4;
  let op2ty = (opByte & BITS_23) >> 2;
  let op3ty = opByte & BITS_01;
  //Zm.debugMsg(zvm, 'op3ty: 0b' + op3ty.toString(2));
  // we really expect it to be an actual routine address, not a byte offset
  // which would be totally jenky, but maybe? happens
  let funAddr = 0;
  let info = {
    str: callAddr.toString(16) + (zvm.version < 4 ? ': call ' : ': call_vs ')
  };
  switch (funAddrTy) {
    case 0:
      // large constant, it should be where the PC is currently, but it's a
      // packed address, so we have to decode it first
      funAddr = Zm.getPackedRoutineAdddress(zvm, zvm.pc);
      //Zm.debugMsg(zvm, 'call long constant address at ' + zvm.pc.toString(16) + ' is ' + funAddr.toString(16));
      // now jump by 2 bytes since we read that off
      // add the address to info
      info.str += funAddr.toString(16) + ' ';
      zvm.pc += 2;
      // it's always an address
      break;
    case 0b01:
      // small constant, this seems odd
      throw Error('calling to a small constant is not expected');
    case 0b10:
      // it's an indirect call at the given variable, which is a byte,
      // and note that it advances the PC appropriately
      let addrBase = readVariable(zvm);
      funAddr = Zf.calculatePackedAddress(zvm.bytes, addrBase, true, false);
      info.str +=
        varToString(Zm.getByte(zvm, zvm.pc - 1)) +
        ' (' +
        funAddr.toString(16) +
        ') ';
      //Zm.debugMsg(zvm, 'call var address at ' + zvm.pc.toString(16) + ' is ' + funAddr.toString(16));
      break;
    default:
      throw Error('function call address type is invalid ' + funAddrTy);
  }

  // now we can parse the operands which come next
  let op1Val = readOperand(zvm, op1ty, info);
  let op2Val = readOperand(zvm, op2ty, info);
  let op3Val = readOperand(zvm, op3ty, info);

  // after this, the next byte is where things are stored,
  // its a variable number 0x00 to 0xff
  let storageByte = Zm.readByte(zvm);

  //let msg = 'call (' + op.toString(16) + '): 0b' + opByte.toString(2) + ' to ' + funAddr.toString(16)
  //          + ' with operands ';

  // now log the call
  Zm.debugMsg(zvm, info.str + '-> ' + varToString(storageByte));
  // in all of this, if the function call address is 0, we 'return 0', i.e., we'll
  // put false wherever the storage is pointing to
  if (funAddr === 0) {
    // just store 'false' wherever the instruction was coded to drop the result
    Zm.storeVariable(zvm, storageByte, 0);
    return;
  }

  // now push the stack frame, which needs the address of this function to fill
  // out variables and the
  let count = Zm.pushStackFrame(zvm, funAddr, storageByte);

  // now try to write the operands into the new frame
  if (op1Val !== null) {
    Zm.storeVariable(zvm, 1, op1Val);
  }
  if (op2Val !== null) {
    Zm.storeVariable(zvm, 2, op2Val);
  }
  if (op3Val !== null) {
    Zm.storeVariable(zvm, 3, op3Val);
  }

  Zm.debugMsg(zvm, 'frame: ' + Zm.getStackFrameAsString(zvm));

  //Zm.debugMsg(zvm, msg + ' and stored in ' + varToString(storageByte));

  // and now set the program counter to our new address, which should be one
  // byte after the procedure start (since the first byte is the number of
  // local variables for the procedure). In addition, it's 2 * the number of
  // locals since these are stored in the routine itself. One exception:
  // the function call to address 0 does nothing--hahaha.

  zvm.pc = funAddr + 1 + count * 2;
  //Zm.debugMsg(zvm, 'new PC is: ' + zvm.pc.toString(16));
}

export function varToString(num: number) {
  if (num === 0) return 'sp';
  else if (num < 0x10) return 'L' + (num - 1).toString(16);
  else return 'g' + (num - 0x10).toString(16);
}

export function jump(zvm: zMachine, offset: number, info?: { str: string }) {
  // branches are offset - 2
  let newOffset = zmath.convertToNum(offset) - 2;
  // then it tries to jump accordingly
  // then set the PC

  zvm.pc += newOffset;
  if (info) {
    info.str += zvm.pc.toString(16);
  }
  //Zm.debugMsg(zvm, 'jump by ' + offset + ' bytes, now ' + newOffset + ' bytes to ' + zvm.pc.toString(16));
}

/**
 * This reads the branch bytes, up to 2, and calculates the offset of the branch.
 * @param zvm the z-machine we are working with
 */
export function readBranchOffset(zvm: zMachine) {
  // read the byte first
  let byte1 = Zm.readByte(zvm);

  // now determine if there's one more byte to read, incrementing the PC as needed
  // (note it's postfix, so it will be incremented after reading it)
  let byte2 = null;
  if ((byte1 & BIT_6) === 0) {
    byte2 = Zm.readByte(zvm);
  }

  // otherwise, calculate the offset
  let offset = 0;
  //let offTy = '';
  if (byte2 === null) {
    // it was a small, 6 bit constant, ie, range 0 to 63
    offset = zop.getBitRange(byte1, 0, 5);
    //Zm.debugMsg(zvm, '5 bit offset of byte ' + byte1.toString(16) + ': ' + offset.toString(16));
  } else {
    offset = (zop.getBitRange(byte1, 0, 5) << 8) | byte2;
    // now convert it to a javascript number so we get negatives
    //Zm.debugMsg(zvm, 'byte1: ' + byte1.toString(16) + ', byte2: ' + byte2.toString(16) + ', offset before conversion: ' + offset.toString(16));
    offset = zmath.convert14BitToNum(offset);

    //Zm.debugMsg(zvm, '14 bit offset: +' + offset);
  }

  return offset;
}

/**
 *
 * @param zvm the zMachine we are working with
 * @param condition whether the comparison was true or false
 */
export function branch(
  zvm: zMachine,
  condition: boolean,
  info?: { str: string }
) {
  // we have already done the comparison and decided to branch, so let's determine branch info
  let byte1 = Zm.getByte(zvm, zvm.pc);
  //Zm.debugMsg(zvm, 'branch info is at byte: ' + (zvm.pc - 1).toString(16) + ' and is ' +
  //            zvm.bytes[zvm.pc].toString(16));

  let branchBit = byte1 & BIT_7;
  let doBranch = false;
  // well, branch bit is 0 if we bitwise-and it with 0x80 and it's not set,
  // or it's 0x80, cause both had the same bit (but the rest of 0x80 are 0s)
  if (
    (branchBit === 0 && condition === false) ||
    (branchBit === BIT_7 && condition === true)
  ) {
    doBranch = true;
  }

  let offset = readBranchOffset(zvm);

  // now determine if there's one more byte to read, incrementing the PC as needed
  // (note it's postfix, so it will be incremented after reading it)
  // let byte2 = null;
  // if ((byte1 & BIT_6) === 0) {
  //     byte2 = Zm.readByte(zvm);
  // }

  // otherwise, calculate the offset
  // let offset = 0;
  // if (byte2 === null)
  // {
  //     // it was a small, 6 bit constant, ie, range 0 to 63
  //     offset = zop.getBitRange(byte1, 0, 5);
  //     //Zm.debugMsg(zvm, '5 bit offset of byte ' + byte1.toString(16) + ': ' + offset.toString(16));
  // } else {
  //     offset = ((zop.getBitRange(byte1, 0, 5) << 8) | byte2);
  //     // now convert it to a javascript number so we get negatives
  //     //Zm.debugMsg(zvm, 'byte1: ' + byte1.toString(16) + ', byte2: ' + byte2.toString(16) + ', offset before conversion: ' + offset.toString(16));
  //     offset = zmath.convert14BitToNum(offset);

  //     //Zm.debugMsg(zvm, '14 bit offset: +' + offset);
  // }

  if (info) {
    info.str += branchBit === 0 ? '~' : '';
    if (offset === 0) info.str += 'rfalse';
    else if (offset === 1) info.str += 'rtrue';
    else info.str += (zvm.pc + offset - 2).toString(16);
  }
  // now we can escape (because we've read all the bytes we need to), or calculate the branch
  if (doBranch === false) {
    //Zm.debugMsg(zvm, 'do branch was false with branchBit ' + ((branchBit >> 7) ? 'true' : 'not') + " so don't branch to "
    //+ (offset + zvm.pc - 2).toString(16) + ', but branch to ' + zvm.pc.toString(16) + ' instead');
    return;
  }

  // now for weird rules: if the offset is 0, it means return false from the current routine,
  // otherwise, if it is 1, it means "return true from the current routine"
  if (offset === 0) {
    // returning false means returning 0
    //Zm.debugMsg(zvm, 'branch results in returning false');
    Zm.popStackFrame(zvm, 0);
  } else if (offset === 1) {
    // returning true means returning 1
    //Zm.debugMsg(zvm, 'branch results in returning true');
    Zm.popStackFrame(zvm, 1);
  } else {
    // otherwise, adjust the frame pointer
    zvm.pc += offset - 2;
    //Zm.debugMsg(zvm, 'branching to ' + zvm.pc.toString(16));
  }
  if (info) info.str += ' >> ' + zvm.pc.toString(16);
}

/**
 * A store can be either a 2-OP or VAR form, this implements the Long form,
 * which has one small consideration: if the first argument is a variable, then
 * it's an 'indirect' refernece, in other words, we read the byte, get the
 * variable, get its value--and that value is the variable we are storing at.
 * In addition, they supposedly write in place, which seems odd when you consider
 * the stack.
 * @param zvm the z-machine we are working with
 * @param opcode the opcode of the store instruction, which we need to handle
 * @param varForm tells us whether the store was a varForm or not, so we know
 * if we need to handle parsing of the operands
 * the store properly.
 */
export function storeLong(
  zvm: zMachine,
  op1: number,
  op2: number,
  byRef: boolean,
  info?: { str: string }
) {
  // at this point, we know it was byRef, meaning we've done the indirection already,
  // so this is in fact the location we want to store to, but if it's indirect, we
  // supposedly don't push to the stack
  if (byRef) {
    if (info) {
      info.str += ' <- ' + op2 + ' WARNING: this is an unusual form';
    }
    if (op1 === 0) {
      Stack.set(zvm.stack, Stack.length(zvm.stack) - 1, op2);
    } else {
      Zm.storeVariable(zvm, op1, op2);
    }
  } else {
    Zm.storeVariable(zvm, op1, op2);
  }
}

/**
 * This function implements storew and storeb instructions, which are basically
 * the same and look like: storew table-address offset <- value, in essence
 * giving you a table/array of locations to store to
 * @param zvm the zMachine we are working with
 * @param instr the instruction used for storing
 */
export function store(
  zvm: zMachine,
  instr: number,
  word: boolean,
  info?: { str: string }
) {
  // if the bit is 0, we have two ops which follow, otherwise we have more, but
  // I don't see how this ever has more, you store by an address, an offset and
  // a value, so it should always have 3
  let opByte = Zm.readByte(zvm);

  // figure out the operand types
  let op1 = zop.getBitRange(opByte, 6, 7);
  let op2 = zop.getBitRange(opByte, 4, 5);
  let op3 = zop.getBitRange(opByte, 2, 3);
  let op4 = zop.getBitRange(opByte, 0, 1);

  // the first should be the table address
  let addr = readOperand(zvm, op1, info);
  //Zm.debugMsg(zvm, 'addr type is ' + op1.toString(2) + ' and is ' + ((addr !== null) ? addr.toString(16) : 'null'));
  let offset = readOperand(zvm, op2, info);
  //Zm.debugMsg(zvm, 'offset type is ' + op2.toString(2) + ' and is ' + offset);
  let val = readOperand(zvm, op3, info);
  //Zm.debugMsg(zvm, 'val type is ' + op3.toString(2) + ' and is ' + val);
  let end = readOperand(zvm, op4, info);
  //Zm.debugMsg(zvm, 'end type is ' + op4.toString(2) + ' and is ' + end);

  if (end !== null) {
    throw Error('4+ arguments for store not implemented');
  }
  if (addr === null || offset === null || val === null) {
    throw Error('not sure how to handle store without 3 arguments');
  }

  //Zm.debugMsg(zvm, 'storing ' + (word ? 'word ' : 'byte ') + val.toString(16) + ' at ' + addr.toString(16) +
  //           ' index ' + offset);
  if (word) Zm.storeWord(zvm, addr, offset, val);
  else Zm.storeByte(zvm, addr, offset, val);
}

export function loadByteOp(
  zvm: zMachine,
  addr: number,
  index: number,
  info?: InfoStr
) {
  return loadOp(zvm, addr, index, false, info);
}

export function loadWordOp(
  zvm: zMachine,
  addr: number,
  index: number,
  info?: InfoStr
) {
  return loadOp(zvm, addr, index, true, info);
}
/**
 * parses a load instruction and loads it into the zmachine as appropriate
 * @param zvm the zMachine we are working with
 * @param instr the instruction for the load
 * @param word a boolean indicating if we are loading a word or byte, true
 * indicates we are loading a word.
 */
export function loadOp(
  zvm: zMachine,
  addr: number,
  index: number,
  word: boolean,
  info?: InfoStr
) {
  // assuming we have the address and index, get the store location
  let storeLoc = Zm.readByte(zvm);

  // now load the result
  let loadedVal = word
    ? Zm.loadWord(zvm, addr, index)
    : Zm.loadByte(zvm, addr, index);

  // get some debug info
  if (info) {
    info.str += '[0x' + (addr + index * 2).toString(16) + '] ';
    info.str += '-> ' + varToString(storeLoc);
    info.str += ' (' + loadedVal.toString(16) + ')';
  }

  // and store it
  Zm.storeVariable(zvm, storeLoc, loadedVal);
}

export function putProperty(
  zvm: zMachine,
  instr: number,
  info: { str: string }
) {
  // read and advance the PC
  let opByte = Zm.readByte(zvm); // zvm.bytes[zvm.pc++];

  //Zm.debugMsg(zvm, 'instr is ' + instr.toString(16) + ', opByte is ' + opByte.toString(16))
  let op1ty = (opByte & BITS_67) >> 6;
  let op2ty = (opByte & BITS_45) >> 4;
  let op3ty = (opByte & BITS_23) >> 2;
  let op4ty = opByte & BITS_01;

  //Zm.debugMsg(zvm, 'op types are 0b' + opByte.toString(2));

  let objID = readOperand(zvm, op1ty);
  // here we are going to read the short name of the object and add it to our info
  if (info && objID) {
    info.str += '"' + zot.getObjectShortName(zvm.objectTable, objID) + '" ';
  }

  //Zm.debugMsg(zvm, 'put property object location ' + (objLoc ? objLoc.toString(16) : ('ty was ' + op1ty.toString(2))));
  let propID = readOperand(zvm, op2ty, info);
  //Zm.debugMsg(zvm, 'put property proprety ' + (objProp ? objProp.toString(16) : '?'));
  let val = readOperand(zvm, op3ty, info);
  //Zm.debugMsg(zvm, 'put property val ' + (val ? val.toString(16) : '?'));

  //Zm.debugMsg(zvm, 'pc is now: ' + zvm.pc.toString(16));
  let end = readOperand(zvm, op4ty);
  if (end !== null) {
    throw Error(
      'Unable to process put property instruction with more than 3 args'
    );
  }

  // now put the property!
  if (objID !== null && propID !== null && val !== null) {
    //Zm.debugMsg(zvm, 'put_prop: setting property for object ' + objID + ' and property ' + propID +
    //             ' to ' + val);
    zot.setProperty(zvm.objectTable, objID, propID, val);
    // just some sanity checking

    if (val !== zot.getProperty(zvm.objectTable, objID, propID))
      throw Error(
        'Setting the property did not return the same result as getting the property'
      );
  } else {
    throw Error(
      'invalid instruction for object table: ' +
        zvm.objectTable +
        ', object ID ' +
        objID +
        ', object property ' +
        propID +
        ', val ' +
        val +
        ' at PC ' +
        zvm.pc.toString(16)
    );
  }
}

/**
 * Implements the test and branch on this attribute.
 * @param zvm the z-machine we are working with
 * @param info the info string to be passed
 */
export function testAttrVar(zvm: zMachine, info: { str: string }) {
  // read the operand types
  let [objID, attr] = read2OP(zvm, info, 0xa);

  // then, we can pretty much use testAttr
  return testAttr(zvm, objID, attr, info);
}

/**
 * Tests and branches on this attribute
 * @param zvm the zMachine we are working with
 * @param objID the object ID we want to look at
 * @param attr the attribute to test
 */
export function testAttr(
  zvm: zMachine,
  objID: number,
  attr: number,
  info: { str: string }
) {
  let isSet = zot.isAttributeSet(zvm.objectTable, objID, attr);
  // now branch!
  branch(zvm, isSet, info);

  if (info) {
    info.str += ': ' + (isSet ? 'true' : 'false');
  }
}

/**
 * This implements the VAR form of set_attr.
 * @param zvm the z-machine we are working with
 * @param info debug messages
 */
export function setAttrVar(zvm: zMachine, info: { str: string }) {
  let [objID, attr] = read2OP(zvm, info, 0xb);
  setAttr(zvm, objID, attr);
}
/**
 * Sets the attribute on the given object
 * @param zvm the zMachine we are working with
 * @param objID the object id we are to set this on
 * @param attr the attribute number
 */
export function setAttr(zvm: zMachine, objID: number, attr: number) {
  zot.setAttribute(zvm.objectTable, objID, attr, true);
}

export function clearAttrVar(zvm: zMachine, info: { str: string }) {
  const [objID, attr] = read2OP(zvm, info, 0xc);
  clearAttr(zvm, objID, attr);
}
/**
 * Sets the attribute on the given object
 * @param zvm the zMachine we are working with
 * @param objID the object id we are to set this on
 * @param attr the attribute number
 */
export function clearAttr(zvm: zMachine, objID: number, attr: number) {
  zot.setAttribute(zvm.objectTable, objID, attr, false);
}

/**
 * Prints the string to the output device, but here we just get the encoded
 * string and let the zmachine handle output
 * @param zvm
 */
export function printZStr(zvm: zMachine, info?: { str: string }) {
  let res = zstr.zToString(zvm, zvm.pc);
  zvm.pc += res.length;
  if (info) {
    info.str += res.str + '"';
  }
  Zm.outputString(zvm, res);
}

/**
 * This function is for parsing a VAR form with 1 operand and takes the
 * next byte after the instruction (the operand byte) to determine what kind
 * of value it is. It throws an error if there is more than one operand specified
 * in the opByte so that you can use it to make assumptions and it errors if those
 * assumptions are wrong.
 * @param zvm the operand we are working with
 * @param opByte the operand byte from a var form
 */
export function read1OP(zvm: zMachine, opByte: number, info?: { str: string }) {
  let end = opByte & BITS_45;
  if (end !== BITS_45)
    throw Error('instruction is expected to only have 1 argument');

  let op1Ty = (opByte & BITS_67) >> 6;
  let res = readOperandExact(zvm, op1Ty, info);

  return res;
}

/**
 * Reads two operands, including the operand byte, and returns them as an array of two elements
 * @param zvm the z-machine we are working with
 */
export function read2OP(
  zvm: zMachine,
  info?: { str: string },
  opcode?: number
) {
  // read the operand byte
  let opByte = Zm.readByte(zvm);
  // then make sure it's really only 2 ops
  let end = opByte & BITS_23;
  if (end !== BITS_23) throw Error('instruction expecting exactly 2 arguments');

  // now get those types
  let op1Ty = (opByte & BITS_67) >> 6;
  let op2Ty = (opByte & BITS_45) >> 4;

  // read the operands
  let op1 = readOperandExact(zvm, op1Ty, info, opcode);
  let op2 = readOperandExact(zvm, op2Ty, info, opcode);

  return [op1, op2];
}

/**
 * Prints the argument as a number to output
 * @param zvm the zMachine we are working with
 * @param instr the instruction for printing the number
 */
export function printNum(zvm: zMachine, info?: { str: string }) {
  //console.log ('instr: ' + instr);
  let opByte = Zm.readByte(zvm); // zvm.bytes[zvm.pc++];
  let num = read1OP(zvm, opByte, info);
  let numStr = zmath.convertToNum(num).toString();
  if (info) {
    info.str += ": '" + numStr + "'";
  }

  // it's possible, this might need to be a ZSCII string, so let's convert it
  let len = numStr.length;
  let zscii = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    // turns out zscii matches ascii, which matches unicode values of '0' - '9'
    zscii[i] = numStr.charCodeAt(i);
  }
  Zm.outputString(zvm, { str: numStr, length: len, zscii: zscii });
}

export function increment(zvm: zMachine, varLoc: number) {
  //Zm.debugMsg(zvm, 'varLoc = ' + varLoc);
  //Zm.debugMsg(zvm, 'stack frame: ' + Zm.getStackFrameAsString(zvm));
  //Zm.debugMsg(zvm, 't')
  let val = Zm.peekVariable(zvm, varLoc);
  //Zm.debugMsg(zvm, 'retrieved ' + val + ' from ' + varLoc);
  // and increment it
  val = zmath.add(val, 1);
  if (varLoc === 0) Stack.set(zvm.stack, Stack.length(zvm.stack) - 1, val);
  else Zm.storeVariable(zvm, varLoc, val);

  return val;
}

export function decrement(zvm: zMachine, varLoc: number) {
  let val = Zm.peekVariable(zvm, varLoc);
  // and decrement it
  val = zmath.sub(val, 1);
  if (varLoc === 0) Stack.set(zvm.stack, Stack.length(zvm.stack) - 1, val);
  else Zm.storeVariable(zvm, varLoc, val);

  return val;
}
/**
 * Increments the thing at op1 and checks if it's greater than op2 and branches if so. This only works for "long" form instructions.
 * @param zvm the zMachine we are working with
 * @param instr the actual instruction we received
 * @param op1 the first op, which is likely a var number
 * @param op2 the second op
 */
export function incCheckLong(
  zvm: zMachine,
  op1: number,
  op2: number,
  info?: { str: string }
) {
  // increment the value
  let val = increment(zvm, op1);

  // then branc
  branch(zvm, zmath.gt(val, op2), info);
}

export function incCheckVar(zvm: zMachine, info?: { str: string }) {
  let opByte = zvm.bytes[zvm.pc];
  let op1ty = (opByte & BITS_67) >> 6;
  let op2ty = (opByte & BITS_45) >> 4;

  // get the two operands
  let [op1, op2] = read2OP(zvm, info);

  if (op1ty !== SMALL_CONSTANT_TYPE) {
    throw Error(
      'weird optype for incCheckVar, op1ty is ' +
        tyToStr(op1ty, op1) +
        ' op2ty is ' +
        tyToStr(op2ty, op2)
    );
  }

  //Zm.debugMsg(zvm, "inc_chk(var) " + op1.toString(16) + " " + op2.toString(16));
  // now increment it
  let val = increment(zvm, op1);

  // and now branch it
  branch(zvm, zmath.gt(val, op2), info);
}

/**
 * Increments the thing at op1 and checks if it's greater than op2 and branches if so.
 * @param zvm the zMachine we are working with
 * @param instr the actual instruction we received
 * @param op1 the first op, which is likely a var number
 * @param op2 the second op
 */
export function decCheckLong(
  zvm: zMachine,
  op1: number,
  op2: number,
  info?: { str: string }
) {
  // decrement the value
  let val = decrement(zvm, op1);

  // then branch
  branch(zvm, zmath.lt(val, op2), info);
}

/**
 * Implements the test instruction which checks if the logical and of the
 * two values is equal to operand 2 (i.e., that all flags are set). If so,
 * a branch occurs.
 * @param zvm the z-machine we are working with
 * @param op1 the first operand
 * @param op2 the second operand
 * @param info a debug string
 */
export function testLong(
  zvm: zMachine,
  op1: number,
  op2: number,
  info?: InfoStr
) {
  branch(zvm, (op1 & op2) === op2, info);
}

export function removeObject(
  zvm: zMachine,
  objID: number,
  info?: { str: string }
) {
  let objTable = zvm.objectTable;

  // the sibling
  let sib = zot.getSibling(objTable, objID);

  // we have to remove the parent, but fix the chain of siblings along the way
  let parentID = zot.getParent(objTable, objID);
  if (parentID === 0) {
    // nothing to see here...
    if (info) {
      info.str += ' from (nothing) ';
    }
    return;
  }
  if (info) {
    info.str += 'from ' + zot.getObjectShortName(objTable, parentID);
  }

  let next = zot.getChild(objTable, parentID);
  let last = 0;
  // now walk through the list of them
  while (next !== objID && next !== 0) {
    last = next;
    next = zot.getSibling(objTable, next);
  }

  // if last === 0, then we weren't at the front of the list, so we need
  // to splice us in
  if (last !== 0) {
    // splice this one out by setting the last sibling to this object's sibling
    zot.setSibling(objTable, last, sib);
    if (info) {
      info.str +=
        ' with previous sibling ' +
        zot.getObjectShortName(objTable, last) +
        ' and next sibling ' +
        (sib !== 0 ? zot.getObjectShortName(objTable, sib) : '(nothing)');
    }
  } else {
    // otherwise, we have to fix the parent also to point to a new child, since
    // we were at the front of the list, so we set their child, but we don't have
    // anything to adjust really here
    zot.setChild(objTable, parentID, sib);
    if (info) {
      info.str +=
        ' with sibling ' +
        (sib !== 0 ? zot.getObjectShortName(objTable, sib) : '(nothing)');
    }
  }

  // finally, set our parent to be 0 and our sibling to be 0, since we've been removed
  zot.setParent(objTable, objID, 0);
  zot.setSibling(objTable, objID, 0);
}

export function insertObjectVar(zvm: zMachine, info: { str: string }) {
  let [objID, newParentID] = read2OP(zvm, info, 0xe);
  insertObject(zvm, objID, newParentID);
}
/**
 * This moves the objID to become a child of newParentID. If newParentID had
 * any children, they are now a sibling of objID. Its previous siblings no longer
 * matter in this case since it has a new parent.
 * @param zvm the zmachine we are working with
 * @param objID the object to be inserted
 * @param newParentID the new parent of the objID
 */
export function insertObject(
  zvm: zMachine,
  objID: number,
  newParentID: number
) {
  let objTable = zvm.objectTable;
  // in essence, it's a singly linked list of sorts, siblings point one way, so you
  // have to do some juggling to keep things right

  // get the parent and sibling of this object
  let oldParent = zot.getParent(objTable, objID);
  let oldSibling = zot.getSibling(objTable, objID);

  // we have to remove ourselves from the object chain if we have a parent
  if (oldParent !== 0) {
    let prevSib = 0;
    let sib = zot.getChild(objTable, oldParent);
    while (sib !== 0 && sib !== objID) {
      // point last to this one
      prevSib = sib;
      // point this one to the next one
      sib = zot.getSibling(objTable, sib);
    }
    // eventually, sib will be 0 or will hit this objID, at which point, prevSib will be the previous one
    // in the chain, so let's splice them up
    if (prevSib === 0) {
      // i.e., we were at the front of the list, so just make the old sibling the new child of the parent,
      // note, it's okay if oldSibling is 0, since that means we didn't have a previous sibling, or a later
      // one, so the parent no longer has a child
      zot.setChild(objTable, oldParent, oldSibling);
    } else {
      // or, we had someone in front of us, so attach them to our sibling, and in this case we don't worry
      // about doing anything with the old parent, they are already pointing to some older sibling
      zot.setSibling(objTable, prevSib, oldSibling);
    }
  }

  // now get the child of the new parent, this will be this object's new sibling
  let sibling = zot.getChild(objTable, newParentID);

  // attach the ObjID to this newParentID
  zot.setChild(objTable, newParentID, objID);
  zot.setParent(objTable, objID, newParentID);

  // now attach its children as siblings to this object
  zot.setSibling(objTable, objID, sibling);
}

/**
 * This is a var form instruction, but we expect just one argument
 * @param zvm the zmachine we are working with
 * @param instr the instruction we are executing
 */
export function push(zvm: zMachine, info?: { str: string }) {
  let opByte = Zm.readByte(zvm);
  let val = read1OP(zvm, opByte, info);

  if (info) {
    info.str += '-> sp';
  }
  //Zm.debugMsg(zvm, 'push ' + val + ' to the stack');
  // to push to the stack, just store to variable 0
  Zm.pushToStack(zvm, val);
}

/**
 * This pulls the top value off the stack and stores it in the operand
 * @param zvm the zMachine we are working with
 */
export function pull(zvm: zMachine, info?: { str: string }) {
  let varLoc = read1OP(zvm, Zm.readByte(zvm));
  let res = Zm.popFromStack(zvm);
  //Zm.debugMsg(zvm, 'pulling ' + res + ' from stack and storing in ' + varLoc.toString(16));
  if (info) {
    info.str += 'sp (' + res + ') -> ' + varToString(varLoc);
  }

  Zm.storeVariable(zvm, varLoc, res);
}

/**
 * This reads two operands in VAR form and then calls the function given to it
 * (which is usually written already for LONG form instructions).
 * @param zvm the z-machine we are working with
 * @param opcode the opcode of this instruction
 * @param fun the function that will be called once we parse the two operands
 * @param info the debug info string
 */
export function parseVar2OPAndCall(
  zvm: zMachine,
  opcode: number,
  fun: (zvm: zMachine, op1: number, op2: number, info?: InfoStr) => void,
  info: InfoStr
) {
  let [op1, op2] = read2OP(zvm, info, opcode);
  fun(zvm, op1, op2, info);
}

/**
 * Tests if obj is a direct child of the parent and branches if so.
 * @param zvm the zMachine we are working with
 * @param child the child we are testing
 * @param parentID the parent we are testing
 */
export function jumpIn(
  zvm: zMachine,
  objID: number,
  parentID: number,
  info?: { str: string }
) {
  let test = zot.getParent(zvm.objectTable, objID) === parentID;

  branch(zvm, test, info);

  if (info) info.str += ' (' + test + ') >> ' + zvm.pc.toString(16);
}

/**
 * This prints the short name of the object
 * @param zvm the zMachine we are working with
 * @param obj the object to print
 */
export function printObj(zvm: zMachine, obj: number) {
  Zm.outputString(zvm, zot.getObjectShortName(zvm.objectTable, obj));
}

export function printChar(zvm: zMachine, info?: { str: string }) {
  let opByte = Zm.readByte(zvm); //zvm.bytes[zvm.pc++];
  let zscii = read1OP(zvm, opByte, info);

  let str = String.fromCharCode(zstr.translateZSCIItoUnicode(zscii, true));
  //Zm.debugMsg(zvm, 'print_char ' + str);
  if (info) {
    info.str += ": '" + str + "'";
  }
  Zm.outputString(zvm, { str: str, length: 1, zscii: new Uint8Array([zscii]) });
}

/**
 * This retrieves the parent and puts it in the local
 * @param zvm the zMachine we are working with
 * @param obj the object whos parent we wish to get
 */
export function getParent(zvm: zMachine, obj: number, info?: { str: string }) {
  let varLoc = Zm.readByte(zvm); //zvm.bytes[zvm.pc++];
  let parentID = zot.getParent(zvm.objectTable, obj);
  if (info) {
    info.str +=
      '-> ' +
      varToString(varLoc) +
      ' (' +
      parentID +
      ')' +
      ' "' +
      (parentID !== 0
        ? zot.getObjectShortName(zvm.objectTable, parentID)
        : '') +
      '"';
  }
  //Zm.debugMsg(zvm, 'storing parent (' + parent + ') of object ' + obj + ' to variable ' + loc);
  Zm.storeVariable(zvm, varLoc, parentID);
}

/**
 * Gets the first child of this object, and branches if it exists. Oh and it stores
 * the object in the given location. Yeah, it does lots.
 * @param zvm the zMachine we are working with
 * @param obj the object we are interested in
 */
export function getChild(zvm: zMachine, obj: number, info?: { str: string }) {
  let child = zot.getChild(zvm.objectTable, obj);

  // get storage location now
  let varLoc = Zm.readByte(zvm); // zvm.bytes[zvm.pc++];
  Zm.storeVariable(zvm, varLoc, child);

  if (info) {
    info.str +=
      '-> ' +
      varToString(varLoc) +
      ' (' +
      child +
      ')' +
      ' "' +
      (child !== 0 ? zot.getObjectShortName(zvm.objectTable, child) : '') +
      '" ';
  }

  //Zm.debugMsg(zvm, 'storing child (' + child + ') of object ' + obj + ' to variable ' + varLoc + ' and maybe branching ');
  // now branch
  branch(zvm, child !== 0, info);
}

/**
 * Gets the first sibling of this object, and branches if it exists. Oh and it stores
 * the object in the given location. Yeah, it does lots.
 * @param zvm the zMachine we are working with
 * @param obj the object we are interested in
 */
export function getSibling(zvm: zMachine, obj: number, info?: { str: string }) {
  let sib = zot.getSibling(zvm.objectTable, obj);

  // get storage location now
  let varLoc = Zm.readByte(zvm);
  Zm.storeVariable(zvm, varLoc, sib);

  if (info) {
    info.str +=
      '-> ' +
      varToString(varLoc) +
      ' (' +
      sib +
      ')' +
      ' "' +
      (sib !== 0 ? zot.getObjectShortName(zvm.objectTable, sib) : '') +
      '" ';
  }
  //Zm.debugMsg(zvm, 'storing sibling (' + sib + ') of object ' + obj + ' to variable ' + varLoc + ' and maybe branching ');
  // now branch
  branch(zvm, sib !== 0, info);
}

/**
 * Implements the var form of get_prop
 * @param zvm the z-machine we are working with
 * @param info a debugging message string
 */
export function getPropVar(zvm: zMachine, info?: { str: string }) {
  let [obj, prop] = read2OP(zvm, info, 0x11);

  // now just call getProperty (=
  let res = getProperty(zvm, obj, prop);
  // and get the store location
  let storeLoc = Zm.readByte(zvm);

  // log some info
  if (info) {
    info.str += res.toString(16) + '-> ' + varToString(storeLoc);
  }

  // now store it
  Zm.storeVariable(zvm, storeLoc, res);
}

/**
 * Retrieves the given property for the given object, returning the object default
 * if it doesn't exist on the object.
 * @param zvm the zMachine we are working with
 * @param obj the object we want the property from
 * @param prop the property number
 */
export function getProperty(zvm: zMachine, obj: number, prop: number) {
  // this gets stored into a location, at this point we have the object
  let { addr, length } = zot.findPropertyAddr(zvm.objectTable, obj, prop);
  if (length > 2)
    throw Error('cannot get the property and store it if its length > 2');

  let res = 0;
  if (addr === 0) {
    res = zot.getObjectDefaultProperty(zvm.objectTable, prop);
    //Zm.debugMsg(zvm, 'get_prop for object ' + obj + ', prop ' + prop + ' is object default: ' + res);
  } else if (length === 1) {
    res = Zm.getByte(zvm, addr);
    //Zm.debugMsg(zvm, 'get_prop for object ' + obj + ', prop ' + prop + ' is 1 byte: ' + res);
  } else {
    res = Zm.getWord(zvm, addr);
    //onsole.log('get_prop for object ' + obj + ', prop ' + prop + ' is 1 word: ' + res);
  }

  return res;
}

/**
 * Unpacks the address and prints from there, sending it to output.
 * @param zvm the zMachine we are working with
 * @param loc the packed address
 */
export function printPackedAddr(zvm: zMachine, loc: number, info?: InfoStr) {
  let addr = Zf.calculatePackedAddress(zvm.bytes, loc, false, true);
  let res = zstr.zToString(zvm, addr);
  if (info) {
    info.str +=
      '[0x' +
      addr.toString(16) +
      '] (' +
      res.zscii.length +
      ' chars): "' +
      res.str +
      '" ';
  }
  Zm.outputString(zvm, res);
}

/**
 * This prints from a given byte address, sending it to ouput.
 * @param zvm the z-machine we are working with
 * @param addr the address we are printing from
 */
export function printByteAddr(zvm: zMachine, addr: number) {
  let res = zstr.zToString(zvm, addr);
  Zm.debugMsg(zvm, 'printing from ' + addr.toString(16) + ': ' + res.str);
  Zm.outputString(zvm, res);
}

/**
 * This is the var version of jump-equal, which compares the first thing with the
 * rest and branches if any are equal. Note, no instruction can have more than
 * 8 parameters, so at most, you're comparing against 7 things.
 * @param zvm the zMachine we are working with
 */
export function jumpEqVar(zvm: zMachine, info?: { str: string }) {
  let opByte = Zm.readByte(zvm); //zvm.bytes[zvm.pc++];

  let op1ty = (opByte & BITS_67) >> 6;
  let op2ty = (opByte & BITS_45) >> 4;
  let op3ty = (opByte & BITS_23) >> 2;
  let op4ty = opByte & BITS_01;

  let op1 = readOperandExact(zvm, op1ty, info);
  let op2 = readOperandExact(zvm, op2ty, info);

  let op3 = readOperand(zvm, op3ty, info);
  let op4 = readOperand(zvm, op4ty, info);

  // we branch if any of them are equal, but op1 and op2 have to be non-null
  // (ie., they have to exist)
  let equal =
    zmath.eq(op1, op2) ||
    (op3 !== null ? zmath.eq(op1, op3) : false) ||
    (op4 !== null ? zmath.eq(op1, op4) : false);

  // now branch!
  branch(zvm, equal, info);
}

/**
 * This is the var version of jump-equal, which compares the first thing with the
 * rest and branches if any are equal. Note, no instruction can have more than
 * 8 parameters, so at most, you're comparing against 7 things.
 * @param zvm the zMachine we are working with
 */
export function jumpGtVar(zvm: zMachine, info?: { str: string }) {
  let opByte = Zm.readByte(zvm); //zvm.bytes[zvm.pc++];

  let op1ty = (opByte & BITS_67) >> 6;
  let op2ty = (opByte & BITS_45) >> 4;
  let op3ty = (opByte & BITS_23) >> 2;
  let op4ty = opByte & BITS_01;

  // this could mean there are more than 4, plus it means the next byte is another
  // opByte so we should read it, chaos will ensue!
  if (op3ty !== END_TYPE && op4ty !== END_TYPE) {
    throw Error('more than 3 operand jg not implemented');
  }

  let op1 = readOperand(zvm, op1ty, info);
  let op2 = readOperand(zvm, op2ty, info);

  // we branch if any of them are equal, but op1 and op2 have to be non-null
  // (ie., they have to exist)
  let gt = op1 !== null && op2 !== null && zmath.gt(op1, op2);

  // now branch!
  branch(zvm, gt, info);
}

/**
 * This is the var version of jump-equal, which compares the first thing with the
 * rest and branches if any are equal. Note, no instruction can have more than
 * 8 parameters, so at most, you're comparing against 7 things.
 * @param zvm the zMachine we are working with
 */
export function jumpLtVar(zvm: zMachine, info?: { str: string }) {
  let opByte = Zm.readByte(zvm);

  let op1ty = (opByte & BITS_67) >> 6;
  let op2ty = (opByte & BITS_45) >> 4;
  let op3ty = (opByte & BITS_23) >> 2;
  let op4ty = opByte & BITS_01;

  // this could mean there are more than 4, plus it means the next byte is another
  // opByte so we should read it, chaos will ensue!
  if (op3ty !== END_TYPE && op4ty !== END_TYPE) {
    throw Error('more than 3 operand jl not implemented');
  }

  let op1 = readOperand(zvm, op1ty, info);
  let op2 = readOperand(zvm, op2ty, info);

  // we branch if any of them are equal, but op1 and op2 have to be non-null
  // (ie., they have to exist)
  let lt = op1 !== null && op2 !== null && zmath.lt(op1, op2);

  // now branch!
  branch(zvm, lt, info);
}

export function orLong(
  zvm: zMachine,
  op1: number,
  op2: number,
  info?: InfoStr
) {
  // get the store location
  let storeLoc = Zm.readByte(zvm);

  let res = zmath.or(op1, op2);
  if (info) {
    info.str += '-> ' + varToString(storeLoc) + '(' + res + ')';
  }

  Zm.storeVariable(zvm, storeLoc, res);
}

export function andVar(zvm: zMachine, info: { str: string }) {
  let [op1, op2] = read2OP(zvm, info);
  let varLoc = Zm.readByte(zvm);
  let res = zmath.and(op1, op2);

  if (info) {
    info.str += '-> ' + varToString(varLoc) + ' (' + res.toString(16) + ')';
  }

  Zm.storeVariable(zvm, varLoc, res);
}

/**
 * Kinda risky: we assume the proprety data is at the given addr, so we find its length
 * which is in theory the first byte.
 * @param zvm the zMachine we are working with
 * @param loc the location of this property
 */
export function getPropertyAddrLen(
  zvm: zMachine,
  addr: number,
  info?: { str: string }
) {
  // well, it's a store, so let's figure out where this should be stored to
  let varLoc = Zm.readByte(zvm); // zvm.bytes[zvm.pc++];

  // get the len
  let len = zot.getPropertyLengthFromAddr(zvm.objectTable, addr);

  if (info) {
    info.str += ': ' + len + ' -> ' + varToString(varLoc);
  }
  Zm.storeVariable(zvm, varLoc, len);
}

/**
 * This gets the property address of the given proprty
 * @param zvm the zMachine we are working with
 * @param objID the object id in question
 * @param propID the property id
 */
export function getPropertyAddr(zvm: zMachine, objID: number, propID: number) {
  let res = zot.findPropertyAddr(zvm.objectTable, objID, propID);

  //Zm.debugMsg(zvm, 'storing next property of object ' + objID + ', property ' + propID);
  return res.addr;
}

/**
 * This function when given 'property 0' returns the ID of the first proprety of the object, or 0
 * if there is none. It can be subsequently used with this value to find successive ones.
 * @param zvm the zMachine we are working with
 * @param objID the object ID
 * @param propID the property ID of where to start looking
 */
export function getNextProp(
  zvm: zMachine,
  objID: number,
  propID: number,
  info: { str: string }
) {
  let nextID = zot.findNextProperty(zvm.objectTable, objID, propID);
  info.str += ' (' + nextID.toString() + ')';
  // now read the next byte to store it
  return nextID;
}

/**
 * Just some simple testing to make sure
 * @param byte the operand byte (for VAR instructions)
 */
export function isOpCountLT4(byte: number) {
  return (byte & BITS_01) === END_TYPE;
}

export function isOpCountLT3(byte: number) {
  return (byte & BITS_23) >> 2 === END_TYPE;
}

export function* readChar(zvm: zMachine, info: { str: string }) {
  // first check the opbyte
  let opByte = Zm.readByte(zvm);
  let op1ty = (opByte & BITS_67) >> 6;
  let op2ty = (opByte & BITS_45) >> 4;

  if (op2ty !== END_TYPE) {
    throw Error('timed input not implemented yet');
  }

  // first read the operand, which must be 1
  let op1 = readOperand(zvm, op1ty);

  if (op1 !== 1) {
    throw Error('unexpected read_char input type: ' + op1);
  }

  // then read the byte
  let storeLoc = Zm.readByte(zvm);

  // okay, let's pause until we get a character
  let input = Zm.readChar(zvm);
  let char = input.next().value;
  while (char === undefined) {
    yield Zm.ZState.WaitingForCharInput;
    char = input.next().value;
  }

  // once we have it, store it
  Zm.storeVariable(zvm, storeLoc, char);
  return Zm.ZState.Running;
}
/**
 *
 * @param zvm the zMachine we are working with
 */
export function* sread(zvm: zMachine, info: { str: string }) {
  // sread is a VAR form, so the next byte is the
  let opByte = Zm.readByte(zvm);

  if (!isOpCountLT3(opByte)) {
    throw Error('sread expects only two arguments!');
  }

  // figure out what the operand types are
  let op1ty = (opByte & BITS_67) >> 6;
  let op2ty = (opByte & BITS_45) >> 4;

  // then read them and advance the PC
  //Zm.debugMsg('text type is: ' + tyToStr(op1ty));
  //Zm.debugMsg('parse type is ' + tyToStr(op2ty));
  let textAddr = readOperand(zvm, op1ty, info);
  let parseAddr = readOperand(zvm, op2ty, info);

  if (textAddr === null || parseAddr === null)
    throw Error(
      'sread expects two arguments, the text buffer and the parse buffer'
    );

  //Zm.debugMsg(zvm, 'text address is ' + textAddr.toString(16));
  //Zm.debugMsg(zvm, 'parse address is ' + parseAddr.toString(16));

  // now figure out how big each of these is
  let textlen = Zm.getByte(zvm, textAddr);
  let parselen = Zm.getByte(zvm, parseAddr);

  //Zm.debugMsg(zvm, 'text table size is: ' + textlen);
  //Zm.debugMsg(zvm, 'parse table size is: ' + parselen);

  // now update input line
  Zm.updateStatusLine(zvm);

  // get the input, this will copy it into the z-machine buffer
  let input = Zm.readInput(zvm, textAddr, textlen);
  let parseStr = input.next().value;
  while (parseStr === undefined) {
    // if it's null on the first pass, just yield (I mean who knows,
    // maybe they already typed something in...)
    yield Zm.ZState.WaitingForInput;
    parseStr = input.next().value;
  }

  // Zm.debugMsg(zvm, 'input string is: ' + parseStr);
  Zm.parseInput(zvm, parseStr, parseAddr, parselen);

  // finally, return a good state
  return Zm.ZState.Running;
}

/**
 * this is the 2OP form of storing
 * @param zvm the zMachine we are working with
 */
export function storeVar(zvm: zMachine, info?: { str: string }) {
  // read the operands, but get the byte first because we need it to
  // read the operands
  let opByte = Zm.readByte(zvm);
  let op1Ty = (opByte & BITS_67) >> 6;
  let op2Ty = (opByte & BITS_45) >> 4;
  let endTy = (opByte & BITS_23) >> 2;
  // sanity checking
  if (endTy !== END_TYPE) {
    throw Error('Invalid var-form store with more than 2 operands');
  }

  let op1 = readOperandExact(zvm, op1Ty, info, 0xd, true);
  let op2 = readOperandExact(zvm, op2Ty, info, 0xd, false);

  // now store this variable
  //Zm.debugMsg(zvm, 'storing (2-op var form) ' + op2 + ' at var ' + op1.toString(16));
  Zm.storeVariable(zvm, op1, op2);
}

export function random(zvm: zMachine, info: { str: string }) {
  // we expect only 2 arguments
  let opByte = Zm.readByte(zvm);
  let op1 = read1OP(zvm, opByte, info);

  // see if this is positive or negative
  let range = zmath.convertToNum(op1);

  let rnd;
  if (range < 0) {
    zmath.switchToSeeded(range);
    rnd = zmath.random();
  } else {
    rnd = zmath.randomRange(range);
  }

  let varLoc = Zm.readByte(zvm);

  if (info) {
    info.str += ' (value: ' + range.toString() + ') -> ' + varToString(varLoc);
  }

  Zm.storeVariable(zvm, varLoc, rnd);
}

export function bufferMode(zvm: zMachine, info?: { str: string }) {
  let op1 = read1OP(zvm, Zm.readByte(zvm));
  if (info) {
    if (op1 === 1) {
      info.str += '(on)';
    } else if (op1 === 0) {
      info.str += '(off)';
    } else {
      info.str += op1.toString();
    }
  }

  if (zvm.terminal.terminalListener) {
    zvm.terminal.terminalListener('bufferMode', op1);
  }
}

export function eraseWindow(zvm: zMachine, info?: { str: string }) {
  let op1 = read1OP(zvm, Zm.readByte(zvm));
  if (info) {
    switch (op1) {
      case 0xffff:
        info.str += 'unsplit and clear';
        break;
      case 0xfffe:
        info.str += 'clear window';
        break;
      default:
        info.str += Zf.colorToString(op1);
    }
  }

  if (op1 === 0xffff) {
    // if it's -1, we unplit the terminal and clear it
    if (zvm.terminal.terminalListener) {
      zvm.terminal.terminalListener('unsplitAndClear');
    }
    // now handle this in the windows, window 1 becomes 0 height,
    // both are cleared
    let win1 = zvm.terminal.windowListeners[1];
    let win0 = zvm.terminal.windowListeners[0];

    if (win1) {
      win1('eraseWindow');
      win1('setCursor', [1, 1]);
      win1('setLines', 0);
    }

    if (win0) {
      win0('eraseWindow');
    }
  } else if (op1 === 0xfffe) {
    // if it's -2, we erase them all without unsplitting
    zvm.terminal.windowListeners.forEach(li => {
      if (li) li('eraseWindow');
    });
  } else if (op1 > 16) {
    throw Error('erase_window called with invalid window number: ' + op1);
  } else {
    let listener = zvm.terminal.windowListeners[op1];
    if (listener === null) {
      throw Error(
        "erase_window called on invalid window number that doesn't exist: " +
          op1
      );
    }
    listener('eraseWindow', zvm.terminal.currentWindow);
    let win = zvm.terminal.windowListeners[zvm.terminal.currentWindow];
    if (win) {
      win('eraseWindow');
      win('setCursor', [1, 1]);
    }
  }
}

export function send1OPTermCmd(
  zvm: zMachine,
  cmd: string,
  info?: { str: string }
) {
  let op1 = read1OP(zvm, Zm.readByte(zvm));
  if (info) {
    info.str += op1.toString() + ' ';
  }

  if (zvm.terminal.terminalListener) {
    zvm.terminal.terminalListener(cmd, op1);
  }
}

/**
 * This executes the split_window instruction, which determines
 * the division of lines between window 0 and window 1. A split
 * window of 0, sets window 0 to the full screen, and window 1
 * to have 0 lines.
 * @param zvm the z-machine we are working with
 * @param info debug info for printing
 */
export function splitWindow(zvm: zMachine, info?: { str: string }) {
  let op1 = read1OP(zvm, Zm.readByte(zvm));

  if (info) {
    info.str += op1 === 0 ? 'unsplit ' : op1.toString() + ' ';
  }

  // 1 is the upper window, which is what split_window affects
  let listener = zvm.terminal.windowListeners[1];
  // if there's a listener, then we should send the setLines
  // command to it
  console.log(
    'there are ' + zvm.terminal.windowListeners.length + ' listeners'
  );

  if (listener) {
    listener('setLines', op1);
    // in version 3 we clear it also
    if (zvm.version === 3) {
      listener('eraseWindow');
    }
  } else {
    console.log('WARING: no listener on 1 for splitWindow');
  }
  if (zvm.terminal.terminalListener) {
    zvm.terminal.terminalListener('splitWindow', op1);
    // in version 3, we also clear the window
    if (zvm.version === 3) {
      zvm.terminal.terminalListener('eraseWindow');
    }
  }
}

export function setWindow(zvm: zMachine, info?: { str: string }) {
  let op1 = read1OP(zvm, Zm.readByte(zvm));

  if (info) {
    info.str += op1.toString() + ' ';
  }

  zvm.terminal.currentWindow = op1;

  if (zvm.terminal.terminalListener) {
    zvm.terminal.terminalListener('setWindow', op1);
  }

  // now, if it's the upper window (1), cause it to reset the cursor to 1,1
  let listener = zvm.terminal.windowListeners[1];
  if (listener !== null) {
    listener('setCursor', [1, 1]);
  }
}

/**
 * Sets the text style to: Roman (if 0), Reverse Video (if 1), Bold (if 2),
 * Italic (4), Fixed Pitch (8)
 * @param zvm the z-machine we are working with
 * @param info the info string for debugging
 */
export function setTextStyle(zvm: zMachine, info?: { str: string }) {
  let op1 = read1OP(zvm, Zm.readByte(zvm));

  if (info) {
    info.str += op1.toString() + ' (';
    switch (op1) {
      case 0:
        info.str += 'roman) ';
        break;
      case 1:
        info.str += 'reverse) ';
        break;
      case 2:
        info.str += 'bold) ';
        break;
      case 4:
        info.str += 'italic) ';
        break;
      case 8:
        info.str += 'fixed) ';
        break;
      default:
        throw Error('unexpected text style: ' + op1);
    }
  }

  if (op1 === 0) {
    zvm.terminal.textStyle = 0;
  } else {
    zvm.terminal.textStyle = zvm.terminal.textStyle | op1;
  }

  let listener = zvm.terminal.windowListeners[zvm.terminal.currentWindow];
  if (listener) {
    listener('textStyle', op1);
  }
}

export function setCursor(zvm: zMachine, info?: { str: string }) {
  if (zvm.version === 4) {
    let ops = read2OP(zvm, info);

    let listener = zvm.terminal.windowListeners[zvm.terminal.currentWindow];
    if (listener) {
      listener('setCursor', ops);
    }
    if (zvm.terminal.terminalListener) {
      zvm.terminal.terminalListener('setCursor', ops);
    }
  } else throw Error('setCursor not implemented for version ' + zvm.version);
}

export function setOutputStream(zvm: zMachine, info?: { str: string }) {
  if (zvm.version < 6) {
    let opByte = Zm.readByte(zvm);
    let op1ty = (opByte & BITS_67) >> 6;
    let op2ty = (opByte & BITS_45) >> 4;
    let endTy = (opByte & BITS_23) >> 2;

    if (endTy !== END_TYPE) {
      throw Error('Unexpected 4th argument to output_stream');
    }

    let sNum = zmath.convertToNum(readOperandExact(zvm, op1ty, info));
    if (info) {
      info.str += "'" + Zm.outputStreamToString(zvm, Math.abs(sNum)) + "' ";
    }

    // see if we're disabling it
    if (sNum < 0) {
      if (info) {
        info.str += '[disabling ' + Math.abs(sNum) + '] ';
      }
      Zm.disableOutputStream(zvm, Math.abs(sNum));
      return;
    }

    // otherwise, we are enabling a stream, this next operand reads the
    // possible address of the table, if one exists
    let table = readOperand(zvm, op2ty, info);

    // now add it, note table may be null, but that's okay if it's not stream 3
    Zm.enableOutputStream(zvm, sNum, table);
    if (sNum !== 1 && sNum !== 2 && sNum !== 3)
      throw Error('need to implement this output stream ' + sNum);
    return;
  } else {
    // note, in v6, output_stream optionally has a 3rd argument
    // let opByte = Zm.readByte(zvm);
    // let op1ty = (opByte & BITS_67) >> 6;
    // let op2ty = (opByte & BITS_45) >> 4;
    // let op3ty = (opByte & BITS_23) >> 2;
    // let endTy = (opByte & BITS_01);

    // let sNum = readOperandExact(zvm, op1ty, info);
    // let table = readOperandExact(zvm, op2ty, info);
    // let width = readOperand(zvm, op3ty, info);

    throw Error('setOutputStream not implemented for version ' + zvm.version);
  }
}

export function scan(zvm: zMachine, info: { str: string }) {
  let opByte = Zm.readByte(zvm);
  let valTy = (opByte & BITS_67) >> 6;
  let tableTy = (opByte & BITS_45) >> 4;
  let lenTy = (opByte & BITS_23) >> 2;
  let formTy = opByte & BITS_01;

  if (formTy !== END_TYPE) {
    throw Error('form type for scan not implemented yet');
  }

  let val = readOperandExact(zvm, valTy, info);
  let table = readOperandExact(zvm, tableTy, info);
  let len = readOperandExact(zvm, lenTy, info);

  // now read the store location
  let storeLoc = Zm.readByte(zvm);
  if (info) {
    info.str += '-> ' + varToString(storeLoc);
  }

  // now that we have these, let's walk through memory looking for a match
  // orinally with all the talk of tables, I thought the first word should
  // be skipped, but this led to all sorts of weird bugs because some of
  // the properties (63 in particular) are synonyms for the object, and you
  // can't skip that first word!
  let tableAddr = table;
  let addr = 0;
  for (let i = 0; i < len; i++) {
    addr = tableAddr + i * 2;
    let w = Zm.getWord(zvm, addr);
    if (zmath.eq(w, val)) {
      // store the address at the given location
      Zm.storeVariable(zvm, storeLoc, addr);
      return branch(zvm, true, info);
    }
  }

  // otherwise, just store 0, and branch with false
  Zm.storeVariable(zvm, storeLoc, 0);
  branch(zvm, false, info);
}
