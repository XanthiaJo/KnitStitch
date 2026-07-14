import { describe, it, expect } from 'vitest';
import { Store } from '../src/state/store.js';
import { toggleCell, clearCells, getFilledBoundingBox, getCombinedBoundingBox, updateCellSizing } from '../src/services/gridService.js';

describe('GridService', () => {
  function makeStore() {
    return new Store();
  }

  describe('toggleCell', () => {
    it('should add a cell key when toggling an unfilled cell', () => {
      const store = makeStore();
      toggleCell(store, 3, 5);
      expect(store.get('filledCells').has('3,5')).toBe(true);
    });

    it('should remove a cell key when toggling a filled cell', () => {
      const store = makeStore();
      toggleCell(store, 3, 5);
      toggleCell(store, 3, 5);
      expect(store.get('filledCells').has('3,5')).toBe(false);
    });

    it('should not affect other cells', () => {
      const store = makeStore();
      toggleCell(store, 1, 1);
      toggleCell(store, 2, 2);
      toggleCell(store, 1, 1);
      expect(store.get('filledCells').has('1,1')).toBe(false);
      expect(store.get('filledCells').has('2,2')).toBe(true);
    });
  });

  describe('clearCells', () => {
    it('should remove all filled cells', () => {
      const store = makeStore();
      toggleCell(store, 0, 0);
      toggleCell(store, 5, 5);
      clearCells(store);
      expect(store.get('filledCells').size).toBe(0);
    });
  });

  describe('getFilledBoundingBox', () => {
    it('should return null for an empty set', () => {
      expect(getFilledBoundingBox(new Set())).toBeNull();
    });

    it('should return the bounding box of filled cells', () => {
      const cells = new Set(['1,2', '3,5', '0,0', '4,1']);
      const bbox = getFilledBoundingBox(cells);
      expect(bbox).toEqual({ minRow: 0, minCol: 0, maxRow: 4, maxCol: 5 });
    });

    it('should handle a single cell', () => {
      const bbox = getFilledBoundingBox(new Set(['2,3']));
      expect(bbox).toEqual({ minRow: 2, minCol: 3, maxRow: 2, maxCol: 3 });
    });
  });

  describe('getCombinedBoundingBox', () => {
    it('should combine manual and sketch-filled cells', () => {
      const manual = new Set(['1,1', '2,2']);
      const sketch = new Set(['5,5', '0,0']);
      const bbox = getCombinedBoundingBox(manual, sketch);
      expect(bbox).toEqual({ minRow: 0, minCol: 0, maxRow: 5, maxCol: 5 });
    });

    it('should work with only manual cells', () => {
      const bbox = getCombinedBoundingBox(new Set(['1,1']), null);
      expect(bbox).toEqual({ minRow: 1, minCol: 1, maxRow: 1, maxCol: 1 });
    });

    it('should return null when both are empty', () => {
      expect(getCombinedBoundingBox(new Set(), new Set())).toBeNull();
    });
  });

  describe('updateCellSizing', () => {
    it('should set cell dimensions from gauge', () => {
      const store = makeStore();
      updateCellSizing(store, 24, 32);
      expect(store.get('cellWidthPx')).toBe(24);
      expect(store.get('cellHeightPx')).toBe(32);
    });

    it('should clamp to minimum of 1', () => {
      const store = makeStore();
      updateCellSizing(store, 0, 0);
      expect(store.get('cellWidthPx')).toBe(1);
      expect(store.get('cellHeightPx')).toBe(1);
    });
  });
});
