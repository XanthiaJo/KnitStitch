import { describe, it, expect } from 'vitest';
import { GlobalConstraintSolver } from '../src/services/sketch/solver/globalConstraintSolver.js';
import { SketchPoint } from '../src/models/sketch/sketchPoint.js';
import { SketchLine } from '../src/models/sketch/sketchLine.js';
import { SketchDimension } from '../src/models/sketch/sketchDimension.js';
import { SketchConstraint } from '../src/models/sketch/sketchConstraint.js';
import { Store } from '../src/state/store.js';
import { SketchService } from '../src/services/sketch/sketchService.js';

describe('GlobalConstraintSolver driven dimensions', () => {
  it('restores a horizontal driven dimension after dragging its endpoint', () => {
    const solver = new GlobalConstraintSolver();
    const a = new SketchPoint(0, 0, 0);
    const b = new SketchPoint(1, 100, 0);
    const line = new SketchLine(0, a, b);
    const dim = new SketchDimension(0, a, b, -1);
    dim.setDrivenValue(100);

    const sketch = {
      points: [a, b],
      lines: [line],
      dimensions: [dim],
      constraints: [],
    };

    // Drag point b far to the right.
    b.x = 300;
    const result = solver.solve(sketch, new Set([b]));

    expect(result).not.toBeNull();
    const actual = Math.hypot(b.x - a.x, b.y - a.y);
    expect(actual).toBeCloseTo(100, 5);
  });

  it('restores a vertical driven dimension after dragging its endpoint', () => {
    const solver = new GlobalConstraintSolver();
    const a = new SketchPoint(0, 0, 0);
    const b = new SketchPoint(1, 0, 100);
    const line = new SketchLine(0, a, b);
    const dim = new SketchDimension(0, a, b, -1);
    dim.setDrivenValue(100);

    const sketch = {
      points: [a, b],
      lines: [line],
      dimensions: [dim],
      constraints: [],
    };

    // Drag point b far down.
    b.y = 300;
    const result = solver.solve(sketch, new Set([b]));

    expect(result).not.toBeNull();
    const actual = Math.hypot(b.x - a.x, b.y - a.y);
    expect(actual).toBeCloseTo(100, 5);
  });

  it('keeps a driven dimension locked when a chain of points is dragged', () => {
    const solver = new GlobalConstraintSolver();
    // Three collinear horizontal points: a -- b -- c
    const a = new SketchPoint(0, 0, 0);
    const b = new SketchPoint(1, 100, 0);
    const c = new SketchPoint(2, 250, 0);
    const lineAB = new SketchLine(0, a, b);
    const lineBC = new SketchLine(1, b, c);
    const dimAB = new SketchDimension(0, a, b, -1);
    dimAB.setDrivenValue(100);
    const dimBC = new SketchDimension(1, b, c, -1);
    dimBC.setDrivenValue(150);

    const sketch = {
      points: [a, b, c],
      lines: [lineAB, lineBC],
      dimensions: [dimAB, dimBC],
      constraints: [],
    };

    // Drag the middle point b.
    b.x = 500;
    const result = solver.solve(sketch, new Set([b]));

    expect(result).not.toBeNull();
    const lengthAB = Math.hypot(b.x - a.x, b.y - a.y);
    const lengthBC = Math.hypot(c.x - b.x, c.y - b.y);
    expect(lengthAB).toBeCloseTo(100, 5);
    expect(lengthBC).toBeCloseTo(150, 5);
  });

  it('positions the sock template top-left at the origin', () => {
    const store = new Store();
    store.set('sketch.isActive', true);
    const service = new SketchService(store);
    service.applyTemplate('sock');

    const p0 = store.state.sketch.points[0];
    expect(p0.x).toBeCloseTo(0, 5);
    expect(p0.y).toBeCloseTo(0, 5);
  });

  it('keeps a vertical constraint enforced after dragging the free endpoint', () => {
    const solver = new GlobalConstraintSolver();
    const a = new SketchPoint(0, 0, 0);
    a.isAnchor = true;
    const b = new SketchPoint(1, 50, 100);
    const line = new SketchLine(0, a, b);
    const constraint = new SketchConstraint('Vertical', a, b, line, null, 0);

    const sketch = {
      points: [a, b],
      lines: [line],
      dimensions: [],
      constraints: [constraint],
    };

    b.x = 200;
    b.y = 300;
    const result = solver.solve(sketch, new Set([b]));

    expect(result).not.toBeNull();
    expect(b.x).toBeCloseTo(a.x, 5);
  });

  it('keeps all sock template dimensions locked when dragging outline points', () => {
    const solver = new GlobalConstraintSolver();

    // Drag a representative set of outline points. The most problematic cases
    // are points whose adjacent dimensions share a driven endpoint (e.g. 18) and
    // left-side notch points (e.g. 3, 6) that previously allowed the outline to
    // deform while dimensions stayed locked.
    for (const idx of [0, 3, 6, 10, 13, 16, 18, 19]) {
      const store = new Store();
      store.set('sketch.isActive', true);
      const service = new SketchService(store);
      service.applyTemplate('sock');
      const sketch = store.state.sketch;

      const p = sketch.points[idx];
      p.x += 80;
      p.y += 60;

      const result = solver.solve(sketch, new Set([p]));
      expect(result).not.toBeNull();

      let maxError = 0;
      let worstDim = null;
      for (const dim of sketch.dimensions) {
        if (!dim.isConstrained) continue;
        const dx = dim.b.x - dim.a.x;
        const dy = dim.b.y - dim.a.y;
        const actual = dim.kind === 'Horizontal' ? Math.abs(dx)
          : dim.kind === 'Vertical' ? Math.abs(dy)
          : Math.hypot(dx, dy);
        const err = Math.abs(actual - dim.drivenValue);
        if (err > maxError) {
          maxError = err;
          worstDim = dim;
        }
      }
      if (maxError >= 1) {
        console.log('drag idx', idx, 'maxError', maxError, 'dim', worstDim?.kind, 'a', worstDim?.a?.id, 'b', worstDim?.b?.id, 'target', worstDim?.drivenValue);
      }
      expect(maxError).toBeLessThan(1);
    }
  });
});
