import { getUint16, getWordAddressAt, getAlphabetTableAddress } from './ZFile';
import { zMachine } from './ZMachine';

// hard code a0 a1 and a2 tables
// make a0 a1 and a2 tables for files w/ their own alphabet tables
// make code to get 3 numbers from 2 byte sections
// make code to look up numbers in tables
// make code for shift numbers
// make code for finally returning a string (last, uses other fun)

/* all the arrays are padded out w/ this:  ['','','','','',] for now
so that the zscii codes line up as expected */
// 6-31 (6-1F)
const a0 = [
  '',
  '',
  '',
  '',
  '',
  '',
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'q',
  'r',
  's',
  't',
  'u',
  'v',
  'w',
  'x',
  'y',
  'z'
];

const a1 = [
  '',
  '',
  '',
  '',
  '',
  '',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z'
];

const a2v2beyond = [
  '',
  '',
  '',
  '',
  '',
  '',
  ' ',
  '\n',
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '.',
  ',',
  '!',
  '?',
  '_',
  '#',
  "'",
  '"',
  '/',
  '\\',
  '-',
  ':',
  '(',
  ')'
];

const a2v1 = [
  '',
  '',
  '',
  '',
  '',
  '',
  ' ',
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '.',
  ',',
  '!',
  '?',
  '_',
  '#',
  "'",
  '"',
  '/',
  '\\',
  '<',
  '-',
  ':',
  '(',
  ')'
];

// these get filled with the alphabet table
// which is different from the unicode translation table
// var customA0 = [-1,-1,-1,-1,-1,];
// var customA1 = [-1,-1,-1,-1,-1,];
// var customA2 = [-1,-1,-1,-1,-1,];
// this will be filled w/ the zscii codes
var customTranslationTable = [-1];

/* returns true if the alphabet table address isn't 0 
(0 indicates we're using default's listed above) */
function customTableNeeded(bytes: Uint8Array) {
  return getAlphabetTableAddress(bytes) !== 0;
}

/* use this to shift the next char, the alphabet table used
depends on which version it is, but that's handled elsewhere. */
function shiftChar(zvm: zMachine, zChar: number) {
  if (zvm.version < 3) {
    switch (zChar) {
      case 2:
      case 4:
        zvm.currentAlphabet = (zvm.currentAlphabet + 1) % 3;
        break;
      case 3:
      case 5:
        zvm.currentAlphabet = (zvm.currentAlphabet + 2) % 3;
        break;
      default:
        throw Error('not a shift char for version ' + zvm.version);
    }
  } else {
    switch (zChar) {
      case 2:
      case 4:
        zvm.currentAlphabet = 1;
        break;
      case 3:
      case 5:
        zvm.currentAlphabet = 2;
        break;
      default:
        throw Error('not a shift char for version ' + zvm.version);
    }
  }
}

function unshiftChar(zvm: zMachine, zChar: number) {
  // undo a shift, for versions > 2, there's no shiftlock and alphabet always goes back to 0
  if (zvm.version > 2) zvm.currentAlphabet = 0;
  else {
    // otherwise, math
    switch (zChar) {
      case 1:
        // if it shifted from 0 to 1, then (1 + 2) % 3 = 0
        // if it shifted from 2 to 0, then (0 + 2) % 3 = 0
        zvm.currentAlphabet = (zvm.currentAlphabet + 2) % 3;
        break;
      case 3:
        // if it shifted from 0 to 2, then (2 + 1) % 3 = 0
        zvm.currentAlphabet = (zvm.currentAlphabet + 1) % 3;
        break;
      case 2:
      case 4:
        break;
      default:
        throw Error('not an unshift char!');
    }
  }
}

/* checks if we need to make/use custom tables
returns true if we do, then fills them out
returns false if we don't (no custom tables required) */
// function makeCustomTables (bytes: Uint8Array) {
//     if (customTableNeeded(bytes)) {
//         // find the table
//         let start = getAlphabetTableAddress(bytes);

//         return true;
//     } else {
//         return false;
//     }
// }

/* fills a custom table, such as custom a0,
filled w/ zscii values */
// function fillCustomTable
// (bytes: Uint8Array, startAddress: number, table: Uint16Array) {
//     // push()
//     for (let i = 0; i < 31; i++) {
//         // get the zscii code, then translate it into a character
//         // and add it to the array
//     }
// }

/*  returns a string of the character represented by the code */
// function unicodeToChar (unicodeCode: number) {
//     // if it's 0 or -1 it's either undefined or null,
//     // either way it's an empty string
//     if (unicodeCode === -1 || unicodeCode === 0) {
//         return "";
//     } else { // otherwise we just grab the character
//         return String.fromCharCode(unicodeCode);
//     }
// }

/* takes a ZSCII code and returns a unicode value
(with the exception of null or undefined, which are handled 
in the unicodeToChar function) */
export function translateZSCIItoUnicode(
  zsciiNum: number,
  usingDefault: boolean
): number {
  // console.log('translateZSCII ' + zsciiNum);
  // returnVal is an unicode code
  // if returnVal == -1, then we have a null value
  // if returnVal == 0, then the char is undefined
  let returnVal = 0;
  if (zsciiNum <= 27) {
    // values not in the switch statement or later handled aren't defined
    switch (zsciiNum) {
      // null
      case 0:
        return -1;
      // delete - input, case 8 : otherOtherReturnVal = "delete"; break;
      // tab (v6 and beyond)
      case 9:
        return 0x9;
      // sentence space (v6 and beyond)
      case 11:
        return 0x20;
      // newline
      case 13:
        return 0xb;
      // escape - input, case 27 : otherOtherReturnVal = "escape"; break;
      default:
        console.log(
          'translateZSCIItoUnicode warning: unhandled char code < 27'
        );
        return 0;
    }
  } else if (zsciiNum >= 32 && zsciiNum <= 126) {
    // ZSCII codes match unicode/ASCII codes here
    return zsciiNum;
  } else if (zsciiNum >= 155 && zsciiNum <= 223) {
    // if there's a translation table specified, use it
    // if it isn't defined in the table, that char is undefined
    if (zsciiNum < customTranslationTable.length && !usingDefault) {
      return customTranslationTable[zsciiNum - 1];
    } // otherwise use the default translation table
    else {
      return translateZSCII155to223Default(zsciiNum);
    }
  }
  // 145 - 154: keypad 0 to 9 (input)
  // (we're ignoring input for now)
  // 155-251: extra characters

  return returnVal;
}

// returns the default unicode translation for the specified ZSCII number
function translateZSCII155to223Default(zsciiNum: number): number {
  let returnVal = 0;
  // default Unicode translations
  switch (zsciiNum) {
    case 155:
      return 0xe4;
    case 156:
      return 0xf6;
    case 157:
      return 0xfc;
    case 158:
      return 0xc4;
    case 159:
      return 0xd6;
    case 160:
      return 0xdc;
    case 161:
      return 0xdf;
    case 162:
      return 0xbb;
    case 163:
      return 0xab;
    case 164:
      return 0xeb;
    case 165:
      return 0xef;
    case 166:
      return 0xff;
    case 167:
      return 0xcb;
    case 168:
      return 0xcf;
    case 169:
      return 0xe1;
    case 170:
      return 0xe9;
    case 171:
      return 0xed;
    case 172:
      return 0xf3;
    case 173:
      return 0xfa;
    case 174:
      return 0xfd;
    case 175:
      return 0xc1;
    case 176:
      return 0xc9;
    case 177:
      return 0xcd;
    case 178:
      return 0xd3;
    case 179:
      return 0xda;
    case 180:
      return 0xdd;
    case 181:
      return 0xe0;
    case 182:
      return 0xe8;
    case 183:
      return 0xec;
    case 184:
      return 0xf2;
    case 185:
      return 0xf9;
    case 186:
      return 0xc0;
    case 187:
      return 0xc8;
    case 188:
      return 0xcc;
    case 189:
      return 0xd2;
    case 190:
      return 0xd9;
    case 191:
      return 0xe2;
    case 192:
      return 0xea;
    case 193:
      return 0xee;
    case 194:
      return 0xf4;
    case 195:
      return 0xfb;
    case 196:
      return 0xc2;
    case 197:
      return 0xca;
    case 198:
      return 0xce;
    case 199:
      return 0xd4;
    case 200:
      return 0xdb;
    case 201:
      return 0xe5;
    case 202:
      return 0xc5;
    case 203:
      return 0xf8;
    case 204:
      return 0xd8;
    case 205:
      return 0xe3;
    case 206:
      return 0xf1;
    case 207:
      return 0xf5;
    case 208:
      return 0xc3;
    case 209:
      return 0xd1;
    case 210:
      return 0xd5;
    case 211:
      return 0xe6;
    case 212:
      return 0xc6;
    case 213:
      return 0xe7;
    case 214:
      return 0xc7;
    case 215:
      return 0xfe;
    case 216:
      return 0xf0;
    case 217:
      return 0xde;
    case 218:
      return 0xd0;
    case 219:
      return 0xa3;
    case 220:
      return 0x153;
    case 221:
      return 0x152;
    case 222:
      return 0xa1;
    case 223:
      return 0xbf;

    default:
      break;
  }
  return returnVal;
}

/**
 * Converts a ZChar into a ZSCII char code.
 * @param zvm the zMachine we are working with
 * @param zchar the z-char we wish to convert
 */
export function zToZSCII(zvm: zMachine, zchar: number) {
  let c = '';
  if (zchar === 0) return ' ';

  if (zvm.version === 1 && zchar === 1) {
    return '\n';
  }

  switch (zvm.currentAlphabet) {
    // this means we're using A0
    case 0:
      c = a0[zchar];
      break;
    // this means we're using A1
    case 1:
      c = a1[zchar];
      break;
    // this means we're using A2
    case 2:
      if (zvm.version === 1) c = a2v1[zchar];
      else c = a2v2beyond[zchar];
      break;
    default:
      throw Error('currentAlphabet must be 0, 1, or 2');
  }

  return c;
}

export function isShiftChar(zChar: number) {
  return zChar > 1 && zChar < 6;
}

/**
 * Represents the info returned by zToString
 */
export interface ZStrInfo {
  /** str is the Javascript representation of this zstring */
  str: string;
  /** the number of bytes read to parse this zstring */
  length: number;
  /** the ZSCII values that make up this zstring */
  zscii: Uint8Array;
}
const MORE_CHARS_BIT = 0x8000;
const CHAR1 = 0x7c00;
const CHAR2 = 0x03e0;
const CHAR3 = 0x001f;

export function convertZBytesToString(
  zvm: zMachine,
  bytes: Uint8Array,
  start: number,
  len?: number
): ZStrInfo {
  if (customTableNeeded(zvm.bytes))
    throw Error('custom tables not implemented yet');

  // an empty string
  if (len === 0) return { str: '', length: 0, zscii: new Uint8Array() };

  // strings are arranged in words, each word has up to 3 chars
  let loc = start;
  let word = 0;

  let str = '';
  // we expect you need to at least look at a whole word
  let lastShift = -1;
  let abbreviate = -1;
  let maxStrLen = len !== undefined ? len * 2 : 768;
  let highZscii: number | false = false;
  let lowZscii: number | false = false;
  let parseZscii = false;
  let zsciiBuf = [];

  do {
    // characters are always encoded into word boundaries, so you'll have exactly
    // three characters per word
    word = getUint16(bytes, loc);
    if (start === 0) {
      console.log('word at ' + loc.toString(16) + ' is: ' + word.toString(16));
    }
    let zChars = [(word & CHAR1) >> 10, (word & CHAR2) >> 5, word & CHAR3];
    for (let i = 0; i < 3; i++) {
      let code = zChars[i];
      // see if we're parsing zscii codes
      if (parseZscii) {
        if (highZscii === false) {
          highZscii = code;
        } else if (lowZscii === false) {
          lowZscii = code;
          // in this case, we have finally read the two characters we needed, so
          // we can translate them and add them to the string
          let zscii = (highZscii << 5) | lowZscii;
          zsciiBuf.push(zscii);
          let fromcode = String.fromCharCode(
            translateZSCIItoUnicode(zscii, true)
          );
          //console.log('translate from zscii: ' + fromcode);
          str += fromcode;

          // now reset these so they can gather up again
          highZscii = false;
          lowZscii = false;
          parseZscii = false;
          //console.log("i is " + i);
        }
      }
      // see if it's an abbreviation
      else if (abbreviate !== -1) {
        // last thing was an abbreviation, so this one is the code
        // we need to look up
        let ab = lookupAbbreviation(zvm, abbreviate, code);
        //console.log('abbreviation is ' + ab);
        str += ab;
        // reset the abbreviate code
        abbreviate = -1;
      } else if (
        (zvm.version === 2 && code === 1) ||
        (zvm.version > 2 && (code === 1 || code === 2 || code === 3))
      ) {
        unshiftChar(zvm, code);
        lastShift = -1;

        abbreviate = code;
      } else if (isShiftChar(code)) {
        // see if it's a shift, and do stuff if so
        //console.log('shifting with ' + code);
        shiftChar(zvm, code);
        lastShift = code;
      } else if (code === 6 && zvm.currentAlphabet === 2) {
        // we would have got to this because there was a shift, so we need
        // to unshift things back to where they belong
        unshiftChar(zvm, code);
        lastShift = -1;

        //console.log('parsing zscii sequence');
        parseZscii = true;
        highZscii = false;
        lowZscii = false;
      } else {
        // otherwise append it to the string
        let s = zToZSCII(zvm, code);
        zsciiBuf.push(s.charCodeAt(0));
        str += s;
        //console.log('str(normal) is now ' + str + ' at loc ' + loc.toString(16) + ' and word ' + getUint16(zvm.bytes, loc).toString(16));

        if (lastShift !== -1) {
          unshiftChar(zvm, lastShift);
          //console.log('unshifting ' + lastShift);
          lastShift = -1;
        }
      }
    }

    loc += 2;
    // repeat this loop as long as the word has the first bit is not set
  } while ((word & MORE_CHARS_BIT) === 0 && loc - start < maxStrLen);

  // reset the alphabet as needed
  if (zvm.version > 2) zvm.currentAlphabet = 0;

  // this returns the string and the length in bytes that were read to parse this string
  return { str: str, length: loc - start, zscii: Uint8Array.from(zsciiBuf) };
}

/**
 * Converts a z-string into a JS string
 * @param zvm the zvm where the string lives
 * @param start the starting byte of the z-string in memory
 * @param len the max number of words to expect we need to read
 */
export function zToString(
  zvm: zMachine,
  start: number,
  len?: number
): ZStrInfo {
  return convertZBytesToString(zvm, zvm.bytes, start, len);
}

/**
 * Looks up an abbreviation in the abbreviations table and returns it. The index
 * is the first abbreviation character, 1, 2, or 3. The offset is the z-code of the
 * next char.
 * @param zvm the zMachine we are working with
 * @param index the index of this abbreviation, this would be 1, 2, or 3
 * @param offset the offset into our abbreviation table, this is the z-code char
 * after the abbreviation char
 */
export function lookupAbbreviation(
  zvm: zMachine,
  index: number,
  offset: number
) {
  // sanity checking
  if (index > 3 || offset > 32 || index < 0)
    throw Error('invalid abbreviation');
  //console.log('looking up abbreviation: ' + index + ' offset ');
  // calculate the entry to lookup, note that the abbreviations table is a table
  // of words, so the entry is on a word boundry (so we multiply by 2);
  let entry = (32 * (index - 1) + offset) * 2;

  let addr = getWordAddressAt(zvm.bytes, zvm.abbreviationsTableAddr + entry);

  // once we have this word, we can read the string
  let ab = zToString(zvm, addr, 0xff).str;

  //console.log('looking up entry ' + entry + ' at ' + addr.toString(16) + ' and found ' + ab);
  return ab;
}

/**
 * This returns the abbreviations table as an array mapping the entry index to
 * the abbreviation itself
 * @param zvm the zMachine we are working with
 */
export function getAbbreviationsTable(zvm: zMachine) {
  let abbreviations = [];
  let tableAddr = zvm.abbreviationsTableAddr;
  /* the abbreviations table is a list of word addresses to the actual
   * abbreviations, so that offset 0 is the 1st abbreviation address. It's a
   * word address, so you have to << 1 (multiply by 2) to get its actual address.
   * The table ends when the address is 0.
   */
  let abbrAddr = getWordAddressAt(zvm.bytes, tableAddr);
  let max = zvm.version < 3 ? 32 : 96;
  let count = 0;
  // again, just sanity checking, maybe the table was written poorly but it should never
  // be any bigger than 32 for v1 or v2, and 96 for later versions
  while (abbrAddr !== 0 && count < max) {
    let res = zToString(zvm, abbrAddr, 2);
    //console.log('found "' + res.str + '" in abbreviations table at addr ' + abbrAddr.toString(16));
    abbreviations.push(res.str);
    tableAddr += 2;
    abbrAddr = getWordAddressAt(zvm.bytes, tableAddr);
    count++;
  }

  //console.log('abbreviations table has ' + abbreviations.length + ' abbreviations.');
  return abbreviations;
}

/**
 * Converts a JavaScript string to an array of ZSCII characters, which is
 * needed for things like the read operation of the z machine.
 * @param str the string we wish to convert
 * @param maxSize maximum length of the string, capped at 255
 * @returns A Uint8Array of ZSCII characters
 */
export function stringToZstr(str: string, maxSize: number) {
  let max = Math.min(str.length, 256);
  max = Math.min(max, maxSize);
  let bytes = new Uint8Array(max);

  for (let i = 0; i < max - 1; i++) {
    // get the char code
    let c = str.charCodeAt(i);
    // convert any newlines to 13 instead
    if (c === 10) {
      c = 13;
    }
    bytes[i] = unicodeToZSCII(c);
  }

  if (max > 0) {
    // now copy a terminating 0 byte into the final char
    bytes[max] = 0;
  }

  // and return the zstrinfo
  return {
    /** str is the Javascript representation of this zstring */
    str: str,
    /** the number of bytes read to parse this zstring */
    length: bytes.length,
    /** the ZSCII values that make up this zstring */
    zscii: bytes
  } as ZStrInfo;
}

function unicodeToZSCII(c: number) {
  // the bulk of characters will be typeable ones
  if (c >= 32 && c <= 126) {
    return c;
  }

  // then we have some special ones that can only be received
  // by reading individual characters since web-based interpreters
  // typically only send completed text
  switch (c) {
    case 0x7f: // unicode delete key
      return 8;
    case 10: // newline
      return 13;
    case 13: // return
      return 13;
    case 27: // escape
      return 27;
    default:
      break;
  }

  // otherwise, instead of doing something bad, just substitute another
  // character for it, like space
  return 32;
  //throw Error('undefined unicode character, no suitable zscii translation');
}

/**
 * This converts a unicode character into one or more ZChars
 * @param code the unicode value
 */
function unicodeToZChar(code: number): number[] {
  let zchars = [];

  // lowercase, the usual
  if (97 <= code && code <= 122) {
    // the lower case letters
    zchars.push(code - 91);
  } else if (65 <= code && code <= 90) {
    // the capital letters
    zchars.push(4, code - 59);
  } else if (48 <= code && code <= 57) {
    // the numbers
    zchars.push(5, code - 40);
  } else {
    // the messy codes
    switch (code) {
      case 10: // 5 (shift A2), 7
        zchars.push(5, 7);
        break;
      case 32: // spaces are 0
        zchars.push(0);
        break;
      case 33: // !
        zchars.push(5, 0x14);
        break;
      case 34: // "
        zchars.push(5, 0x19);
        break;
      case 35: // #
        zchars.push(5, 0x17);
        break;
      case 39: // '
        zchars.push(5, 0x18);
        break;
      case 40: // (
        zchars.push(5, 0x1e);
        break;
      case 41: // )
        zchars.push(5, 0x1f);
        break;
      case 44: // ,
        zchars.push(5, 0x13);
        break;
      case 45: // -
        zchars.push(5, 0x1c);
        break;
      case 46: // .
        zchars.push(5, 0x12);
        break;
      case 47: // /
        zchars.push(5, 0x1a);
        break;
      case 58: // :
        zchars.push(5, 0x1d);
        break;
      case 63: // ?
        zchars.push(5, 0x15);
        break;
      case 92: // \
        zchars.push(5, 0x1b);
        break;
      case 95: // _
        zchars.push(5, 0x16);
        break;
      default:
        let v = 0x3ff & code;
        if (code !== v) {
          throw Error(
            'Unsure how to handle unicode value (in hex): ' + code.toString(16)
          );
        } else {
          zchars.push(5, 6, (v & 0x3e0) >> 5, v & 0x1f);
          break;
        }
    }
  }

  return zchars;
}

/**
 * This takes a string and z-encodes it into a given number of words,
 * either padding with the 0x5 character or cutting it off.
 * @param str the string we want to z-encode
 * @param len the length in bytes we can encode in
 */
export function zEncodeStr(str: string, len: number) {
  let bytes = [];

  // walk through the characters and get the bytes for them
  for (let i = 0; i < str.length; i++) {
    let subbytes = unicodeToZChar(str.charCodeAt(i));
    //subbytes.forEach((el, idx) => console.log('subbyte ' + i + ': ' + el));
    for (let j = 0; j < subbytes.length; j++) {
      bytes.push(subbytes[j]);
    }
  }

  // now combine every 3 chars into 2 bytes
  let res = [];
  for (let i = 0; i < bytes.length; i += 3) {
    // now read the next 3 bytes
    let c1 = bytes[i];
    let c2 = i + 1 < bytes.length ? bytes[i + 1] : 0x5;
    let c3 = i + 2 < bytes.length ? bytes[i + 2] : 0x5;

    // now combine them and push them
    let word = (c1 << 10) | (c2 << 5) | c3;
    // now push two bytes
    res.push((word & 0xff00) >> 8, word & 0xff);
  }

  // now figure out when this ends, which since we can encode 3 chars
  // in a word, so 6 chars is 2 words, 9 chars is 3 words, etc...
  let max = Math.floor(len / 3) * 2;

  // if it's got too few words, we fill them
  if (res.length < max) {
    for (let i = res.length; i < max; i += 2) {
      res.push(0x14, 0xa5);
    }
  }

  // slice it to cap it
  res = res.slice(0, max);

  // and on the last one, set the top bit
  res[res.length - 2] |= 0x80;

  // and finally wrap it in a Uint8Array type
  return new Uint8Array(res);
}
