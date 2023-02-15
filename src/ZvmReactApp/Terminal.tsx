import React, {
  FunctionComponent,
  useState,
  useEffect,
  useCallback,
  useReducer,
  useRef
} from 'react';
import { makeTextSpan } from './TextSpan';
import './Terminal.css';

import * as CSS from 'csstype';

import * as Zm from '../ZmLib/ZMachine';
import * as Line from './TextLine';
import * as Text from './TextSpan';
import TextLine from './TextLine';
import { IWindowSettings } from './OutputTerminal';

/**
 * Uses canvas.measureText to compute and return the width of the given text of given font in pixels.
 *
 * @param {String} text The text to be rendered.
 * @param {String} font The css font descriptor that text is to be rendered with (e.g. "bold 14px verdana").
 *
 * @see https://stackoverflow.com/questions/118241/calculate-text-width-with-javascript/21015393#21015393
 */
function calculateTextWidth(text: string, style: any) {
  // re-use canvas object for better performance
  let canvas = document.createElement('canvas');
  let context: any = canvas.getContext('2d');
  context.font = style;
  let metrics = context.measureText(text);
  return metrics.width;
}

export interface ITermStyle extends CSS.PropertiesFallback {
  fontFamily: CSS.Property.FontFamily;
  defaultFixedFont: CSS.Property.FontFamily;
  // overflowX: CSS.Property.OverflowX;
  // overflowY: CSS.Property.OverflowY;
  // backgroundColor: CSS.Property.BackgroundColor;
  // color: CSS.Property.Color;
  height?: CSS.Property.Height;
  // position?: string;
}

/**
 * This hook does a few things: 1st, it calculates the client rectangle
 * whenever dimensions change, and 2nd, it estimates how many columns
 * will fit in the width of that element based on the calculated style
 * of the element. Remember, it's an *estimate* and measures the maximum
 * number of Ms that might fit on the line.
 */
const useClientSize = () => {
  // our client size state
  const [clientSize, setClientSize] = useState<DOMRect>();
  const [numColumns, setNumColumns] = useState<number>(0);
  const [lineHeight, setLineHeight] = useState<number>(0);
  const [numLines, setNumLines] = useState<number>(0);

  // a callback ref, which gets returned to the user of this hook and
  // can be attached to a DOM
  const ref = useCallback((node: HTMLElement | null) => {
    if (node !== null) {
      let rect = node.getBoundingClientRect();
      setClientSize(rect);
      const wStyle = window.getComputedStyle(node);
      const fontFamily = wStyle.getPropertyValue('font-family');
      const fontStyle = wStyle.getPropertyValue('font-style');
      const fontWeight = wStyle.getPropertyValue('font-weight');
      const fontSize = wStyle.getPropertyValue('font-size');
      const fontVariant = wStyle.getPropertyValue('font-variant');
      const lineHeight = wStyle.getPropertyValue('line-height');
      const fontStr =
        fontStyle +
        ' ' +
        fontVariant +
        ' ' +
        fontWeight +
        ' ' +
        fontSize +
        '/' +
        lineHeight +
        ' ' +
        fontFamily;

      let w = calculateTextWidth('M', fontStr);
      let ew = Math.floor(rect.width / w) - 1;
      console.log(
        'font string: ' +
          fontStr +
          ': char width: ' +
          w.toString() +
          'estimated columns: ' +
          ew
      );
      setNumColumns(ew);
      let match = lineHeight.match(/\d+/);
      if (match) {
        let lheight = parseInt(match[0]);
        console.log('line height is: ' + lheight);
        setLineHeight(lheight);
        let nlines = Math.floor(rect.height / lheight);
        setNumLines(nlines);
        console.log('num lines is: ' + nlines);
      }
    }
  }, []);

  return [clientSize, numColumns, lineHeight, numLines, ref];
};

// a simple interface for the initial arguments
interface InitArgs {
  winID: number;
  style?: any;
}

/**
 * This constructs the initial terminal state based of init arguments.
 * @param init the initial arguments to build the terminal state
 */
const initState = (init: InitArgs): TerminalState => {
  let color = init.style && init.style.color ? init.style.color : 'black';
  let backgroundColor =
    init.style && init.style.backgroundColor
      ? init.style.backgroundColor
      : 'blanchedalmond';
  let initState: TerminalState = {
    ref: {
      winID: init.winID,
      numLines: 0,
      fgColor: color,
      bgColor: backgroundColor,
      textStyle: 0,
      lines: [],
      cursor: [1, 1],
      numColumns: 0,
      inputLine: makeBlankInputLine(color, backgroundColor)
    }
  };
  return initState;
};

const makeBlankInputLine = (
  color: CSS.Property.Color,
  backgroundColor: CSS.Property.Color
) => {
  return makeTextSpan(
    '',
    {
      color: color,
      backgroundColor: backgroundColor
    },
    'InputLine'
  );
};

const makeCursor = (state: TerminalState): Text.ITextSpan => {
  let fg = isReverse(state) ? state.ref.bgColor : state.ref.fgColor;
  let bg = isReverse(state) ? state.ref.fgColor : state.ref.bgColor;
  return makeTextSpan(' ', { color: fg, backgroundColor: bg }, 'Cursor');
};

const isReverse = (state: TerminalState) => {
  return state.ref.textStyle & Zm.TextStyle.Reverse;
};
const isBold = (state: TerminalState) => {
  return state.ref.textStyle & Zm.TextStyle.Bold;
};
const isItalic = (state: TerminalState) => {
  return state.ref.textStyle & Zm.TextStyle.Italic;
};
const isFixedPitch = (state: TerminalState) => {
  return state.ref.textStyle & Zm.TextStyle.FixedPitch;
};
const isRoman = (state: TerminalState) => {
  return state.ref.textStyle & Zm.TextStyle.Roman;
};

interface TerminalState {
  ref: {
    winID: number;
    numLines: number;
    fgColor: CSS.Property.Color;
    bgColor: CSS.Property.Color;
    textStyle: number;
    lines: Line.ITextLine[];
    cursor: [number, number];
    numColumns: number;
    inputLine: Text.ITextSpan;
  };
}

enum Action {
  Print,
  Input,
  EraseWindow,
  EraseLine,
  SetNumLines,
  SetCursorPos,
  SetTextStyle
}

type ActionValueType =
  | undefined
  | boolean
  | string
  | number
  | [number, number]
  | { str: string; style: ITermStyle };
interface TerminalAction {
  type: Action;
  value: any;
}

/**
 * This erases a given line in the terminal
 * @param state the current terminal state
 */
const eraseLine = (state: TerminalState) => {
  // figure out where the cursor is, but note that the cursor
  // is from 1,1, but internally this is 0,0.
  let [line, column] = state.ref.cursor;
  line--;
  column--;

  // replace the line that is currently there with a blank one
  if (line < state.ref.lines.length) {
    let str = state.ref.lines[line - 1];
    let spaces = ' '.repeat(str.length - column + 1);
    state.ref.lines[line - 1] = Line.writeTextLine(
      state.ref.lines[line - 1],
      makeTextSpan(spaces),
      column
    );
  }

  return state.ref;
};

/**
 * Creates a blank ITextLine
 * @param len the length of the line
 */
const makeBlankLine = (len: number) => {
  return [makeTextSpan(' '.repeat(len))];
};

/**
 * Fixes the array of lines to have the given number of lines (numLines)
 * and ensures they're all at least numCols wide. fgColor and bgColor are
 * used for fill colors.
 * @param lines the initial set of lines we have
 * @param numLines the total number of lines we want
 * @param numCols the width in characters these lines should be
 * @param fgColor the forground color
 * @param bgColor and the background color
 */
const adjustLines = (
  lines: Line.ITextLine[],
  numLines: number,
  numCols: number,
  fgColor: CSS.Property.Color,
  bgColor: CSS.Property.Color
) => {
  // really what we want is to fix the screen to be a number of
  // characters of a given width and a number of lines. Also, we
  // are given an array of ITextLine objects, so we want to work
  // with those and return an array that has these in them
  // make sure we have a number of lines equal to the width of the screen

  // a shallow non-mutative form
  lines = lines.slice(0, lines.length > numLines ? lines.length : numLines);

  // now that we have a copy
  if (lines.length < numLines) {
    // add some blank lines
    let l = ' '.repeat(numCols);
    for (let i = 0; i < numLines - lines.length; i++)
      lines.push([makeTextSpan(l)]);
  }

  lines.forEach((el, idx) => {
    let len = Line.lengthTextLine(el);
    if (len < numCols) {
      let spaces = makeTextSpan(' '.repeat(numCols - len), {
        color: fgColor,
        backgroundColor: bgColor
      });
      lines[idx] = Line.appendTextSpanToLine(el, spaces);
    }
  });

  return lines;
};

/**
 * This erases the window by replacing the lines with a bunch of blank ones
 * @param state the state we are working with
 */
const makeBlankLines = (numLines: number, numCols: number) => {
  let newlines = [];
  for (let i = 0; i < numLines; i++) {
    newlines.push(makeBlankLine(numCols));
  }

  return newlines;
};

const NewTextStyle = (state: TerminalState, style: Zm.TextStyle) => {
  switch (style) {
    // switching to 'roman' turns off all other stylings
    case Zm.TextStyle.Roman:
      if (isRoman(state)) {
        return false;
      } else {
        return Zm.TextStyle.Roman;
      }
    // reverse the coloring
    case Zm.TextStyle.Reverse:
      if (isReverse(state)) {
        return false;
      } else {
        return state.ref.textStyle | Zm.TextStyle.Reverse;
      }
    case Zm.TextStyle.Italic:
      if (isItalic(state)) {
        return false;
      } else {
        return state.ref.textStyle | Zm.TextStyle.Italic;
      }
    case Zm.TextStyle.Bold:
      if (isBold(state)) {
        return false;
      } else {
        return state.ref.textStyle | Zm.TextStyle.Bold;
      }
    case Zm.TextStyle.FixedPitch:
      if (isFixedPitch(state)) {
        return false;
      } else {
        return state.ref.textStyle | Zm.TextStyle.FixedPitch;
      }
    default:
      throw Error('unknown text style');
  }
};

/**
 * creates a text style using the current settings of the terminal
 */
const makeTextStyle = (state: TerminalState, style: ITermStyle) => {
  let newstyle: React.CSSProperties = {};
  if (isRoman(state)) {
    newstyle.fontFamily = style.fontFamily;
    return newstyle;
  }
  if (isFixedPitch(state)) {
    newstyle.fontFamily = style.defaultFixedFont;
  }
  if (isBold(state)) {
    newstyle.fontWeight = 'bold';
  }
  if (isItalic(state)) {
    newstyle.fontStyle = 'italic';
  }
  if (isReverse(state)) {
    newstyle.color = state.ref.bgColor;
    newstyle.backgroundColor = state.ref.fgColor;
  } else {
    newstyle.color = state.ref.fgColor;
    newstyle.backgroundColor = state.ref.bgColor;
  }
  return newstyle;
};

const addTextToLines = (
  state: TerminalState,
  str: string,
  style: ITermStyle
) => {
  // get the length of the string
  let len = str.length;
  if (len === 0) return false;

  let oldLines = state.ref.lines;
  //let winID = state.ref.winID;
  // first, build a span from this string using the current terminal style
  let span = makeTextSpan(str, makeTextStyle(state, style));

  // now figure out where we're writing to on the screen based on the cursor position
  let [line, column] = state.ref.cursor;

  //console.log('window ' + winID + ' cursor is line ' + line + ', column ' + column);

  // expand the window if needed
  if (line > oldLines.length) {
    console.log(' now setting lines to ' + oldLines.length);
    oldLines = adjustLines(
      oldLines,
      line,
      state.ref.numColumns,
      state.ref.fgColor,
      state.ref.bgColor
    );
  }

  // then shallow copy the lines over
  oldLines = oldLines.map((el, idx) => {
    // if this is the line
    if (idx === line - 1) {
      // update it
      // console.log('window line \'' + Line.textLineToString(el) +
      //              '\', newtext: \'' + span.content + '\', at pos: ' + column);
      // update the line, note that we write to column - 1 because our cursor is
      // indexed starting from 1, not 0, so this corrects that when writing
      let newLine = Line.writeTextLine(el, span, column - 1);
      // console.log('window updating line to be: "' +
      //              Line.textLineToString(newLine) + '" and has length ' +
      //              Line.lengthTextLine(newLine));
      Line.mergeAdjacent(newLine);
      // return this newline
      return newLine;
    } else {
      // otherwise, return the old one
      return el;
    }
  });

  // now see if we need to split the lines, this helps with performance in the long run
  let lastLine = oldLines[oldLines.length - 1];
  // we don't need to keep the newlines because they're divs, so they break automatically
  let newLast = Line.splitOnNewlines(lastLine, true);

  // if newLast.length is 1, we didn't split, so just keep oldLines, otherwise
  // we have to add all these lines
  if (newLast) {
    let pos = oldLines.length - 1;
    newLast.forEach((el, idx) => {
      oldLines[pos + idx] = el;
    });
    // adjust where the cursor line would be
    line = oldLines.length;
    column = Line.lengthTextLine(oldLines[oldLines.length - 1]) + 1;
    len = 0;
  }

  state.ref.lines = oldLines;
  // now adjust the cursor to its new position
  state.ref.cursor = [line, column + len];
  // and adjust the number of lines if needed
  state.ref.numLines = state.ref.lines.length;
  // console.log('window: ' + winID + ' new cursor line: ' + line + ' and column ' + (column + len) + ', strlen was ' + len);

  // finally, return this state reference
  return state;
};

const processInput = (
  state: TerminalState,
  str: string,
  style: ITermStyle
): TerminalState | false => {
  let newstate = state;
  switch (str) {
    case 'Backspace':
      // backspace is going to just delete the last character, nothing fancy
      let len = Text.length(state.ref.inputLine);
      newstate.ref.inputLine = Text.sliceTextSpan(
        state.ref.inputLine,
        0,
        len - 1
      );
      break;
    case 'Enter':
      // leave a copy of the input buffer on the screen at this point, and
      // then reset the inputLine to be empty
      //let res = addTextToLines(state, Text.textSpanToString(state.ref.inputLine) + '\n', style);
      // if (res !== false) {
      //   newstate = state;
      // }
      newstate.ref.inputLine = Text.sliceTextSpan(state.ref.inputLine, 0, 0);
      break;
    case 'ClearBuffer':
      console.log('ClearBuffer');
      // this isn't a real keypress, but we can get whatever we want, haha
      newstate.ref.inputLine = Text.sliceTextSpan(state.ref.inputLine, 0, 0);
      break;
    default:
      if (str.length === 1) {
        // by default, just add it to the input line
        newstate.ref.inputLine = Text.appendStrToTextSpan(
          state.ref.inputLine,
          str
        );
      }
      break;
  }
  return newstate;
};

const TermStateReducer = (
  state: TerminalState,
  action: TerminalAction
): TerminalState => {
  let tmpRef: false | TerminalState = false;
  switch (action.type) {
    case Action.Print:
      // console.log('printing to window ' + state.ref.winID);
      tmpRef = addTextToLines(state, action.value.str, action.value.style);
      if (tmpRef !== false) {
        return { ref: tmpRef.ref };
      } else {
        return state;
      }
    case Action.Input:
      tmpRef = processInput(state, action.value.str, action.value.style);
      if (tmpRef !== false) {
        return { ref: tmpRef.ref };
      } else {
        return state;
      }
    case Action.EraseWindow:
      // this just erases all the lines, but keeps however many there should be
      state.ref.lines = makeBlankLines(
        state.ref.numLines,
        action.value as number
      );
      return { ref: state.ref };
    case Action.EraseLine:
      // erases the line
      return { ref: eraseLine(state) };
    case Action.SetNumLines:
      // this lets us set the lines, so we first adjust
      // the number of lines we have
      state.ref.lines = adjustLines(
        state.ref.lines,
        action.value.numLines,
        action.value.numCols,
        state.ref.fgColor,
        state.ref.bgColor
      );
      // and then we set this in our state
      state.ref.numLines = action.value.numLines;
      return { ref: state.ref };
    case Action.SetCursorPos:
      let newPos = action.value as [number, number];
      // only update the cursor position if we need to
      if (
        state.ref.cursor[0] !== newPos[0] ||
        state.ref.cursor[1] !== newPos[1]
      ) {
        state.ref.cursor = newPos;
        return { ref: state.ref };
      } else {
        return state;
      }
    case Action.SetTextStyle:
      let style = action.value as Zm.TextStyle;
      let newStyle = NewTextStyle(state, style);
      if (newStyle !== false) {
        state.ref.textStyle = newStyle;
        return { ref: state.ref };
      } else {
        return state;
      }
    default:
      throw Error('Unknown state in TermStateReducer: ' + action.type);
  }
};

/** Implements the idea of a terminal window for the z-machine. */
const Terminal: FunctionComponent<{
  zvm: Zm.zMachine;
  winID: number;
  defaultFixedFont: string;
  defaultVariableFont: string;
  wrap?: boolean;
  screenRectSource?: boolean;
  bufferMode?: boolean;
  windowSettings: IWindowSettings;
  responsiveHeight?: number;
  defaultFont: string;
  showCursor: boolean;
  inputBuffer?: { buffer: string };
  [propName: string]: any;
}> = props => {
  const {
    zvm,
    winID,
    wrap,
    screenRectSource,
    defaultFont,
    defaultFixedFont,
    bufferMode,
    style,
    responsiveHeight,
    inputBuffer,
    showCursor,
    windowSettings
  } = props;

  const [state, dispatch] = useReducer(
    TermStateReducer,
    { winID: winID, style: style },
    initState
  );
  const [termStyle, setTermStyle] = useState<ITermStyle>({
    fontFamily: defaultFont,
    defaultFixedFont: defaultFixedFont,
    overflowX: bufferMode ? 'auto' : 'hidden',
    overflowY: bufferMode ? 'auto' : 'hidden',
    color: state.ref.fgColor,
    backgroundColor: state.ref.bgColor,
    height: '100%'
  });

  // this uses the custom hook to handle the ref as a callback
  // eslint-disable-next-line
  const [
    clientSize,
    numColumns,
    lineHeight,
    numLines,
    terminalRef
  ] = useClientSize();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // so, whenever the input buffer changes, we want to do something
  useEffect(() => {
    if (inputBuffer) {
      dispatch({
        type: Action.Input,
        value: { str: inputBuffer.buffer, style: style }
      });
    }
  }, [inputBuffer, style]);

  useEffect(() => {
    // the primary window is the one that is counted in terms of column width
    if (screenRectSource) {
      console.log(
        'window ' + winID + ' screen width is ' + numColumns + ' columns'
      );

      Zm.setScreenRect(zvm, numLines as number, numColumns as number);
    }
  }, [numColumns, numLines, winID, zvm, screenRectSource]);

  // this effect is primarily for dispatching side effects sent to us by the
  // z-machine
  useEffect(() => {
    const setBufferMode = (on: boolean) => {
      console.log(
        'window: ' + winID + ' buffer mode set to ' + (on ? 'on' : 'off')
      );
      setTermStyle(oldStyle => {
        oldStyle.overflowY = on ? 'scroll' : 'hidden';
        return oldStyle;
      });
    };

    /**
     * This is used by the zvm to send commands from its instruction set
     * @param cmd the command to this output winID
     * @param val the value if needed
     */
    const winIDListener = (
      cmd: string,
      val: undefined | string | [number, number] | boolean | number
    ) => {
      // console.log(
      //   'window ' + winID + ' listener dispatch: "' + cmd + '" of ' + val
      // );
      switch (cmd) {
        case 'print':
          if (val !== undefined) {
            dispatch({ type: Action.Print, value: { str: val, style: style } });
          } else {
            throw Error('cannot call print without an argument');
          }
          break;
        case 'eraseWindow':
          dispatch({ type: Action.EraseWindow, value: undefined });
          break;
        case 'textStyle':
          console.log('window ' + winID + ': textStyle to ' + val);
          dispatch({ type: Action.SetTextStyle, value: val });
          break;
        case 'setCursor':
          let [line, column] = val as [number, number];
          console.log(
            'window ' +
              winID +
              ': setCursor (line, col) [' +
              line +
              ',' +
              column +
              ']'
          );
          dispatch({ type: Action.SetCursorPos, value: val });
          break;
        case 'setBufferMode':
          console.log(
            'window ' + winID + ': setBufferMode to ' + (val as boolean)
              ? 'true'
              : 'false'
          );
          setBufferMode(val as boolean);
          break;
        case 'setLines':
          console.log('window ' + winID + ': setLines to ' + (val as number));
          dispatch({
            type: Action.SetNumLines,
            value: { numLines: val, numCols: numColumns }
          });
          break;
        case 'eraseLine':
          console.log(
            'window ' + winID + ': erase_line ' + state.ref.cursor[0]
          );
          dispatch({ type: Action.EraseLine, value: numColumns });
          break;
        default:
          throw Error('invalid cmd to terminal');
      }
    };

    console.log('setting winID listener ' + winID);
    Zm.setWindowListener(zvm, winID, winIDListener);

    // unset us when we're done, seems a bit excessive, but whatever
    return () => {
      console.log('unsetting winID listener ' + winID);
      Zm.unsetWindowListener(zvm, winID);
    };
  }, [numColumns, winID, style, zvm, state.ref.cursor]);

  // this attemps to handle issues around the hight of the terminal box
  useEffect(() => {
    setTermStyle(ts => {
      // only adjust the style if the type is a wrapping window
      if (!wrap) {
        let newTs: ITermStyle = {
          fontFamily: ts.fontFamily,
          defaultFixedFont: ts.defaultFixedFont,
          overflowX: ts.overflowX,
          overflowY: ts.overflowY,
          color: ts.color,
          backgroundColor: ts.backgroundColor,
          height: ts.height
        };
        if (state.ref.numLines >= 0) {
          console.log(
            'window ' +
              winID +
              ' numLines: ' +
              state.ref.numLines +
              ', line height: ' +
              lineHeight +
              ', new height: ' +
              (state.ref.numLines * (lineHeight as number) +
                0.5 * (lineHeight as number))
          );
          newTs.height =
            state.ref.numLines * (lineHeight as number) +
            0.5 * (lineHeight as number) +
            'px';
        }
        if (winID === 0 || newTs.height === ts.height) {
          return ts;
        } else {
          return newTs;
        }
      } else {
        return ts;
      }
    });
  }, [zvm, state.ref.numLines, lineHeight, wrap, winID]);

  useEffect(() => {
    let div = scrollRef.current;
    if (div) {
      console.log(
        'window ' + winID + ' updating scrolling, scrollTop: ' + div.scrollTop
      );
      div.scrollTop = div.scrollHeight;
    }
  }, [scrollRef, winID, state.ref.lines]);
  // finally, rendering, after all this, it looks so simple
  return (
    <div
      className="NewTerminal"
      ref={terminalRef as ((node: HTMLElement | null) => void) | undefined}
      style={{
        height: responsiveHeight,
        overflow: 'auto',
        position: 'relative',
        fontFamily: termStyle.fontFamily
      }}
    >
      <div ref={scrollRef} style={termStyle as React.CSSProperties}>
        {winID === 0
          ? state.ref.lines.map((el, idx) => {
              return idx === state.ref.lines.length - 1 ? (
                <TextLine
                  className="TextLine"
                  key={'tl' + idx}
                  line={el}
                  suffix={state.ref.inputLine}
                />
              ) : (
                <TextLine className="TextLine" key={'tl' + idx} line={el} />
              );
            })
          : state.ref.lines.map((el, idx) => {
              return (
                <TextLine className="TextLine" key={'tl' + idx} line={el} />
              );
            })}
      </div>
    </div>
  );
};

export default Terminal;
