/**
 * Well the idea is to create an interface to be an output terminal for the game.
 */
import React, {
  FunctionComponent,
  useState,
  useEffect,
  useRef,
  useCallback
} from 'react';
import * as Zm from '../ZmLib/ZMachine';
import './OutputTerminal.css';
import Menu from './Menu';
import { Container, Row, Col } from 'reactstrap';
import { Action } from './App';
import Terminal from './Terminal';

export interface IWindowSettings {
  numLines: number;
}

export function makeWindowSettings(numLines: number): IWindowSettings {
  return {
    numLines: numLines
  };
}

/**
 * The idea here is to provide an autoscrolling ref.
 */
const useAutoscroll = () => {
  const ref = useCallback((node: HTMLElement | null) => {
    console.log('autoscroll callback');
    if (node !== null) {
      console.log('setting scrolling');
      node.scrollTop = node.scrollHeight;
    }
  }, []);

  return ref;
};

// what should the globals table have, well a table! with 240 entries!
const OutputTerminal: FunctionComponent<{
  zvm: Zm.zMachine;
  virtualKeyboard: boolean;
  pauseOnInput: boolean;
  evalIt: IterableIterator<Zm.ZState>;
  dispatch: React.Dispatch<{ type: Action; value: any }>;
  [propName: string]: any;
}> = props => {
  const { zvm, dispatch, virtualKeyboard, pauseOnInput, evalIt } = props;
  // the main state of this component is the array of strings in its window
  // let [output, setOutput] = useState(['']);
  const [inputStr, setInputStr] = useState('');
  const [objName, setObjName] = useState('Welcome');
  const [turn, setTurn] = useState(0);
  const [score, setScore] = useState(0);
  // let [evalIt, setEvalIt] = useState();
  const [textAreaString, setTextAreaString] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [winHeight, setWinHeight] = useState(window.innerHeight);
  const [winWidth, setWinWidth] = useState(window.innerWidth);
  const [windowSettings, setWindowSettings] = useState<IWindowSettings[]>([]);
  const textAreaRef = useRef(null);
  const [inputBuffer, setInputBuffer] = useState({ buffer: '' });
  const [lastState, setLastState] = useState(Zm.ZState.Stopped);
  // const [keyMap, setKeyMap] = useState<{ [key: string]: boolean }>({});
  // const topWindowRef = useRef(null);
  // const bottomWindowRef = useRef(null);
  // create an effect for this thing
  useEffect(() => {
    let ow = textAreaRef.current as HTMLTextAreaElement | null;
    if (ow !== null) {
      ow.scrollTop = ow.scrollHeight;
    }
  }, [textAreaString, textAreaRef]);

  useEffect(() => {
    const updateStatus = (n: string, s: number, t: number) => {
      console.log('update status called');
      setObjName(n);
      setScore(s);
      setTurn(t);
    };

    // listens to terminal commands to handle configurations of windows/terminals
    const terminalListener = (cmd: string, val: any) => {
      switch (cmd) {
        case 'splitWindow':
          // the number of lines is sent to us, and this causes
          // the top window to change so that it maintains that number
          // of lines while the bottom window contains the rest.
          let lines = val as number;
          setWindowSettings([{ numLines: lines }, { numLines: lines }]);
          break;
        case 'unsplitAndClear':
          setWindowSettings(oldSettings => {
            let changed = false;
            let totalSize = 0;
            if (oldSettings[0] && oldSettings[1]) {
              totalSize = oldSettings[0].numLines + oldSettings[1].numLines;
            } else if (oldSettings[0]) {
              totalSize = oldSettings[0].numLines;
            }
            let newSettings = oldSettings.map((el, idx) => {
              // we have to do specific things to specific windows
              switch (idx) {
                // we set the size to be the total size for window 0
                case 0:
                  if (totalSize > 0 && el.numLines !== totalSize) {
                    changed = true;
                    return {
                      numLines: totalSize
                    };
                  } else return el;
                // and we set the size of window 1 (top window) to be 0
                case 1:
                  if (el.numLines !== 0) {
                    changed = true;
                    return {
                      numLines: 0
                    };
                  } else return el;
                default:
                  return el;
              }
            });
            if (changed) {
              return newSettings;
            } else {
              return oldSettings;
            }
          });
          break;
        default:
          console.log('Received "' + cmd + '", but not handled');
          break;
      }
    };

    // add our listeners for input and output
    Zm.addOutputListener(zvm, updateOutput);
    Zm.addStatusLineListener(zvm, updateStatus);
    zvm.terminal.terminalListener = terminalListener;

    // // first, set up our iterator for computation
    // setEvalIt(Zm.evalNext(zvm));

    // set up a callback for window dimensions to set the terminal size
    const updateDimensions = (evt: UIEvent) => {
      //window.innerHeight;
      //updateOutput('window height: ' + window.innerHeight + '\n');
      setWinHeight(window.innerHeight);
      setWinWidth(window.innerWidth);
    };
    window.addEventListener('resize', updateDimensions);

    // if we unload the zvm, then we need to remove ourselves for cleanup
    return () => {
      zvm.outputListener = null;
      zvm.statusLineListener = null;
      window.removeEventListener('resize', updateDimensions);
      zvm.terminal.terminalListener = null;
    };
  }, [zvm]);

  // this handles side-effects for evalIt, which is our computational stepper,
  // we we change this for some reason, we need to restart the computation
  useEffect(() => {
    if (evalIt && !pauseOnInput) {
      console.log('autorunning evaluation from OutputTerminal');
      // now start things running
      let state = evalIt.next().value;
      while (state === Zm.ZState.Running) {
        state = evalIt.next().value;
      }
      setLastState(state);
    }
  }, [evalIt, pauseOnInput]);

  // this sends the input as keyboard input to the zvm and then resets the input,
  // afterwhich, it continues the processing loop of getting the next instruction
  const processInput = useCallback(
    (str: string) => {
      console.log('processing ' + str);
      if (zvm.terminal.keyboardInput) {
        if (lastState === Zm.ZState.WaitingForCharInput) {
          console.log('sending "' + str + '"');
          zvm.terminal.keyboardInput(str, false);
        } else if (lastState === Zm.ZState.WaitingForInput) {
          let newstr = str + (str === '\n' ? '' : '\n');
          console.log('sending "' + newstr + '"');
          zvm.terminal.keyboardInput(newstr, true);
        }
        // now restart things
        let nextState = evalIt.next().value;
        while (nextState === Zm.ZState.Running) {
          nextState = evalIt.next().value;
        }
        setLastState(nextState);
      }
    },
    [zvm.terminal, lastState, evalIt]
  );

  const updateOutput = (str: string) => {
    // save the output whenever updateOutput is called
    setTextAreaString(oldStr => {
      let ow = textAreaRef.current as HTMLTextAreaElement | null;
      if (ow !== null) {
        //ow.focus();
        //ow.setSelectionRange(textAreaString.length + str.length, textAreaString.length + str.length);
        ow.scrollTop = ow.scrollHeight;
      }
      return oldStr + str;
    });
  };

  const calculateInsertionPoint = (
    textLen: number,
    inputLen: number,
    posInText: number
  ) => {
    return inputLen - (textLen - posInText);
  };

  const insertAt = (
    str: string,
    newStr: string,
    start: number,
    end: number
  ) => {
    return str.slice(0, start) + newStr + str.slice(end, str.length);
  };

  useEffect(() => {
    let ow = textAreaRef.current as HTMLTextAreaElement | null;
    if (ow) {
      if (cursorPos <= ow.value.length) {
        ow.setSelectionRange(cursorPos, cursorPos);
      }
    }
  }, [cursorPos, textAreaRef]);

  // const onKeyUp = (evt: React.KeyboardEvent<HTMLElement>) => {
  //   let key = evt.key;
  //   setKeyMap(oldMap => {
  //     oldMap[key] = false;
  //     return oldMap;
  //   });
  // };
  /**
   * This inserts text into our input string and into the output window.
   * @param evt event fired by React for keyboard clicks
   */
  // const onKeyDown = (evt: React.KeyboardEvent<HTMLTextAreaElement>) => {
  //   let key = evt.key;
  //   setKeyMap(oldMap => {
  //     oldMap[key] = true;
  //     return oldMap;
  //   });

  //   //console.log('key: ' + evt.key);
  //   switch (evt.keyCode) {
  //     // these are delete characters
  //     case 8:
  //     case 46:
  //       // well, figure out what the selection might be
  //       let ta = evt.currentTarget;
  //       // this calculates where we are starting in the input string
  //       let sPos = calculateInsertionPoint(
  //         textAreaString.length,
  //         inputStr.length,
  //         ta.selectionStart
  //       );
  //       if (ta.selectionStart === ta.selectionEnd) {
  //         // if selection start and end are in the same place, then
  //         // we move start back by one so it's like we're selecting a
  //         // character to delete
  //         sPos -= 1;
  //         ta.selectionStart -= 1;
  //       }
  //       // the end of the selection
  //       let ePos = calculateInsertionPoint(
  //         textAreaString.length,
  //         inputStr.length,
  //         ta.selectionEnd
  //       );

  //       // slice out the character from the input string, and from the output string
  //       setInputStr(
  //         oldStr => oldStr.slice(0, sPos) + oldStr.slice(ePos, inputStr.length)
  //       );
  //       setTextAreaString(
  //         oldStr =>
  //           oldStr.slice(0, ta.selectionStart) +
  //           oldStr.slice(ta.selectionEnd, oldStr.length)
  //       );
  //       // and reset our cursor position
  //       setCursorPos(ta.selectionStart);
  //       break;
  //     case 9: // tab
  //     case 16: // shift
  //       break;

  //     // ignore these
  //     case 13:
  //       // this sends the actual command, it's like submit
  //       updateOutput(String.fromCharCode(13));
  //       if (!pauseOnInput) {
  //         processInput(inputStr + '\n');
  //       } else {
  //         if (zvm.terminal.keyboardInput) {
  //           zvm.terminal.keyboardInput(inputStr + '\n', true);
  //         }
  //       }
  //       setInputStr('');
  //       break;
  //     default:
  //       // check for key lengths > 1 because special keys have longer names,
  //       // and check our keymap to make sure meta and control aren't also
  //       // being pressed
  //       //if ((evt.key.length === 1) && !(keyMap['Meta'] || keyMap['Control'])) {
  //       if (key.length === 1 && !(evt.ctrlKey || evt.metaKey)) {
  //         let ta = evt.currentTarget;
  //         // calculate where this text will be added
  //         let sPos = calculateInsertionPoint(
  //           textAreaString.length,
  //           inputStr.length,
  //           ta.selectionStart
  //         );
  //         let endPos = calculateInsertionPoint(
  //           textAreaString.length,
  //           inputStr.length,
  //           ta.selectionEnd
  //         );

  //         // and now set the input string and the text area string to contain this new text
  //         setInputStr(oldStr => insertAt(oldStr, key, sPos, endPos));
  //         setTextAreaString(oldStr =>
  //           insertAt(oldStr, key, ta.selectionStart, ta.selectionEnd)
  //         );

  //         // set the input buffer to be this new character
  //         console.log('setting input buffer');
  //         setInputBuffer({ buffer: key });
  //         // finally, adjust the cursor (note, this catches every character so it's not like they
  //         // can actually type more than one character at a time here)
  //         setCursorPos(ta.selectionStart + 1);
  //       }
  //       break;
  //   }
  // };

  /**
   * This inserts text into our input string and into the output window.
   * @param evt event fired by React for keyboard clicks
   */
  const onKeyDownDiv = useCallback(
    (evt: React.KeyboardEvent<HTMLDivElement>) => {
      evt.preventDefault();
      let key = evt.key;
      // setKeyMap(oldMap => {
      //   oldMap[key] = true;
      //   return oldMap;
      // });

      //console.log('key: "' + evt.key + '"');
      switch (evt.keyCode) {
        // these are delete characters
        case 8:
        case 46:
          // console.log('delete key');
          // well, it's a delete key
          setInputBuffer({ buffer: key });
          if (lastState === Zm.ZState.WaitingForCharInput) {
            processInput(key);
            setInputStr('');
          } else {
            setInputStr(oldStr => oldStr.slice(0, oldStr.length - 1));
          }
          break;
        // ignore these
        case 13:
          console.log('enter key');
          // this sends the actual command, it's like submit, but only
          // send this to the terminal if it's not waiting for a char, because
          // if it's waiting for input, then sending this to the terminal will
          // cause it to copy out its input to the 'output' window and it can
          // no longer be edited
          if (lastState !== Zm.ZState.WaitingForCharInput) {
            setInputBuffer({ buffer: key });
          } else {
            // if we switched to read char mode, we should delete our input buffer
            // on the terminal side of things
            setInputBuffer({ buffer: 'ClearBuffer' });
          }
          if (!pauseOnInput) {
            processInput(inputStr + '\n');
          } else {
            if (zvm.terminal.keyboardInput) {
              if (lastState === Zm.ZState.WaitingForCharInput) {
                console.log('enter: waiting for char');
                zvm.terminal.keyboardInput(inputStr, false);
              } else {
                console.log('enter: any other state');
                zvm.terminal.keyboardInput(inputStr + '\n', true);
              }
            }
          }
          setInputStr('');
          break;
        default:
          //console.log('default key');
          if (key.length === 1 && !(evt.ctrlKey || evt.metaKey)) {
            switch (lastState) {
              case Zm.ZState.WaitingForCharInput:
                // console.log('waiting for char in onKeyDownDiv');
                processInput(key);
                setInputStr('');
                setInputBuffer({ buffer: 'ClearBuffer' });
                break;
              case Zm.ZState.WaitingForInput:
                // console.log('waiting for input in onKeyDownDiv')
                // Otherwise, queue up the characters
                setInputBuffer({ buffer: key });
                setInputStr(oldStr => oldStr + key);
                break;
              case Zm.ZState.Stopped:
                setInputBuffer({ buffer: key });
                if (zvm.terminal.keyboardInput) {
                  //   console.log('stopped, so queue up input');
                  zvm.terminal.keyboardInput(key, false);
                }
                break;
              default:
                console.log('Warning: invalid Zm state when handling input');
                break;
            }
          } else {
            console.log('failed the outter test');
          }
          break;
      }
    },
    [inputStr, processInput, pauseOnInput, zvm.terminal, lastState]
  );

  // const onTextAreaChange = (evt: React.FormEvent<HTMLTextAreaElement>) => {
  //   //let ow = evt.currentTarget;
  //   //console.log("onInput selectionstart: " + ow.selectionStart + ", selectionEnd: " + ow.selectionEnd);
  //   //console.log('onInput length: ' + ow.value.length);
  //   //ow.scrollTop = ow.scrollHeight;
  // };

  const onPaste = (evt: React.ClipboardEvent<HTMLTextAreaElement>) => {
    let str = evt.clipboardData.getData('Text');
    console.log('paste: ' + str);
    // paste it into the cursor position
    let ta = evt.currentTarget;
    // only paste into the command line area
    if (ta.selectionStart >= textAreaString.length - inputStr.length) {
      let sPos = calculateInsertionPoint(
        textAreaString.length,
        inputStr.length,
        ta.selectionStart
      );
      let ePos = calculateInsertionPoint(
        textAreaString.length,
        inputStr.length,
        ta.selectionEnd
      );

      // a special case: if we are pasting at the end, we will strip all quotes and replace all
      // commas with newlines--this lets you paste in some walkthroughs for testing
      if (sPos === ePos) {
        let strs = str.split(/\n/g);
        strs.forEach(el => {
          if (el.length > 0) {
            if (zvm.terminal.keyboardInput) {
              zvm.terminal.keyboardInput(el + '\n', true);
            }
          }
        });
        setTextAreaString(oldStr => oldStr + str);
        return;
        // const rs = new RegExp('\\"', 'g');
        // str = str.replace(rs,'');
        // let strs = str.split(new RegExp(',', 'g'));
        // if (strs.length > 0) {
        //     strs.forEach(el => {
        //         if (zvm.terminal.keyboardInput) {
        //             zvm.terminal.keyboardInput(el + '\n');
        //         }
        //         setTextAreaString(oldStr => oldStr + el + '\n');
        //     });
        //     return;
        // }
      }
      // and now set the input string and the text area string to contain this new text
      setInputStr(oldStr => insertAt(oldStr, str, sPos, ePos));
      setTextAreaString(oldStr =>
        insertAt(oldStr, str, ta.selectionStart, ta.selectionEnd)
      );
      // finally, adjust the cursor (note, this catches every character so it's not like they
      // can actually type more than one character at a time here)
      setCursorPos(ta.selectionStart + str.length);
    }
    //setInputStr(oldStr => oldStr + str);
    //updateOutput(str);
  };

  const onCut = (evt: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // cut is like delete and copy, the copy part will just work, it's the
    // cut part that we have to deal with, so figure out what the selection might be
    let ta = evt.currentTarget;
    // this calculates where we are starting the cut in the input string,
    // in this case, we know the start and end positions must be different
    if (ta.selectionStart >= textAreaString.length - inputStr.length) {
      let sPos = calculateInsertionPoint(
        textAreaString.length,
        inputStr.length,
        ta.selectionStart
      );
      // the end of the selection
      let ePos = calculateInsertionPoint(
        textAreaString.length,
        inputStr.length,
        ta.selectionEnd
      );

      //evt.clipboardData.setData('Text', textAreaString.slice(ta.selectionStart, ta.selectionEnd))
      document.execCommand('copy');
      // slice out the character from the input string, and from the output string
      setInputStr(
        oldStr => oldStr.slice(0, sPos) + oldStr.slice(ePos, inputStr.length)
      );
      setTextAreaString(
        oldStr =>
          oldStr.slice(0, ta.selectionStart) +
          oldStr.slice(ta.selectionEnd, oldStr.length)
      );
      // and reset our cursor position
      setCursorPos(ta.selectionStart);
    }
  };

  // const onFocus = (evt: React.FocusEvent<HTMLTextAreaElement>) => {
  //   console.log('got focus, cursor at ' + cursorPos);
  //   setCursorPos(textAreaString.length);
  // };
  // const onChangeInput = (evt: React.FormEvent<HTMLInputElement>) => {
  //     setInputStr(evt.currentTarget.value);
  // }

  const responsiveHeight = (width: number) => {
    let wh = 0;
    if (virtualKeyboard) {
      if (width < 768) wh = winHeight * 0.4;
      else if (width < 991) wh = winHeight * 0.6;
      else wh = winHeight * 0.9;
    } else {
      wh = winHeight * 0.9;
    }

    return winHeight < 540 ? wh * 0.9 : wh;
  };

  // set up things for save games
  useEffect(() => {
    const onRestoreGame = () => {
      let s = localStorage.getItem('SaveGame-' + zvm.sourceName);
      if (s !== null) {
        let obj = JSON.parse(s);
        return obj as Zm.SaveGame;
      }
      return null;
    };

    const onSaveGame = (saveGame: Zm.SaveGame) => {
      localStorage.setItem(
        'SaveGame-' + zvm.sourceName,
        JSON.stringify(saveGame)
      );
      return true;
    };

    zvm.saveGameListener = onSaveGame;
    zvm.restoreGameListener = onRestoreGame;
    return () => {
      zvm.saveGameListener = null;
      zvm.restoreGameListener = null;
    };
  }, [zvm.sourceName, zvm.saveGameListener, zvm.restoreGameListener]);

  return (
    <Container
      fluid
      className="TerminalWindow d-flex flex-column"
      style={
        {
          /*height: '95vh', flexDirection: 'column'*/
        }
      }
    >
      {/* the status line */}
      {zvm.version < 4 ? (
        <Row>
          <Container fluid className="StatusLine">
            <Row className="StatusLine">
              <Col xs="9" sm="8">
                <Menu
                  showDebug={zvm.debugging}
                  virtualKeyboard={virtualKeyboard}
                  pauseOnInput={pauseOnInput}
                  dispatch={dispatch}
                />
                {objName}
              </Col>
              <Col className="d-none d-sm-block" sm="2">
                Score: {score}
              </Col>
              <Col className="d-none d-sm-block" sm="2">
                Turn: {turn}
              </Col>
              <Col className="d-block d-sm-none" xs="3">
                {score} / {turn}
              </Col>
            </Row>
          </Container>
        </Row>
      ) : null}
      {/* we adjust the height so that the keyboard can stay open on mobile devices */}
      {/* <Row
        className="OutputTerminalWindow"
        style={{ height: responsiveHeight(winWidth) }}
      >
        <Col height="95vh">
          {document.queryCommandSupported('copy') ? (
            <textarea
              ref={textAreaRef}
              className="ScrollingWindow"
              onChange={onTextAreaChange}
              onKeyDown={onKeyDown}
              onKeyUp={onKeyUp}
              onPaste={onPaste}
              onCut={onCut}
              onFocusCapture={onFocus}
              id="OutputWindow"
              value={textAreaString}
              spellCheck={false}
              autoFocus
            />
          ) : (
            <textarea
              ref={textAreaRef}
              spellCheck={false}
              className="ScrollingWindow"
              onChange={onTextAreaChange}
              onKeyDown={onKeyDown}
              onKeyUp={onKeyUp}
              onFocusCapture={onFocus}
              id="OutputWindow"
              value={textAreaString}
              autoFocus
            />
          )}
        </Col>
      </Row> */}
      <Row className="OutputTerminalWindow">
        {zvm.version > 3 ? (
          <Col>
            <Menu
              showDebug={zvm.debugging}
              virtualKeyboard={virtualKeyboard}
              pauseOnInput={pauseOnInput}
              dispatch={dispatch}
            />
            <Terminal
              zvm={zvm}
              winID={1}
              wrap={false}
              bufferMode={false}
              windowSettings={windowSettings[1]}
              defaultFixedFont="Consolas, Monaco, Courier New, serif"
              defaultVariableFont="Helvetica, Arial, sans-serif"
              defaultFont="Consolas,Monaco, Courier New, serif"
              screenRectSource={false}
              showCursor={true}
            />
          </Col>
        ) : null}
      </Row>
      <Row className="OutputTerminalWindow">
        <Col>
          {/* <div ref={scrollRef} style={{height: responsiveHeight(winWidth), overflow: 'auto', position: 'relative'}}> */}
          <div
            className="NewTerminalWindow"
            tabIndex={0}
            onKeyDown={onKeyDownDiv}
            // onKeyUp={onKeyUp}
          >
            <Terminal
              zvm={zvm}
              winID={0}
              autoFocus
              bufferMode={true}
              tabIndex={0}
              responsiveHeight={responsiveHeight(winWidth)}
              inputBuffer={inputBuffer}
              screenRectSource={true}
              windowSettings={windowSettings[0]}
              defaultFixedFont="Consolas, Monaco, 'Courier New', serif'"
              defaultVariableFont="Lato, Roboto, 'Open Sans', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
              defaultFont="Lato, Roboto, 'Open Sans', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
              showCursor={true}
            />
          </div>
          {/* </div> */}
        </Col>
      </Row>
    </Container>
  );
};

export default OutputTerminal;
