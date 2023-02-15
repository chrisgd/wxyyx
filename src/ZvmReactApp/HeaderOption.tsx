import React, { FunctionComponent } from 'react';
import * as ZFile from '../ZmLib/ZFile';
import * as Zm from '../ZmLib/ZMachine';

const HeaderOption: FunctionComponent<{
  fun: (b: Uint8Array) => any;
  funName: string;
  funYes?: string;
  funNo?: string;
  zvm: Zm.zMachine;
  minVersion: number;
  maxVersion?: number;
  hex?: boolean;
  [propName: string]: any;
}> = props => {
  let { zvm, fun, funName, hex, minVersion, maxVersion, funYes, funNo } = props;

  return zvm.bytes &&
    ZFile.getVersionNum(zvm.bytes) >= minVersion &&
    (maxVersion !== undefined
      ? ZFile.getVersionNum(zvm.bytes) <= maxVersion
      : true) ? (
    <tr>
      <td />
      <td>{funName}</td>
      <td>
        {funYes
          ? fun(zvm.bytes)
            ? funYes
            : funNo
          : hex
          ? fun(zvm.bytes).toString(16)
          : fun(zvm.bytes)}
      </td>
    </tr>
  ) : null;
};

export default HeaderOption;
