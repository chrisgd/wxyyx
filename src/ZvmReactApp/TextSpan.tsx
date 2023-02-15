import React, { FunctionComponent } from 'react';
import * as CSS from 'csstype';
import './TextSpan.css';

/**
 * An interface for the text spanning pieces of the terminal.
 */
export interface ITextSpan {
  content: string;
  style?: {
    fontFamily?: string;
    fontStyle?: CSS.Property.FontStyle;
    fontWeight?: CSS.Property.FontWeight;
    color?: CSS.Property.Color;
    backgroundColor?: CSS.Property.Color;
  };
  className?: string;
}

/**
 * A 'shortcut'? to making a text span
 * @param str the string we're making the text span out of
 * @param style the style attached to it
 */
export function makeTextSpan(
  str: string,
  style?: {
    fontFamily?: string;
    fontStyle?: CSS.Property.FontStyle;
    fontWeight?: CSS.Property.FontWeight;
    color?: CSS.Property.Color;
    backgroundColor?: CSS.Property.Color;
  },
  className?: string
): ITextSpan {
  if (str === undefined) {
    throw Error('illegal string in makeTextSpan');
  }
  return { content: str, className: className, style: style };
}

/**
 * This compares the styles of two text spans and decides if they're
 * 'equivalent', meaning: if a property of the style is defined on both, they're
 * the same, if the property on the left is defined but not on the right, they're
 * the same, if the property on the right is defined but not on the left,
 * they're different, and if they're both defined but different, then they're not
 * the same. In other words, this is not a commutative comparison.
 * @param sp1 first span to compare with
 * @param sp2 second span to compare
 */
export function isSubsetOfStyle(sp1: ITextSpan, sp2: ITextSpan) {
  if (sp1.style) {
    if (sp2.style) {
      // now walk through the cases, kinda gross, but we expect
      // it to shortcircuit the condition nicely
      let subset = true;
      if (
        (sp2.style.backgroundColor !== undefined &&
          sp1.style.backgroundColor !== sp2.style.backgroundColor) ||
        (sp2.style.color !== undefined &&
          sp1.style.color !== sp2.style.color) ||
        (sp2.style.fontStyle !== undefined &&
          sp1.style.fontStyle !== sp2.style.fontStyle) ||
        (sp2.style.fontWeight !== undefined &&
          sp1.style.fontWeight !== sp2.style.fontWeight) ||
        (sp2.style.fontFamily !== undefined &&
          sp1.style.fontFamily !== sp2.style.fontFamily)
      ) {
        subset = false;
      }
      return subset;
    } else {
      // if sp2 doesn't have a style, it's a subset
      return true;
    }
  }

  // sp1 doesn't have a style, but sp2 does, so they're not subsets
  if (sp2.style) {
    // sp2 could have a style object, but no styles set
    if (
      sp2.style.fontFamily ||
      sp2.style.fontStyle ||
      sp2.style.fontWeight ||
      sp2.style.color ||
      sp2.style.backgroundColor
    )
      return false;
    else return true;
  } else {
    return true;
  }
}

/**
 * Works pretty much like splice for strings. This does not affect the styles.
 * @param span the span we are working with
 * @param start starting positing (inclusive) to start with
 * @param end ending position (non-inclusive) to end with
 */
export function sliceTextSpan(span: ITextSpan, start: number, end: number) {
  return {
    content: span.content.slice(start, end),
    style: span.style,
    className: span.className
  };
}

/**
 * Appends one span to another one. Obviously if they're the same, they must
 * share styling...otherwise, why attach them? An optional argument lets you pick
 * which one, left or right.
 * @param left the left side of the span to attach
 * @param right and the right side of the span being attached
 * @param useLeftStyling true if we are to keep the left styling, false to keep the right
 * @param useSideEffect true if we want to modify the left object to append the right, false
 * to simply create a new object.
 */
export function appendTextSpan(
  left: ITextSpan,
  right: ITextSpan,
  useLeftStyling = true,
  useSideEffect = false
) {
  if (useSideEffect) {
    left.content += right.content;
    left.style = useLeftStyling ? left.style : right.style;
    left.className = useLeftStyling ? left.className : right.className;
    return left;
  }

  return {
    content: left.content + right.content,
    style: useLeftStyling ? left.style : right.style,
    className: useLeftStyling ? left.className : right.className
  };
}

/**
 * Appends a string to a text span, where we can optionally specify whether or not to use
 * side effects (by default it's false)
 * @param span the span we are modifying
 * @param str the string to attach
 * @param useSideEffect whether or not we modify this textspan or create a new one
 */
export function appendStrToTextSpan(
  span: ITextSpan,
  str: string,
  useSideEffect: boolean = false
) {
  if (useSideEffect) {
    span.content += str;
    return span;
  } else {
    return makeTextSpan(span.content + str, span.style, span.className);
  }
}

/**
 * This overwrite a portion of the text span and is used to simulate cursor behaviors in a line
 * where you might have a 'position' and want to write text over what's there without bumping
 * the other text forward. Different than an insert, which would place it at that position and
 * bump the text.
 * @param span the span we are working with
 * @param str the string we are going to write
 * @param pos the position we want to write onto in this text span
 */
export function textSpanWrite(
  span: ITextSpan,
  str: string,
  pos: number,
  useSideEffect = false
) {
  // left side of the span, we slice to position
  let left = span.content.slice(0, pos);
  // right side of it, we slice but only after the remaining characters, which
  // would begin str.length characters after pos
  let right = span.content.slice(pos + str.length, span.content.length);

  // modify it in place
  if (useSideEffect) {
    span.content = left + str + right;
    return span;
  }

  // or return a new object
  return makeTextSpan(left + str + right, span.style, span.className);
}

/**
 * This returns the string representation of the text span
 * @param span the span we are working with
 */
export function textSpanToString(span: ITextSpan) {
  return span.content;
}

/**
 * Returns the number of characters in this span
 * @param span the span we are working with
 */
export function length(span: ITextSpan) {
  return span.content.length;
}

/**
 * TextSpan is the text to be displayed in the terminal window and is rendered as a span.
 * It's specifically for having a particular style on some text.
 * @param text the ITextSpan you'll be displaying
 */
const TextSpan: FunctionComponent<{ text: ITextSpan }> = props => {
  let { text } = props;

  return (
    <span className={text.className} style={text.style}>
      {text.content}
    </span>
  );
};

export default TextSpan;
