/**
 * ZObjTable defines structures and functions on the object table.
 */
import * as zm from './ZMachine';
import { getObjectTableLoc } from './ZFile';
import { zToString } from './Strings';

export interface ZObjTable {
  // well the object table has to be associated with a zmachine really
  readonly zvm: zm.zMachine;
  // size of the property defaults table
  readonly size: number;
  // this is really a byte entry into its location
  readonly address: number;
  readonly entries: number;
  readonly entrySize: number;
  readonly parentOffset: number;
  readonly siblingOffset: number;
  readonly childOffset: number;
  readonly propertiesAddr: number;
  estimatedObjCount: number;
}

/**
 * creates a ZObjTable to work with.
 * @param zvm the z-machine this object table is associated with
 */
export function makeZObjTable(zvm: zm.zMachine): ZObjTable {
  let otl = getObjectTableLoc(zvm.bytes);
  // 31 words or 63 words in the object defaults header
  let sz = zvm.version < 4 ? 62 : 126;
  let pot = {
    zvm: zvm,
    size: sz,
    address: otl,
    entries: otl + sz,
    entrySize: zvm.version < 4 ? 9 : 14,
    parentOffset: zvm.version < 4 ? 4 : 6,
    siblingOffset: zvm.version < 4 ? 5 : 8,
    childOffset: zvm.version < 4 ? 6 : 10,
    propertiesAddr: zvm.version < 4 ? 7 : 12,
    estimatedObjCount: 0
  };

  return pot;
}

/**
 * Returns 1 if the given attribute is set for the given object, or 0 otherwise
 * @param zot the ZObjTable we are working with
 * @param objLoc object ID, or entry into the table
 * @param attributeNum attribute number we want to retrieve
 */
export function isAttributeSet(
  zot: ZObjTable,
  objID: number,
  attributeNum: number
) {
  // attributes are in the first 4 bytes for versions < 4, or first 6 bytes for 4 and later
  // so just some sanity checking during development of these things
  if (
    (zot.zvm.version < 4 && (attributeNum < 0 || attributeNum >= 32)) ||
    attributeNum < 0 || attributeNum >= 48
  )
    throw Error(
      'attribute value ' +
        attributeNum +
        ' is out of range for version ' +
        zot.zvm.version
    );

  // calculate the attribute byte, divide by 8 then floor it
  let byte = Math.floor(attributeNum / 8);
  // and get the bit, which is modulo 8, but the bits are backwards,
  // so it's lowest bit first
  let bit = 0x80 >> attributeNum % 8;

  // note, object 0 doesn't really count, oh and yay for pointer math?
  // we multiply the object ID (they are consecutively numbered) by the
  // entry size, then we add the entry start location (which is in bytes) and
  // finally we add the byte offset given by the attribute number
  let attribLoc = (objID - 1) * zot.entrySize + zot.entries + byte;
  // then we and this byte we look up with bit and if it's not 0, we return 0
  return (zm.getByte(zot.zvm, attribLoc) & bit) !== 0;
}

/**
 * Sets the given attribute on the given object
 * @param zot the ZObjTable we are working with
 * @param objLoc object ID, or entry into the table
 * @param attributeNum attribute number we want to set
 * @param on whether we want this attribute on or not (true or false/1 or 0)
 */
export function setAttribute(
  zot: ZObjTable,
  objID: number,
  attributeNum: number,
  on: boolean
) {
  // attributes are in the first 4 bytes for versions < 4, or first 6 bytes for 4 and later
  // so just some sanity checking during development of these things
  if (
    (zot.zvm.version < 4 && (attributeNum < 0 || attributeNum >= 32)) ||
    attributeNum < 0 || attributeNum >= 48
  )
    throw Error(
      'attribute value ' +
        attributeNum +
        ' is out of range for version ' +
        zot.zvm.version
    );

  // calculate the attribute byte, divide by 8 then floor it
  let byte = Math.floor(attributeNum / 8);
  // and get the bit, which is modulo 8, but the bits are little-endian
  // so we right-shift a 1 from the left
  let bit = 0x80 >> attributeNum % 8;

  // note, object 0 doesn't really count, oh and yay for pointer math?
  // we multiply the object ID (they are consecutively numbered) by the
  // entry size, then we add the entry start location (which is in bytes) and
  // finally we add the byte offset given by the attribute number
  let attribLoc = (objID - 1) * zot.entrySize + zot.entries + byte;
  // then we and this byte we look up with bit and if it's not 0, we return 0
  let newByte = zm.getByte(zot.zvm, attribLoc);
  if (on)
    // or it with this single bit
    zm.writeByte(zot.zvm, attribLoc, newByte | bit);
  // or flip the bits and and it
  else zm.writeByte(zot.zvm, attribLoc, newByte & ~bit);
}

/**
 * This calculates the address for a property so we don't have to
 * recaculate it everywhere
 * @param zot the zObjTable we are working with
 * @param objID the id of the object
 * @param propOffset the offset for this field, like zot.parentOffset
 */
export function getObjFieldAddr(
  zot: ZObjTable,
  objID: number,
  propOffset: number
) {
  // sanity checks
  if (objID < 1 || (zot.zvm.version < 4 && objID > 255) || objID > 65535) {
    throw Error(
      'objID ' + objID + ' is invalid for version ' + zot.zvm.version
    );
  }

  return (objID - 1) * zot.entrySize + zot.entries + propOffset;
}

/**
 * Returns the properties address for a given object
 * @param zot the zObjTable we are working with
 * @param objID the object table we want
 */
export function getPropertiesAddr(zot: ZObjTable, objID: number) {
  return zm.getWord(zot.zvm, getObjFieldAddr(zot, objID, zot.propertiesAddr));
}

/**
 * Sets the properties address for a given object
 * @param zot the zObjTable we are working with
 * @param objID the object table we want
 */
export function setPropertiesAddr(
  zot: ZObjTable,
  objID: number,
  newAddr: number
) {
  return zm.writeWord(
    zot.zvm,
    getObjFieldAddr(zot, objID, zot.propertiesAddr),
    newAddr
  );
}

/**
 * Returns the the parent ID of the given objID, 0 if there isn't one.
 * @param zot the zObjTable we are working with
 * @param objID the object table we want
 */
export function getParent(zot: ZObjTable, objID: number) {
  if (zot.zvm.version < 4) {
    return zm.getByte(zot.zvm, getObjFieldAddr(zot, objID, zot.parentOffset));
  } else {
    return zm.getWord(zot.zvm, getObjFieldAddr(zot, objID, zot.parentOffset));
  }
}

/**
 * Returns the properties address for a given object
 * @param zot the zObjTable we are working with
 * @param objID the object table we want
 */
export function setParent(zot: ZObjTable, objID: number, newParent: number) {
  // sanity checks
  if ((zot.zvm.version < 4 && objID > 255) || objID > 65535) {
    throw Error(
      'objID ' + objID + ' is invalid for version ' + zot.zvm.version
    );
  }

  if (zot.zvm.version < 4) {
    zm.writeByte(
      zot.zvm,
      getObjFieldAddr(zot, objID, zot.parentOffset),
      newParent
    );
  } else {
    return zm.writeWord(
      zot.zvm,
      getObjFieldAddr(zot, objID, zot.parentOffset),
      newParent
    );
  }
}

/**
 * Returns the properties address for a given object
 * @param zot the zObjTable we are working with
 * @param objID the object table we want
 */
export function getSibling(zot: ZObjTable, objID: number) {
  if (zot.zvm.version < 4) {
    return zm.getByte(zot.zvm, getObjFieldAddr(zot, objID, zot.siblingOffset));
  } else {
    return zm.getWord(zot.zvm, getObjFieldAddr(zot, objID, zot.siblingOffset));
  }
}

/**
 * Returns the properties address for a given object
 * @param zot the zObjTable we are working with
 * @param objID the object table we want
 */
export function setSibling(zot: ZObjTable, objID: number, newSibling: number) {
  // sanity checks
  if ((zot.zvm.version < 4 && objID > 255) || objID > 65535) {
    throw Error(
      'objID ' + objID + ' is invalid for version ' + zot.zvm.version
    );
  }

  if (zot.zvm.version < 4) {
    zm.writeByte(
      zot.zvm,
      getObjFieldAddr(zot, objID, zot.siblingOffset),
      newSibling
    );
  } else {
    return zm.writeWord(
      zot.zvm,
      getObjFieldAddr(zot, objID, zot.siblingOffset),
      newSibling
    );
  }
}

/**
 * Returns the properties address for a given object
 * @param zot the zObjTable we are working with
 * @param objID the object table we want
 */
export function getChild(zot: ZObjTable, objID: number) {
  if (zot.zvm.version < 4) {
    return zm.getByte(zot.zvm, getObjFieldAddr(zot, objID, zot.childOffset));
  } else {
    return zm.getWord(zot.zvm, getObjFieldAddr(zot, objID, zot.childOffset));
  }
}

/**
 * Returns the properties address for a given object
 * @param zot the zObjTable we are working with
 * @param objID the object table we want
 */
export function setChild(zot: ZObjTable, objID: number, newChild: number) {
  // sanity checks
  if ((zot.zvm.version < 4 && objID > 255) || objID > 65535) {
    throw Error(
      'objID ' + objID + ' is invalid for version ' + zot.zvm.version
    );
  }

  if (zot.zvm.version < 4) {
    zm.writeByte(
      zot.zvm,
      getObjFieldAddr(zot, objID, zot.childOffset),
      newChild
    );
  } else {
    return zm.writeWord(
      zot.zvm,
      getObjFieldAddr(zot, objID, zot.childOffset),
      newChild
    );
  }
}

/**
 * Returns the property table header information as an object, which includes
 * the length of the header, the short name of the object, and the address of the first
 * property of the object
 * @param zot the ZObjTable we are working with
 * @param objID the object we are concerned with
 */
export function getPropertyTableHeader(zot: ZObjTable, objID: number) {
  // first get the address of this table
  let addr = getPropertiesAddr(zot, objID);

  // then read the next byte, which is how many words the text is (we multiply by 2 to get bytes)
  let wordLen = zot.zvm.bytes[addr];
  let len = wordLen * 2;
  // then get the short name
  let str = zToString(zot.zvm, addr + 1, len);

  return { len: len, shortName: str.str, firstPropertyAddress: addr + len + 1 };
}

/**
 * Returns the short name of the object, which requires looking up its property table
 * @param zot the ZObjTable we are working with
 * @param objID the object ID
 */
export function getObjectShortName(zot: ZObjTable, objID: number) {
  return getPropertyTableHeader(zot, objID).shortName;
}

/**
 * Properties are stored in the property object table in descending numerical order
 * and it's essential apparently. We just walk through the list until we find the right one.
 * This returns an object with { addr: <starting byte address of the property>, length: <length
 * of this property> }. If it's not found, the fields will be filled with 0.
 * @param zot the zObjTable we are working with
 * @param objID the object id we need
 * @param prop the property we are looking for
 */
export function findPropertyAddr(
  zot: ZObjTable,
  objID: number,
  propID: number,
  res?: { addr: number; length: number }
): { addr: number; length: number } {
  // get the prop table first
  let addr = getPropertiesAddr(zot, objID);

  // now skip past the name and start at the first property (this includes the size of the name)
  let headerLen = zot.zvm.bytes[addr] * 2 + 1;
  let loc = addr + headerLen;

  // simplify this...
  let maxProps = zot.zvm.version < 4 ? 32 : 64;
  let propCount = 0;
  while (propCount < maxProps) {
    let res = getPropertyBlockInfo(zot, loc);
    // we're at the end if the length is 0
    if (res.length === 0) return res;
    else if (res.id === propID)
      // we found it!
      return res;
    else {
      // otherwise, advance the location
      loc += res.length + res.sizeLen;
    }
    // just some sanity checking
    propCount++;
  }
  throw Error(
    'exceeded the maximum property count for an object when searching for its property'
  );
}

/**
 * Returns the next preperty after the one given--we assume you start with 0
 * @param zot the ZObjTable we are working with
 * @param propID the previous property ID, so we'll find the one after this
 */
export function findNextProperty(
  zot: ZObjTable,
  objID: number,
  propID: number
) {
  // get the prop table first
  let addr = getPropertiesAddr(zot, objID);

  // now skip past the name and start at the first property (this includes the size of the name)
  let headerLen = zm.getByte(zot.zvm, addr) * 2 + 1;
  let propAddr = addr + headerLen;

  let block = getPropertyBlockInfo(zot, propAddr);
  // if it's for propID 0, just return the first object, note there could be no
  // properties, but this will return id = 0, which is correct
  if (propID === 0) {
    return block.id;
  }

  let maxProps = zot.zvm.version < 4 ? 32 : 64;
  let propCount = 0;
  while (block.id !== propID && propCount < maxProps) {
    // increment our address by the size of the property block
    propAddr += block.sizeLen + block.length;

    // then get the next one
    block = getPropertyBlockInfo(zot, propAddr);

    // and escape if it gives us 0 because we've reached the end
    if (block.id === 0) break;

    // sanity checking
    propCount++;
  }

  // make sure we've actually found the property--it's illegal to not find it
  if (block.id !== propID) {
    throw Error(
      'illegal get-next-prop for object ' + objID + ' for proprety ' + propID
    );
  }

  // now, we found the property, but we want the next ID
  propAddr += block.sizeLen + block.length;
  block = getPropertyBlockInfo(zot, propAddr);

  return block.id;
}

const BIT_6 = 0x40;
const BIT_7 = 0x80;
const BITS_567 = 0xe0;
const BITS_0TO4 = 0x1f;
const BITS_0TO5 = 0x3f;
/**
 * This returns info about the property, which depends on the zvm version.
 * It returns an object with { addr: number, length: number, id: number, sizeLen: number },
 * where addr is the start of the data. If the sizeByte is 0, it returns results filled with 0,
 * since that indicates it's no longer there. The addr is the address of this property address,
 * the length is the number of bytes (not including size-byte) in the property, the id is the
 * property id, and the sizelen is the size of the sizebyte, which can be 1 or 2 bytes (up to 2
 * if it's zvm.version >= 4).
 * @param zot the ZObjTable we are working with
 * @param addr the address where this proprety block lives
 */
export function getPropertyBlockInfo(
  zot: ZObjTable,
  propAddr: number
): { length: number; addr: number; id: number; sizeLen: number } {
  if (zot.zvm.version < 4) {
    let sizeByte = zm.getByte(zot.zvm, propAddr);
    //console.log('getPropertyBlockInfo: sizeByte = ' + sizeByte);

    // it could be this byte is 0, which means we are at the end of the property blocks
    if (sizeByte === 0) {
      return { addr: 0, length: 0, id: 0, sizeLen: 0 };
    }

    // the top 3 bits of the size byte is the size of the property data
    let size = ((sizeByte & BITS_567) >> 5) + 1;
    // the bottom 5 bits give us the propID
    let propID = sizeByte & BITS_0TO4;

    // the size is the number of bytes in the property
    // addr is the start of this property address
    // sizeLen is the length of the size byte, in version 1-3, it's 1 byte
    return { length: size, addr: propAddr + 1, id: propID, sizeLen: 1 };
    //return { length: size, addr: propAddr, id: propID, sizeLen: 1 }
  } else {
    // version 4+ have a different method
    let firstByte = zm.getByte(zot.zvm, propAddr);

    // if the byte is just 0, then there's no more property blocks here
    if (firstByte === 0) {
      return { addr: 0, length: 0, id: 0, sizeLen: 0 };
    }

    // the id is the bottom 6 bits of the first byte
    let id = firstByte & BITS_0TO5;

    // now see if bit 7 is set, if so, there is one more byte that follows
    if ((firstByte & BIT_7) === BIT_7) {
      let secondByte = zm.getByte(zot.zvm, propAddr + 1);
      // the size is in this second byte, bits 0 to 5
      let size = secondByte & BITS_0TO5;
      // one thing though, if this is 0, it's actually a size of 64 bytes
      if (size === 0) size = 64;

      // the addresses start two bytes later
      return { length: size, addr: propAddr + 2, id: id, sizeLen: 2 };
      //return { length: size, addr: propAddr, id: id, sizeLen: 2 }
    } else {
      // in this case, there's just one byte, and if bit 6 is set,
      // then the property data is 2 bytes in length, otherwise it's 1 byte
      let size = (firstByte & BIT_6) === BIT_6 ? 2 : 1;

      return { length: size, addr: propAddr + 1, id: id, sizeLen: 1 };
      //return { length: size, addr: propAddr, id: id, sizeLen: 1}
    }
  }
}

/**
 * Given the first byte of some proprety data, we want to reconstruct its size--this is
 * done by backing up one byte, and depends on the version of the machine we have
 * @param zot the ZObjTable we are working with
 * @param propAddr the property address we have
 */
export function getPropertyLengthFromAddr(zot: ZObjTable, propAddr: number) {
  // get_prop_len 0 must return 0 as some Infocom games and files generated by old
  // versions of Inform expect it to
  if (propAddr === 0) return 0;

  // well, we know the size byte is really just one byte back, regardless of version
  let sizeByte = zm.getByte(zot.zvm, propAddr - 1);
  //let sizeByte = zot.zvm.bytes[propAddr];
  if (zot.zvm.version < 4) {
    let pbi = getPropertyBlockInfo(zot, propAddr - 1);
    return pbi.length;
    // then we can calculate it and return it, i.e., it's 1 to 8 bytes long at most
    // since 3 bits can be 0 to 7 at most
    //return ((sizeByte & BITS_567) >> 5) + 1;
  } else {
    // now we behave differently depending on whether bit 7 is set, because if there
    // was a 2nd byte, this bit was also set on it
    if (sizeByte & BIT_7) {
      let size = sizeByte & BITS_0TO5;
      if (size === 0) size = 64;
      return size;
    } else {
      return sizeByte & BIT_6 ? 2 : 1;
    }
  }
}

/**
 * Sets the property on the given object in the z-object table. This is primarily for
 * the put_prop instruction of the z-machine.
 * @param zot the object table we are working with
 * @param objID the object id
 * @param propID the property id
 */
export function setProperty(
  zot: ZObjTable,
  objID: number,
  propID: number,
  value: number
) {
  let { addr, length } = findPropertyAddr(zot, objID, propID);
  if (length > 2) {
    throw Error('unable to set a property where the length > 2');
  } else if (length === 1) {
    // truncate the value to the least significant byte, so 0 to 255
    let val = value & 0xff;
    zm.writeByte(zot.zvm, addr, val);
    console.log(
      'setting object ' +
        objID +
        ' property ' +
        propID +
        ' to ' +
        val +
        ' with length 1'
    );
  } else {
    let val = value & 0xffff;
    console.log(
      'setting object ' +
        objID +
        ' property ' +
        propID +
        ' to ' +
        val +
        ' with length 2'
    );
    zm.writeWord(zot.zvm, addr, val);
  }
}

/**
 * Returns the property data of a specific property in an object
 * @param zot the ZObjTable we are working with
 * @param objID the object id of the object whose property we want
 * @param propID the property id of the proprety we want
 */
export function getProperty(zot: ZObjTable, objID: number, propID: number) {
  let paddr = findPropertyAddr(zot, objID, propID);

  // if we can't find the property, return the default one
  if (paddr.addr === 0) return getObjectDefaultProperty(zot, propID);

  // if the length is too big, throw an error
  if (paddr.length > 2)
    throw Error('unable to return more than 2 bytes of data');

  // otherwise, return it
  if (paddr.length === 1) {
    return zm.getByte(zot.zvm, paddr.addr);
  } else {
    return zm.getWord(zot.zvm, paddr.addr);
  }
}

/**
 * Returns the default property from the property defaults block of the object table:
 * note that properties are numbered from 1 upwards
 * @param zot the ZObjTable we are working with
 * @param propID the property ID we are looking for
 */
export function getObjectDefaultProperty(zot: ZObjTable, propID: number) {
  let propLoc = (propID - 1) * 2;
  if (propLoc >= zot.size)
    throw Error(
      'invalid property ID ' + propID + ' for getting the default property'
    );

  // sane or not sane?
  if (propID === 0) {
    console.log('warning: getObjectDefaultProperty called on propID 0');
    return 0;
  }

  //console.log('zot address: ' + zot.address.toString(16) + ', propLoc: ' + propLoc);
  return zm.getWord(zot.zvm, zot.address + propLoc);
}

/**
 * Represents the data in an object property.
 */
export interface ZObjProperty {
  id: number;
  //addr: number;
  size: number;
  propAddr: number;
  propData: number[];
}

/**
 * This is an interface usable by programs needing object details. The z-machine
 * just knows how to access objects and the functions here allow the instructions
 * for it access the revelant pieces of data. But an interpreter doesn't really
 * need to know what an object looks like--on the other hand, it's useful to
 * see, hence the interface.
 */
export interface ZObj {
  // the object id, sometimes useful to have internally
  id: number;
  // location of the zobj
  addr: number;
  // attributes as an array of values, this is calculated from the flags
  attributes: number[];
  // parent id
  parent: number;
  // next sibling id
  sibling: number;
  // next child id
  child: number;
  // address of the properties table
  propertiesAddr: number;
  // short name of the object
  shortName: string;
  // the actual properties
  properties: ZObjProperty[];
}

/**
 * The z-machine doesn't actually ever specify what the count of
 * objects is, but it seems that programs assume the properties table
 * begins immediately after the list of objects (see Remarks in link):
 * http://inform-fiction.org/zmachine/standards/z1point0/sect12.html
 * @param zot the ZObjTable we are working with
 */
export function guessObjectCount(zot: ZObjTable) {}

export function getAllPropreties(
  zot: ZObjTable,
  objID: number
): ZObjProperty[] {
  let props: ZObjProperty[] = [];

  // let's try again, start by querying for property ID 0
  let nextPropID = findNextProperty(zot, objID, 0);
  while (nextPropID !== 0) {
    let addr = findPropertyAddr(zot, objID, nextPropID);

    let prop = {
      id: nextPropID,
      propAddr: addr.addr,
      size: addr.length,
      propData: [] as number[]
    };
    zot.zvm.bytes
      .slice(prop.propAddr, prop.propAddr + prop.size)
      .forEach(el => prop.propData.push(el));
    nextPropID = findNextProperty(zot, objID, nextPropID);
    props.push(prop);
  }
  // let addr = getPropertiesAddr(zot, objID);
  // let block = getPropertyBlockInfo(zot, addr);
  // while (block.length !== 0) {
  //     let prop = {
  //         id: block.id,
  //         addr: block.addr - block.sizeLen,
  //         size: block.length,
  //         propAddr: block.addr,
  //         propData: [] as number[],
  //     }
  //     zot.zvm.bytes.slice(block.addr, block.addr + block.length).forEach(el => prop.propData.push(el));
  //     props.push(prop);
  //     addr = prop.propAddr + prop.size;
  //     block = getPropertyBlockInfo(zot, addr);
  // }

  return props;
}

// this looks up and loads the object at a given location, returning its data
export function makeZObj(zot: ZObjTable, objID: number, addr: number): ZObj {
  const attribArray = [];
  for (let i = 0; i < (zot.zvm.version < 4 ? 32 : 48); i++) attribArray[i] = i;

  return {
    id: objID,
    addr: addr,
    attributes: attribArray.filter(el => isAttributeSet(zot, objID, el)),
    parent: getParent(zot, objID),
    sibling: getSibling(zot, objID),
    child: getChild(zot, objID),
    propertiesAddr: getPropertiesAddr(zot, objID),
    shortName: getObjectShortName(zot, objID),
    properties: getAllPropreties(zot, objID)
  };
}

/**
 * This returns an array of all the objects we can find. This takes a
 * little bit of guess work, but we know the object table must be contiguous.
 * @param zot the ZObjTable we are working with
 */
export function getZObjs(zot: ZObjTable) {
  let zobjs: ZObj[] = [];
  let addr = zot.entries;
  // well, assume there's at least one object
  let end = getPropertiesAddr(zot, 1);
  // going to try to dynamically figure out the end of the table by
  // adjusting the end--don't try this at home!
  for (let i = addr, objID = 1; i < end; i += zot.entrySize, objID++) {
    zobjs[objID] = makeZObj(zot, objID, i);

    if (end > zobjs[objID].propertiesAddr) {
      end = zobjs[objID].propertiesAddr;
    }
  }

  // at this point, end is as small as we think it'll be
  return zobjs;
}
