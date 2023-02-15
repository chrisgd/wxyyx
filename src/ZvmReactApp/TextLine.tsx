import React, { FunctionComponent } from 'react';
import TextSpan, { ITextSpan, isSubsetOfStyle } from './TextSpan';
import * as Text from './TextSpan';

export type ITextLine = ITextSpan[];
/**
 * This returns a list of matches as if exec were run and the results were collected.
 * @param line the line we are working with
 * @param regex the regular expression being used for matching
 */
export function regexecTextLine(line: ITextSpan[], regex: RegExp) {
  let s = textLineToString(line);
  let m: any = regex.exec(s);
  let res = [] as { [key: string]: any }[];
  while (m) {
    m.lastIndex = regex.lastIndex;
    // console.log('m[0]: ' + m[0] + ', m[1]: ' + m[1] + ', m[2]: ' + m[2] +
    //             ', index: ' + m.index + ', input: ' + m.input + ', groups: ' + m.groups);
    res.push(m);
    m = regex.exec(s);
  }
  return res;
}

/**
 * Returns the matches using the given regular expression--this crosses
 * text boundaries and ignores styles. *Note:* it returns strings, not
 * text spans.
 * @param line the line we are working with
 * @param regex the regular expression we are matching with
 */
export function matchTextLine(line: ITextSpan[], regex: RegExp) {
  return textLineToString(line).match(regex);
}

/**
 * returns all the content parts of the ITextSpans as a single string
 * @param line the line we are working with
 */
export function textLineToString(line: ITextSpan[]) {
  if (line.length > 0) {
    return line.slice(1).reduce((acc, el) => {
      return acc + el.content;
    }, line[0].content);
  } else return '';
}

/**
 * counts the number of characters in this text line
 * @param line the line we are working with
 */
export function lengthTextLine(line: ITextLine) {
  return line.reduce((acc, el) => acc + el.content.length, 0);
}

// export function matchIndexTextLine(line: ITextLine, re: RegExp) {}

/**
 * This function will take an array of ITextSpan objects and walk through
 * the contents to determine if the line should be split. Any newlines
 * will force a split to a new line. The result will be an array of arrays,
 * or false, if it doesn't need to be split. Note that this *removes* the
 * newlines on the split by default.
 * @param line The line we are working with
 */
export function splitOnNewlines(
  line: ITextLine,
  keepNewlines = false
): ITextLine[] | false {
  // split on newlines, this will give us an array of array-like objects with details
  // on the split
  let splits = regexecTextLine(
    line,
    keepNewlines ? /([^\n]*\n)|([^\n]+)/g : /([^\n]*)\n|([^\n]+)/g
  );
  let lines: ITextLine[] = [];
  splits.forEach(info => {
    // slice and dice it, calculate the end point based on whether or not we're keeping
    // the newlines, because if we're not, we have to chop some stuff off
    let end = keepNewlines
      ? info.lastIndex
      : info.index + (info[1] !== undefined ? info[1].length : info[2].length);
    let subline = sliceTextLine(line, info.index, end);
    // and push it

    lines.push(subline);
  });

  if (lines.length > 1) return lines;
  else return false;
}

/**
 * This function walks through the elements from left to right and decides
 * whether or not to merge the elements based on styles--if the nth style
 * is a subset of the nth-1 style, the two elements are merged.
 * @param line The line we are merging adjacent spans in
 */
export function mergeAdjacent(spans: ITextSpan[]) {
  return spans.slice(1, spans.length).reduce(
    (acc, el) => {
      let idx = acc.length - 1;
      let span = acc[idx];
      if (isSubsetOfStyle(span, el)) {
        // replace the last one with the new appended one
        acc[idx] = Text.appendTextSpan(span, el);
      } else {
        acc.push(el);
      }
      return acc;
    },
    [spans[0]]
  );
}

/**
 * This just appends the span to this line, nothing fancy. If you want
 * to merge, you can do so separately. This has side effects.
 * @param line the line we are working with
 * @param span a new text span
 */
export function appendTextSpanToLine(
  line: ITextLine,
  span: ITextSpan,
  useSideEffects = false
) {
  if (useSideEffects) {
    line.push(span);
    return line;
  } else {
    let res = line.slice(0, line.length);
    res.push(span);
    return res;
  }
}

/**
 * Think of this as line1 + line2, we append the elements of line 2 onto the end of line1.
 * This can be done with or without side effects (but note, it's a shallow copy ultimately).
 * @param line1 the line we are appending to
 * @param line2 the line we are appending
 * @param useSideEffects
 */
export function appendTextLine(
  line1: ITextLine,
  line2: ITextLine,
  useSideEffects = false
): ITextLine {
  if (useSideEffects) {
    line2.forEach(el => {
      line1.push(el);
    });
    return line1;
  } else {
    let newline = line1.slice(0, line1.length);
    line2.forEach(el => {
      newline.push(el);
    });
    return newline;
  }
}

/**
 * This appends a string to the given text line by attaching it to the last
 * element in the text line. We assume styling remains the same so we don't change it.
 * @param line the line we are working with
 * @param str the string we want to append to this text line
 * @param useSideEffects whether or not we want to do this with side effects
 */
export function appendStrToTextLine(
  line: ITextLine,
  str: string,
  useSideEffects = false
): ITextLine {
  if (line.length > 0) {
    let last = Text.appendStrToTextSpan(
      line[line.length - 1],
      str,
      useSideEffects
    );
    return appendTextSpanToLine(
      sliceTextLine(line, 0, line.length - 1, useSideEffects),
      last,
      useSideEffects
    );
  } else {
    return appendTextSpanToLine(line, Text.makeTextSpan(str), useSideEffects);
  }
}

/**
 * This takes an array of spans and slices them, similar to what the JS
 * String.prototype.slice does. It however results in an array of ITextSpan
 * objects, where the new array size will be <= 1 + the original size. As
 * with the string slice, slicing beyond the end or having your indices
 * backwards will not cause an error (and the 2nd case will return an empty
 * TextSpan). By default, this will create a new spans, not modify the existing ones
 * but the final parameter can change this behavior.
 * @param spans an array of ITextSpan objects which we are slicing
 * @param start the starting index to begin the slice
 * @param end the ending index to end the slice, non-inclusively.
 * @param useSideEffects whether or not to modify the line in place or return
 * new text spans.
 */
export function sliceTextLine(
  spans: ITextSpan[],
  start: number,
  end: number,
  useSideEffects = false
) {
  // just use a filter
  let count = 0;
  let newLine: ITextSpan[] = [];
  spans.forEach(el => {
    let newCount = el.content.length + count;
    let begin = start >= count ? start - count : 0;
    let stop = end >= count ? end - count : 0;
    let sl = Text.sliceTextSpan(el, begin, stop);
    if (sl.content.length !== 0) {
      newLine.push(sl);
    }
    count = newCount;
  });

  return newLine;
}

/**
 * This function copies a text span over a portion of a text line, possibly
 * splitting the styles and such. If start is after the length of the line, it's
 * basically an append.
 * @param line the line we are writing to
 * @param span the text span we are writing
 * @param pos the position in the line we are writing to
 */
export function writeTextLine(line: ITextLine, span: ITextSpan, start: number) {
  console.log(
    'text line before: "' +
      textLineToString(line) +
      '", length ' +
      lengthTextLine(line)
  );
  // first, if the span is empty, don't write it
  if (Text.length(span) > 0) {
    let lineLength = lengthTextLine(line);
    let len = span.content.length;
    let end = start + len;

    // chop them into left and right pieces, subtracting out the piece we're gonna write
    let left = sliceTextLine(line, 0, start);
    let right = sliceTextLine(line, end, lineLength);

    // now append these pieces, but only if they have characters left in them
    if (lineLength <= start) {
      appendStrToTextLine(left, ' '.repeat(start - lineLength), true);
    }
    let res =
      lengthTextLine(left) === 0 ? [span] : appendTextSpanToLine(left, span);
    let rresult =
      lengthTextLine(right) === 0 ? res : appendTextLine(res, right);
    console.log(
      'text line after: "' +
        textLineToString(rresult) +
        '", length ' +
        lengthTextLine(rresult)
    );
    return rresult;
  } else {
    console.log(
      'text line after: "' +
        textLineToString(line) +
        '", length ' +
        lengthTextLine(line)
    );
    return line;
  }
}

/**
 * TextSpan is the text to be displayed in the terminal window and is rendered as a span.
 * It's specifically for having a particular style on some text.
 * @param style the style on this particular line if needed
 */
const TextLine: FunctionComponent<{
  line: ITextLine;
  className: string;
  suffix?: ITextSpan;
  style?: { [propName: string]: any };
}> = props => {
  const { line, className, suffix, style } = props;

  const sline = suffix ? line.concat(suffix) : line;

  return style ? (
    <div className={className} style={style}>
      {sline.map((el, idx) => {
        return <TextSpan key={'w' + idx} text={el} />;
      })}
    </div>
  ) : (
    <div className={className}>
      {sline.map((el, idx) => {
        return <TextSpan key={'w' + idx} text={el} />;
      })}
    </div>
  );
};

export default TextLine;
