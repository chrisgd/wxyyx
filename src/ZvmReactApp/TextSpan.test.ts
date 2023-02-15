import * as ts from './TextSpan';

test('test span appending and slicing', () => {
  let ts1 = ts.makeTextSpan('hello ');
  let ts2 = ts.makeTextSpan('world');
  expect(ts.appendTextSpan(ts1, ts2)).toEqual(ts.makeTextSpan('hello world'));
  expect(ts.appendStrToTextSpan(ts1, 'there')).toEqual(
    ts.makeTextSpan('hello there')
  );
  expect(ts.sliceTextSpan(ts1, 0, 3)).toEqual(ts.makeTextSpan('hel'));
  expect(ts.sliceTextSpan(ts1, 3, 7)).toEqual(ts.makeTextSpan('lo '));
  // testing with side effects
  expect(ts.appendStrToTextSpan(ts1, 'there', true)).toEqual(
    ts.makeTextSpan('hello there')
  );
  expect(ts.sliceTextSpan(ts1, 3, 7)).toEqual(ts.makeTextSpan('lo t'));

  // test span writing
  expect(ts.textSpanWrite(ts1, 'world', 6)).toEqual(
    ts.makeTextSpan('hello world')
  );
  expect(ts1).toEqual(ts.makeTextSpan('hello there'));
  expect(ts.textSpanWrite(ts1, 'world', 6, true)).toEqual(
    ts.makeTextSpan('hello world')
  );
  expect(ts1).toEqual(ts.makeTextSpan('hello world'));

  expect(ts.textSpanWrite(ts1, 'my', 4)).toEqual(
    ts.makeTextSpan('hellmyworld')
  );

  expect(ts.isSubsetOfStyle(ts1, ts2)).toBe(true);
  ts2.style = { fontFamily: 'Monaco, sans-serif' };
  ts1.style = { fontFamily: 'Monaco,' + ' sans-serif' };
  expect(ts.isSubsetOfStyle(ts1, ts2)).toBe(true);
  ts1.style.color = 'blue';
  expect(ts.isSubsetOfStyle(ts1, ts2)).toBe(true);
  ts1.style.fontWeight = 700;
  expect(ts.isSubsetOfStyle(ts1, ts2)).toBe(true);
  ts1.style.fontStyle = 'italic';
  expect(ts.isSubsetOfStyle(ts1, ts2)).toBe(true);
  ts1.style.backgroundColor = 'green';
  expect(ts.isSubsetOfStyle(ts1, ts2)).toBe(true);
  ts2.style.color = 'blue';
  expect(ts.isSubsetOfStyle(ts1, ts2)).toBe(true);
  ts2.style.fontWeight = 700;
  expect(ts.isSubsetOfStyle(ts1, ts2)).toBe(true);
  ts2.style.fontStyle = 'italic';
  expect(ts.isSubsetOfStyle(ts1, ts2)).toBe(true);
  ts2.style.backgroundColor = 'green';
  expect(ts.isSubsetOfStyle(ts1, ts2)).toBe(true);
  ts2.style.color = 'yellow';
  expect(ts.isSubsetOfStyle(ts1, ts2)).toBe(false);
  ts2.style.color = undefined;
  expect(ts.isSubsetOfStyle(ts1, ts2)).toBe(true);
  ts2.style.fontWeight = 600;
  expect(ts.isSubsetOfStyle(ts1, ts2)).toBe(false);
  ts2.style.fontWeight = 700;
  expect(ts.isSubsetOfStyle(ts1, ts2)).toBe(true);
  ts2.style.fontStyle = 'normal';
  expect(ts.isSubsetOfStyle(ts1, ts2)).toBe(false);
  ts2.style.fontStyle = 'italic';
  expect(ts.isSubsetOfStyle(ts1, ts2)).toBe(true);
  ts2.style.backgroundColor = 'orange';
  expect(ts.isSubsetOfStyle(ts1, ts2)).toBe(false);
  ts2.style.backgroundColor = undefined;
  expect(ts.isSubsetOfStyle(ts1, ts2)).toBe(true);
});
