import React, { FunctionComponent, useState, useEffect } from 'react';
import * as Zm from '../ZmLib/ZMachine';
import * as Stack from '../StackUint16/StackUint16';
const labels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
// what should the Locals table have, well a table! with 240 entries!
const LocalsTable: FunctionComponent<{
  zvm: Zm.zMachine;
  [propName: string]: any;
}> = props => {
  let { zvm } = props;
  let [ltable, setLtable] = useState<number[]>(Zm.getLocalsTable(zvm));
  let [top, setTop] = useState('');
  useEffect(() => {
    const updateTable: (tbl: number[]) => void = tbl => {
      setLtable(tbl.map(el => el));
      setTop(Stack.top(zvm.stack).toString(16));
    };

    Zm.addLocalsTableListener(zvm, updateTable);

    // return a cleanup function
    return () => {
      zvm.localsTableListener = null;
    };
  }, [zvm]);

  return (
    <div className="localsTable">
      <p>
        Locals Table for Frame at: {zvm.fp.toString(16)}, top of stack: {top}
      </p>
      <p>Locals count: {Zm.getLocalsCount(zvm, zvm.fp)}</p>
      <table>
        <tbody>
          <tr>
            {labels.map((el, index) => {
              return <th key={'' + el + index}>{el.toString(16)}</th>;
            })}
          </tr>
          <tr>
            {ltable.map((el, index) => {
              return <td key={'' + el + index}>{el.toString(16)}</td>;
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default LocalsTable;
