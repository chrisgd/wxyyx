import React, {
  FunctionComponent,
  useCallback,
  useState,
  useEffect
} from 'react';
import {
  Table,
  Collapse,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardSubtitle
} from 'reactstrap';
import * as Zm from '../ZmLib/ZMachine';
import * as Zot from '../ZmLib/ZObjTable';
import './ObjectTable.css';

const getDataString = (data: number[]) => {
  let str = '';
  data.forEach(el => (str += ' ' + el.toString(16)));
  return str;
};

const ObjectTable: FunctionComponent<{
  zvm: Zm.zMachine;
  width: number;
}> = props => {
  const { zvm, width } = props;
  const [otbl, setOtbl] = useState(zvm.objectTable);
  const [isOpen, setIsOpen] = useState(true);
  const [objIsOpen, setObjIsOpen] = useState(false);
  const [buttonText, setButtonText] = useState('Show Object Table');
  const [objsButtonText, setObjsButtonText] = useState('Show Object List');
  const [defaultProps, setDefaultProps] = useState<number[][]>([]);
  const [zObjs, setZObjs] = useState<Zot.ZObj[]>(Zot.getZObjs(zvm.objectTable));
  const [htmlObjs, setHtmlObjs] = useState<{
    refs: { [key: string]: HTMLElement };
  }>({ refs: {} });

  const callbackRef = useCallback(node => {
    setHtmlObjs(oldHtmlObjs => {
      if (oldHtmlObjs.refs[node.id] !== node) {
        oldHtmlObjs.refs[node.id] = node;
        return { refs: oldHtmlObjs.refs };
      } else {
        return oldHtmlObjs;
      }
    });
  }, []);

  useEffect(() => {
    setOtbl(zvm.objectTable);
    setZObjs(Zot.getZObjs(zvm.objectTable));
  }, [zvm]);

  const toggle = useCallback(() => {
    let newVal = !isOpen;
    setIsOpen(newVal);
    setButtonText(newVal ? 'Hide Object Table' : 'Show Object Table');
  }, [isOpen]);

  const toggleObj = useCallback(() => {
    let newVal = !objIsOpen;
    setObjIsOpen(newVal);
    setObjsButtonText(newVal ? 'Hide Object List' : 'Show Object List');
  }, [objIsOpen]);

  useEffect(() => {
    // set up the entries arrays, this breaks apart the
    // entries into mini-arrays length len, so they can
    // be mapped below in the render as rows of columns
    let oprops: number[] = [];
    // first, read all the props to make it easy
    for (let i = 1; i <= otbl.size / 2; i++) {
      oprops.push(Zot.getObjectDefaultProperty(otbl, i));
    }

    // now make some slices
    let defProps: number[][] = [];
    for (let i = 0; i <= otbl.size / 2 / width; i++) {
      defProps.push(oprops.slice(i * width, i * width + width));
    }

    setDefaultProps(defProps);
  }, [width, zvm, otbl]);

  const scrollTo = (evt: React.MouseEvent<HTMLElement>, id: number) => {
    let ref: HTMLElement = htmlObjs.refs['#obj' + id];
    window.scrollTo(0, ref.offsetTop);
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
                <b>Objects Address:</b>
              </td>
              <td>{'0x' + otbl.address.toString(16)}</td>
            </tr>
            <tr>
              <td>
                <b>Size of Property Defaults Table:</b>
              </td>
              <td>
                {otbl.size.toString() +
                  ' bytes / ' +
                  (otbl.size / 2).toString() +
                  ' words'}
              </td>
            </tr>
            <tr>
              <td>
                <b>Properties Address:</b>
              </td>
              <td>{'0x' + otbl.propertiesAddr.toString(16)}</td>
            </tr>
            <tr>
              <td>
                <b>Objects begin at:</b>
              </td>
              <td>{'0x' + otbl.entries.toString(16)}</td>
            </tr>
            <tr>
              <td>
                <b>Entry size:</b>
              </td>
              <td>{otbl.entrySize}</td>
            </tr>
            <tr>
              <td>
                <b>Default Properties:</b>
              </td>
              <td>
                <Table>
                  <tbody>
                    {defaultProps.map((el, idx) => {
                      return (
                        <tr key={'otrow' + idx}>
                          {el.map((el2, idx2) => {
                            return (
                              <td key={'otcol' + (idx * width + idx2 + 1)}>
                                <b key={'foo' + (idx * width + idx2 + 1)}>
                                  {idx * width + idx2 + 1}{' '}
                                </b>{' '}
                                {el2}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </td>
            </tr>
            <tr />
          </tbody>
        </Table>
        <Button block color="primary" href="#objs" onClick={toggleObj}>
          {objsButtonText}
        </Button>
        <Collapse ref={callbackRef} id="#obj0" isOpen={objIsOpen}>
          {zObjs.map(el => {
            if (el)
              return (
                <div
                  ref={callbackRef}
                  id={'#obj' + el.id}
                  key={'divobj' + el.id}
                >
                  <Card key={'objid' + el.id}>
                    <CardBody>
                      <CardHeader>
                        <b>{el.shortName + ' (' + el.id + ')'}</b>
                      </CardHeader>
                      <CardSubtitle>
                        <Button
                          color="link"
                          disabled={el.parent === 0}
                          onClick={(evt: React.MouseEvent<HTMLElement>) => {
                            scrollTo(evt, el.parent);
                          }}
                        >
                          <b>Parent: </b>
                          {el.parent !== 0
                            ? Zot.getObjectShortName(
                                zvm.objectTable,
                                el.parent
                              ) +
                              ' (' +
                              el.parent +
                              ')'
                            : 'none'}
                        </Button>
                      </CardSubtitle>
                      <CardSubtitle>
                        <Button
                          color="link"
                          disabled={el.sibling === 0}
                          onClick={(evt: React.MouseEvent<HTMLElement>) => {
                            scrollTo(evt, el.sibling);
                          }}
                        >
                          <b>Sibling:</b>{' '}
                          {el.sibling !== 0
                            ? Zot.getObjectShortName(
                                zvm.objectTable,
                                el.sibling
                              ) +
                              ' (' +
                              el.sibling +
                              ')'
                            : 'none'}
                        </Button>
                      </CardSubtitle>
                      <CardSubtitle>
                        <Button
                          color="link"
                          disabled={el.child === 0}
                          onClick={(evt: React.MouseEvent<HTMLElement>) => {
                            scrollTo(evt, el.child);
                          }}
                        >
                          <b>Child:</b>{' '}
                          {el.child !== 0
                            ? Zot.getObjectShortName(
                                zvm.objectTable,
                                el.child
                              ) +
                              ' (' +
                              el.child +
                              ')'
                            : 'none'}
                        </Button>
                      </CardSubtitle>

                      <CardSubtitle>
                        <b>Attributes: </b>{' '}
                        {el.attributes.map((att, idx) => (
                          <span key={'att' + att}>{att} </span>
                        ))}
                      </CardSubtitle>
                      <CardSubtitle>
                        <b>Properties address: </b>{' '}
                        {el.propertiesAddr.toString(16)}
                      </CardSubtitle>
                      <CardSubtitle>
                        <b>Properties:</b>
                      </CardSubtitle>
                      {el.properties.map((prop, idx) => {
                        return (
                          <div key={'prop' + idx}>
                            {'' +
                              prop.id +
                              ' (' +
                              prop.size +
                              ' bytes) [' +
                              prop.propAddr.toString(16) +
                              '] ' +
                              getDataString(prop.propData)}
                          </div>
                        );
                      })}
                    </CardBody>
                  </Card>
                </div>
              );
            else return null;
          })}
        </Collapse>
      </Collapse>
    </>
  );
};

export default ObjectTable;
