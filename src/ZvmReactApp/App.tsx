import React, {
  FunctionComponent,
  useState,
  useEffect,
  useReducer,
  useRef
} from 'react';
import './App.css';
import * as ZFile from '../ZmLib/ZFile';
import HeaderOption from './HeaderOption';
import GlobalsTable from './GlobalsTable';
import ZvmControls from './ZvmControls';
import * as Zm from '../ZmLib/ZMachine';
import LocalsTable from './LocalsTable';
import OutputTerminal from './OutputTerminal';
import Dictionary from './Dictionary';
import ObjectTable from './ObjectTable';

// for fontawesome
import { library } from '@fortawesome/fontawesome-svg-core';
//import { fab } from '@fortawesome/free-brands-svg-icons'
import { fas } from '@fortawesome/free-solid-svg-icons';
import { far } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

// add them to the library
library.add(far, fas);

const btos = (b: boolean) => {
  return b ? 'true' : 'false';
};

export enum Action {
  initialize,
  toggleDebug,
  toggleVirtualKeyboard,
  togglePauseOnInput
}

export function initZvm(zvm: Zm.zMachine | null) {
  return {
    zvm: zvm,
    settings: {
      virtualKeyboard: true,
      pauseOnInput: true,
      showDebug: true
    }
  };
}

interface WxyyxState {
  zvm: Zm.zMachine | null;
  [key: string]: any;
}
interface WxyyxAction {
  type: Action;
  value: any;
}

export function zvmReducer(state: WxyyxState, action: WxyyxAction) {
  console.log('reducer: ' + action.type);
  switch (action.type) {
    case Action.initialize:
      if (action.value !== null) {
        // this basically shows that the zvm has been updated, without having to recreate
        // it constantly
        return { zvm: action.value as Zm.zMachine, settings: state.settings };
      }
      return { zvm: state.zvm };
    case Action.toggleDebug:
      if (state.zvm) {
        if (action.value !== undefined) {
          console.log('setting zvm.debugging to ' + btos(action.value));
          state.zvm.debugging = action.value as boolean;
          state.settings.showDebug = action.value as boolean;
          return { zvm: state.zvm, settings: state.settings };
        }
      }
      return state;
    case Action.toggleVirtualKeyboard:
      if (action.value !== undefined) {
        console.log('setting virtualKeyboard to ' + btos(action.value));
        state.settings.virtualKeyboard = action.value as boolean;
        return { zvm: state.zvm, settings: state.settings };
      }
      return state;
    case Action.togglePauseOnInput:
      if (action.value !== undefined) {
        console.log('setting pausOnInput to ' + btos(action.value));
        state.settings.pauseOnInput = action.value as boolean;
        return { zvm: state.zvm, settings: state.settings };
      }
      return state;
    default:
      throw Error('unknown action type.');
  }
}

interface Context {
  state: WxyyxState;
  dispatch: React.Dispatch<WxyyxAction>;
}

export const WxyyxContext = React.createContext<Context>({} as Context);

const App: FunctionComponent<{ zfile: string; [key: string]: any }> = props => {
  let { zfile } = props;
  let [msg, setMsg] = useState('Loading...');
  /* lazy load these */
  let [version, setVersion] = useState(-1);
  let [state, dispatch]: any = useReducer(zvmReducer, null, initZvm);
  // let [showDebug, setShowDebug] = useState(true);
  // let [virtualKeyboard, setVirtualKeyboard] = useState(true);
  // let [pauseOnInput, setPauseOnInput] = useState(true);
  let [evalIt, setEvalIt] = useState<IterableIterator<Zm.ZState>>();

  const prev = useRef(props);
  useEffect(() => {
    const changedProps = Object.entries(props).reduce((ps: any, [k, v]) => {
      if (prev.current[k] !== v) {
        ps[k] = [prev.current[k], v];
      }
      return ps;
    }, {});
    if (Object.keys(changedProps).length > 0) {
      console.log('Changed props:', changedProps);
    }
    prev.current = props;
  });

  /* here's how we do something with an effect hook */
  useEffect(() => {
    document.title = 'wxyyx: ' + zfile;

    // try using fetch
    fetch(zfile, {
      headers: {
        'Content-Type': 'application/octet-stream'
      }
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Unable to fetch ' + zfile + ' from the network');
        }

        return response.arrayBuffer();
      })
      .then(arrayBuf => {
        console.log('fetch called and returned');

        let byteArray = new Uint8Array(arrayBuf);
        setMsg('zfile loaded');
        console.log('zfile loaded, ' + byteArray.length + ' bytes.');
        setVersion(ZFile.getVersionNum(byteArray));
        let z = Zm.makeZvm(byteArray);
        z.sourceName = zfile.split(/./)[0];
        console.log('source name: ' + z.sourceName);
        dispatch({ type: Action.initialize, value: z });

        // create the iterator so we can share it to things that
        // might need it, like zvmcontrols and output terminal
        setEvalIt(Zm.evalNext(z));
      })
      .catch(err => {
        console.error('Error loading zfile: ' + err);
      });

    // let oReq = new XMLHttpRequest();
    // oReq.open('GET', zfile, true);
    // oReq.responseType = 'arraybuffer';

    // oReq.onerror = (err) => {
    //   console.error('request failed: ' + err)
    // }
    // oReq.onprogress = function(event) {
    //   // triggers periodically
    //   // event.loaded - how many bytes downloaded
    //   // event.lengthComputable = true if the server sent Content-Length header
    //   // event.total - total number of bytes (if lengthComputable)
    //   console.log('Received ' + event.loaded + ' of ' + event.total);
    // };

    // // may or may not work in all browsers to grab the file locally, this trick
    // // is taken from: https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/Sending_and_Receiving_Binary_Data
    // // note that this doesn't seem to work for some files!
    // oReq.onload = function(oEvent) {
    //   console.log('onload called');
    //   let arrayBuffer = oReq.response; // Note: not oReq.responseText
    //   if (arrayBuffer) {
    //     let byteArray = new Uint8Array(arrayBuffer);
    //     setMsg('zfile loaded');
    //     console.log('zfile loaded, ' + byteArray.length + ' bytes.');
    //     setVersion(ZFile.getVersionNum(byteArray));
    //     let z = Zm.makeZvm(byteArray);
    //     z.sourceName = zfile.split(/./)[0];
    //     console.log('source name: ' + z.sourceName);
    //     dispatch({ type: Action.initialize, value: z });

    //     // create the iterator so we can share it to things that
    //     // might need it, like zvmcontrols and output terminal
    //     setEvalIt(Zm.evalNext(z));
    //   } else {
    //     setMsg("zfile loaded, but we couldn't create byte array");
    //   }
    // };

    // oReq.send(null);
  }, [zfile]); // any change in zfile will require us to reload the zmachine

  useEffect(() => {
    console.log('checking debugging');
    // set us
    if (state.settings.showDebug) {
      if (state.zvm !== null) {
        state.zvm.debugListener = (str: string) => console.log(str);
      }
    }
    // unset us
    return () => {
      if (state.settings.showDebug) {
        if (state.zvm !== null) {
          state.zvm.debugListener = null;
        }
      }
    };
  }, [state.zvm, state.settings.showDebug]);

  return state.zvm !== null ? (
    <WxyyxContext.Provider value={{ state: state, dispatch: dispatch }}>
      <div className="App">
        {evalIt ? (
          <OutputTerminal
            zvm={state.zvm}
            evalIt={evalIt}
            dispatch={dispatch}
            virtualKeyboard={state.settings.virtualKeyboard}
            pauseOnInput={state.settings.pauseOnInput}
            className="OutputTerminal"
          />
        ) : null}
        {!state.settings.showDebug ? null : (
          <div className="Debugging">
            <h2>Zvm Controls</h2>
            {evalIt ? (
              <ZvmControls className="ZvmControls" evalIt={evalIt} />
            ) : null}
            <hr />

            {<LocalsTable zvm={state.zvm} />}
            <h2>Globals Table</h2>
            {<GlobalsTable zvm={state.zvm} />}
            <hr />
            <Dictionary zvm={state.zvm} len={4} />
            <hr />
            <ObjectTable zvm={state.zvm} width={8} />
            {msg}
            <table className="App-table">
              <thead>
                <tr>
                  <td />
                  <td>Field</td>
                  <td>Value</td>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td />
                  <td>Z-code version:</td>
                  <td>{version}</td>
                </tr>
                <HeaderOption
                  fun={ZFile.getFileLength}
                  zvm={state.zvm}
                  funName="File Length"
                  minVersion={3}
                />
                <HeaderOption
                  funName="Checksum"
                  fun={ZFile.getChecksum}
                  zvm={state.zvm}
                  minVersion={3}
                />
                <HeaderOption
                  funName="Calculated checksum"
                  fun={ZFile.calculateChecksum}
                  zvm={state.zvm}
                  minVersion={3}
                />
                <HeaderOption
                  funName="Interpreter number"
                  fun={ZFile.getInterpreterNum}
                  minVersion={4}
                  zvm={state.zvm}
                />
                <HeaderOption
                  funName="Interpreter version"
                  fun={ZFile.getInterpreterVersion}
                  minVersion={4}
                  zvm={state.zvm}
                />
                <HeaderOption
                  funName="Standard revision num"
                  fun={ZFile.getStandardRevisionNum}
                  minVersion={1}
                  zvm={state.zvm}
                />

                <tr>
                  <td>Memory Map</td>
                  <td />
                  <td />
                </tr>
                <HeaderOption
                  funName="High memory"
                  fun={ZFile.getBaseOfHighMemory}
                  hex
                  minVersion={1}
                  zvm={state.zvm}
                />
                <HeaderOption
                  funName="Initial PC"
                  fun={ZFile.getInitialValuePC}
                  hex
                  zvm={state.zvm}
                  minVersion={1}
                />
                <HeaderOption
                  funName="Dictionary address"
                  fun={ZFile.getDictionaryLoc}
                  hex
                  zvm={state.zvm}
                  minVersion={1}
                />
                <HeaderOption
                  funName="Object table address"
                  fun={ZFile.getObjectTableLoc}
                  hex
                  zvm={state.zvm}
                  minVersion={1}
                />
                <HeaderOption
                  funName="Globals table address"
                  fun={ZFile.getGlobalVarTable}
                  hex
                  zvm={state.zvm}
                  minVersion={1}
                />
                <HeaderOption
                  funName="Start of static memory"
                  fun={ZFile.getBaseOfStaticMem}
                  hex
                  zvm={state.zvm}
                  minVersion={1}
                />
                <HeaderOption
                  funName="Abbreviations table address"
                  fun={ZFile.getAbbreviationsTable}
                  hex
                  zvm={state.zvm}
                  minVersion={1}
                />
                <HeaderOption
                  funName="Routines offset"
                  fun={ZFile.getRoutinesOffset}
                  zvm={state.zvm}
                  hex
                  minVersion={6}
                />
                <HeaderOption
                  funName="Static strings offset"
                  fun={ZFile.getStaticStringsOffset}
                  hex
                  zvm={state.zvm}
                  minVersion={6}
                />
                <HeaderOption
                  funName="Terminating characters table address"
                  hex
                  fun={ZFile.getTerminatingCharactersTableAddress}
                  zvm={state.zvm}
                  minVersion={5}
                />
                <HeaderOption
                  funName="Alphabet table address"
                  fun={ZFile.getAlphabetTableAddress}
                  hex
                  zvm={state.zvm}
                  minVersion={5}
                />
                <HeaderOption
                  funName="Header extension table address"
                  fun={ZFile.getHeaderExtensionTableAddress}
                  hex
                  minVersion={5}
                  zvm={state.zvm}
                />
                <HeaderOption
                  funName="Number of words in header extension"
                  fun={ZFile.getNumOfFurtherWords}
                  hex
                  minVersion={5}
                  zvm={state.zvm}
                />
                <HeaderOption
                  funName="Unicode Translation table address"
                  fun={ZFile.getUnicodeTranslationTableAddress}
                  hex
                  minVersion={5}
                  zvm={state.zvm}
                />

                <tr>
                  <td>Flags 1</td>
                </tr>
                <HeaderOption
                  fun={ZFile.isStatusLineTurns}
                  funName="Status Line Type"
                  zvm={state.zvm}
                  minVersion={1}
                  maxVersion={3}
                  funNo="Score/Turns"
                  funYes="Hours/Minues"
                />
                <HeaderOption
                  fun={ZFile.isStoryFileSplit}
                  zvm={state.zvm}
                  minVersion={1}
                  funName="Story File Split?"
                  maxVersion={3}
                  funYes="yes"
                  funNo="no"
                />
                <HeaderOption
                  fun={ZFile.isStatusLineNotAvailable}
                  funName="Is Status Line Available?"
                  zvm={state.zvm}
                  minVersion={1}
                  maxVersion={3}
                  funYes="no"
                  funNo="yes"
                />
                <HeaderOption
                  fun={ZFile.isScreenSplittingAvailable}
                  funName="Is Screen Splitting Available?"
                  zvm={state.zvm}
                  minVersion={1}
                  maxVersion={3}
                  funYes="no"
                  funNo="yes"
                />
                <HeaderOption
                  fun={ZFile.isVariablePitchFontDefault}
                  funName="Variable Pitch Font Default?"
                  zvm={state.zvm}
                  minVersion={3}
                  maxVersion={3}
                  funYes="yes"
                  funNo="no"
                />
                <HeaderOption
                  fun={ZFile.isColorAvailable}
                  funName="Color available?"
                  zvm={state.zvm}
                  minVersion={5}
                  funYes="yes"
                  funNo="no"
                />
                <HeaderOption
                  fun={ZFile.isPictureDisplayingAvailable}
                  zvm={state.zvm}
                  minVersion={6}
                  funName="Can show pictures?"
                  funYes="yes"
                  funNo="no"
                />
                <HeaderOption
                  fun={ZFile.isBoldfaceAvailable}
                  zvm={state.zvm}
                  minVersion={4}
                  funName="Boldface available?"
                  funYes="yes"
                  funNo="no"
                />
                <HeaderOption
                  fun={ZFile.isItalicAvailable}
                  zvm={state.zvm}
                  minVersion={4}
                  funName="Italic available?"
                  funYes="yes"
                  funNo="no"
                />
                <HeaderOption
                  fun={ZFile.isFixedSpaceStyleAvailable}
                  zvm={state.zvm}
                  minVersion={4}
                  funName="Fixed space style avilable?"
                  funYes="yes"
                  funNo="no"
                />
                <HeaderOption
                  fun={ZFile.isSoundAvailable}
                  zvm={state.zvm}
                  minVersion={6}
                  funName="Sound available?"
                  funYes="yes"
                  funNo="no"
                />
                <HeaderOption
                  fun={ZFile.isTimedKeyboardInputAvailable}
                  zvm={state.zvm}
                  minVersion={6}
                  funName="Timed keyboard input available?"
                  funYes="yes"
                  funNo="no"
                />
                <HeaderOption
                  fun={ZFile.isSoundAvailable}
                  zvm={state.zvm}
                  minVersion={6}
                  funName="Sound available?"
                  funYes="yes"
                  funNo="no"
                />

                <tr>
                  <td>Flags 2</td>
                </tr>
                <HeaderOption
                  fun={ZFile.isTranscriptingOn}
                  zvm={state.zvm}
                  minVersion={1}
                  funName="Is transcripting on?"
                  funYes="yes"
                  funNo="no"
                />
                <HeaderOption
                  fun={ZFile.isForcePrintingInFixedPitchFont}
                  zvm={state.zvm}
                  minVersion={3}
                  funName="Force print in fixed pitch font?"
                  funYes="yes"
                  funNo="no"
                />
                <HeaderOption
                  fun={ZFile.isClearBitSet}
                  zvm={state.zvm}
                  minVersion={6}
                  funName="Is Clear Bit set?"
                  funYes="yes"
                  funNo="no"
                />
                <HeaderOption
                  fun={ZFile.isWantingPictures}
                  zvm={state.zvm}
                  minVersion={5}
                  funName="Wants pictures?"
                  funYes="yes"
                  funNo="no"
                />
                <HeaderOption
                  fun={ZFile.isWantingUNDO}
                  zvm={state.zvm}
                  minVersion={5}
                  funName="Wants undo?"
                  funYes="yes"
                  funNo="no"
                />
                <HeaderOption
                  fun={ZFile.isWantingMouse}
                  zvm={state.zvm}
                  minVersion={5}
                  funName="Wants mouse?"
                  funYes="yes"
                  funNo="no"
                />
                <HeaderOption
                  fun={ZFile.isWantingColors}
                  zvm={state.zvm}
                  minVersion={6}
                  funName="Wants colors?"
                  funYes="yes"
                  funNo="no"
                />
                <HeaderOption
                  fun={ZFile.isWantingSoundEffects}
                  zvm={state.zvm}
                  minVersion={5}
                  funName="Wants sound effects?"
                  funYes="yes"
                  funNo="no"
                />
                <HeaderOption
                  fun={ZFile.isWantingMenus}
                  zvm={state.zvm}
                  minVersion={6}
                  funName="Wants menus?"
                  funYes="yes"
                  funNo="no"
                />

                {ZFile.getVersionNum(state.zvm.bytes) >= 5 ? (
                  <tr>
                    <td>Screen Details</td>
                  </tr>
                ) : null}
                <HeaderOption
                  funName="Screen height in lines"
                  fun={(bytes: Uint8Array) => {
                    let h = ZFile.getScreenHeightLines(bytes);
                    if (h === 255) return 'infinite';
                    else return h.toString();
                  }}
                  minVersion={4}
                  zvm={state.zvm}
                />
                <HeaderOption
                  funName="Screen width in characters"
                  fun={ZFile.getScreenWidthChar}
                  minVersion={4}
                  zvm={state.zvm}
                />
                <HeaderOption
                  funName="Screen width in units"
                  fun={ZFile.getScreenWidthUnits}
                  minVersion={5}
                  zvm={state.zvm}
                />
                <HeaderOption
                  funName="Screen height in units"
                  fun={ZFile.getScreenHeightUnits}
                  minVersion={5}
                  zvm={state.zvm}
                />
                <HeaderOption
                  funName="Font width in units"
                  fun={ZFile.getFontWidthUnits}
                  minVersion={5}
                  zvm={state.zvm}
                />
                <HeaderOption
                  funName="Font height in units"
                  fun={ZFile.getFontHeight}
                  minVersion={5}
                  zvm={state.zvm}
                />
                <HeaderOption
                  funName="Default background color"
                  fun={ZFile.getDefaultBackgroundColor}
                  minVersion={5}
                  zvm={state.zvm}
                />
                <HeaderOption
                  funName="Default foreground color"
                  fun={ZFile.getDefaultForegroundColor}
                  minVersion={5}
                  zvm={state.zvm}
                />
                <HeaderOption
                  funName="Total width of pixels in out stream 3"
                  fun={ZFile.getTotalWidthPixelsInOutStream3}
                  minVersion={6}
                  zvm={state.zvm}
                />
                <HeaderOption
                  funName="X Pos after click"
                  fun={ZFile.getXPosAfterClick}
                  minVersion={5}
                  zvm={state.zvm}
                />
                <HeaderOption
                  funName="Y Pos after click"
                  fun={ZFile.getYPosAfterClick}
                  minVersion={5}
                  zvm={state.zvm}
                />
              </tbody>
            </table>
            <hr />
            {/* this closes up the debug section */}
          </div>
        )}
      </div>
    </WxyyxContext.Provider>
  ) : (
    <div>
      <span>
        Loading...
        <FontAwesomeIcon icon={['fas', 'spinner']} pulse spin />
      </span>
    </div>
  );
};

export default App;
