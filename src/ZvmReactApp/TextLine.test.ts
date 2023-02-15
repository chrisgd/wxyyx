import * as ts from './TextSpan';
import * as tl from './TextLine';

test('test line slicing', () => {
  let tl1 = [
    ts.makeTextSpan('hello'),
    ts.makeTextSpan(' '),
    ts.makeTextSpan('world')
  ];

  expect(tl.sliceTextLine(tl1, 0, 4)).toEqual([ts.makeTextSpan('hell')]);
  expect(tl1[0].content).toBe('hello');
  expect(tl.sliceTextLine(tl1, 0, 5)).toEqual([ts.makeTextSpan('hello')]);
  expect(tl.sliceTextLine(tl1, 0, 1)).toEqual([ts.makeTextSpan('h')]);
  expect(tl.sliceTextLine(tl1, 2, 4)).toEqual([ts.makeTextSpan('ll')]);

  // now slice off individual pieces
  expect(tl.sliceTextLine(tl1, 5, 6)).toEqual([ts.makeTextSpan(' ')]);
  expect(tl.sliceTextLine(tl1, 6, 11)).toEqual([ts.makeTextSpan('world')]);
});

test('test slicing across boundaries', () => {
  let tl1 = [
    ts.makeTextSpan('hello'),
    ts.makeTextSpan(' '),
    ts.makeTextSpan('world')
  ];
  // finally, cross boundaries
  expect(tl.sliceTextLine(tl1, 4, 6)).toEqual([
    ts.makeTextSpan('o'),
    ts.makeTextSpan(' ')
  ]);
  expect(tl.sliceTextLine(tl1, 5, 7)).toEqual([
    ts.makeTextSpan(' '),
    ts.makeTextSpan('w')
  ]);

  // bigger boundaries
  expect(tl.sliceTextLine(tl1, 4, 7)).toEqual([
    ts.makeTextSpan('o'),
    ts.makeTextSpan(' '),
    ts.makeTextSpan('w')
  ]);
  expect(tl.sliceTextLine(tl1, 2, 7)).toEqual([
    ts.makeTextSpan('llo'),
    ts.makeTextSpan(' '),
    ts.makeTextSpan('w')
  ]);
  expect(tl.sliceTextLine(tl1, 2, 9)).toEqual([
    ts.makeTextSpan('llo'),
    ts.makeTextSpan(' '),
    ts.makeTextSpan('wor')
  ]);
});

test('test merging elements', () => {
  let tl1 = [
    ts.makeTextSpan('hello'),
    ts.makeTextSpan(' '),
    ts.makeTextSpan('world')
  ];
  expect(tl.mergeAdjacent(tl1)).toEqual([ts.makeTextSpan('hello world')]);
  let tl2 = [
    ts.makeTextSpan('hello'),
    ts.makeTextSpan(' ', { fontFamily: 'Monaco' }),
    ts.makeTextSpan('world')
  ];
  expect(tl.mergeAdjacent(tl2)).toEqual([
    ts.makeTextSpan('hello'),
    ts.makeTextSpan(' world', { fontFamily: 'Monaco' })
  ]);
  let tl3 = [
    ts.makeTextSpan('hello', { fontFamily: 'Monaco' }),
    ts.makeTextSpan(' ', { fontFamily: 'Monaco' }),
    ts.makeTextSpan('world')
  ];
  expect(tl.mergeAdjacent(tl3)).toEqual([
    ts.makeTextSpan('hello world', { fontFamily: 'Monaco' })
  ]);
  let tl4 = [
    ts.makeTextSpan('hello', { fontFamily: 'Monaco' }),
    ts.makeTextSpan(' '),
    ts.makeTextSpan('world', { fontFamily: 'Monaco' })
  ];
  expect(tl.mergeAdjacent(tl4)).toEqual([
    ts.makeTextSpan('hello world', { fontFamily: 'Monaco' })
  ]);
});

test('converting to a string and counting characters ', () => {
  let tl1 = [
    ts.makeTextSpan('hello'),
    ts.makeTextSpan(' '),
    ts.makeTextSpan('world')
  ];
  expect(tl.textLineToString(tl1)).toEqual('hello world');
  expect(tl.lengthTextLine(tl1)).toBe(11);
});

test('matching things', () => {
  let tl1 = [
    ts.makeTextSpan('hello'),
    ts.makeTextSpan(' '),
    ts.makeTextSpan('world')
  ];
  expect(tl.matchTextLine(tl1, / /g)).toEqual([' ']);
  expect(tl.matchTextLine(tl1, /o/g)).toEqual(['o', 'o']);
  let ans1: any = ['hello', 'hello', undefined];
  ans1.index = 0;
  ans1.input = 'hello world';
  ans1.lastIndex = 5;
  ans1.groups = undefined;
  let ans2: any = [' ', undefined, ' '];
  ans2.index = 5;
  ans2.input = 'hello world';
  ans2.lastIndex = 6;
  ans2.groups = undefined;
  let ans3: any = ['world', 'world', undefined];
  ans3.index = 6;
  ans3.input = 'world';
  ans3.groups = undefined;
  ans3.lastIndex = 11;

  expect(JSON.stringify(tl.regexecTextLine(tl1, /([^ ]+)|([ ])/g))).toEqual(
    JSON.stringify([ans1, ans2, ans3])
  );
});

test('splitting on newlines', () => {
  let tl1 = [
    ts.makeTextSpan('hel\nlo'),
    ts.makeTextSpan(' \n'),
    ts.makeTextSpan('world')
  ];

  let res = tl.splitOnNewlines(tl1, false);
  expect(res === false).toBe(false);
  if (res) {
    expect(res[0]).toEqual([ts.makeTextSpan('hel')]);
    expect(res[1]).toEqual([ts.makeTextSpan('lo'), ts.makeTextSpan(' ')]);
    expect(res[2]).toEqual([ts.makeTextSpan('world')]);
  }
  res = tl.splitOnNewlines(tl1, true);
  expect(res === false).toBe(false);
  if (res) {
    expect(res[0]).toEqual([ts.makeTextSpan('hel\n')]);
    expect(res[1]).toEqual([ts.makeTextSpan('lo'), ts.makeTextSpan(' \n')]);
    expect(res[2]).toEqual([ts.makeTextSpan('world')]);
  }
});

test('appending lines', () => {
  let tl1 = [
    ts.makeTextSpan('hello'),
    ts.makeTextSpan(' '),
    ts.makeTextSpan('world')
  ];
  let tl2 = [
    ts.makeTextSpan('goodbye'),
    ts.makeTextSpan(' '),
    ts.makeTextSpan('universe')
  ];

  expect(tl.appendTextLine(tl1, tl2)).toEqual([
    ts.makeTextSpan('hello'),
    ts.makeTextSpan(' '),
    ts.makeTextSpan('world'),
    ts.makeTextSpan('goodbye'),
    ts.makeTextSpan(' '),
    ts.makeTextSpan('universe')
  ]);

  expect(tl.appendTextSpanToLine(tl1, ts.makeTextSpan(' and yes'))).toEqual([
    ts.makeTextSpan('hello'),
    ts.makeTextSpan(' '),
    ts.makeTextSpan('world'),
    ts.makeTextSpan(' and yes')
  ]);
});

test('write text lines', () => {
  let tl1 = [ts.makeTextSpan('hello')];
  expect(tl.writeTextLine(tl1, ts.makeTextSpan(' world'), 4)).toEqual([
    ts.makeTextSpan('hell'),
    ts.makeTextSpan(' world')
  ]);
  expect(tl.writeTextLine(tl1, ts.makeTextSpan(' world'), 7)).toEqual([
    ts.makeTextSpan('hello'),
    ts.makeTextSpan(' world')
  ]);
  expect(tl.writeTextLine(tl1, ts.makeTextSpan(' world'), 0)).toEqual([
    ts.makeTextSpan(' world')
  ]);
});

test('lengths and such', () => {
  let tl1 = [ts.makeTextSpan('hello '), ts.makeTextSpan('world')];
  expect(tl.lengthTextLine(tl1)).toBe(11);
  expect(tl.textLineToString(tl1)).toBe('hello world');
});
