import { describe, expect, it } from 'vitest';
import { buildRowInstructions, countCellsByRow } from '../src/services/rowCountService.js';

describe('rowCountService', () => {
  it('counts cells by grid row', () => {
    expect(countCellsByRow(['-4,1', '-4,2', '-3,1'])).toEqual(new Map([
      [-4, 2],
      [-3, 1],
    ]));
  });

  it('builds top-down row instructions', () => {
    expect(buildRowInstructions([
      '-3,0', '-3,1', '-3,2', '-3,3', '-3,4',
      '-2,1', '-2,2', '-2,3',
      '-1,1', '-1,2', '-1,3', '-1,4',
    ])).toEqual([
      { row: 1, stitches: 4, change: 0, instruction: 'Cast on 4 stitches' },
      { row: 2, stitches: 3, change: -1, instruction: 'Work 2 stitches, Decrease 1 stitch' },
      { row: 3, stitches: 5, change: 2, instruction: 'Increase 1 stitch, Work 3 stitches, Increase 1 stitch' },
    ]);
  });

  it('reports unchanged rows as work even', () => {
    expect(buildRowInstructions(['-2,1', '-1,1'])).toEqual([
      { row: 1, stitches: 1, change: 0, instruction: 'Cast on 1 stitch' },
      { row: 2, stitches: 1, change: 0, instruction: 'Work even' },
    ]);
  });
});
