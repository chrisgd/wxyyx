/**
 * Defines the dictionary for use in parsing and lexical analysis.
 */

import * as zm from './ZMachine';
import * as zf from './ZFile';
import * as Zstr from './Strings';

export interface ZDEntry {
  str: string;
  addr: number;
  len: number;
  dataAddr: number;
  dataLen: number;
}
export interface ZDictionary {
  bytes: Uint8Array;
  // address of the dictionary in the zmachine
  address: number;
  // array of word separators, as read from the zmachine
  wordSeparators: number[];
  // string representation of the separator chars
  wordSeparatorChars: string[];
  // length of entries in the table
  readonly entryLength: number;
  // total number of entries
  readonly maxWordLength: number;

  count: number;
  // starting address of the entries
  entryStartAddr: number;
  // entries
  entries: ZDEntry[];

  // entries by address
  entriesByAddr: { [key: number]: ZDEntry };

  // this inserts the strings as dynamic properties so we can look them up quickly
  dictionary: {
    [key: string]: number;
  };

  isStatic: boolean;
}

/**
 * This creates a dictionary for use by the zMachine--in theory the dictionary can
 * be any dictionary, not just the standard one, so you can configure this with a
 * different address.
 * @param bytes the memory of the zMachine we are being constructed from
 * @param addr the address of the dictionary (it doesn't have to be the standard one)
 */
export function makeDictionary(zvm: zm.zMachine, addr?: number) {
  let startAddr = 0;
  if (addr) {
    startAddr = addr;
  } else {
    startAddr = zf.getDictionaryLoc(zvm.bytes);
  }
  let loc = startAddr;
  //console.log('starting address of dictionary: ' + loc.toString(16));
  // the first byte is the number of word separators
  let count = zvm.bytes[loc++];
  //console.log('number of word separators ' + count);

  let wordSeps: number[] = [];
  let wChars: string[] = [];
  // now create the word separators, each of these is a ZSCII code
  for (let i = 0; i < count; i++) {
    let c = zvm.bytes[loc++];
    wordSeps.push(c);
    wChars.push(String.fromCharCode(Zstr.translateZSCIItoUnicode(c, true)));
  }
  //console.log('wordSeps.length: ' + wordSeps.length);

  // then get the entry length
  let entryLength = zvm.bytes[loc++];
  //console.log('entry Length: ' + entryLength);

  let entryCount = zm.getWord(zvm, loc);

  //console.log('number of entries: ' + entryCount);

  loc += 2;

  let entryStartAddr = loc;
  //console.log('starting address of entries: ' + entryStartAddr.toString(16));

  let isStat = false;
  if (startAddr >= zf.getBaseOfStaticMem(zvm.bytes)) isStat = true;
  else isStat = false;

  let zd: ZDictionary = {
    bytes: zvm.bytes,
    address: startAddr,
    wordSeparators: wordSeps,
    wordSeparatorChars: wChars,
    entryLength: entryLength,
    maxWordLength: zvm.version < 4 ? 6 : 9,
    count: entryCount,
    entryStartAddr: entryStartAddr,
    entries: [],
    entriesByAddr: {},
    dictionary: {},
    isStatic: isStat
  };

  // now init all the entries
  let entries: any = [];
  for (let i = 0; i < zd.count; i++) entries.push(getEntryBlock(zd, zvm, i));

  zd.entries = entries;

  // now, let's insert the entries into the dictionary
  // {
  //     str: string,
  //     addr: number,
  //     len: number,
  //     dataAddr: number,
  //     dataLen: number
  // }
  zd.entries.forEach((el, index) => {
    // we want a map from the words to their starting address
    zd.dictionary[el.str] = el.addr;
    zd.entriesByAddr[el.addr] = el;
    //console.log("adding word '" + el.str + "' to dictionary with addr " + el.addr.toString(16));
  });

  //console.log('number of zd.entries: ' + zd.entries.length)
  return zd;
}

function getEntryBlock(zd: ZDictionary, zvm: zm.zMachine, entryNum: number) {
  if (entryNum >= zd.count)
    throw RangeError(
      'entryNum ' +
        entryNum +
        ' is too big for the total number of entries ' +
        zd.count
    );
  //console.log('getting entry block with length ' + zd.entryLength + ' for entry ' + entryNum )
  let entryLoc = zd.entryStartAddr + entryNum * zd.entryLength;
  // now read the entry starting there, should be exactly 4 bytes

  let wordLen = zvm.version < 3 ? 2 : 3;
  let str = Zstr.zToString(zvm, entryLoc, wordLen);
  let dataLen = zd.entryLength - (zvm.version < 3 ? 4 : 6);

  //console.log('entry location is at: ' + entryLoc.toString(16) + ', str is ' + str.str)

  if (dataLen < 0)
    throw Error(
      'something is wrong in the data length calculation for entry ' +
        entryNum +
        ', entry length is ' +
        zd.entryLength +
        ' and str.length was ' +
        str.length +
        ' for word ' +
        str.str +
        ', location is: ' +
        entryLoc.toString(16)
    );

  return {
    str: str.str,
    addr: entryLoc,
    len: str.length,
    dataAddr: entryLoc + str.length,
    dataLen: dataLen
  };
}

export function getEntry(zd: ZDictionary, entryNum: number) {
  if (entryNum >= zd.count)
    throw RangeError(
      'entryNum ' +
        entryNum +
        ' is too big for the total number of entries ' +
        zd.count
    );

  return zd.entries[entryNum].str;
}

export function toString(zd: ZDictionary) {
  let str = '';
  for (let i = 0; i < zd.count; i++) {
    str += zd.entries[i].str + ' at ' + zd.entries[i].addr.toString(16);
    str += '\n';
  }
  return str;
}

/**
 * This function searches for a given word in the dictionary and returns
 * its 'position' in the original dictionary (in case that matters)
 * @param zd the ZDictionary object we are working with
 * @param word the word we are looking for
 */
export function search(zvm: zm.zMachine, zd: ZDictionary, word: string) {
  let zTranslated = Zstr.convertZBytesToString(
    zvm,
    Zstr.zEncodeStr(word, zd.maxWordLength),
    0,
    zd.maxWordLength
  );
  let res = zd.dictionary[zTranslated.str];
  if (res !== undefined) return res;
  else return 0;
}
export function searchSlow(zd: ZDictionary, word: string) {
  // binary search the dictionary
  let low = 0;
  let high = zd.count - 1;
  let tword = word.slice(0, zd.maxWordLength);

  while (low <= high) {
    let mid = Math.floor((high + low) / 2);
    let str = getEntry(zd, mid);
    let cmp = str.localeCompare(tword);
    //console.log('checking entry: ' + mid);
    if (cmp === 0) {
      // return our guess
      return zd.entries[mid].addr;
    } else if (cmp < 0) {
      // this means the str is 'smaller' than the word, so we need a bigger guess,
      // so raise the floor (the low) to be the mid
      low = mid + 1;
    } else if (cmp > 0) {
      high = mid - 1;
    }
  }

  // well we didn't find it, so return 0--since it normally returns the
  // address of this entry, 0 indicates it didn't find it
  return 0;
}
