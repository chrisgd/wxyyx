import * as Zf from './ZFile';
import * as Stack from '../StackUint16/StackUint16';
import * as zop from './Zops';
import * as zinst from './Zinstr';
import * as zmath from './Zmath';
import * as zstr from './Strings';
import * as zo from './ZObjTable';
import { BITS_67 } from './Zinstr';
import * as zd from './ZDictionary';

export enum ZState {
  Stopped,
  Running,
  WaitingForInput,
  WaitingForCharInput,
  Quit,
  Error
}

export type FontStyle = 'roman' | 'reverse' | 'bold' | 'italic' | 'fixed pitch';

export enum TextStyle {
  Roman = 0,
  Reverse = 1,
  Bold = 2,
  Italic = 4,
  FixedPitch = 8
}

export interface InfoStr {
  str: string;
}

export enum Stream {
  Screen = 1,
  Transcript = 2,
  Table = 3,
  Commands = 4
}

/**
 * This represents a ztable in the z-machine, which has an address
 * somewhere (in dynamic memory), the first word is the size of the table
 * and usually when they're used for input, this is altered to indicate
 * how many words were actually written to the table. The pos element
 * tells us where the current writing position begins. Note, pos is in
 * bytes, writing always begins
 */
export interface ZTable {
  addr: number;
  size: number;
  pos: number;
}

/**
 * This constructs a new ztable by initializing the address location
 * with the size of the table and returning a structure to work with it
 * so that 'pos' is an offset of the location to write to.
 * @param zvm the z-machine we are working with
 * @param addr the address the table lives at
 * @param initSize the initial size of the table
 */
export function makeZTable(
  zvm: zMachine,
  addr: number,
  initSize: number = 0
): ZTable {
  return {
    addr: addr,
    size: initSize,
    pos: 2
  };
}

export function zStateToString(s: ZState) {
  switch (s) {
    case ZState.Stopped:
      return 'Stopped';
    case ZState.Running:
      return 'Running';
    case ZState.WaitingForInput:
      return 'Waiting For Input';
    case ZState.WaitingForCharInput:
      return 'Waiting for Char Input';
    case ZState.Quit:
      return 'Quit';
    case ZState.Error:
      return 'Error';
    default:
      throw Error('Unknown ZState');
  }
}

export interface zMachine {
  readonly bytes: Uint8Array;
  readonly backupBytes: Uint8Array;
  readonly dynamic: number;
  readonly static: number;
  readonly high: number;
  stack: Stack.StackUint16;
  readonly globals: number;
  pc: number;
  fp: number;
  readonly version: number;
  globalsTableListener: (() => void) | null;
  localsTableListener: (() => void) | null;
  readonly fpLocalsOffset: number;
  readonly fpStorageLocation: number;
  readonly previousFp: number;
  readonly fpLocalsCount: number;
  readonly abbreviationsTableAddr: number;
  currentAlphabet: number;
  abbreviations: string[];
  objectTable: zo.ZObjTable;
  outputListener: ((str: string) => void) | null;
  statusLineListener:
    | ((name: string, turn: number, score: number) => void)
    | null;
  exited: boolean;
  terminal: {
    keyboardInput: ((str: string, newline: boolean) => void) | null;
    inputBuffer: string[];
    currentFont: string;
    foregroundColor: number;
    backgroundColor: number;
    terminalListener: ((str: string, val?: any) => void) | null;
    windowListeners: (((str: string, val?: any) => void) | null)[];
    currentWindow: number;
    textStyle: number;
    isScreenWidthSet: boolean;
  };
  // this contains an array of streams which are currently enabled
  outputStreams: boolean[];
  // address of the table we are currently writing to with stream 3
  tableList: ZTable[];
  dictionaries: {
    [key: number]: zd.ZDictionary;
  };
  standardDictionary: zd.ZDictionary;
  wordSepRegExp: RegExp | null;
  tmpSaveGame: SaveGame | null;
  saveGameListener: null | ((save: SaveGame) => boolean);
  restoreGameListener: null | (() => SaveGame | null);
  // this is the name of the .z file we are using
  sourceName: string;
  debugging: boolean;
  debugListener: ((str: string) => void) | null;
}

/**
 * The layout of a frame is:
 *  return address (2 words)
 *  previous frame pointer (1 word)
 *  return location (high byte) | locals count (low byte) (1 word)
 *  locals (where the locals begin)
 */
const FP_RETURN_ADDRESS_OFFSET = 0;
// these next two things take just one byte each, so storage location
// will be in the high byte of the 16-bit word and locals count will
// be in the low byte of the 16-bit
const FP_PREVIOUS_FP = FP_RETURN_ADDRESS_OFFSET + 2;
const FP_RETURN_STORAGE_LOC = FP_PREVIOUS_FP + 1;
const FP_LOCALS_COUNT = FP_RETURN_STORAGE_LOC; // note, they share the same word
// this seems weird, but locals have an 'address' starting at 1, so we add it to this
// offset to calculate the correct location in the frame
const FP_LOCALS_OFFSET = FP_LOCALS_COUNT;
const FP_STACK_HEADER_SIZE = FP_LOCALS_OFFSET;
const FP_IGNORE_RETURN_STORAGE = 1 << 30;

/* creates a zvm */
export function makeZvm(bytes: Uint8Array): zMachine {
  // create a z-machine virtual machine, note we make it type any at first
  // because we have some things we have to add dynamically, but then this
  // returns a zMachine type, which should be properly constructed
  let zvm: any = {
    // reference to the memory of our z-machine
    bytes: bytes,
    backupBytes: bytes.map(el => el),
    dynamic: 0,
    static: Zf.getBaseOfStaticMem(bytes),
    high: Zf.getBaseOfHighMemory(bytes),
    stack: Stack.makeStack(),
    globals: Zf.getGlobalVarTable(bytes),
    pc: Zf.getInitialValuePC(bytes),
    fp: 0,
    version: Zf.getVersionNum(bytes),
    globalsTableListener: null,
    localsTableListener: null,
    // Defines the offset that local variables start at from the frame pointer. Note, it's only 3
    // instead of the proper 5 because local variables are numbered from 1 to f, this means that while
    // we push 3 16-bit words onto a frame, if we add the local number and this offset, we'll get 4
    fpLocalsOffset: FP_LOCALS_OFFSET,
    // this is where we store the storage location for a function return, so maybe a variable or
    // maybe the stack
    fpStorageLocation: FP_RETURN_STORAGE_LOC,
    // the previous frame pointer is at offset 3
    previousFp: FP_PREVIOUS_FP,
    // locals count
    fpLocalsCount: FP_LOCALS_COUNT,
    abbreviationsTableAddr: Zf.getAbbreviationsTable(bytes),
    currentAlphabet: 0,
    abbreviations: [],
    outputListener: null,
    statusLineListener: null,
    exited: false,
    terminal: {
      keyboardInput: null,
      inputBuffer: [],
      currentFont: '',
      foregroundColor: Zf.Color.Black,
      backgroundColor: Zf.Color.Yellow,
      terminalListener: null,
      windowListeners: [],
      currentWindow: 0,
      textStyle: 0,
      isScreenWidthSet: false
    },
    outputStreams: [],
    tableList: [],
    dictionaries: {},
    wordSepRegExp: null,
    tmpSaveGame: null,
    saveGameListener: null,
    restoreGameListener: null,
    sourceName: '',
    debugging: true,
    debugListener: null
  };

  return initZvm(zvm);
}

export function initZvm(zvm: zMachine) {
  console.log('Initializing z-Machine, total bytes: ' + zvm.bytes.length);
  // set up some of the things we don't have yet in our type, like the abbreviations table
  console.log('building abbreviations table...');
  zvm.abbreviations = zstr.getAbbreviationsTable(zvm);
  // and the standard dictionary

  console.log('constructing dictionary...');
  zvm.standardDictionary = zd.makeDictionary(zvm);

  // set up the output streams, by default only 1 is enabled
  zvm.outputStreams[1] = true;

  console.log('setting up word separators...');
  // now given the standard dictionary, set up the word separators
  let dict = zvm.standardDictionary as zd.ZDictionary;
  if (dict.wordSeparators.length > 0) {
    let sepStr = '(';

    dict.wordSeparatorChars.forEach((el, idx) => {
      if (el.localeCompare('.') === 0) {
        sepStr += '\\.';
      } else if (el.localeCompare('?') === 0) {
        sepStr += '[?]';
      } else {
        sepStr += el;
      }
      if (idx < dict.wordSeparators.length - 1) sepStr += '|';
    });
    sepStr += ')|( +|\\t+|\\r+|\\n+)';
    // now drop the last 'or' bar
    zvm.wordSepRegExp = new RegExp(sepStr, 'g');
    debugMsg(zvm, 'word separator regexp is: "' + sepStr + '"');
  }

  // get the object table setup
  zvm.objectTable = zo.makeZObjTable(zvm);

  // now init the stack frames for main
  initStackFrames(zvm);

  // set up keyboard input to call the default keyboard input function
  setKeyboardInputFun(zvm, (str: string, newline: boolean) => {
    defaultKeyboardInput(zvm, str, newline);
  });

  // set up window listeners
  for (let i = 0; i < 8; i++) {
    zvm.terminal.windowListeners.push(null);
  }

  initHeader(zvm);
  return zvm;
}

/** sets a window listener to receive output for a specific window */
export function setWindowListener(
  zvm: zMachine,
  num: number,
  callback: (cmd: string, val?: any) => void
) {
  zvm.terminal.windowListeners[num] = callback;
}

export function unsetWindowListener(zvm: zMachine, num: number) {
  console.log('ZM: unsetting window listener ' + num);
  zvm.terminal.windowListeners[num] = null;
}

/**
 * This sends a message to debugListener, if there is one
 * @param zvm the z-machine we are working with
 * @param msg the message we want to send to the debug log
 */
export function debugMsg(zvm: zMachine, msg: string) {
  if (zvm.debugging && zvm.debugListener) {
    zvm.debugListener(msg);
  }
}

/**
 * Once the z-machine is created, we need to initialize the header with
 * interpreter specific things. These set up the defaults, but they can
 * obviously be changed if the interpreter is chagned.
 * @param zvm the z-machine we are working with
 */
export function initHeader(zvm: zMachine) {
  if (zvm.version < 4) {
    Zf.setStatusLineAvailable(zvm.bytes, true);
    // sure, why not, just gotta set it up and need some games that use it to test it
    Zf.setScreenSplitAvailable(zvm.bytes, true);
    // yeah, this makes sense actually
    Zf.setVariablePitchFontIsDefault(zvm.bytes, true);
  } else {
    // after version 3, the flags change
    if (zvm.version >= 5) {
      Zf.setColorsAvailable(zvm.bytes, true);
    }

    if (zvm.version >= 6) {
      Zf.setCanDisplayPictures(zvm.bytes, true);
    }

    Zf.setBoldfaceAvailable(zvm.bytes, true);
    Zf.setItalicAvailable(zvm.bytes, true);
    Zf.setFixedSpaceAvailable(zvm.bytes, true);

    if (zvm.version >= 6) {
      Zf.setSoundEffectsAvailable(zvm.bytes, true);
    }
    Zf.setTimedKeyboardInputAvailable(zvm.bytes, true);
  }

  // now for flags 2, we will assume we can do whatever they're asking for, so we
  // won't change these bits, but look at ZFile for functions to handle it for a
  // specific interpreter.
  if (zvm.version >= 4) {
    // I think Amiga fans will appreciate this, haha
    Zf.setInterpreterNum(zvm.bytes, Zf.InterpreterNum.IBMPC);
    // no particular reason
    Zf.setInterpreterVersion(zvm.bytes, 71);

    // we need to set the screen width, but we can't do it here
    // because it's too early--we may not have windows attached yet,
    // so once they're attached, but BEFORE running things, we need to
    // set up the scree width

    // set the screen height to infinite
    Zf.setScreenHeightLines(zvm.bytes, 0xff);
  }

  Zf.setStandardRevisionNum(zvm.bytes, (1 << 8) | 0);

  // specific to versions 5 and higher
  if (zvm.version >= 5) {
    Zf.setDefaultBackgroundColor(zvm.bytes, Zf.Color.Yellow);
    Zf.setDefaultForegroundColor(zvm.bytes, Zf.Color.Black);

    // recommended by the z-machine standard to set both to 1, (S.8 Remarks)
    Zf.setFontWidthUnits(zvm.bytes, 1);
    Zf.setFontHeight(zvm.bytes, 1);
  }
}

/**
 * The issue here is that most likely the z-machine reads and stores the width
 * once, so that this might change and not be updated. Well that's speculation.
 * In any case, we set the width here.
 * @param zvm the z-machine we are working with
 * @param height the height of the screen
 * @param width the width of the screen
 */
export function setScreenRect(zvm: zMachine, height: number, width: number) {
  if (zvm.version > 3) {
    // we set the screen width only for versions 4+
    Zf.setScreenWidthChar(zvm.bytes, width);
    Zf.setScreenHeightLines(zvm.bytes, height);
  }
  // note we set the screen width to be the same in units as chars
  // this is by recommendation of the standard because it appears infocom
  // games used 1x1 or 8x8 characters (and only 1x1 makes sense for a modern
  // screen)
  if (zvm.version > 5) {
    Zf.setScreenWidthUnits(zvm.bytes, width);
  }

  zvm.terminal.isScreenWidthSet = true;
}

/**
 * This function sets up the keyboard input.
 * @param zvm the zMachine we are working with
 * @param fun the function to be called for input by an external terminal
 */
export function setKeyboardInputFun(
  zvm: zMachine,
  fun: (str: string, newline: boolean) => void
) {
  zvm.terminal.keyboardInput = fun;
}

/**
 * used as the default method for input, this prints it to the output
 * @param zvm the zMachine we are working with
 * @param str the string that is read from the input
 */
export function defaultKeyboardInput(
  zvm: zMachine,
  str: string,
  echo: boolean
) {
  if (str.length > 0) {
    // see if the last character already has a newline, if so, push to a new buffer
    let buffers = zvm.terminal.inputBuffer;
    let len = buffers.length;
    if (len > 0) {
      let lastBuf = buffers[len - 1];
      // if it ends with a newline, just push it
      if (lastBuf[lastBuf.length - 1] === '\n') {
        buffers.push(str);
      } else {
        // otherwise, just keep queueing
        buffers[len - 1] += str;
      }

      // now see if we need to echo this new string to the screen other streams
      if (echo) {
        outputString(zvm, str, Stream.Screen);
      }
      if (zvm.outputStreams[Stream.Transcript] === true) {
        outputString(zvm, str, Stream.Transcript);
      }
    } else {
      // otherwise, just push to the buffers since we don't have any
      buffers.push(str);
      // see if it's newline terminated
      if (str[str.length - 1] === '\n') {
        if (echo) {
          outputString(zvm, str, Stream.Screen);
        }

        if (zvm.outputStreams[Stream.Transcript] === true) {
          outputString(zvm, str, Stream.Transcript);
        }
      }
    }
  }
}

// this just reads a single char and returns it
export function* readChar(zvm: zMachine) {
  if (zvm.version < 4) {
    throw Error("read_char wasn't supported in versions < 4");
  }

  let buffer = zvm.terminal.inputBuffer;
  while (buffer.length <= 0) {
    debugMsg(zvm, 'ready to read char');
    yield;
  }

  // read and convert the char
  let c = zstr.stringToZstr(buffer[0][0], 1);

  // now slice the buffer to eat up the character
  buffer[0] = buffer[0].slice(1, buffer[0].length);

  // get rid of it if it's empty
  if (buffer[0].length === 0) {
    zvm.terminal.inputBuffer = zvm.terminal.inputBuffer.slice(1);
  }

  // and finally, return it
  debugMsg(zvm, "parsed the character '" + c.zscii[0] + "'");
  return c.zscii[0];
}
/**
 * This takes a string from the buffer if there is one and writes it
 * to the given address. The size specifies the maximum number of bytes
 * to write. This is an interator function because it will continue to
 * yield ZState.Input *until* there's input
 * @param zvm the zMachine we are working with
 * @param addr the address to write to
 * @param size the number of bytes that can be written
 */
export function* readInput(zvm: zMachine, addr: number, size: number) {
  // (Interpreters are asked to halt with a suitable error message if the text or parse buffers have length
  // of less than 3 or 6 bytes, respectively: this sometimes occurs due to a previous array being overrun,
  // causing bugs which are very difficult to find.)
  if ((zvm.version < 4 && size < 3) || size < 6)
    throw Error(
      'unusually small buffer size, see Section 15 sread in the z-machine specification.'
    );

  let buffer = zvm.terminal.inputBuffer;
  // only write if the buffer length is > 0
  while (
    buffer.length <= 0 ||
    (buffer.length > 0 && buffer[0][buffer[0].length - 1] !== '\n')
  ) {
    debugMsg(zvm, 'waiting for input, currently have "' + buffer[0] + '"');
    yield;
  }

  // get the first string of the buffer, but cut off the newline
  let s = buffer[0].slice(0, buffer[0].length - 1).toLocaleLowerCase();

  debugMsg(zvm, "read: '" + s + "'");
  // now convert the string to a ZStr
  let z = zstr.stringToZstr(s, size - 1);

  let codes = '';
  for (let i = 0; i < z.length; i++) {
    codes += ' ' + z.zscii[i];
  }
  debugMsg(zvm, 'converted to: ' + z.zscii.length + ' characters: ' + codes);

  // and write the bytes
  if (zvm.version < 4) {
    writeBytes(zvm, addr + 1, z.zscii);
  } else {
    writeByte(zvm, addr + 1, z.length);
    writeBytes(zvm, addr + 2, z.zscii);
  }

  // chop off the first string of our buffer and keep the rest
  zvm.terminal.inputBuffer = zvm.terminal.inputBuffer.slice(1);

  // and return that we're running now
  return s;
}

/**
 *
 * @param zvm the zMachine we are working with
 * @param str the string we are parsing
 * @param addr the address we are writing the parse results to
 * @param size the number of bytes we're allowed to write
 */
export function parseInput(
  zvm: zMachine,
  str: string,
  parseAddr: number,
  size: number
) {
  // (Interpreters are asked to halt with a suitable error message if the text or parse buffers have length
  // of less than 3 or 6 bytes, respectively: this sometimes occurs due to a previous array being overrun,
  // causing bugs which are very difficult to find.)
  if ((zvm.version < 4 && size < 3) || size < 6)
    throw Error(
      'unusually small buffer size, see Section 15 sread in the z-machine specification.'
    );

  /*
   * Next, lexical analysis is performed on the text (except that in Versions 5
   * and later, if parse-buffer is zero then this is omitted). Initially, byte
   * 0 of the parse-buffer should hold the maximum number of textual words which
   * can be parsed. (If this is n, the buffer must be at least 2 + 4*n bytes long
   * to hold the results of the analysis.)
   *
   * The interpreter divides the text into words and looks them up in the
   * dictionary, as described in S 13. The number of words is written in byte
   * 1 and one 4-byte block is written for each word, from byte 2 onwards
   * (except that it should stop before going beyond the maximum number of words
   * specified). Each block consists of the byte address of the word in the
   * dictionary, if it is in the dictionary, or 0 if it isn't; followed by a
   * byte giving the number of letters in the word; and finally a byte giving
   * the position in the text-buffer of the first letter of the word.
   */

  // first split by spaces
  if (!zvm.wordSepRegExp) {
    throw Error('No valid word separator regular expression');
  }

  //let words = str.split(zvm.wordSepRegExp).filter(el => el !== '' && el !== ' ' && el !== '\r' && el !== '\n');
  //words.forEach(el => { debugMsg(zvm, "parsed: '" + el + "'"); });

  let words: { word: string; startPos: number; location: number }[] = [];
  // make sure it starts at the start of the string
  zvm.wordSepRegExp.lastIndex = 0;
  let start = 0;
  // now we will walk through and figure out what the words are
  let res = zvm.wordSepRegExp.exec(str);

  let offset = zvm.version < 5 ? 1 : 2;
  while (res) {
    //debugMsg(zvm, 'res: \'' + res[0] + '\', index: ' + res.index + ', start: ' + start);
    if (res.index > start) {
      let w = str.slice(start, res.index);
      //debugMsg(zvm, 'found word: \'' + w + '\' at ' + start);
      // then add it to our list of words
      let lookup = zd.search(zvm, zvm.standardDictionary, w);
      words.push({ word: w, startPos: start + offset, location: lookup });
    }

    if (res[1] !== undefined) {
      //debugMsg(zvm, 'found a word separator: ' + res[1]);
      let lookup = zd.search(zvm, zvm.standardDictionary, res[1]);
      words.push({
        word: res[1],
        startPos: res.index + offset,
        location: lookup
      });
    }

    start = zvm.wordSepRegExp.lastIndex;
    res = zvm.wordSepRegExp.exec(str);
  }

  // now that we have all these, let's write them to the parse table
  // note, we start writing at byte 1, since byte 0 has the number of
  // entries we can read
  let addr = parseAddr + 1;
  if (size > words.length) {
    words = words.slice(0, size);
  }

  // 59 is really the maximum size of a 240 byte buffer, so we'll force it there,
  // even though if it's less, we're probably going to overrun some stuff
  words = words.slice(0, Math.min(size, 59));

  // write how many words were parsed (up to 255 I suppose)
  writeByte(zvm, addr++, words.length);
  // next, write the words we parsed and their dictionary addresses
  words.forEach(word => {
    debugMsg(
      zvm,
      'writing word: ' +
        word.word +
        ' which is at location: ' +
        word.location.toString(16) +
        ' with position: ' +
        word.startPos
    );
    writeWord(zvm, addr, word.location ? word.location : 0);
    addr += 2;
    // now the length
    writeByte(zvm, addr++, word.word.length);

    // and now its position in the text buffer
    writeByte(zvm, addr++, word.startPos + 1);
  });
}

/**
 * This function will evaluate the next instruction and yield a state the
 * z-machine is in. This won't 'return' until it's either encountered a quit
 * instruction or error since there will continue to be something that it can
 * evaluate.
 * A z-machine instruction has the following (in the order given)
 * Opcode               1 or 2 bytes
 * (Types of operands)  1 or 2 bytes: 4 or 8 2-bit fields
 * Operands             Between 0 and 8 of these: each 1 or 2 bytes
 * (Store variable)     1 byte
 * (Branch offset)      1 or 2 bytes
 * (Text to print)      An encoded string (of unlimited length)
 * @param zvm The zmachine which is being evaluated
 */
export function* evalNext(zvm: zMachine) {
  // if (zvm.terminal.isScreenWidthSet === false) {
  //     throw Error('You must set the screen width before starting up the z-machine so that headers are set properly');
  // }
  while (true) {
    // if something goes crazy, stop
    if (isNaN(zvm.pc)) {
      throw Error('pc is NaN!');
    }

    // can't move past the end of the story
    if (zvm.pc > zvm.bytes.length) {
      throw Error(
        'PC has exceeded the length of the story, something has gone wrong!'
      );
    }

    // first, make sure it's in the right location--ie, above high
    if (zvm.pc < zvm.high)
      throw Error(
        'pc is set to ' +
          zvm.pc.toString(16) +
          ', which is below legal executable memory at ' +
          zvm.high.toString(16)
      );

    // get the next instruction and increment the program counter
    //debugMsg(zvm, "PC: " + zvm.pc.toString(16));
    let instr = readByte(zvm);

    // now determine the instruction type by looking at the topmost bits (6 and 7)
    switch (instr & BITS_67) {
      case 0x00:
      case 0x40: // bits: 01 00 00 00
        //debugMsg(zvm, 'long instruction');
        evalLongForm(zvm, instr);
        break;
      case 0x80: // bits: 10 00 00 00
        //debugMsg(zvm, 'short form');
        evalShortForm(zvm, instr);
        break;
      case 0xc0: // bits: 11 00 00 00
        //debugMsg(zvm, 'variable form');
        yield* evalVarForm(zvm, instr);
        break;
      default:
        throw Error('unexpected instruction type');
    }

    // see if our instruction told us to quit, and if so, escape by
    // finishing up the iteration, since there's nothing left to compute
    if (zvm.exited === true) {
      debugMsg(zvm, 'completed computation in zvm, exiting');
      return ZState.Quit;
    } else {
      // otherwise, we're still running
      yield ZState.Running;
    }
  }
}

/**
 * Evaluates a variable form instruction
 * @param zvm
 * @param instr
 */
export function* evalVarForm(zvm: zMachine, instr: number) {
  // determine the number of ops
  let addr = (zvm.pc - 1).toString(16) + ': ';
  let op2Version = false;
  if ((instr & zinst.BIT_5) === 0) {
    // if it's a 2-op version, their OP code is really from the 2OP table,
    // so in essence there's a second translation going on!
    op2Version = true;
  }

  // log opcode
  let opcode = instr & 0x1f;
  let info = { str: '' };
  switch (opcode) {
    case 0x0:
      if (op2Version) {
        throw Error(
          'VAR version of op2 opcode (' +
            opcode.toString(16) +
            ') is not implemented'
        );
      } else {
        zinst.call(zvm);
        // pretty major event, so update the locals table
        if (zvm.localsTableListener) zvm.localsTableListener();
        return ZState.Running;
      }
    case 0x1:
      if (op2Version) {
        // two op VAR version of 0x1 opcode is je
        info.str = addr + 'je_var ';
        zinst.jumpEqVar(zvm, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      } else {
        // store word
        info.str = addr + 'storew ';
        zinst.store(zvm, instr, true, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      }
    case 0x2:
      if (op2Version) {
        // jumpltvar
        info.str = addr + 'jl_var ';
        zinst.jumpLtVar(zvm, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      } else {
        // store byte
        info.str = addr + 'storeb ';
        zinst.store(zvm, instr, false, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      }
    case 0x3:
      if (op2Version) {
        info.str = addr + 'jg_var ';
        zinst.jumpGtVar(zvm, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      } else {
        info.str = addr + 'put_prop ';
        zinst.putProperty(zvm, instr, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      }
    case 0x4:
      if (op2Version) {
        info.str = addr + 'dec_chk_var ';
        zinst.parseVar2OPAndCall(zvm, opcode, zinst.decCheckLong, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      } else {
        // read-char
        info.str = addr + 'read ';
        yield* zinst.sread(zvm, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      }
    case 0x5:
      if (op2Version) {
        // inc_chk, the VAR form
        info.str = addr + 'inc_chk (var) ';
        zinst.incCheckVar(zvm, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      } else {
        // print char
        info.str = addr + 'print_char ';
        zinst.printChar(zvm, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      }
    case 0x6:
      if (op2Version) {
        info.str = addr + 'jin_var ';
        zinst.parseVar2OPAndCall(zvm, opcode, zinst.jumpIn, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      } else {
        info.str = addr + 'print_num ';
        zinst.printNum(zvm, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      }
    case 0x7:
      if (op2Version) {
        info.str = addr + 'test_var ';
        zinst.parseVar2OPAndCall(zvm, opcode, zinst.testLong, info);
        return ZState.Running;
      } else {
        // random!
        info.str = addr + 'random';
        zinst.random(zvm, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      }
    case 0x8:
      if (op2Version) {
        info.str = addr + 'or_var ';
        zinst.parseVar2OPAndCall(zvm, opcode, zinst.orLong, info);
        return ZState.Running;
      } else {
        info.str = addr + 'push ';
        zinst.push(zvm, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      }
    case 0x9: // and in the 2op version, which could have more than two ops!
      if (op2Version) {
        info.str = addr + 'and (var) ';
        zinst.andVar(zvm, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      } else {
        // otherwise it's a pull
        info.str = addr + 'pull ';
        zinst.pull(zvm, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      }
    case 0xa:
      if (op2Version) {
        // this is the var form of test_attr
        info.str = addr + 'test_attr_var ';
        zinst.testAttrVar(zvm, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      } else {
        // split window
        zinst.splitWindow(zvm, info);
        debugMsg(zvm, addr + 'split_window ' + info.str);
        return ZState.Running;
      }
    case 0xb:
      if (op2Version) {
        info.str = addr + 'set_attr_var ';
        zinst.setAttrVar(zvm, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      } else {
        // set window
        zinst.setWindow(zvm, info);
        debugMsg(zvm, addr + 'set_window ' + info.str);
        return ZState.Running;
      }

    case 0xc:
      if (!op2Version) {
        info.str += addr + 'call_vs2 ';
        zinst.call_vs2(zvm, true, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      } else {
        info.str += addr + 'clear_attr ';
        zinst.clearAttrVar(zvm, info);
        return ZState.Running;
      }
    case 0xd:
      // if it's the 2 op version, then it's really a long form instruction with
      // 2 operands, so we'll have to parse the operand byte first, and deal with
      // indirect references for this store form (which is handled in storeVar)
      if (op2Version) {
        info.str = addr + 'store (var) ';
        zinst.storeVar(zvm, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      } else {
        zinst.eraseWindow(zvm, info);
        debugMsg(zvm, addr + 'erase_window ' + info.str);
        return ZState.Running;
      }
    case 0xe:
      if (op2Version) {
        // var form of insert_obj
        info.str = addr + 'insert_obj_var ';
        zinst.insertObjectVar(zvm, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      }
      break;
    case 0xf:
      if (op2Version) {
        // var form of loadw
        info.str = addr + 'loadw_var ';
        zinst.parseVar2OPAndCall(zvm, opcode, zinst.loadWordOp, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      } else {
        zinst.setCursor(zvm, info);
        debugMsg(zvm, addr + 'set_cursor ' + info.str);
        return ZState.Running;
      }
    case 0x10:
      if (op2Version) {
        // var form of loadb
        info.str = addr + 'loadb_var ';
        zinst.parseVar2OPAndCall(zvm, opcode, zinst.loadByteOp, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      }
      break;
    case 0x11:
      if (op2Version) {
        // var form of get_prop
        zinst.getPropVar(zvm, info);
        debugMsg(zvm, addr + 'get_prop_var ' + info.str);
        return ZState.Running;
      } else {
        // set text style
        zinst.setTextStyle(zvm, info);
        debugMsg(zvm, addr + 'set_text_style ' + info.str);
        return ZState.Running;
      }
    case 0x12:
      if (!op2Version) {
        // buffer mode, basically, can you buffer this text
        zinst.bufferMode(zvm, info);
        debugMsg(zvm, addr + 'buffer_mode ' + info.str);
        return ZState.Running;
      }
      break;
    case 0x13:
      if (!op2Version) {
        zinst.setOutputStream(zvm, info);
        debugMsg(zvm, addr + 'output_stream ' + info.str);
        return ZState.Running;
      }
      break;
    case 0x16:
      if (!op2Version) {
        yield* zinst.readChar(zvm, info);
        debugMsg(zvm, addr + 'read_char ' + info.str);
        return ZState.Running;
      }
      break;
    case 0x17:
      if (!op2Version) {
        // scan
        info.str = addr + 'scan_table ';
        zinst.scan(zvm, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      }
      break;
    case 0x19:
      if (op2Version) {
        zinst.call2Var(zvm, true, 0x19, info);
        debugMsg(zvm, addr + 'call_2sv ' + info.str);
        return ZState.Running;
      }
      break;
    case 0x1a:
      if (op2Version) {
        zinst.call2Var(zvm, true, 0x20, info);
        debugMsg(zvm, addr + 'call_2sv ' + info.str);
        return ZState.Running;
      }
      break;
    default:
      if (op2Version) {
        throw Error(
          'VAR version of op2 opcode (' +
            opcode.toString(16) +
            ') is not implemented'
        );
      }
      throw Error(
        'evalVarForm instruction ' +
          instr.toString(16) +
          ' at ' +
          (zvm.pc - 1).toString(16) +
          ' with opcode ' +
          opcode.toString(16) +
          ' not implemented'
      );
  }

  throw Error(
    'evalVarForm instruction ' +
      instr.toString(16) +
      ' at ' +
      (zvm.pc - 1).toString(16) +
      ' with opcode ' +
      opcode.toString(16) +
      ' not implemented'
  );
}

/**
 * Evaluate the instruction as a short form. The PC will have already been advanced
 * to the next byte after the instruction, but we still need bits from it to determine
 * how to behave.
 * @param zvm the zMachine we are working with
 * @param instr the instruction (already determined to be a short form instruction)
 */
export function evalShortForm(zvm: zMachine, instr: number) {
  // short form uses bits 4 and 5 for the operand type, and short forms only have
  // a single operand after the instruction
  let addr = (zvm.pc - 1).toString(16) + ': ';
  let info = { str: '' };
  let op1 = null;
  let opTy = (instr & 0x30) >> 4;

  // now that we have the op, we can check to see what the instruction is,
  // which lives in the bottom 4 bits of the instruction
  let opcode = instr & 0xf;

  // switch on the operand type to read it in
  switch (opTy) {
    // large constant, which starts at the PC
    case 0b00:
      op1 = readWord(zvm);
      info.str += '#' + op1.toString(16) + ' ';
      //debugMsg(zvm, 'op1 from large constant ' + op1);
      if (zvm.standardDictionary.entriesByAddr[op1] !== undefined) {
        info.str += '"' + zvm.standardDictionary.entriesByAddr[op1].str + '" ';
      }
      break;
    // small constant
    case 0b01:
      op1 = readByte(zvm);
      if (opcode === 0x5) {
        info.str += getVarStr(zvm, op1, peekVariable(zvm, op1));
      } else {
        info.str += '#' + op1.toString(16) + ' ';
        //debugMsg(zvm, 'op1 is small constant ' + op1);
        switch (opcode) {
          case 0x1:
          case 0x2:
          case 0x3:
          case 0x9:
          case 0xa:
            info.str +=
              '"' + zo.getObjectShortName(zvm.objectTable, op1) + '" ';
            break;
          default:
            break;
        }
      }
      break;
    // read from var
    case 0b10:
      op1 = getVariable(zvm, readByte(zvm));
      info.str += getVarStr(zvm, zvm.bytes[zvm.pc - 1], op1);
      //debugMsg(zvm, 'op1 from var ' + zvm.bytes[zvm.pc] + ' is ' + op1);
      switch (opcode) {
        case 0x1:
        case 0x2:
        case 0x3:
        case 0x9:
        case 0xa:
          info.str += '"' + zo.getObjectShortName(zvm.objectTable, op1) + '" ';
          break;
        case 0x5: // inc-var
        case 0x6: // dec-var
        case 0xe: // load
          info.str =
            '[' + zinst.varToString(zvm.bytes[zvm.pc - 1]) + '] (' + op1 + ')';
          break;
        default:
          break;
      }
      break;
    // in theory, this is just 0b11, so no op?
    case 0b11:
      break;
    default:
      throw Error('Sanity check: illegal opcode type');
  }

  //debugMsg(zvm, 'instr is ' + instr + ', opcode is: ' + opcode);
  let storeLoc = 0;
  switch (opcode) {
    case 0:
      // if op1 is 0, then this was the rtrue opcode
      if (op1 === null) {
        info.str = addr + 'rtrue -> ';
        popStackFrame(zvm, 1);
        debugMsg(zvm, info.str + zvm.pc.toString(16));
        return ZState.Running;
      } else {
        // jz - jump if op1 is 0
        zinst.branch(zvm, zmath.eq(op1, 0), info);
        debugMsg(zvm, addr + 'jz ' + info.str);

        return ZState.Running;
      }
    case 0x1:
      // rfalse for the no-op version
      if (op1 === null) {
        info.str = addr + 'rfalse -> ';
        popStackFrame(zvm, 0);
        debugMsg(zvm, info.str + zvm.pc.toString(16));
        return ZState.Running;
      } else {
        // get_child object -> result ?(label)
        zinst.getSibling(zvm, op1, info);
        debugMsg(zvm, addr + 'get_sibling ' + info.str);
        return ZState.Running;
      }
    case 0x2:
      if (op1 === null) {
        info.str = addr + 'print "';
        // print, the first output we're writing!

        zinst.printZStr(zvm, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      } else {
        // get_child object -> result ?(label)
        zinst.getChild(zvm, op1, info);
        debugMsg(zvm, addr + 'get_child ' + info.str);
        return ZState.Running;
      }
    case 0x3:
      if (op1 === null) {
        // print_return
        info.str = addr + 'print_ret "';
        // print-return the literal string, so first print it
        zinst.printZStr(zvm, info);
        // then output a newline
        outputString(zvm, '\n');
        debugMsg(zvm, info.str);
        // then return true (which is 1)
        popStackFrame(zvm, 1);
        return ZState.Running;
      } else {
        zinst.getParent(zvm, op1, info);
        debugMsg(zvm, addr + 'get_parent ' + info.str);
        return ZState.Running;
      }
    case 0x4:
      // get_prop_len property-address -> (result)
      if (op1 === null) {
        // the nop instruction is a 0OP short form
        debugMsg(zvm, addr + 'nop');
        return ZState.Running;
      } else {
        zinst.getPropertyAddrLen(zvm, op1, info);
        debugMsg(zvm, addr + 'get_property_addr_len ' + info.str);
        return ZState.Running;
      }
    case 0x5:
      // increment
      if (op1 !== null) {
        if (opTy === 0b00) throw Error('unexpected type for increment');

        // if it's var type, we have one more level of indirection, but we will
        // have read the actual var type and placed it in op1
        debugMsg(zvm, addr + 'inc-var ' + info.str);
        zinst.increment(zvm, op1);
        return ZState.Running;
      } else {
        outputString(zvm, 'Saving...');
        zvm.tmpSaveGame = makeSaveGame(zvm);
        let res = false;
        if (zvm.saveGameListener !== null) {
          res = zvm.saveGameListener(zvm.tmpSaveGame);
        }

        // we assume saving is true, so branch if we are version 3
        if (zvm.version < 4) {
          // this reads branch info
          zinst.branch(zvm, res, info);
        } else if (zvm.version === 4) {
          // read the next byte and stores it in that location
          let storeLoc = readByte(zvm);
          info.str += '-> ' + zinst.varToString(storeLoc) + '(';
          storeVariable(zvm, storeLoc, res === true ? 1 : 0);
          info.str += peekVariable(zvm, storeLoc) + ')';
        } else {
          throw Error('save instruction not valid in this version');
        }
        debugMsg(zvm, addr + 'save ' + info.str);

        return ZState.Running;
      }

    case 0x6:
      if (op1 !== null) {
        // this would be long constant, which seems odd
        if (opTy === 0b00) {
          throw Error('unexpected type for decrement at');
        }

        // if it's var type, we have one more level of indirection, but we will
        // have read the actual var type and placed it in op1
        debugMsg(zvm, addr + 'dec-var ' + info.str);
        zinst.decrement(zvm, op1);
        return ZState.Running;
      } else {
        // this is the restore opcode
        if (zvm.restoreGameListener !== null) {
          zvm.tmpSaveGame = zvm.restoreGameListener();
        }

        // if there's a save game, let's try to load it
        if (zvm.tmpSaveGame) {
          if (zvm.tmpSaveGame.sourceName.localeCompare(zvm.sourceName) !== 0) {
            debugMsg(
              zvm,
              addr + 'failed to restore game, not the same source name'
            );
            if (zvm.version < 4) {
              zinst.branch(zvm, false, info);
            } else if (zvm.version === 4) {
              // if it's version 4, we store true or false instead of branching
              storeLoc = readByte(zvm);
              info.str += '-> ' + zinst.varToString(storeLoc) + '(';
              storeVariable(zvm, storeLoc, 0);
              info.str += peekVariable(zvm, storeLoc);
            } else {
              throw Error(
                'illegal save game opcode for z-version ' + zvm.version
              );
            }
            debugMsg(zvm, addr + 'restore ' + info.str);
          } else {
            // this means that we did restore it
            debugMsg(zvm, addr + 'restoring save game');
            loadSaveGame(zvm, zvm.tmpSaveGame);
            debugMsg(zvm, 'zvm.pc is now: ' + zvm.pc);

            if (zvm.version < 4) {
              // now branch if this is failed for some reason
              zinst.branch(zvm, true, info);
            } else if (zvm.version === 4) {
              storeLoc = readByte(zvm);
              info.str += '-> ' + zinst.varToString(storeLoc) + '(';
              storeVariable(zvm, storeLoc, 1);
              info.str += peekVariable(zvm, storeLoc);
            } else {
              throw Error(
                'illegal save game opcode for z-version ' + zvm.version
              );
            }
            debugMsg(zvm, addr + 'restore ' + info.str);
          }
          return ZState.Running;
        } else {
          outputString(zvm, 'No save game present');

          if (zvm.version < 4) {
            zinst.branch(zvm, false, info);
          } else if (zvm.version === 4) {
            storeLoc = readByte(zvm);
            info.str += '-> ' + zinst.varToString(storeLoc) + '(';
            storeVariable(zvm, storeLoc, 0);
            info.str += peekVariable(zvm, storeLoc);
          } else {
            throw Error(
              'illegal save game opcode for z-version ' + zvm.version
            );
          }
          debugMsg(zvm, addr + 'restore ' + info.str);
          // update the tables
          if (zvm.localsTableListener) zvm.localsTableListener();
          if (zvm.globalsTableListener) zvm.globalsTableListener();
          return ZState.Running;
        }
      }
    case 0x7:
      if (op1 === null) {
        // restart
        debugMsg(zvm, addr + 'restart');
        restart(zvm);
        return ZState.Running;
      } // print_addr
      else {
        debugMsg(zvm, addr + 'print_addr ' + info.str);
        zinst.printByteAddr(zvm, op1);
        return ZState.Running;
      }
    case 0x8:
      if (op1 === null) {
        // ret_pop, which is like ret sp but 1 byte shorter
        // first pop the top of the stack off
        op1 = Stack.pop(zvm.stack);
        // then return it
        popStackFrame(zvm, op1);
        debugMsg(
          zvm,
          addr + 'ret_popped ' + info.str + '>> ' + zvm.pc.toString(16)
        );
        return ZState.Running;
      } else {
        // otherwise it's a call 1s, which calls the routine and stores it
        zinst.call1(zvm, op1, true, info);
        debugMsg(zvm, addr + 'call_1s ' + info.str);
        return ZState.Running;
      }
    case 0x9:
      if (op1 === null) {
        // pop:
        debugMsg(zvm, addr + 'pop');
        // just pop the top item off the stack and throw it away
        Stack.pop(zvm.stack);
        return ZState.Running;
      } else {
        // remove_obj
        // this just sets the parent to 0, effectively removing it from the parent
        zinst.removeObject(zvm, op1, info);
        debugMsg(zvm, addr + 'remove_obj ' + info.str);
        return ZState.Running;
      }
    case 0xa:
      if (op1 === null) {
        // if op1 is null, it's a quit op
        debugMsg(zvm, addr + 'quit');
        zvm.exited = true;
        outputString(zvm, '\n\nYou may reload the page to restart.');
      } else {
        debugMsg(zvm, addr + 'print_obj ' + info.str);
        zinst.printObj(zvm, op1);
      }
      return ZState.Running;
    case 0xb:
      if (op1 === null) {
        // the no-op instruction of 0xB is print newline, we can just
        // call print with an empty string here and move on
        outputString(zvm, '\n');
        debugMsg(zvm, addr + 'new_line');
        return ZState.Running;
      } else {
        // return
        info.str = addr + 'return ' + info.str;
        popStackFrame(zvm, op1);
        info.str += '>> ' + zvm.pc.toString(16);
        debugMsg(zvm, info.str);
        return ZState.Running;
      }
    case 0xc:
      if (op1 !== null) {
        // jump (unconditional)
        // sanity checking
        if (opTy !== 0) throw Error('expecting large constant for jump');

        info.str = addr + 'jump ';
        zinst.jump(zvm, op1, info);
        debugMsg(zvm, info.str);
        return ZState.Running;
      }
      throw Error(
        '0OP version of 0xC at ' +
          (zvm.pc - 1).toString(16) +
          ' not implemented '
      );
    case 0xd:
      if (op1 !== null) {
        // it's print_paddr, where the address is in packed address form
        zinst.printPackedAddr(zvm, op1, info);
        debugMsg(zvm, addr + 'print_paddr ' + info.str);
        return ZState.Running;
      }
      throw Error(
        'evalShortForm "verify" at ' +
          zvm.pc.toString(16) +
          ' with opcode ' +
          opcode.toString(16) +
          ' not implemented'
      );
    case 0xe:
      if (op1 !== null) {
        // okay, figure out where we store to
        storeLoc = readByte(zvm);
        info.str += '-> ' + zinst.varToString(storeLoc);

        info.str += ' (' + op1.toString(16) + ')';
        debugMsg(zvm, addr + 'load short ' + info.str);

        // now handle the indirect reference, op1 is currently
        // the variable we want to load from, so get its value
        if (opTy === zinst.VARIABLE_TYPE) {
          if (op1 === 0) {
            op1 = Stack.top(zvm.stack);
          } else {
            op1 = getVariable(zvm, op1);
          }
        }
        // now actually store it
        storeVariable(zvm, storeLoc, op1);
        return ZState.Running;
      }

      throw Error(
        'Extended OPS not implemented at ' +
          zvm.pc.toString(16) +
          ' with opcode ' +
          opcode.toString(16) +
          ' not implemented'
      );
    case 0xf:
      throw Error(
        'evalShortForm "not" at ' +
          zvm.pc.toString(16) +
          ' with opcode ' +
          opcode.toString(16) +
          ' not implemented'
      );
    default:
      break;
  }

  throw Error(
    'evalShortForm instruction at ' +
      zvm.pc.toString(16) +
      ' with opcode ' +
      opcode.toString(16) +
      ' not implemented'
  );
}

/**
 * This parses the two operands and then executes a getVariable, advancing the
 * program counter as needed. There are 7 instructions which sort of pass by
 * reference and in theory they encode the instruction using a small constant
 * instead of a var. These are dec, dec_chk, inc, inc_chk, load, store, pull.
 * The reason it's a problem is that if they mark the type as a variable, and
 * that type is the stack, it would cause it to pop the value off the stack: in
 * particular, dec, dec_chk, inc, and inc_chk should do this in place, i.e.,
 * increment or decrement the variable directly on the stack instead of popping.
 *
 * Here's what the standard says (hopefullyload we have this right, or we are going to
 * have some pretty subtle bugs!)
 * In the seven opcodes that take indirect variable references (inc, dec, inc_chk,
 * dec_chk, load, store, pull), an indirect reference to the stack pointer does not
 * push or pull the top item of the stack - it is read or written in place.
 *
 * @param zvm the zMachine we are working with
 * @param instr the instruction we are working on
 */
export function read2Ops(zvm: zMachine, instr: number) {
  // if bit 6 is 1, it's a variable, if it's 0 it's a short constant
  let op1 =
    zop.getBit(instr, 6) === 1
      ? getVariable(zvm, zvm.bytes[zvm.pc])
      : zvm.bytes[zvm.pc];
  // if bit 5 is 1, it's a variable, if it's 0 it's a short constant
  let op2 =
    zop.getBit(instr, 5) === 1
      ? getVariable(zvm, zvm.bytes[zvm.pc + 1])
      : zvm.bytes[zvm.pc + 1];

  return [op1, op2];
}

function getVarStr(zvm: zMachine, varLoc: number, varVal: number) {
  return (
    zinst.varToString(varLoc) +
    ' (' +
    varVal.toString(16) +
    ') ' +
    (zvm.standardDictionary.entriesByAddr[varVal] !== undefined
      ? '"' + zvm.standardDictionary.entriesByAddr[varVal].str + '" '
      : '')
  );
}
/**
 *
 * @param zvm The zMachine being evaluated
 * @param instr The current instruction we are evaluating
 */
export function evalLongForm(zvm: zMachine, instr: number) {
  // opcount is always 2 for long instructions, and these
  // can be either variables or short constants--each will be a byte

  // start recording info
  let addr = (zvm.pc - 1).toString(16) + ': ';
  let info = { str: '' };

  // get the opcode, it's the first 5 bits (0 to 4)
  let opcode = zop.getBitRange(instr, 0, 4);

  let op1 = 0;
  let op2 = 0;
  // if bit 6 is 1, it's a variable, if it's 0 it's a short constant
  let byRef = false;
  if (zop.getBit(instr, 6) === 1) {
    switch (opcode) {
      // this is the special case for those instructions with indirect references
      // because we want to variable named inside of the variable
      case 0x0d:
        op1 = getByte(zvm, zvm.pc);
        info.str += '[' + op1 + '] ';
        byRef = true;

        if (op1 === 0) {
          op1 = Stack.top(zvm.stack);
        } else {
          op1 = getVariable(zvm, op1);
        }
        // op1 now has the variable we want to read from, so we do it again, but
        // don't pop or push the stack
        let op1Val = 0;
        if (op1 === 0) {
          op1Val = Stack.top(zvm.stack);
        } else {
          op1Val = getVariable(zvm, op1);
        }

        info.str += '{' + op1 + '} (' + op1Val.toString(16) + ') ';
        break;
      default:
        op1 = getVariable(zvm, zvm.bytes[zvm.pc]);
        info.str += getVarStr(zvm, zvm.bytes[zvm.pc], op1);
        break;
    }
    switch (opcode) {
      case 0x06:
      case 0x0e:
      case 0x0a:
      case 0x0b:
      case 0x11:
      case 0x12:
      case 0x13:
        info.str += '"' + zo.getObjectShortName(zvm.objectTable, op1) + '" ';
        break;
      case 0x19:
      case 0x1a:
        info.str +=
          '[' + calculatePackedRoutineAddress(zvm, op1).toString(16) + '] ';
        break;
      default:
        break;
    }
  } else {
    op1 = getByte(zvm, zvm.pc);
    // slight deviation for some of these opcodes
    switch (opcode) {
      case 0x04: // dec_chk
      case 0x05: // inc_chk
        info.str += getVarStr(zvm, op1, peekVariable(zvm, op1));
        break;
      case 0x0d:
        info.str += getVarStr(zvm, op1, peekVariable(zvm, op1)) + '<- ';
        break;
      default:
        info.str += '#' + op1.toString(16) + ' ';
    }

    switch (opcode) {
      case 0x06:
      case 0x0a:
      case 0x0b:
      case 0x0c:
      case 0x0e:
        info.str += '"' + zo.getObjectShortName(zvm.objectTable, op1) + '" ';
        break;
      default:
        break;
    }
  }
  if (zop.getBit(instr, 5) === 1) {
    op2 = getVariable(zvm, zvm.bytes[zvm.pc + 1]);
    info.str += getVarStr(zvm, zvm.bytes[zvm.pc + 1], op2);

    switch (opcode) {
      case 0x06:
      case 0x0e:
        info.str += '"' + zo.getObjectShortName(zvm.objectTable, op2) + '" ';
        break;
      default:
        break;
    }
  } else {
    op2 = getByte(zvm, zvm.pc + 1);
    info.str += '#' + op2.toString(16) + ' ';

    switch (opcode) {
      case 0x06:
        info.str += '"' + zo.getObjectShortName(zvm.objectTable, op2) + '" ';
        break;
      default:
        break;
    }
  }

  // increment the program counter by 2 more for each byte for the ops
  zvm.pc += 2;

  let storeLoc = 0;
  let loadedVal = 0;
  switch (opcode) {
    case 0x00: // a weird kind of null op, just do nothing
      debugMsg(zvm, 'the no op thingy');
      break;
    case 0x01:
      // done!
      zinst.branch(zvm, zmath.eq(op1, op2), info);
      debugMsg(zvm, addr + 'je ' + info.str);

      break;
    case 0x02:
      // done!
      zinst.branch(zvm, zmath.lt(op1, op2), info);
      debugMsg(zvm, addr + 'jl ' + info.str);
      break;
    case 0x03:
      // done!
      zinst.branch(zvm, zmath.gt(op1, op2), info);
      debugMsg(zvm, addr + 'jg ' + info.str);
      break;
    case 0x04:
      // dec_check
      if (zop.getBit(instr, 6) === 1)
        throw Error('unexpected var type for op1 dec_chk');
      zinst.decCheckLong(zvm, op1, op2, info);
      debugMsg(zvm, addr + 'dec_chk long ' + info.str);
      break;
    case 0x05:
      // inc_check
      if (zop.getBit(instr, 6) === 1)
        throw Error('unexpected var type for op1 inc_chk');
      zinst.incCheckLong(zvm, op1, op2, info);
      debugMsg(zvm, addr + 'inc_chk long ' + info.str);
      break;
    case 0x06:
      zinst.jumpIn(zvm, op1, op2, info);
      debugMsg(zvm, addr + 'jin ' + info.str);
      break;
    case 0x07:
      // test: tests if the flags (op2) are all set in op1, if so, the result should be op2
      zinst.testLong(zvm, op1, op2, info);
      debugMsg(zvm, addr + 'test ' + info.str);
      break;
    case 0x08: // logical or
      zinst.orLong(zvm, op1, op2, info);
      debugMsg(zvm, addr + 'or ' + info.str);
      break;
    case 0x09: // logical and
      info.str += '-> ' + zinst.varToString(zvm.bytes[zvm.pc]);
      debugMsg(zvm, addr + 'and ' + info.str);
      storeVariable(zvm, readByte(zvm), zmath.and(op1, op2));
      break;
    case 0x0a: // test attribute
      zinst.testAttr(zvm, op1, op2, info);
      debugMsg(zvm, addr + 'test_attr ' + info.str);
      break;
    case 0x0b: // set attribute
      debugMsg(zvm, addr + 'set_attr ' + info.str);
      zinst.setAttr(zvm, op1, op2);
      break;
    case 0x0c: // clear attribute
      debugMsg(zvm, addr + 'clear_attr ' + info.str);
      zinst.clearAttr(zvm, op1, op2);
      break;
    case 0x0d: // store
      debugMsg(zvm, addr + 'store ' + info.str);
      zinst.storeLong(zvm, op1, op2, byRef, info);
      // storeVariable(zvm, op1, op2);
      break;
    case 0x0e: // insert_obj
      debugMsg(zvm, addr + 'insert_obj ' + info.str);
      zinst.insertObject(zvm, op1, op2);
      break;
    case 0x0f: // loadw in long form
      storeLoc = readByte(zvm);
      loadedVal = loadWord(zvm, op1, op2);
      info.str += '[0x' + (op1 + op2 * 2).toString(16) + '] ';
      info.str += '-> ' + zinst.varToString(storeLoc);
      info.str += ' (' + loadedVal.toString(16) + ')';
      debugMsg(zvm, addr + 'loadw long ' + info.str);
      storeVariable(zvm, storeLoc, loadedVal);
      break;
    case 0x10: // loadb in long form
      storeLoc = readByte(zvm);
      loadedVal = loadByte(zvm, op1, op2);
      info.str += '[0x' + (op1 + op2).toString(16) + '] ';
      info.str += '-> ' + zinst.varToString(storeLoc);
      info.str += ' (' + loadedVal.toString(16) + ')';
      debugMsg(zvm, addr + 'loadb long ' + info.str);
      storeVariable(zvm, storeLoc, loadedVal);
      break;
    case 0x11: // get property and store it in a variable
      storeLoc = readByte(zvm);
      info.str += '-> ' + zinst.varToString(storeLoc);
      loadedVal = zinst.getProperty(zvm, op1, op2);
      info.str += ' (' + loadedVal.toString(16) + ')';
      storeVariable(zvm, storeLoc, loadedVal);
      debugMsg(zvm, addr + 'get_prop ' + info.str);
      break;
    case 0x12: // get property address and store it in a variable
      storeLoc = readByte(zvm);
      info.str += '-> ' + zinst.varToString(storeLoc);
      loadedVal = zinst.getPropertyAddr(zvm, op1, op2);
      info.str += ' (' + loadedVal.toString(16) + ')';
      debugMsg(zvm, addr + 'get_prop_addr ' + info.str);
      storeVariable(zvm, storeLoc, loadedVal);
      break;
    case 0x13: // get next prop and store the result in a variable
      storeLoc = readByte(zvm);
      info.str += '-> ' + zinst.varToString(storeLoc);
      storeVariable(zvm, storeLoc, zinst.getNextProp(zvm, op1, op2, info));
      debugMsg(zvm, addr + 'get_next_prop ' + info.str);
      break;
    case 0x14: // add, the next byte is the location to store at
      // done!
      info.str += '-> ' + zinst.varToString(zvm.bytes[zvm.pc]);
      debugMsg(zvm, addr + 'add ' + info.str);
      storeVariable(zvm, readByte(zvm), zmath.add(op1, op2));
      break;
    case 0x15: // sub, the next byte is the location to store at
      // done!
      info.str += '-> ' + zinst.varToString(zvm.bytes[zvm.pc]);
      debugMsg(zvm, addr + 'sub ' + info.str);
      storeVariable(zvm, readByte(zvm), zmath.sub(op1, op2));
      break;
    case 0x16: // mul, the next byte is the location to store at
      info.str += '-> ' + zinst.varToString(zvm.bytes[zvm.pc]);
      debugMsg(zvm, addr + 'mul ' + info.str);
      storeVariable(zvm, readByte(zvm), zmath.mul(op1, op2));
      break;
    case 0x17: // div, the next byte is the location to store at
      info.str += '-> ' + zinst.varToString(zvm.bytes[zvm.pc]);
      debugMsg(zvm, addr + 'div ' + info.str);
      storeVariable(zvm, readByte(zvm), zmath.div(op1, op2));
      break;
    case 0x18: // mod, the next byte is the location to store at
      info.str += '-> ' + zinst.varToString(zvm.bytes[zvm.pc]);
      debugMsg(zvm, addr + 'mod ' + info.str);
      storeVariable(zvm, readByte(zvm), zmath.mod(op1, op2));
      break;

    // all the unused ops we haven't implemented yet
    case 0x19:
      info.str = addr + 'call_2s ';
      zinst.call2(zvm, op1, op2, true, info);
      debugMsg(zvm, info.str);
      break;
    case 0x1a:
      info.str = addr + 'call_2n ';
      zinst.call2(zvm, op1, op2, false, info);
      debugMsg(zvm, info.str);
      break;
    case 0x1b:
    case 0x1c:
    case 0x1d:
    case 0x1e:
    case 0x1f:
    default:
      throw Error(
        'evalLongForm instruction at ' +
          (zvm.pc - 3).toString(16) +
          ' with opcode ' +
          opcode.toString(16) +
          ' and instr: ' +
          instr +
          ' is not implemented'
      );
  }
}

/**
 * Just looks at the variable without altering it, like popping the stack.
 * @param zvm the zMachine being evaluated
 * @param varLoc the variable 'name'/location
 */
export function peekVariable(zvm: zMachine, varLoc: number) {
  // if varLoc is 0, it's the stack
  if (varLoc === 0) {
    // reading from the stack doesn't do anything but look at it
    return Stack.top(zvm.stack);
  } else if (varLoc < 0x10) {
    // get the value of a local variable (0x1 to 0xf)
    return getLocal(zvm, varLoc);
  } else {
    // 15-255 are the global variables
    return getGlobal(zvm, varLoc);
  }
}

/**
 * Retrieves the variable value and returns it
 * @param zvm the zMachine being evaluated
 * @param varLoc the variable 'name'/location
 */
export function getVariable(zvm: zMachine, varLoc: number) {
  // if varLoc is 0, it's the stack
  if (varLoc === 0) {
    // reading from the stack pops it
    return Stack.pop(zvm.stack);
  } else if (varLoc < 0x10) {
    // get the value of a local variable (0x1 to 0xf)
    return getLocal(zvm, varLoc);
  } else {
    // 15-255 are the global variables
    return getGlobal(zvm, varLoc);
  }
}

/**
 * Sets a variable location indicated by the varLoc to the given val
 * @param zvm the zMachine being evaluated
 * @param varLoc variable location to write to
 * @param val value we are writing
 */
export function storeVariable(zvm: zMachine, varLoc: number, val: number) {
  if (varLoc === 0) {
    //debugMsg(zvm, 'pusing ' + val + ' to stack');
    Stack.push(zvm.stack, val);
  } else if (varLoc < 0x10) {
    setLocal(zvm, varLoc, val);
  } else {
    setGlobal(zvm, varLoc, val);
    if (zvm.globalsTableListener) zvm.globalsTableListener();
  }
}

/**
 * Gets the global variable from the globals table
 * @param zvm the zMachine being evaluated
 * @param globalNum the global variable number (0x10 to 0xff)
 */
export function getGlobal(zvm: zMachine, globalNum: number): number {
  // sanity checking
  if (globalNum > 0xff) throw Error('illegal global variable number');
  // globals are located at the specified location in the zmachine,
  // and are numbered 0x10 to 0xff--each is a 2-byte value, so we subtract
  // of 0x10 to make this a 0 offset, and multiply it by 2, to get the byte
  // offset from the global location
  let addr = zvm.globals + (globalNum - 0x10) * 2;
  //let val = Zf.getUint16(zvm.bytes, addr)
  //debugMsg(zvm, 'looking for global ' + globalNum.toString(16) + ' at ' +
  //           addr.toString(16) + ' and found ' + val);
  let val = getWord(zvm, addr);
  return val;
}

/**
 * Sets a global variable, which is located at the specifed location in the zMachine
 * @param zvm The zMachine being modified
 * @param globalNum The global variable number (0x10 to 0xff)
 * @param val the value being set
 */
export function setGlobal(zvm: zMachine, globalNum: number, val: number) {
  if (globalNum > 0xff) throw Error('Illegal global variable number to write');

  writeWord(zvm, zvm.globals + ((globalNum - 0x10) << 1), val);
  //Zf.setUint16(zvm.bytes, zvm.globals + ((globalNum - 0x10) << 1), val);
}

// this just sets up the main routine
export function initStackFrames(zvm: zMachine) {
  // push the 0 return address, this will let us check if there's a problem of
  // popping too many stack frames, haha
  pushUint31ToStack(zvm, 0);
  // if/when we return to the main routine, we don't have locals so we'll always
  // store to the stack on returns
  Stack.push(zvm.stack, 0);
  // the previous frame pointer doesn't exist, but we'll point it to 0
  Stack.push(zvm.stack, 0);
}
/**
 * Pushes a stack frame, creating space for the args and copying the default
 * values over, and storing the return and storage location in the stack frame.
 * @param zvm the zMachine being modified
 * @param funAddr the address of the function we are pushing to the stack
 */
export function pushStackFrame(
  zvm: zMachine,
  funAddr: number,
  storageByte: number | null
) {
  //debugMsg(zvm, 'pusing stack frame');
  // a stack frame is chunk of memory on the stack which has
  // the return address and the locals, it's followed by 'working'
  // memory, i.e., the rest of the stack
  let newFp = Stack.length(zvm.stack);

  let returnAddr = zvm.pc;
  // now set bit 30 of the return address if we're supposed to ignore the storage byte
  if (storageByte === null) {
    returnAddr = returnAddr | FP_IGNORE_RETURN_STORAGE;
  }

  // first, push the return address, this should be wherever the program counter is at
  // currently, but it takes two 16-bit words
  pushUint31ToStack(zvm, returnAddr);

  // push 0s onto the stack, then we'll set the values so order isn't so
  // fragile in the code below and can be defined in constants above
  //debugMsg(zvm, 'pushing ' + (FP_STACK_HEADER_SIZE - 1) + ' words to the stack');
  for (let i = 0; i < FP_STACK_HEADER_SIZE - 1; i++) Stack.push(zvm.stack, 0);

  // then, set the previous frame pointer
  Stack.set(zvm.stack, newFp + zvm.previousFp, zvm.fp);

  // at this point, the frame has 4 16-bit values on it, 2 for the return address, one
  // for the storage location on return and locals count, and one for the previous frame pointer

  // next, we need a number of locals equal to the first byte of the function addr
  let varCount = zvm.bytes[funAddr];
  if (varCount > 0xf)
    throw Error(
      'Function at ' +
        funAddr.toString(16) +
        ' not a proper function (number of locals > 15), read: ' +
        varCount.toString(16)
    );

  // push 0 or the init value
  for (let i = 0; i < varCount; i++) {
    if (zvm.version < 5) {
      // in versions 1-4, all local variables have initial values defined
      // in varCount 16-bit words following the varCount byte
      let init = Zf.getUint16(zvm.bytes, funAddr + 1 + i * 2);
      //debugMsg(zvm, 'pushing ' + init + ' as a local');
      Stack.push(zvm.stack, init);
    } else {
      Stack.push(zvm.stack, 0);
    }
  }

  // next, set the storage location and the locals count
  setReturnAndLocalsCount(zvm, newFp, storageByte, varCount);

  // now set the frame pointer to this so var references will know where to look
  //debugMsg(zvm, 'new fp is: ' + newFp + ' old fp is ' + zvm.fp);
  zvm.fp = newFp;

  // pretty major event, so update the locals table
  if (zvm.localsTableListener) zvm.localsTableListener();

  // print the stack frame:
  debugMsg(zvm, 'frame: ' + getStackFrameAsString(zvm));
  // we return the varCount so that we know how far to push the program counter
  return varCount;
}

/**
 * This sets the return location and locals count for a frame and requires an index
 * into the current frame pointer. Index should be already have the frame pointer added
 * into it.
 * @param zvm the zMachine we are working with
 * @param index the index into the stack where this is stored (should have fp already added)
 * @param loc the storage location for a return from this frame
 * @param count the number of locals in this frame
 */
export function setReturnAndLocalsCount(
  zvm: zMachine,
  fp: number,
  loc: number | null,
  count: number
) {
  let val = loc ? ((loc & 0xff) << 8) | (count & 0xff) : count & 0xff;
  Stack.set(zvm.stack, fp + zvm.fpStorageLocation, val);
}

/**
 * The return location of the current stack frame
 * @param zvm the zMachine we are working with
 */
export function getReturnLocation(zvm: zMachine, fp: number) {
  return Stack.get(zvm.stack, fp + zvm.fpStorageLocation) >> 8;
}

/**
 * Returns the locals count of the current stack frame
 * @param zvm the zMachine we are working in
 */
export function getLocalsCount(zvm: zMachine, fp: number) {
  // we have to chop off the high byte, so we and it with 0xff
  return Stack.get(zvm.stack, fp + zvm.fpLocalsCount) & 0xff;
}
/**
 * pops the current stack frame, assuming there is one
 * @param zvm the zMachine we are working with
 * @param result the value we are returning, note we need this to store due to function calls
 * which specify on the stack where they store the result
 */
export function popStackFrame(zvm: zMachine, result: number) {
  // you can't pop the final frame, it's an error to do so
  if (zvm.fp === 0) {
    throw Error(
      'zcode instruction tried to return from the only entry into the game'
    );
  }

  // then set the program counter back to where it should be, this will be at fp + 0
  let returnAddr = getUint31FromStack(zvm, zvm.fp);

  let ignoreReturnStorage = false;
  // this bit is set if our return location was -1
  if ((returnAddr & (1 << 30)) >> 30 === 1) {
    ignoreReturnStorage = true;
  }
  //debugMsg(zvm, 'return address: ' + returnAddr.toString(16));
  if (returnAddr === 0) {
    throw Error('zcode instruction tried to return to address 0x0');
  }

  // get the storage location for this call, which is at fpStorageLocation in the
  // current frame, but stored at the high byte located there, so we right shift
  // it by a byte to get the correct value
  let storeLoc = getReturnLocation(zvm, zvm.fp);
  //debugMsg(zvm, 'store location: ' + storeLoc);

  // the previous frame pointer is at location previousFp in the current frame
  let oldFp = Stack.get(zvm.stack, zvm.fp + zvm.previousFp);
  //debugMsg(zvm, 'previous fp: ' + oldFp);

  // drop all the elements from this stack from the current FP to the end of it
  Stack.multiPop(zvm.stack, Stack.length(zvm.stack) - zvm.fp);

  // now adjust the frame pointer
  zvm.fp = oldFp;

  // store the result of the function call in the old stack frame (this will use
  // our updated frame pointer)
  if (!ignoreReturnStorage) {
    storeVariable(zvm, storeLoc, result);
  }

  // and finally, adjust the program counter
  zvm.pc = returnAddr;

  // oh, and update the locals table which should have changed
  if (zvm.localsTableListener) zvm.localsTableListener();

  // and log it
  debugMsg(zvm, 'frame: ' + getStackFrameAsString(zvm));
}

/**
 * Returns the value of the local at the current frame, which are
 * 'numbered' from 0x1 to 0xf
 * @param zvm zMachine we are working with
 * @param localNum the local we want to return from the current frame
 */
export function getLocal(zvm: zMachine, localNum: number) {
  if (localNum - 1 < getLocalsCount(zvm, zvm.fp)) {
    // A local is an offset from the current frame pointer, so we
    // just add our offset value to the FP and the local number
    return Stack.get(zvm.stack, zvm.fp + zvm.fpLocalsOffset + localNum);
  } else {
    throw RangeError(
      'local variable number ' +
        localNum +
        ' exceeds the locals count for this frame ' +
        getLocalsCount(zvm, zvm.fp)
    );
  }
}

/**
 * Sets the local in the current frame to the given value
 * @param zvm the zMachine we are working with
 * @param localNum the local we want to set in the current frame
 * @param val the value we want to assign to the local
 */
export function setLocal(zvm: zMachine, localNum: number, val: number) {
  Stack.set(zvm.stack, zvm.fp + zvm.fpLocalsOffset + localNum, val);
  // call the listener to show there was a change
  if (zvm.localsTableListener) zvm.localsTableListener();
}

/**
 * This returns the number of local variables a given routine has,
 * and all routines are encoded such that the first byte is the local
 * variable count (so yes, a routine can only have 15 locals at most)
 * @param zvm the zMachine we are working with
 * @param addr the address of the routine in question
 */
export function getLocalCount(zvm: zMachine, addr: number) {
  return zvm.bytes[addr];
}

/**
 * Retrieves a 16-bit address starting at loc in the zvm
 * @param zvm the zMachine we are working with
 * @param loc the location (byte wise) into the zMachine of the address we are looking for
 */
export function getPackedRoutineAdddress(zvm: zMachine, loc: number) {
  return Zf.getPackedAddress(zvm.bytes, loc, true, false);
}

export function getPackedStringAddress(zvm: zMachine, loc: number) {
  return Zf.getPackedAddress(zvm.bytes, loc, false, true);
}

export function calculatePackedRoutineAddress(zvm: zMachine, baseAddr: number) {
  return Zf.calculatePackedAddress(zvm.bytes, baseAddr, true, false);
}

export function calculatePackedStringAddress(zvm: zMachine, baseAddr: number) {
  return Zf.calculatePackedAddress(zvm.bytes, baseAddr, false, true);
}

/**
 * Reads a large constant at an area of memory
 * @param zvm the zMachine we are working on
 * @param loc the location (usually in high memory) we are looking at
 */
export function getLargeConstantAt(zvm: zMachine, loc: number) {
  return Zf.getUint16(zvm.bytes, loc);
}

/**
 * Reads a small constant from an area in memory
 * @param zvm the zMachine we are working on
 * @param loc the location as a byte address we are looking at
 */
export function getSmallConstantAt(zvm: zMachine, loc: number) {
  return zvm.bytes[loc];
}

/**
 * This allows us to put a 31-bit value on the stack, we break
 * it into a high and low part (and it can be recoved by an
 * opposite function). This just simplifies putting return addresses,
 * like the zvm.pc onto the stack, which can be larger than 16-bits.
 * Truthfully, the PC doesn't get much bigger than say 19-bits or so,
 * but we'll have word boundaries anyways on an architecture and our
 * stack only works in 16-bit values. But, because of Javascripts handling
 * of bit operations, trying to split a 32-bit value into two 16-bit words
 * fails when recombining them due to it being a signed bit value. So, we
 * only store 31 bits at most.
 * @param zvm the zMachine we are working on
 * @param num the 31-bit value we want to push
 */
export function pushUint31ToStack(zvm: zMachine, num: number) {
  // break the number apart into bits
  let highBits = (num >> 16) & 0x7fff;
  let lowBits = 0xffff & num;

  // debugMsg(zvm, 'highbits: ' + highBits.toString(16) + ', lowBits ' +
  //             lowBits.toString(16));
  // now push them onto the stack
  Stack.push(zvm.stack, highBits);
  Stack.push(zvm.stack, lowBits);
}

/**
 * Gets the 31-bit unsigned number from the stack, which begins at index on the stack
 * (the high bits) and ends at index+1 (the low bits).
 * @param zvm the zMachine we are working with
 * @param addr the starting index in the stack of the 31-bit value
 */
export function getUint31FromStack(zvm: zMachine, index: number): number {
  // these are stored with highBits at the lower address, and lowBits
  // at the next address, kinda big-endian style
  let highBits = Stack.get(zvm.stack, index);
  let lowBits = Stack.get(zvm.stack, index + 1);

  //debugMsg(zvm, 'highbits: ' + highBits.toString(16) + ', lowBits ' +
  //            lowBits.toString(16));

  //debugMsg(zvm, 'highBits shifted ' + (highBits << 16));
  // just recombine these, need to shift the high bits over by 16 bits
  return (highBits << 16) | lowBits;
}

/**
 * This returns the current state of the locals for a given routine
 * and assumes that 1. The routine has been 'called' and that 2. it's
 * currently on top of the stack. This is mainly useful for debugging
 * purposes if you want to watch the locals table or something
 * @param zvm zMachine we are working with
 * @param procAddr the address of procedure
 * @param table if specified will fill out this table instead of creating
 * a new one
 */
export function getLocalsTable(
  zvm: zMachine,
  table?: number[],
  fp?: number
): number[] {
  // locals count is the first byte of the proc address
  let myFp = fp ? fp : zvm.fp;
  let localCount = getLocalsCount(zvm, myFp);
  if (localCount > 16) throw Error('too many locals!');

  // make a new table or use their table
  let locTable = table ? table : [];
  for (let i = 0; i < localCount; i++) {
    locTable[i] = getLocal(zvm, i + 1);
  }

  // return the table
  return locTable;
}

/**
 * This returns the current state of the globals table. This is mainly
 * useful for debugging purposes if you want to watch the globals table
 * or something.
 * @param zvm zMachine we are working with
 * @param procAddr the address of procedure
 * @param table if specified will fill out this table instead of creating
 * a new one
 */
export function getGlobalsTable(zvm: zMachine, table?: number[]): number[] {
  // globals are configured by the header of the zMachine
  let globalAddr = Zf.getGlobalVarTable(zvm.bytes);
  // make a new table or use their table
  let globTable = table ? table : new Array<number>();
  for (let i = 0; i < 240; i++) {
    // get the 16-bit val out of memory
    let val = Zf.getUint16(zvm.bytes, globalAddr + i * 2);
    // now put it in the table as a javascript number (so we can see negatives)
    globTable[i] = zmath.convertToNum(val);
  }

  // return the table
  return globTable;
}

/**
 * This allows you to install a globals table listener which will be
 * called whenever the globals table changes. Your function should take
 * one argument and in it the globals table will be passed back with
 * indices 0-240 filled (these correspond to 0x10 - 0xff global entries).
 * You can only have one, seriously, why would you be watching more than one...
 * @param zvm the zMachine we are working with
 * @param table the table to be updated during the watch
 * @param callback function to be called when the globals table changes,
 * which has the type (table) => void
 */
export function addGlobalsTableListener(
  zvm: zMachine,
  table: number[],
  callback: (tbl: number[]) => void
) {
  // now assign to it
  zvm.globalsTableListener = () => {
    getGlobalsTable(zvm, table);
    callback(table);
  };
}

/**
 * This allows you to install a locals table listener which will be
 * called whenever the locals table changes. Your function should take
 * one argument and the locals table will be passed back with
 * indices 0-16 filled (these correspond to the variables 0x1 to 0xf)
 * @param zvm the zMachine we are working with
 * @param table the table to be updated during the watch
 * @param callback function to be called when the globals table changes,
 * which has the type (table) => void
 */
export function addLocalsTableListener(
  zvm: zMachine,
  callback: (tbl: number[]) => void
) {
  // now assign to it
  zvm.localsTableListener = () => {
    let table = getLocalsTable(zvm);
    callback(table);
  };
}

/**
 * storeWord is a way to store a value in an array like structure. This must
 * be in dynamic memory, but it's simply the address + index * 2 = val. Note,
 * in this version, we must be at a word offset, instead of a byte offset, so
 * we are treating the array like it's an array of uint16s.
 * @param zvm the zMachine we are working with
 * @param addr the address of the table we are storing in
 * @param index the offset into the address
 * @param val the value
 */
export function storeWord(
  zvm: zMachine,
  addr: number,
  index: number,
  val: number
) {
  let loc = addr + 2 * index;
  // cannot write above static memory, and a word takes two bytes
  if (loc + 1 < zvm.static) {
    //debugMsg(zvm, 'writing word ' + val.toString(16) + ' to addr ' + loc.toString(16));
    Zf.setUint16(zvm.bytes, loc, val);
    return;
  } else {
    throw Error(
      'illegal attempt to write to ' +
        loc.toString(16) +
        ' which is beyond static memory at ' +
        zvm.static.toString(16)
    );
  }
}

/**
 * loadWord reads a z-number from the z-machine, but supposedly cannot read from
 * high memory, which this enforces. It doesn't mean there aren't other ways to
 * get data from high memory, which might overlap with static, but you can store
 * arrays in it I guess?
 * @param zvm the zMachine we are working with
 * @param addr the address we are reading from
 * @param index the offset into this address we want
 */
export function loadWord(zvm: zMachine, addr: number, index: number) {
  let loc = addr + 2 * index;
  // you shouldn't be able to read data below the high mark, but some games,
  // like nord and bert, interleave static tables and high memory (i.e., the
  // static memory overlaps with the high memory). The maximum address, however, is
  // 0xFFFF.
  if (loc + 1 < 0xffff) {
    let res = Zf.getUint16(zvm.bytes, loc);
    //debugMsg(zvm, 'reading word from addr ' + loc.toString(16) + ' is ' + res.toString(16));
    return res;
  } else
    throw Error(
      'illegal attempt to read from ' +
        loc.toString(16) +
        ' which is beyond high memory at ' +
        zvm.static.toString(16)
    );
}

/**
 * storeByte is a way to store a value in an array like structure. This must
 * be in dynamic memory, but it's simply the address + index * 2 = val. Note,
 * in this version users a byte offset, so
 * we are treating the array like it's an array of bytes.
 * @param zvm the zMachine we are working with
 * @param addr the address of the table we are storing in
 * @param index the offset into the address
 * @param val the value
 */
export function storeByte(
  zvm: zMachine,
  addr: number,
  index: number,
  val: number
) {
  let loc = addr + index;
  // cannot write above static memory, and a word takes two bytes
  if (loc < zvm.static) {
    debugMsg(
      zvm,
      'writing byte ' + val.toString(16) + ' to addr ' + loc.toString(16)
    );
    zvm.bytes[loc] = val;
  } else {
    throw Error(
      'illegal attempt to write to ' +
        loc.toString(16) +
        ' which is beyond static memory at ' +
        zvm.static.toString(16)
    );
  }
}

/**
 * loadWord reads a z-number from the z-machine, but supposedly cannot read from
 * high memory, which this enforces. It doesn't mean there aren't other ways to
 * get data from high memory, which might overlap with static, but you can't store
 * arrays in it I guess?
 * @param zvm the zMachine we are working with
 * @param addr the address we are reading from
 * @param index the offset into this address we want
 */
export function loadByte(zvm: zMachine, addr: number, index: number) {
  let loc = addr + index;
  // cannot read above high memory, but in theory this could
  // overlap with static memory, so really, the maximum readable byte
  // is at 0xffff.
  //if (loc < zvm.high) {
  if (loc < 0xffff) {
    let res = zvm.bytes[loc];
    debugMsg(
      zvm,
      'reading byte from addr ' + loc.toString(16) + ' is ' + res.toString(16)
    );
    return res;
  } else {
    throw Error(
      'illegal attempt to read byte from ' +
        loc.toString(16) +
        ' which is beyond high memory at ' +
        zvm.static.toString(16)
    );
  }
}

/**
 * Adds an output listener that gets called from the zMachine whenever it needs
 * to display output.
 * @param zvm the zMachine we are working with
 * @param callback the function that will be called by the zMachine when output
 * needs to be displayed.
 */
export function addOutputListener(
  zvm: zMachine,
  callback: (str: string) => void
) {
  zvm.outputListener = callback;
}

/**
 * Adds an status line listener that gets called from the zMachine whenever it needs
 * to update the status line.
 * @param zvm the zMachine we are working with
 * @param callback the function that will be called by the zMachine when the output
 * needs to be displayed.
 */
export function addStatusLineListener(
  zvm: zMachine,
  callback: (name: string, score: number, turn: number) => void
) {
  zvm.statusLineListener = callback;
}

/**
 * Updates the status line by calling the status line listener callback.
 * @param name name of the object in the status line
 * @param score the current score
 * @param turn the current turn
 */
export function updateStatusLine(zvm: zMachine) {
  if (zvm.version < 4) {
    debugMsg(zvm, 'status_line: updating');
    //debugMsg(zvm, 'updating the status line');
    // get the object at the first global, which is 0x10
    let objNum = peekVariable(zvm, 0x10);
    if (objNum !== 0 && zvm.objectTable && zvm.statusLineListener) {
      let name = zo.getObjectShortName(zvm.objectTable, objNum);
      let score = peekVariable(zvm, 0x11);
      let turn = peekVariable(zvm, 0x12);
      zvm.statusLineListener(name, score, turn);
    } else {
      debugMsg(zvm, "update status line can't be called");
    }
  }
}

/**
 *
 * @param str the string or ZStrInfo we are working with
 */
export function isZStrInfo(str: string | zstr.ZStrInfo): str is zstr.ZStrInfo {
  return (str as zstr.ZStrInfo).zscii !== undefined;
}
/**
 *
 * @param zvm the z-machine we are working with
 * @param str the string info we want to print, this is what zToString gives you.
 * @param stream the stream we want to write
 */
export function outputStringToStream(
  zvm: zMachine,
  str: string | zstr.ZStrInfo,
  streamNum: Stream
) {
  switch (streamNum) {
    case Stream.Screen:
      // print to the screen listener
      if (zvm.outputListener) {
        // if (isZStrInfo(str)) {
        //   console.log('zstr.str is "' + str.str + '"');
        // } else {
        //   console.log('str is "' + str + '"');
        // }

        // if we have a window listener for this output, send the text to it
        let winListener =
          zvm.terminal.windowListeners[zvm.terminal.currentWindow];
        if (winListener !== null) {
          winListener('print', isZStrInfo(str) ? str.str : str);
        }
        //zvm.outputListener(isZStrInfo(str) ? str.str : str);
      }
      break;
    // print to the transcript listener
    case Stream.Transcript:
      throw Error('transcripts not implemented yet');
    case Stream.Table:
      if (zvm.tableList.length > 0) {
        if (isZStrInfo(str)) {
          writeZSCIIToTable(zvm, zvm.tableList[zvm.tableList.length - 1], str);
        } else {
          // convert the string to a zscii string
          let zs = zstr.stringToZstr(str, str.length);
          writeZSCIIToTable(zvm, zvm.tableList[zvm.tableList.length - 1], zs);
        }
      } else {
        throw Error('No tables active to write to, must be created first');
      }
      break;
    case Stream.Commands:
    default:
      throw Error('invalid stream type for output: ' + streamNum);
  }
}

/**
 * This writes the bytes of ZSCII to the table in memory. We assume that the table
 * has been selected properly and so contains the right location to write to.
 * @param zvm the z-machine we are working with
 * @param table the table we are writing to
 * @param str the string we are writing, this contains the ZSCII characters
 */
export function writeZSCIIToTable(
  zvm: zMachine,
  table: ZTable,
  str: zstr.ZStrInfo
) {
  let chars = '[';
  str.zscii.forEach((el, idx) => {
    chars += el;
    if (idx !== chars.length - 1) chars += ', ';
  });
  chars += ']';
  debugMsg(zvm, 'writing zscii chars: ' + chars);

  // we start writing at the table address offset by the table position
  writeBytesToTable(zvm, table, str.zscii);
}

/**
 * This returns a Uint8Array that is a slice of the memory based on the given table.
 * @param zvm the z-machine we are working with
 * @param table the table we are extracting the zscii from
 */
export function getBytesFromTable(zvm: zMachine, table: ZTable) {
  let count = getWord(zvm, table.addr);
  return zvm.bytes.slice(table.addr + 2, table.addr + 2 + count);
}

/**
 * This outputs to the currently selected stream
 * @param zvm the z-machine we are working with
 * @param str the string we are going to write
 */
export function outputString(
  zvm: zMachine,
  str: string | zstr.ZStrInfo,
  stream?: number
) {
  // debugMsg(zvm, 'output (pc is at ' + zvm.pc + '): ' + str);

  // Is the stream specified? If so, do something about it
  if (stream) {
    outputStringToStream(zvm, str, stream);
  } else {
    // if the stream isn't specified, then we print to them all, unless
    // we are currently writing to stream 3!
    if (zvm.outputStreams[Stream.Table]) {
      outputStringToStream(zvm, str, Stream.Table);
    } else {
      zvm.outputStreams.forEach((el, idx) => {
        if (el === true) {
          outputStringToStream(zvm, str, idx);
        }
      });
    }
  }
}

/**
 * this pushes a value to the stack
 * @param zvm the zMachine we are working with
 * @param val the value to push to the stack
 */
export function pushToStack(zvm: zMachine, val: number) {
  Stack.push(zvm.stack, val);
}

/**
 * Pops the top of the stack and returns it
 * @param zvm the zvm we are working with
 */
export function popFromStack(zvm: zMachine) {
  return Stack.pop(zvm.stack);
}

export function getStackFrameAsString(zvm: zMachine) {
  let str = '[ ';
  /*
   *  return address (2 words)
   *  previous frame pointer (1 word)
   *  return location (high byte) | locals count (low byte) (1 word)
   *  locals (where the locals begin)
   */
  let addr = getUint31FromStack(zvm, zvm.fp + FP_RETURN_ADDRESS_OFFSET);
  let ignoreReturnStorage = false;
  if (addr & FP_IGNORE_RETURN_STORAGE) {
    ignoreReturnStorage = true;
    addr = addr & ~FP_IGNORE_RETURN_STORAGE;
  }
  str += addr.toString(16);
  //str += getUint31FromStack(zvm, zvm.fp + FP_RETURN_ADDRESS_OFFSET).toString(16);
  str += ', f' + Stack.get(zvm.stack, zvm.fp + FP_PREVIOUS_FP).toString(16);

  let localsCount = getLocalsCount(zvm, zvm.fp);
  let returnStore = getReturnLocation(zvm, zvm.fp);
  if (ignoreReturnStorage) {
    str += ', IR';
  } else {
    str += ', ' + zinst.varToString(returnStore);
  }

  str += ', ' + localsCount + ': ';
  //str += ', ' + zinst.varToString((Stack.get(zvm.stack, zvm.fp + FP_RETURN_STORAGE_LOC) & 0xFF00) >> 8);
  //str += ', ' + (Stack.get(zvm.stack, zvm.fp + FP_LOCALS_COUNT) & 0x00FF) + ': ';
  for (
    let i = 0;
    i < (Stack.get(zvm.stack, zvm.fp + FP_LOCALS_COUNT) & 0xff);
    i++
  ) {
    str +=
      Stack.get(zvm.stack, i + zvm.fp + FP_LOCALS_OFFSET + 1).toString(16) +
      ' ';
  }
  str += ']';

  return str;
}

/**
 * Reads a byte from the current program counter and advances it.
 * @param zvm the zMachine we are working with
 */
export function readByte(zvm: zMachine) {
  let res = getByte(zvm, zvm.pc++);
  return res;
}

/**
 * Reads a word (2 bytes) from the current program counter and advances it.
 * @param zvm the zMachine we are working with
 */
export function readWord(zvm: zMachine) {
  let word = getWord(zvm, zvm.pc);
  zvm.pc += 2;
  return word;
}

/**
 * Reads a byte from the zMachine--this has some sanity checks to help
 * prevent a bug from reading outside the bounds of memory
 * @param zvm the zMachine we are working from
 * @param addr the address we are reading from
 */
export function getByte(zvm: zMachine, addr: number) {
  if (addr < 0 || addr >= zvm.bytes.length)
    throw RangeError(
      'Illegal byte memory access at address: 0x' +
        addr.toString(16) +
        ', max memory location is 0x' +
        (zvm.bytes.length - 1).toString(16)
    );

  return zvm.bytes[addr];
}

/**
 * Reads a byte from the zMachine--this has some sanity checks to help
 * prevent a bug from reading outside the bounds of memory. Note this is
 * an escape hatch, in the sense that we could use loadWord, but that
 * ensures the address is beneath 0xFFFF or the high memory mark, and this
 * just ensures we don't try to read out of bounds.
 * @param zvm the zMachine we are working from
 * @param addr the address we are reading from
 */
export function getWord(zvm: zMachine, addr: number) {
  if (addr < 0 || addr >= zvm.bytes.length - 1)
    throw RangeError(
      'Illegal word memory access at address: 0x' +
        addr.toString(16) +
        ', max memory location is 0x' +
        (zvm.bytes.length - 2).toString(16)
    );

  let word = Zf.getUint16(zvm.bytes, addr);
  return word;
}

/**
 * Writes an 8-bit value to memory, which can only be done in the dynamic part of
 * memory and not in the static or high parts of memory. Throws a RangeError if you
 * try to do so.
 * @param zvm the zMachine we are working with
 * @param addr the address to write to
 */
export function writeByte(zvm: zMachine, addr: number, byte: number) {
  if (addr < 0)
    throw RangeError('Illegal write to memory at negative address: ' + addr);
  else if (addr >= zvm.static)
    throw RangeError(
      'Illegal byte write to memory location ' +
        addr.toString(16) +
        '. Static memory begins at ' +
        zvm.static.toString(16) +
        ' and high memory begins at ' +
        zvm.high.toString(16)
    );

  zvm.bytes[addr] = byte;
}

/**
 * Writes a 16-bit value to memory, which can only be done in the dynamic part of
 * memory and not in the static or high parts of memory. Throws a RangeError if you
 * try to do so.
 * @param zvm the zMachine we are working with
 * @param addr the address to write to
 */
export function writeWord(zvm: zMachine, addr: number, word: number) {
  if (addr < 0)
    throw RangeError('Illegal write to memory at negative address: ' + addr);
  else if (addr >= zvm.static)
    throw RangeError(
      'Illegal byte write to memory location ' +
        addr.toString(16) +
        '. Static memory begins at ' +
        zvm.static.toString(16) +
        ' and high memory begins at ' +
        zvm.high.toString(16)
    );

  Zf.setUint16(zvm.bytes, addr, word);
}

/**
 * Creates a dictionary from a given address for this zMachine and adds it to
 * the collection of dictionaries.
 * @param zvm the zMachine we are working with
 * @param addr the address of the dictionary
 */
export function addDictionary(zvm: zMachine, addr: number) {
  let d = zd.makeDictionary(zvm, addr);
  zvm.dictionaries[addr] = d;
}

/**
 * The zMachine has a concept of a table where the first word is the number of
 * entries in the table and then that number of words follow, thus index 0
 * is 1 word after the starting address of the table.
 * @param zvm the zMachine we are working with
 * @param addr the address of the table
 * @param index the index of the table, which starts at 0
 */
export function getWordFromTable(zvm: zMachine, table: ZTable, index: number) {
  getWord(zvm, table.addr + index * 2 + 2);
}

/**
 * The zMachine has a concept of a table where the first word is the number of
 * entries in the table and then that number of words follow, thus index 0
 * is 1 word after the starting address of the table. This returns the byte
 * at that offset
 * @param zvm the zMachine we are working with
 * @param addr the address of the table
 * @param index the index of the table, which starts at 0
 */
export function getByteFromTable(zvm: zMachine, table: ZTable, index: number) {
  getByte(zvm, table.addr + index + 2);
}

/**
 * Writes to a z-machine table, which has an offset from the address of at least
 * 2 bytes because the first word is the number of bytes in the table. This method
 * does *not* update the size (you might arbitrarily write to the middle of a table,
 * for example). It returns the table from the updated position.
 * @param zvm the zMachine we are working with
 * @param table the starting address of the table
 * @param word the word to write
 */
export function writeWordToTable(zvm: zMachine, table: ZTable, word: number) {
  writeWord(zvm, table.addr + table.pos, word);
  table.pos += 2;
  return table;
}

/**
 * A method to write a byte to a Ztable in the z-machine. It returns the table
 * with the updated position.
 * @param zvm the z-machine we are working with
 * @param table the table we are writing to
 * @param byte the byte we are writing
 */
export function writeByteToTable(zvm: zMachine, table: ZTable, byte: number) {
  writeByte(zvm, table.addr + table.pos, byte);
  table.pos += 1;
  return table;
}

/**
 * A method to write a Uint8Array to a table. Note, this does *not* update
 * the table size. It returns the table with the udpated position.
 * @param zvm the z-machine we are working with
 * @param table the table in memory we are writing to
 * @param bytes the bytes to write
 */
export function writeBytesToTable(
  zvm: zMachine,
  table: ZTable,
  bytes: Uint8Array
) {
  writeBytes(zvm, table.addr + table.pos, bytes);
  table.pos += bytes.length;
  return table;
}

/**
 * Returns the table size at the given address
 * @param zvm the zMachine we are working with
 * @param addr the address of the table we are querying the size of
 */
export function getTableSize(zvm: zMachine, addr: number) {
  return getWord(zvm, addr);
}

export function createTable(zvm: zMachine, addr: number, size: number) {
  // first write the word
  writeWord(zvm, addr, size);

  // then zero everything out (for sanity sake)
  for (let i = 0; i < size; i++) writeWord(zvm, addr + i * 2, 0);
}

/**
 * Copies the bytes into the z-machine's memory, starting at addr. This
 * won't write into static or high memory since in theory that shouldn't change.
 * @param zvm the zMachine we are working with
 * @param addr the address we are writing the bytes to
 * @param bytes a Uint8Array of bytes we are writing
 */
export function writeBytes(zvm: zMachine, addr: number, bytes: Uint8Array) {
  if (addr < 0) {
    throw RangeError('Illegal write to memory at negative address: ' + addr);
  } else if (addr + bytes.length >= zvm.static) {
    throw RangeError(
      'Illegal byte write to memory location ' +
        addr.toString(16) +
        '. Static memory begins at ' +
        zvm.static.toString(16) +
        ' and high memory begins at ' +
        zvm.high.toString(16)
    );
  }

  // copy the bytes over to the zvm, note this just clobbers whatever is there
  // but won't write into static memory
  bytes.forEach((byte, index) => (zvm.bytes[addr + index] = byte));
}

/**
 * This function restarts the game, which means that everything is going
 * to be copied from 'backupBytes' into the working memory, and everything
 * will be reinitialized.
 * @param zvm the zMachine we are working with
 */
export function restart(zvm: zMachine) {
  // copy the bytes over
  zvm.backupBytes.forEach((el, index) => {
    zvm.bytes[index] = el;
  });

  // reset the program counter
  zvm.pc = Zf.getInitialValuePC(zvm.bytes);
  // reset the frame pointer
  zvm.fp = 0;

  // call the listeners
  if (zvm.globalsTableListener) zvm.globalsTableListener();
  if (zvm.localsTableListener) zvm.localsTableListener();

  // reset the alphabet
  zvm.currentAlphabet = 0;

  // reset the exited condition
  zvm.exited = false;

  // keep our old window listeners just in case
  let owl = zvm.terminal.windowListeners;
  // now finish initializing everything
  let newzvm = initZvm(zvm);
  newzvm.terminal.windowListeners = owl;
  return newzvm;
}

/**
 * This function gets the relevant bytes, i.e., those in dynamic
 * memory, and saves them
 * @param zvm the zMachine we are working with
 */
export function dynamicBytesToString(zvm: zMachine, len?: number) {
  if (len === undefined) len = zvm.static;

  return Zf.convertToString(zvm.bytes, len);
}

/**
 *
 * @param zvm the z-machine we are working with
 * @param str a string of dynamic memory that was returned with dynamicToByteString
 */
export function stringToDynamicBytes(zvm: zMachine, str: string) {
  return Zf.convertFromString(str);
}

export interface SaveGame {
  pc: number;
  fp: number;
  dynamicMem: string;
  stack: string;
  currentAlphabet: number;
  // this is so we know what this save game belongs to
  sourceName: string;
}

export function makeSaveGame(zvm: zMachine) {
  // this creates a JSON object that can be saved
  let save: SaveGame = {
    pc: zvm.pc,
    fp: zvm.fp,
    dynamicMem: dynamicBytesToString(zvm),
    stack: Stack.stackToString(zvm.stack),
    currentAlphabet: zvm.currentAlphabet,
    sourceName: zvm.sourceName
  };

  return save;
}

export function loadSaveGame(zvm: zMachine, save: SaveGame) {
  zvm.pc = save.pc;
  zvm.fp = save.fp;
  zvm.currentAlphabet = save.currentAlphabet;

  let bytes = stringToDynamicBytes(zvm, save.dynamicMem);
  // now copy the bytes over
  for (let i = 0; i < bytes.length; i++) {
    zvm.bytes[i] = bytes[i];
  }

  // clear our stack just in case
  if (Stack.length(zvm.stack) > 0) {
    Stack.multiPop(zvm.stack, Stack.length(zvm.stack));
  }

  // and push the elements from this stack onto our stack
  let stk = Stack.stringToStack(save.stack);
  for (let i = 0; i < Stack.length(stk); i++) {
    Stack.push(zvm.stack, Stack.get(stk, i));
  }

  return true;
}

export function setSaveGameListener(
  zvm: zMachine,
  fun: (s: SaveGame) => boolean
) {
  zvm.saveGameListener = fun;
}
export function setRestoreGameListener(
  zvm: zMachine,
  fun: () => SaveGame | null
) {
  zvm.restoreGameListener = fun;
}

export function outputStreamToString(zvm: zMachine, sNum: Stream) {
  switch (sNum) {
    case Stream.Screen:
      return 'screen';
    case Stream.Transcript:
      return 'transcript';
    case Stream.Table:
      return 'table';
    case Stream.Commands:
      return 'commands';
    default:
      throw Error('illegal stream number/name');
  }
}
/**
 * This enables the given stream number to our list of output streams.
 * @param zvm the z-machine we are working with
 * @param sNum the stream number we want to add to output
 */
export function enableOutputStream(
  zvm: zMachine,
  sNum: Stream,
  tableAddr: number | null
) {
  // if we're adding an output stream, and it's stream 3, then we
  // need to create a table for it
  if (sNum === Stream.Table) {
    if (tableAddr) {
      let table = makeZTable(zvm, tableAddr);
      zvm.tableList.push(table);
    } else {
      throw Error('cannot specify stream 3 without an address for it');
    }
  }

  // then mark that this stream is available and active
  zvm.outputStreams[sNum] = true;
}

/**
 * This disables the given output stream so it's no longer in use.
 * @param zvm the z-machine we are working with
 * @param sNum the number of the stream we are removing from the list
 */
export function disableOutputStream(zvm: zMachine, sNum: Stream) {
  // if we were writing to a table, clear the table address
  if (sNum === Stream.Table) {
    if (zvm.tableList.length !== 0) {
      // pop our last table off
      let table = zvm.tableList.pop();
      if (table !== undefined) {
        console.log('popping table off for address ' + table.addr.toString(16));

        // now write how many bytes were written to the table location
        // but note, we offset it by 2 because we don't include the first words
        // of the table
        writeWord(zvm, table.addr, table.pos - 2);

        // and turn off our stream for good if we need to
        if (zvm.tableList.length === 0) {
          console.log('output stream 3 is now off');
          zvm.outputStreams[3] = false;
        }
      }
    } else {
      throw Error('underflow on stream deselection');
    }
  } else {
    // if it's not stream 3, just disable it
    zvm.outputStreams[sNum] = false;
  }
}
