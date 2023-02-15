import React, { FunctionComponent, useState, useEffect } from 'react';
import * as Zm from '../ZmLib/ZMachine';

const labels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const labels2 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
// what should the globals table have, well a table! with 240 entries!
const GlobalsTable: FunctionComponent<{
  zvm: Zm.zMachine;
  [propName: string]: any;
}> = props => {
  let { zvm } = props;
  let [gtable, setGtable] = useState<number[]>(Zm.getGlobalsTable(zvm));

  useEffect(() => {
    const updateTable: (tbl: number[]) => void = tbl => {
      setGtable(tbl.map(el => el));
    };

    Zm.addGlobalsTableListener(zvm, gtable, updateTable);
    return () => {
      zvm.globalsTableListener = null;
    };
  }, [gtable, zvm]);

  return (
    <table>
      <thead>
        <tr>
          <th>Addr</th>
          {labels.map((el, index) => (
            <th key={el + index}>{el.toString(16)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labels2.map((el, index) => (
          <tr key={el + index}>
            <th>{el.toString(16)}</th>
            {gtable.slice(el * 16, el * 16 + 16).map((el2, i2) => (
              <td key={el * 16 + i2}>{el2.toString(16)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default GlobalsTable;
