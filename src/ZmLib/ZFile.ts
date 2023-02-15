// -1 =  the colour of the pixel under the cursor (if any)
// 0  =  the current setting of this colour
// 1  =  the default setting of this colour
// 2  =  black   3 = red       4 = green    5 = yellow
// 6  =  blue    7 = magenta   8 = cyan     9 = white
// 10 =  darkish grey (MSDOS interpreter number)
// 10 =  light grey   (Amiga interpreter number)
// 11 =  medium grey  (ditto)
// 12 =  dark grey    (ditto)
// Colours 10, 11, 12 and -1 are available only in Version 6.
// gross, haha, these are harsh colors and not great for people with trouble
// perceiving colors, so while we have these, the actual color for green need
// not be exactly RGB(0, 255, 0).
export enum Color {
  PIXEL_COLOR_UNDER_CURSOR = -1,
  CURRENT_SETTING = 0,
  DEFAULT_SETTING = 1,
  Black = 2,
  Red = 3,
  Green = 4,
  Yellow = 5,
  Blue = 6,
  Magenta = 7,
  Cyan = 8,
  White = 9,
  MSDOS_DARKISH_GREY = 10,
  AMIGA_LIGHT_GREY = 10,
  AMIGA_MEDIUM_GREY = 11,
  AMIGA_DARK_GREY = 12
}

export function colorToString(color: Color) {
  switch (color) {
    case Color.PIXEL_COLOR_UNDER_CURSOR:
      return 'Pixel Color under Cursor';
    case Color.CURRENT_SETTING:
      return 'Current setting';
    case Color.DEFAULT_SETTING:
      return 'Default setting';
    case Color.Black:
      return 'black';
    case Color.Red:
      return 'red';
    case Color.Green:
      return 'green';
    case Color.Yellow:
      return 'yellow';
    case Color.Blue:
      return 'blue';
    case Color.Magenta:
      return 'magenta';
    case Color.Cyan:
      return 'cyan';
    case Color.White:
      return 'white';
    case Color.MSDOS_DARKISH_GREY:
      return 'MSDOS darkish grey';
    case Color.AMIGA_LIGHT_GREY:
      return 'AMIGA light grey';
    case Color.AMIGA_MEDIUM_GREY:
      return 'AMIGA medium grey';
    case Color.AMIGA_DARK_GREY:
      return 'AMIGA dark grey';
    default:
      throw Error('Unknown color');
  }
}

/**
 * retrieves a 16 bit unsigned int value from the array of bytes,
 * and this assumes it's stored in big-endian fashion, so most
 * significant byte is at loc, least is at loc + 1.
 * @param bytes the Uint8Array we are working with
 * @param loc the location where the 16-bit value starts
 */

export function getUint16(bytes: Uint8Array, loc: number) {
  return (bytes[loc] << 8) | bytes[loc + 1];
}

/* sets the 16-bit value in the array */
export function setUint16(bytes: Uint8Array, loc: number, val: number) {
  // the zmachine stores in big-endian fashion
  bytes[loc] = (val & 0xff00) >> 8;
  bytes[loc + 1] = val & 0xff;
}

/**
 * retrieves am 8 bit unsigned int value from the array of bytes
 * @param bytes the Uint8Array we are working with
 * @param loc the location where the 16-bit value starts
 */

export function getByte(bytes: Uint8Array, loc: number) {
  return bytes[loc];
}

/* sets the 8-bit value in the array */
export function setByte(bytes: Uint8Array, loc: number, val: number) {
  // be sure to chop off all but a byte
  bytes[loc] = val & 0xff;
}

/* gets the version number from the zfile,
v1 and beyond */
export function getVersionNum(bytes: Uint8Array) {
  return bytes[0];
}

/* gets a bit out of a number, where you specify the bit number you want,
 * and this function will return 1 if it's set, or 0 if it's not */
export function getBit(num: number, bit: number) {
  let bitval = 1 << bit;
  return (num & bitval) >> bit;
}

/**
 * This will set a bit on a given number and return it.
 * @param num the number we're setting the bit on
 * @param bit the bit number we want to set
 */
export function setBit(num: number, bit: number) {
  let bitval = 1 << bit;
  return num | bitval;
}

/**
 * This clears the bit on a given value
 * @param num the number we're clearning the bit on
 * @param bit the bit number we want to clear
 */
export function clearBit(num: number, bit: number) {
  // flip all the bits and then and it
  let bitval = ~(1 << bit);
  return num & bitval;
}

/* gets the status line type: 0=score/turns, 1=hours:mins*/
function getStatusLineType(bytes: Uint8Array) {
  return getBit(bytes[1], 1);
}

/* checks if the version number matches what the function needs.
    min is the earliest version where function makes sense
    max is the latest version where the function makes sense 
    use a negative number for max if there is no max 
    (as in this function makes sense up to most recent version)
*/

function isVersionCorrect(bytes: Uint8Array, min: number, max: number) {
  let version = getVersionNum(bytes);
  if (max <= 0) {
    return version >= min;
  } else {
    return version >= min && version <= max;
  }
}

/* returns true if the status line type is score/turns, 
v1-3 */
export function isStatusLineTurns(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 1, 3)) {
    if (getStatusLineType(bytes) === 0) {
      return true;
    } else {
      return false;
    }
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns true if the status line type is hours:mins, 
v1-3 */
export function isStatusLineHours(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 1, 3)) {
    if (getStatusLineType(bytes) === 1) {
      return true;
    } else {
      return false;
    }
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns true if the specified bit is true (ie 1) */

function isBitTrue(bytes: Uint8Array, byte: number, bit: number) {
  return getBit(bytes[byte], bit) === 1;
}

/* returns true if the story file is split across 2 discs, 
v1-3 */
export function isStoryFileSplit(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 1, 3)) {
    return isBitTrue(bytes, 0x1, 2);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns true if status line is not available, 
v1-3 */
export function isStatusLineNotAvailable(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 1, 3)) {
    return isBitTrue(bytes, 0x1, 4);
  } else {
    throw Error('you have the wrong version');
  }
}

/**
 * This is a generic method for setting or clearing header bit flags in general.
 * @param bytes the bytes of the z-machine
 * @param byte the byte in the header we are modifying
 * @param bit the bit we are setting
 * @param set true if we want to set it, false to clear it
 * @param version which version this is valid in
 */
export function setHeaderBitFlag(
  bytes: Uint8Array,
  byte: number,
  bit: number,
  set: boolean,
  minVersion: number,
  maxVersion: number,
  errMsg: string
) {
  if (isVersionCorrect(bytes, minVersion, maxVersion)) {
    if (set) {
      bytes[1] = setBit(bytes[1], bit);
    } else {
      bytes[1] = clearBit(bytes[1], bit);
    }
  } else {
    throw Error(errMsg);
  }
}

/**
 * This sets bit 4 in flags 1 to 0 if the status line is available and 1 if
 * it's not (the flag is phrased backwards)
 * @param bytes the Uint8Array representing the z-machine
 * @param isAvailable whether or not this interpreter has a status line
 */
const HEADER_FLAG_1_BYTE = 1;
const HEADER_FLAG_2_BYTE = 0x10;
const STATUS_LINE_BIT_V3 = 4;
export function setStatusLineAvailable(
  bytes: Uint8Array,
  isAvailable: boolean
) {
  setHeaderBitFlag(
    bytes,
    HEADER_FLAG_1_BYTE,
    STATUS_LINE_BIT_V3,
    !isAvailable,
    1,
    3,
    'status lines are always available in versions above 3'
  );
}

const SCREEN_SPLIT_BIT_V3 = 5;
export function setScreenSplitAvailable(
  bytes: Uint8Array,
  isAvailable: boolean
) {
  setHeaderBitFlag(
    bytes,
    HEADER_FLAG_1_BYTE,
    SCREEN_SPLIT_BIT_V3,
    isAvailable,
    1,
    3,
    "screen splitting isn't a thing in versions above 4"
  );
}

const VARIABLE_PITCH_FONT_DEFAULT_V3 = 6;
export function setVariablePitchFontIsDefault(
  bytes: Uint8Array,
  isAvailable: boolean
) {
  setHeaderBitFlag(
    bytes,
    HEADER_FLAG_1_BYTE,
    VARIABLE_PITCH_FONT_DEFAULT_V3,
    isAvailable,
    1,
    3,
    'setting variable pitch font as default is only a version < 3 thing'
  );
}

const COLORS_AVAILABLE_BIT = 0;
export function setColorsAvailable(bytes: Uint8Array, isAvailable: boolean) {
  setHeaderBitFlag(
    bytes,
    HEADER_FLAG_1_BYTE,
    COLORS_AVAILABLE_BIT,
    isAvailable,
    5,
    8,
    'colors available only in versions 5+, version is: ' + getVersionNum(bytes)
  );
}

const PICTURE_DISPLAYING_AVAILALBE = 1;
export function setCanDisplayPictures(bytes: Uint8Array, isAvailable: boolean) {
  setHeaderBitFlag(
    bytes,
    HEADER_FLAG_1_BYTE,
    PICTURE_DISPLAYING_AVAILALBE,
    isAvailable,
    6,
    8,
    'picture displaying is available only in versions 6+'
  );
}

const BOLDFACE_AVAILABLE = 2;
export function setBoldfaceAvailable(bytes: Uint8Array, isAvailable: boolean) {
  setHeaderBitFlag(
    bytes,
    HEADER_FLAG_1_BYTE,
    BOLDFACE_AVAILABLE,
    isAvailable,
    4,
    8,
    'boldface fonts available only in versions 4+'
  );
}

const ITALIC_AVAILABLE = 3;
export function setItalicAvailable(bytes: Uint8Array, isAvailable: boolean) {
  setHeaderBitFlag(
    bytes,
    HEADER_FLAG_1_BYTE,
    ITALIC_AVAILABLE,
    isAvailable,
    4,
    8,
    'italic available only in versions 4+'
  );
}

const FIXED_SPACE_STYLE_AVAILABLE = 4;
export function setFixedSpaceAvailable(
  bytes: Uint8Array,
  isAvailable: boolean
) {
  setHeaderBitFlag(
    bytes,
    HEADER_FLAG_1_BYTE,
    FIXED_SPACE_STYLE_AVAILABLE,
    isAvailable,
    4,
    8,
    'fixed-space style available only in versions 4+'
  );
}

const SOUND_EFFECTS_AVAILABLE = 5;
export function setSoundEffectsAvailable(
  bytes: Uint8Array,
  isAvailable: boolean
) {
  setHeaderBitFlag(
    bytes,
    HEADER_FLAG_1_BYTE,
    SOUND_EFFECTS_AVAILABLE,
    isAvailable,
    6,
    8,
    'fixed-space style available only in versions 6+'
  );
}

const TIMED_KEYBOARD_INPUT_AVAILABLE = 7;
export function setTimedKeyboardInputAvailable(
  bytes: Uint8Array,
  isAvailable: boolean
) {
  setHeaderBitFlag(
    bytes,
    HEADER_FLAG_1_BYTE,
    TIMED_KEYBOARD_INPUT_AVAILABLE,
    isAvailable,
    4,
    8,
    'fixed-space style available only in versions 4+'
  );
}

const TRANSCRIPTING_ON_BIT = 0;
export function setTranscriptingIsOn(bytes: Uint8Array, isOn: boolean) {
  setHeaderBitFlag(
    bytes,
    HEADER_FLAG_2_BYTE,
    TRANSCRIPTING_ON_BIT,
    isOn,
    1,
    8,
    'transcripting should be available for all versions'
  );
}

//const GAME_FORCING_FIXED_PITCH_FONT = 1;
const REQUEST_SCREEN_REDRAW = 2;
export function setScreenRedrawRequest(bytes: Uint8Array, request: boolean) {
  setHeaderBitFlag(
    bytes,
    HEADER_FLAG_2_BYTE,
    REQUEST_SCREEN_REDRAW,
    request,
    6,
    8,
    'fixed-space style available only in versions 6+'
  );
}

const GAME_WANTS_PICTUERS = 3;
export function setIntCanUsePicutres(bytes: Uint8Array, request: boolean) {
  setHeaderBitFlag(
    bytes,
    HEADER_FLAG_2_BYTE,
    GAME_WANTS_PICTUERS,
    request,
    5,
    8,
    'can only change picture status in versions 5+'
  );
}

const GAME_WANTS_UNDO_OPCODES = 4;
export function setIntCanUseUndoOpcodes(bytes: Uint8Array, request: boolean) {
  setHeaderBitFlag(
    bytes,
    HEADER_FLAG_2_BYTE,
    GAME_WANTS_UNDO_OPCODES,
    request,
    5,
    8,
    'can use undo is available only in versions 5+'
  );
}

const GAME_WANTS_MOUSE = 5;
export function setIntCanUseMouse(bytes: Uint8Array, request: boolean) {
  setHeaderBitFlag(
    bytes,
    HEADER_FLAG_2_BYTE,
    GAME_WANTS_MOUSE,
    request,
    5,
    8,
    'can use mouse is only in versions 5+'
  );
}

//const GAME_WANTS_COLORS = 6;
const GAME_WANTS_SOUND_EFECTS = 7;
export function setIntCanUseSounds(bytes: Uint8Array, request: boolean) {
  setHeaderBitFlag(
    bytes,
    HEADER_FLAG_2_BYTE,
    GAME_WANTS_SOUND_EFECTS,
    request,
    5,
    8,
    'can use sounds is only in versions 5+'
  );
}

const GAME_WANTS_MENUS = 8;
export function setIntCanUseMenus(bytes: Uint8Array, request: boolean) {
  setHeaderBitFlag(
    bytes,
    HEADER_FLAG_2_BYTE,
    GAME_WANTS_MENUS,
    request,
    5,
    8,
    'can use sounds is only in versions 5+'
  );
}

/* returns true if sceen-spliting is available, 
v1-3 */
export function isScreenSplittingAvailable(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 1, 3)) {
    return isBitTrue(bytes, 0x1, 5);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns true if a variable-pitch font the default, 
v1-3 */
export function isVariablePitchFontDefault(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 1, 3)) {
    return isBitTrue(bytes, 0x1, 6);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns true if colors are available, 
v5 and beyond */
export function isColorAvailable(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 5, -1)) {
    return isBitTrue(bytes, 0x1, 0);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns true if picture displaying available, 
v6 and beyond */
export function isPictureDisplayingAvailable(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 6, -1)) {
    return isBitTrue(bytes, 0x1, 1);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns true if boldface available, 
v4 and beyond */

export function isBoldfaceAvailable(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 4, -1)) {
    return isBitTrue(bytes, 0x1, 2);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns true if italic available, 
v4 and beyond */

export function isItalicAvailable(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 4, -1)) {
    return isBitTrue(bytes, 0x1, 3);
  } else {
    throw Error('you have the wrong version');
  }
}
/* returns true if fixed-space style available, 
v4 and beyond */

export function isFixedSpaceStyleAvailable(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 4, -1)) {
    return isBitTrue(bytes, 0x1, 4);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns true if sound effects available, 
v6 and beyond */

export function isSoundAvailable(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 6, -1)) {
    return isBitTrue(bytes, 0x1, 5);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns true if timed keyboard input available, 
v4 and beyond */

export function isTimedKeyboardInputAvailable(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 4, -1)) {
    return isBitTrue(bytes, 0x1, 7);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the byte address, located at byte */
function getByteAddress(bytes: Uint8Array, byte: number) {
  return getUint16(bytes, byte);
}
/* returns the word address, located at byte */

export function getWordAddressAt(bytes: Uint8Array, byte: number) {
  return getUint16(bytes, byte) << 1;
}

export function calculatePackedAddress(
  bytes: Uint8Array,
  base: number,
  isRoutineCall: boolean,
  isPrintPaddr: boolean
) {
  let version = getVersionNum(bytes);
  if (version <= 3) {
    return base << 1;
  } else if (version <= 5) {
    return base << 2;
  } else if (version <= 7 && isRoutineCall) {
    return (base << 2) + getRoutinesOffset(bytes); // + 8R_O (routine offset )
  } else if (version <= 7 && isPrintPaddr) {
    return (base << 2) + getStaticStringsOffset(bytes); // + 8S_O (strings offset)
  } else {
    return base << 3;
  }
}
/* returns the packed address, located at byte */

export function getPackedAddress(
  bytes: Uint8Array,
  byte: number,
  isRoutineCall: boolean,
  isPrintPaddr: boolean
) {
  let base = getUint16(bytes, byte);
  return calculatePackedAddress(bytes, base, isRoutineCall, isPrintPaddr);
}

/* returns the base of high memory (byte address),
v1 and beyond */

export function getBaseOfHighMemory(bytes: Uint8Array) {
  return getByteAddress(bytes, 0x4);
}

/* returns initial value of program counter (byte address),
v1 and beyond */
export function getInitialValuePC(bytes: Uint8Array) {
  return getByteAddress(bytes, 0x6);
}

/* returns address of initial "main" routine (packed address)
this is a routine call, so using routine call of packed address,
v6 and beyond */
export function getAddressOfInitialMainRoutine(bytes: Uint8Array) {
  return getPackedAddress(bytes, 0x6, true, false);
}

/* returns location of dictionary (byte address),
v1 and beyond */
export function getDictionaryLoc(bytes: Uint8Array) {
  return getByteAddress(bytes, 0x8);
}

/* returns location of object table (byte address),
v1 and beyond */
export function getObjectTableLoc(bytes: Uint8Array) {
  return getByteAddress(bytes, 0xa);
}

/* returns location of global variables table (byte address),
v1 and beyond */
export function getGlobalVarTable(bytes: Uint8Array) {
  return getByteAddress(bytes, 0xc);
}

/* returns base of static memory (byte address),
v1 and beyond */

export function getBaseOfStaticMem(bytes: Uint8Array) {
  return getByteAddress(bytes, 0xe);
}

// flags 2
// (For bits 3,4,5,7 and 8, Int clears again if it cannot provide the requested effect.)

/* returns true if transcripting is on,
v1 and beyond */
export function isTranscriptingOn(bytes: Uint8Array) {
  return isBitTrue(bytes, 0x10, 0);
}

/* returns true if game sets to force printing in fixed-print font,
v3 and beyond */
export function isForcePrintingInFixedPitchFont(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 3, -1)) {
    return isBitTrue(bytes, 0x10, 1);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns true if clear bit is set, in other words
Interpreter sets to request screen redraw: 
game clears when it complies with this.
v6 and beyond */
export function isClearBitSet(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 6, -1)) {
    return isBitTrue(bytes, 0x10, 2);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns true if the game wants to use pictures, v5 and beyond */

export function isWantingPictures(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 5, -1)) {
    return isBitTrue(bytes, 0x10, 3);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns true if the game wants to use the UNDO opcodes, v5 and beyond */
export function isWantingUNDO(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 5, -1)) {
    return isBitTrue(bytes, 0x10, 4);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns true if the game wants to use a mouse, v5 and beyond */
export function isWantingMouse(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 5, -1)) {
    return isBitTrue(bytes, 0x10, 5);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns true if the game wants to use colors, v5 and beyond */

export function isWantingColors(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 5, -1)) {
    return isBitTrue(bytes, 0x10, 6);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns true if the game wants to use sound effects, v5 and beyond */

export function isWantingSoundEffects(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 5, -1)) {
    return isBitTrue(bytes, 0x10, 7);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns true if the game wants to use menus, v6 and beyond */
export function isWantingMenus(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 6, -1)) {
    return isBitTrue(bytes, 0x10, 8);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns location of abbreviations table (byte address),
v2 and beyond */
export function getAbbreviationsTable(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 2, -1)) {
    return getByteAddress(bytes, 0x18);
  } else {
    throw Error('you have the wrong version');
  }
}

/* return length of file,
 v3 and beyond (some early v3 files might not have this) */
export function getFileLength(bytes: Uint8Array) {
  let version = getVersionNum(bytes);
  let baseLength = getUint16(bytes, 0x1a);
  if (version <= 3) {
    return baseLength << 1;
  } else if (version <= 5) {
    return baseLength << 2;
  } else {
    return baseLength << 3;
  }
}

/* returns the checksum of the file,
v3 and beyond (some early v3 files might not have this) */

export function getChecksum(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 3, -1)) {
    return getUint16(bytes, 0x1c);
  } else {
    throw Error('you have the wrong version');
  }
}

/* calculate the checksum on a set of bytes */
export function calculateChecksum(bytes: Uint8Array) {
  let checksum = 0;
  // subtract off the header
  const fileSize = getFileLength(bytes) - 64;
  // use this to point into the bytes
  let ptr = 64;

  // just sum all the bytes from the end of the header
  // to the end of the file, module 0x10000 (so we get
  // a 16-bit value)
  for (let i = 0; i < fileSize; i++, ptr++) {
    checksum += Math.floor(bytes[ptr]);
    checksum = checksum % 0x10000;
  }

  return checksum;
}

export enum InterpreterNum {
  DECSystem20 = 1,
  AppleIIe = 2,
  Machintosh = 3,
  Amiga = 4,
  AtariST = 5,
  IBMPC = 6,
  Commodore128 = 7,
  Commodore64 = 8,
  AppleIIc = 9,
  AppleIIgs = 10,
  TandyColor = 11,
  Other = 12
}

/* returns the interpreter number,
v4 and beyond  */
export function getInterpreterNum(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 4, -1)) {
    return bytes[0x1e];
  } else {
    throw Error('you have the wrong version');
  }
}

/**
 * sets the interpreter number for version 4+
 * @param bytes the z-machine file we are working with
 */
export function setInterpreterNum(bytes: Uint8Array, num: number) {
  if (isVersionCorrect(bytes, 4, -1)) {
    return (bytes[0x1e] = num);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the interpreter version,
v4 and beyond  */
export function getInterpreterVersion(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 4, -1)) {
    return bytes[0x1f];
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the interpreter version,
v4 and beyond  */
export function setInterpreterVersion(bytes: Uint8Array, num: number) {
  if (isVersionCorrect(bytes, 4, -1)) {
    return (bytes[0x1f] = num);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the screen height (lines),
255 means "infinite"
v4 and beyond */
export function getScreenHeightLines(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 4, -1)) {
    return getByte(bytes, 0x20);
  } else {
    throw Error('you have the wrong version');
  }
}

export function setScreenHeightLines(bytes: Uint8Array, height: number) {
  if (isVersionCorrect(bytes, 4, -1)) {
    return setByte(bytes, 0x20, height);
  } else {
    throw Error('You can only set the screen height in lines in version 4+');
  }
}

/* returns the screen width (characters),
v4 and beyond */
export function getScreenWidthChar(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 4, -1)) {
    return getByte(bytes, 0x21);
  } else {
    throw Error('you have the wrong version');
  }
}

export function setScreenWidthChar(bytes: Uint8Array, width: number) {
  if (isVersionCorrect(bytes, 4, -1)) {
    return setByte(bytes, 0x21, width);
  } else {
    throw Error('You can only set the sceen width in chars for versions 4+');
  }
}

/* returns the screen width in units,
v5 and beyond */
export function getScreenWidthUnits(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 5, -1)) {
    return getUint16(bytes, 0x22);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the screen width in units,
v5 and beyond */
export function setScreenWidthUnits(bytes: Uint8Array, width: number) {
  if (isVersionCorrect(bytes, 5, -1)) {
    return setUint16(bytes, 0x22, width);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the screen height in units, 
v5 and beyond */

export function getScreenHeightUnits(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 5, -1)) {
    return getUint16(bytes, 0x24);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the screen height in units, 
v5 and beyond */

export function setScreenHeightUnits(bytes: Uint8Array, height: number) {
  if (isVersionCorrect(bytes, 5, -1)) {
    return setUint16(bytes, 0x24, height);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the font width in units (defined as a width of a '0'), 
    v5 and beyond*/
export function getFontWidthUnits(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 5, -1)) {
    if (getVersionNum(bytes) === 5) {
      // font width location in version 5 is 26
      return getByte(bytes, 0x26);
    } else {
      // font width location in version 6 and beyond is 27
      return getByte(bytes, 0x27);
    }
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the font width in units (defined as a width of a '0'), 
    v5 and beyond*/
export function setFontWidthUnits(bytes: Uint8Array, width: number) {
  if (isVersionCorrect(bytes, 5, -1)) {
    if (getVersionNum(bytes) === 5) {
      // font width location in version 5 is 26
      return setByte(bytes, 0x26, width);
    } else {
      // font width location in version 6 and beyond is 27
      return setByte(bytes, 0x27, width);
    }
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the font height in units, v5 and beyond */
export function getFontHeight(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 5, -1)) {
    if (getVersionNum(bytes) === 5) {
      // font width location in version 5 is 27
      return getByte(bytes, 0x27);
    } else {
      // font width location in version 6 and beyond is 26
      return getByte(bytes, 0x26);
    }
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the font height in units, v5 and beyond */
export function setFontHeight(bytes: Uint8Array, height: number) {
  if (isVersionCorrect(bytes, 5, -1)) {
    if (getVersionNum(bytes) === 5) {
      // font width location in version 5 is 27
      return setByte(bytes, 0x27, height);
    } else {
      // font width location in version 6 and beyond is 26
      return setByte(bytes, 0x26, height);
    }
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the routines offset,
v6 and beyond */

export function getRoutinesOffset(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 6, -1)) {
    return getUint16(bytes, 0x28) << 8;
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the static strings offset
v6 and beyond  */
export function getStaticStringsOffset(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 6, -1)) {
    return getUint16(bytes, 0x2a);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the default background color,
v5 and beyond */

export function getDefaultBackgroundColor(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 5, -1)) {
    return getByte(bytes, 0x2c);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the default background color, wow 256 colors???
v5 and beyond */

export function setDefaultBackgroundColor(bytes: Uint8Array, color: number) {
  if (isVersionCorrect(bytes, 5, -1)) {
    return setByte(bytes, 0x2c, color);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the default foreground color,
v5 and beyond */

export function getDefaultForegroundColor(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 5, -1)) {
    return getByte(bytes, 0x2d);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the default foreground color,
v5 and beyond */

export function setDefaultForegroundColor(bytes: Uint8Array, color: number) {
  if (isVersionCorrect(bytes, 5, -1)) {
    return setByte(bytes, 0x2d, color);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the address of terminating characters table (bytes),
v5 and beyond */
export function getTerminatingCharactersTableAddress(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 5, -1)) {
    return getUint16(bytes, 0x2e);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the total width of pixels sent to output stream 3,
v6 and beyond */

export function getTotalWidthPixelsInOutStream3(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 6, -1)) {
    return getUint16(bytes, 0x30);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the total width of pixels sent to output stream 3,
v6 and beyond */

export function setTotalWidthPixelsInOutStream3(
  bytes: Uint8Array,
  width: number
) {
  if (isVersionCorrect(bytes, 6, -1)) {
    return setUint16(bytes, 0x30, width);
  } else {
    throw Error('you have the wrong version');
  }
}

/* returns the standard revision number, 
v1 and beyond */

export function getStandardRevisionNum(bytes: Uint8Array) {
  return getUint16(bytes, 0x32);
}

/* returns the standard revision number, 
v1 and beyond */

export function setStandardRevisionNum(bytes: Uint8Array, rev: number) {
  return setUint16(bytes, 0x32, rev);
}

/* returns the alpabet table address (bytes), or 0 for default, 
v5 and beyond can return another address besides 0 */

export function getAlphabetTableAddress(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 5, -1)) {
    return getUint16(bytes, 0x34);
  } else {
    return 0;
  }
}

/* returns the header extension table address (bytes), 
v5 and beyond */

export function getHeaderExtensionTableAddress(bytes: Uint8Array) {
  if (isVersionCorrect(bytes, 5, -1)) {
    return getUint16(bytes, 0x36);
  } else {
    throw Error('you have the wrong version');
  }
}

// header extenstion table stuff

/* returns a word in the header extension table 
a word is 2 bytes */

function getHeaderExtensionTableWord(bytes: Uint8Array, wordNum: number) {
  return getUint16(bytes, getHeaderExtensionTableAddress(bytes) + 2 * wordNum);
}
/* returns the number of further words in header extension table */
export function getNumOfFurtherWords(bytes: Uint8Array) {
  return getHeaderExtensionTableWord(bytes, 0);
}

/* returns x-coordinate of mouse after a click, v5+ */

export function getXPosAfterClick(bytes: Uint8Array) {
  return getHeaderExtensionTableWord(bytes, 1);
}

/* returns y-coordinate of mouse after a click, v5+ */

export function getYPosAfterClick(bytes: Uint8Array) {
  return getHeaderExtensionTableWord(bytes, 2);
}

/*returns unicode translation table address (optional), v5+ */
export function getUnicodeTranslationTableAddress(bytes: Uint8Array) {
  return getHeaderExtensionTableWord(bytes, 3);
}

// takes a uint8array and converts it to a javascript string
export function convertToString(bytes: Uint8Array, len: number) {
  let sb = '';
  if (len > bytes.length)
    console.log('len is larger than bytes, truncating to bytes length');

  len = Math.min(len, bytes.length);
  for (let i = 0; i < len; i++) sb += String.fromCharCode(bytes[i]);

  return sb;
}

export function convertFromString(sbytes: string) {
  let bytes = new Uint8Array(sbytes.length);
  for (let i = 0; i < sbytes.length; i++) {
    // truncate it to 0-255, well, it should be that anyways
    // and it is a Uint8Array
    bytes[i] = sbytes.charCodeAt(i) & 0xff;
  }

  return bytes;
}
