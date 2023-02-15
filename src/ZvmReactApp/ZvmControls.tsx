import React, {
  FunctionComponent,
  useState,
  MouseEvent,
  FormEvent,
  useEffect,
  useContext
} from 'react';
import * as Zm from '../ZmLib/ZMachine';
import * as Stack from '../StackUint16/StackUint16';
import * as App from './App';

// what should the globals table have, well a table! with 240 entries!
const ZvmControls: FunctionComponent<{
  evalIt: IterableIterator<Zm.ZState>;
  [propName: string]: any;
}> = props => {
  let { state } = useContext(App.WxyyxContext);
  let { children, evalIt } = props;
  //let [currentRoutine, setCurrentRoutine] = useState();
  let [pc, setPc] = useState(state.zvm ? state.zvm.pc : 0);
  let [fp, setFp] = useState(state.zvm ? state.zvm.fp : 0);
  let [stackLength, setStackLength] = useState(
    state.zvm ? Stack.length(state.zvm.stack) : 0
  );
  let [zvmStatus, setZvmStatus] = useState('');
  let [isRunning, setIsRunning] = useState(true);
  let [stopValue, setStopValue] = useState(0);
  let [stopValStr, setStopValStr] = useState('');
  let [zvmState, setZvmState] = useState(Zm.ZState.Stopped);
  // let [it, setIT] = useState(state.zvm ? Zm.evalNext(state.zvm) : null);

  useEffect(() => {
    if (state.zvm) {
      setPc(state.zvm.pc);
      setFp(state.zvm.fp);
      setStackLength(Stack.length(state.zvm.stack));
    }
  }, [state.zvm, pc, fp, stackLength]);

  const evalNext = async (evt: MouseEvent) => {
    setZvmStatus('Evaluating next instruction');

    // now just do things asynchronously and come back here when it's done
    //let state = await Zm.evalNext(zvm).next().value;
    if (state.zvm && evalIt) {
      let nextState = await evalIt.next().value;
      setZvmState(nextState);
      // update our local things
      setPc(state.zvm.pc);
      setFp(state.zvm.fp);
      setStackLength(Stack.length(state.zvm.stack));
      setZvmStatus('Waiting for next command');
    }
  };

  const runForever = async (evt: MouseEvent) => {
    if (state.zvm && evalIt) {
      setZvmStatus('Running forever...');
      let promise = new Promise((resolve, reject) => {
        if (state.zvm && evalIt) {
          let nextState = evalIt.next().value;
          console.log(
            'run forever starting state is ' + Zm.zStateToString(nextState)
          );
          while (nextState === Zm.ZState.Running) {
            nextState = evalIt.next().value;
          }

          setPc(state.zvm.pc);
          setFp(state.zvm.fp);
          setZvmState(nextState);
          setStackLength(Stack.length(state.zvm.stack));
          resolve(state);
        }
      });

      try {
        let s = await promise;
        //console.log('resolved as: ' + s);
        setZvmStatus('Waiting for next command');
      } catch (err) {
        setIsRunning(false);
        setZvmStatus(err.stack);
        throw err;
      }
    } else {
      setZvmStatus('Waiting to load...');
    }
  };

  function changeStoppingPoint(evt: FormEvent<HTMLInputElement>) {
    let res = parseInt(evt.currentTarget.value, 16);
    if (res) setStopValue(res);

    setStopValStr(evt.currentTarget.value);
  }

  async function runUntil(evt: MouseEvent) {
    setZvmStatus('running until ' + stopValue);
    setIsRunning(true);
    if (state.zvm && evalIt) {
      let nextState = evalIt.next().value;
      while (state.zvm.pc !== stopValue && nextState === Zm.ZState.Running) {
        nextState = evalIt.next().value;
      }

      setPc(state.zvm.pc);
      setFp(state.zvm.fp);
      setZvmState(nextState);
      setStackLength(Stack.length(state.zvm.stack));
      setIsRunning(false);

      setZvmStatus('Stopped at ' + state.zvm.pc.toString(16));
    } else {
      setZvmStatus('Waiting to load...');
    }
  }

  async function stop(evt: MouseEvent) {
    setIsRunning(false);
  }

  // the controls will live in a div
  return (
    <div>
      <h3>{zvmStatus}</h3>
      <div className="pc">PC: {pc.toString(16)}</div>
      <div className="fp">FP: {fp.toString(16)}</div>
      <div className="topOfStack">Stack length: {stackLength.toString(16)}</div>
      <button type="button" onClick={evalNext}>
        Eval Next Instruction
      </button>
      <button type="button" onClick={runForever}>
        Run Forever
      </button>
      <button type="submit" onClick={stop}>
        Stop
      </button>
      <button type="button" onClick={runUntil}>
        Run until: {stopValue.toString(16)}
      </button>
      <input type="text" value={stopValStr} onChange={changeStoppingPoint} />
      <p>
        Status: {Zm.zStateToString(zvmState)}, isRunning:{' '}
        {isRunning ? 'Running' : 'Not running'}
      </p>
      {/* nest children */ children}
    </div>
  );
};

export default ZvmControls;
