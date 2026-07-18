import { describe, it, expect } from 'vitest';
import {
  computeFilledCellsFromSketch,
  findClosedPolygons,
} from '../src/services/sketch/fill/closedShapeFill.js';

function line(sx, sy, ex, ey, isConstruction = false) {
  return { start: { x: sx, y: sy }, end: { x: ex, y: ey }, isConstruction };
}

describe('findClosedPolygons', () => {
  it('returns no polygons for fewer than 3 lines', () => {
    expect(findClosedPolygons([line(0, 0, 10, 0), line(10, 0, 10, 10)])).toEqual([]);
  });

  it('finds a triangle', () => {
    const lines = [
      line(0, 0, 100, 0),
      line(100, 0, 100, 100),
      line(100, 100, 0, 0),
    ];
    const polys = findClosedPolygons(lines);
    expect(polys.length).toBe(1);
    expect(polys[0]).toHaveLength(3);
  });

  it('finds a square (4 lines)', () => {
    const lines = [
      line(0, 0, 100, 0),
      line(100, 0, 100, 100),
      line(100, 100, 0, 100),
      line(0, 100, 0, 0),
    ];
    const polys = findClosedPolygons(lines);
    expect(polys.length).toBe(1);
    expect(polys[0]).toHaveLength(4);
  });

  it('finds two separate triangles', () => {
    const lines = [
      line(0, 0, 100, 0),
      line(100, 0, 100, 100),
      line(100, 100, 0, 0),
      line(200, 0, 300, 0),
      line(300, 0, 300, 100),
      line(300, 100, 200, 0),
    ];
    const polys = findClosedPolygons(lines);
    expect(polys.length).toBe(2);
  });

  it('finds both faces when a diagonal splits a square', () => {
    const lines = [
      line(0, 0, 100, 0),
      line(100, 0, 100, 100),
      line(100, 100, 0, 100),
      line(0, 100, 0, 0),
      line(0, 0, 100, 100), // diagonal
    ];
    const polys = findClosedPolygons(lines);
    expect(polys.length).toBe(2);
  });

  it('ignores open polylines that do not close', () => {
    const lines = [
      line(0, 0, 100, 0),
      line(100, 0, 100, 100),
      line(100, 100, 200, 100),
    ];
    expect(findClosedPolygons(lines)).toEqual([]);
  });

  it('ignores construction lines when finding polygons', () => {
    const lines = [
      line(0, 0, 100, 0),
      line(100, 0, 100, 100),
      line(100, 100, 0, 0),
      line(0, 0, 50, 50, true), // construction diagonal
    ];
    const polys = findClosedPolygons(lines);
    expect(polys.length).toBe(1);
    expect(polys[0]).toHaveLength(3);
  });

  it('matches points by coordinates, not object identity', () => {
    const lines = [
      { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { start: { x: 100, y: 0 }, end: { x: 100, y: 100 } },
      { start: { x: 100, y: 100 }, end: { x: 0, y: 0 } },
    ];
    const polys = findClosedPolygons(lines);
    expect(polys.length).toBe(1);
  });
});

describe('computeFilledCellsFromSketch', () => {
  // Cell 10x10 → 100x100 area for a 10x10 grid.
  const cellW = 10, cellH = 10;

  it('returns empty set when there are no lines', () => {
    expect(computeFilledCellsFromSketch([], cellW, cellH).size).toBe(0);
  });

  it('returns empty set for open polylines', () => {
    const lines = [
      line(0, 0, 100, 0),
      line(100, 0, 100, 100),
    ];
    expect(computeFilledCellsFromSketch(lines, cellW, cellH).size).toBe(0);
  });

  it('fills cells fully inside a square', () => {
    // Square from (10,10) to (90,90) → 8x8 interior cells.
    const lines = [
      line(10, 10, 90, 10),
      line(90, 10, 90, 90),
      line(90, 90, 10, 90),
      line(10, 90, 10, 10),
    ];
    const filled = computeFilledCellsFromSketch(lines, cellW, cellH);
    // Cells from col 1..8, row 1..8 → 8*8 = 64 cells.
    expect(filled.size).toBe(64);
    // Spot-check an interior cell (col 5, row 5).
    expect(filled.has('5,5')).toBe(true);
    // Corner cell (0,0) should not be filled.
    expect(filled.has('0,0')).toBe(false);
  });

  it('fills cells on the boundary when 50%+ is inside', () => {
    // Square from (5,5) to (95,95) — boundary runs through the middle of
    // edge cells, so those edge cells are 50% inside and should be filled.
    // The four corner cells (0,0), (9,0), (0,9), (9,9) are only 25% inside
    // and should NOT be filled.
    const lines = [
      line(5, 5, 95, 5),
      line(95, 5, 95, 95),
      line(95, 95, 5, 95),
      line(5, 95, 5, 5),
    ];
    const filled = computeFilledCellsFromSketch(lines, cellW, cellH);
    // 100 total - 4 corner cells at 25% = 96 filled.
    expect(filled.size).toBe(96);
    expect(filled.has('0,0')).toBe(false);   // top-left corner
    expect(filled.has('0,9')).toBe(false);   // top-right corner
    expect(filled.has('9,0')).toBe(false);   // bottom-left corner
    expect(filled.has('9,9')).toBe(false);   // bottom-right corner
    expect(filled.has('0,1')).toBe(true);    // top edge (50% inside)
  });

  it('does not fill cells outside the shape', () => {
    // Small square in the top-left corner: (0,0)-(30,30).
    const lines = [
      line(0, 0, 30, 0),
      line(30, 0, 30, 30),
      line(30, 30, 0, 30),
      line(0, 30, 0, 0),
    ];
    const filled = computeFilledCellsFromSketch(lines, cellW, cellH);
    // A cell in the bottom-right corner should not be filled.
    expect(filled.has('9,9')).toBe(false);
  });

  it('handles a triangle', () => {
    // Triangle: (0,100)-(100,100)-(50,0).
    const lines = [
      line(0, 100, 100, 100),
      line(100, 100, 50, 0),
      line(50, 0, 0, 100),
    ];
    const filled = computeFilledCellsFromSketch(lines, cellW, cellH);
    // The bottom-center cell (col 5, row 9) is inside.
    expect(filled.has('9,5')).toBe(true);
    // The top-left corner (0,0) is outside.
    expect(filled.has('0,0')).toBe(false);
  });

  it('fills both faces of a square split by a diagonal', () => {
    const lines = [
      line(0, 0, 100, 0),
      line(100, 0, 100, 100),
      line(100, 100, 0, 100),
      line(0, 100, 0, 0),
      line(0, 0, 100, 100),
    ];
    const filled = computeFilledCellsFromSketch(lines, cellW, cellH);
    // The whole 10x10 grid should be filled.
    expect(filled.size).toBe(100);
  });

  it('keeps a centered triangle symmetric across the grid', () => {
    const lines = [
      line(0, 0, 40, 0),
      line(40, 0, 20, 40),
      line(20, 40, 0, 0),
    ];
    const filled = computeFilledCellsFromSketch(lines, 10, 10, 0.3);
    expect([...filled].sort()).toEqual([
      '0,0', '0,1', '0,2', '0,3',
      '1,1', '1,2',
      '2,1', '2,2',
    ]);
  });

  it('mirrors cells for a symmetric triangle whose axis is off-grid', () => {
    const lines = [
      line(3, 0, 43, 0),
      line(43, 0, 23, 40),
      line(23, 40, 3, 0),
    ];
    const filled = computeFilledCellsFromSketch(lines, 10, 10, 0.3);
    const rows = new Map();
    for (const key of filled) {
      const [row, column] = key.split(',').map(Number);
      if (!rows.has(row)) rows.set(row, []);
      rows.get(row).push(column);
    }
    for (const columns of rows.values()) {
      expect(columns.sort((a, b) => a - b)).toEqual(columns.slice().sort((a, b) => a - b).reverse().map((column) => {
        const min = Math.min(...columns);
        const max = Math.max(...columns);
        return min + max - column;
      }).sort((a, b) => a - b));
    }
  });

  it('uses exact area for the configured threshold', () => {
    const lines = [
      line(2, 2, 8, 2),
      line(8, 2, 8, 8),
      line(8, 8, 2, 8),
      line(2, 8, 2, 2),
    ];
    expect(computeFilledCellsFromSketch(lines, 10, 10, 0.3).has('0,0')).toBe(true);
    expect(computeFilledCellsFromSketch(lines, 10, 10, 0.6).has('0,0')).toBe(false);
  });

  it('returns empty set for invalid cell dimensions', () => {
    const lines = [
      line(0, 0, 100, 0),
      line(100, 0, 100, 100),
      line(100, 100, 0, 0),
    ];
    expect(computeFilledCellsFromSketch(lines, 0, 10).size).toBe(0);
    expect(computeFilledCellsFromSketch(lines, 10, 0).size).toBe(0);
  });

  it('does not fill from a closed shape made only of construction lines', () => {
    const lines = [
      line(10, 10, 90, 10, true),
      line(90, 10, 90, 90, true),
      line(90, 90, 10, 90, true),
      line(10, 90, 10, 10, true),
    ];
    expect(computeFilledCellsFromSketch(lines, cellW, cellH).size).toBe(0);
  });
});
