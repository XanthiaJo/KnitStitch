import { describe, it, expect } from 'vitest';
import { SketchBezier, flattenBezier } from '../src/models/sketch/sketchBezier.js';

describe('flattenBezier', () => {
  it('produces the requested number of segments', () => {
    const b = new SketchBezier(0, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 });
    const segs = flattenBezier(b, 24);
    expect(segs).toHaveLength(24);
  });

  it('start and end match the curve endpoints', () => {
    const b = new SketchBezier(0, { x: 0, y: 0 }, { x: 5, y: 10 }, { x: 15, y: 10 }, { x: 20, y: 0 });
    const segs = flattenBezier(b, 16);
    expect(segs[0].start.x).toBeCloseTo(0);
    expect(segs[0].start.y).toBeCloseTo(0);
    expect(segs[segs.length - 1].end.x).toBeCloseTo(20);
    expect(segs[segs.length - 1].end.y).toBeCloseTo(0);
  });

  it('flattens a straight-line Bézier into collinear points', () => {
    const b = new SketchBezier(0, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 });
    const segs = flattenBezier(b, 10);
    for (const s of segs) {
      expect(s.start.y).toBeCloseTo(0);
      expect(s.end.y).toBeCloseTo(0);
    }
  });

  it('produces segments with isConstruction=false', () => {
    const b = new SketchBezier(0, { x: 0, y: 0 }, { x: 5, y: 5 }, { x: 15, y: 5 }, { x: 20, y: 0 });
    const segs = flattenBezier(b, 5);
    for (const s of segs) {
      expect(s.isConstruction).toBe(false);
    }
  });
});
