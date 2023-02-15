import React, { FunctionComponent, useState, useEffect } from 'react';
import { Table, Collapse, Button } from 'reactstrap';
import * as Zm from '../ZmLib/ZMachine';
import * as Zd from '../ZmLib/ZDictionary';

const Dictionary: FunctionComponent<{
  zvm: Zm.zMachine;
  len: number;
}> = props => {
  let { zvm, len } = props;
  let [dict, setDict] = useState(zvm.standardDictionary);
  let [entries, setEntries] = useState<Zd.ZDEntry[][]>([]);
  let [isOpen, setIsOpen] = useState(false);
  let [buttonText, setButtonText] = useState('Show Dictionary');

  useEffect(() => {
    setDict(zvm.standardDictionary);

    // set up the entries arrays, this breaks apart the
    // entries into mini-arrays length len, so they can
    // be mapped below in the render as rows of columns
    let e = zvm.standardDictionary.entries;
    let es: Zd.ZDEntry[][] = [];
    for (let i = 0; i < e.length; i += len) {
      es.push(e.slice(i, i + len));
    }
    setEntries(es);
  }, [len, zvm.standardDictionary]);

  const toggle = () => {
    let newVal = !isOpen;
    setIsOpen(newVal);
    setButtonText(newVal ? 'Hide Dictionary' : 'Show Dictionary');
  };
  return (
    <>
      <Button block color="primary" onClick={toggle}>
        {buttonText}
      </Button>
      <Collapse isOpen={isOpen}>
        <Table>
          <tbody>
            <tr>
              <td>
                <b>Dictionary Address:</b>
              </td>
              <td>{dict.address.toString(16)}</td>
            </tr>
            <tr>
              <td>
                <b>Entry size:</b>
              </td>
              <td>{dict.entryLength}</td>
            </tr>
            <tr>
              <td>
                <b>Number of entries:</b>
              </td>
              <td>{dict.entries.length}</td>
            </tr>
          </tbody>
        </Table>
        <Table>
          <tbody>
            <tr>
              <td>
                <b>Word separators:</b>
              </td>
              {dict.wordSeparatorChars.map((el, index) => {
                return <td key={el + index}>{el}</td>;
              })}
            </tr>
          </tbody>
        </Table>
        <Table>
          <tbody>
            <tr>
              <td>
                <b>Entries:</b>
              </td>
              <td />
              <td />
              <td />
            </tr>
            {entries.map((row, ridx) => {
              return (
                <tr key={'row' + ridx}>
                  {row.map((el, idx) => {
                    return <td key={el.str + idx}>{el.str}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Collapse>
    </>
  );
};

export default Dictionary;
