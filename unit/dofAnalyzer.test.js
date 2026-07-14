import { describe, it, expect } from 'vitest';
import { analyzeDof, wouldOverconstrain } from '../src/services/sketch/solver/dofAnalyzer.js';
import { SketchPoint } from '../src/models/sketch/sketchPoint.js';
import { SketchLine } from '../src/models/sketch/sketchLine.js';
import { SketchDimension } from '../src/models/sketch/sketchDimension.js';
import { SketchConstraint } from '../src/models/sketch/sketchConstraint.js';

function makeSketch(points = [], lines = [], constraints = [], dimensions = []) {
  return { points, lines, constraints, dimensions };
}

describe('analyzeDof (Jacobian rank)', () => {
  it('reports 2 DOF for a single free point', () => {
    const p = new SketchPoint(0, 0, 0);
    const sketch = makeSketch([p]);
    const result = analyzeDof(sketch);
    expect(result.dof).toBe(2);
    expect(result.status).toBe('under');
  });

  it('reports 0 DOF for a single anchored point', () => {
    const p = new SketchPoint(0, 0, 0);
    p.isAnchor = true;
    const sketch = makeSketch([p]);
    const result = analyzeDof(sketch);
    expect(result.dof).toBe(0);
    expect(result.status).toBe('well');
  });

  it('reports 4 DOF for two free points connected by a line', () => {
    const a = new SketchPoint(0, 0, 0);
    const b = new SketchPoint(1, 100, 0);
    const line = new SketchLine(0, a, b);
    const sketch = makeSketch([a, b], [line]);
    const result = analyzeDof(sketch);
    expect(result.dof).toBe(4);
    expect(result.status).toBe('under');
  });

  it('reports 2 DOF for two points + line + one anchor', () => {
    const a = new SketchPoint(0, 0, 0);
    const b = new SketchPoint(1, 100, 0);
    const line = new SketchLine(0, a, b);
    const sketch = makeSketch([a, b], [line]);
    const result = analyzeDof(sketch);
    expect(result.dof).toBe(4);
    expect(result.status).toBe('under');
  });

  it('reports 2 DOF for two points + line + one anchor', () => {
    const a = new SketchPoint(0, 0, 0);
    a.isAnchor = true;
    const b = new SketchPoint(1, 100, 0);
    const line = new SketchLine(0, a, b);
    const sketch = makeSketch([a, b], [line]);
    const result = analyzeDof(sketch);
    expect(result.dof).toBe(2);
    expect(result.status).toBe('under');
  });

  it('reports 1 DOF after adding a Horizontal constraint to a line with one anchor', () => {
    const a = new SketchPoint(0, 0, 0);
    a.isAnchor = true;
    const b = new SketchPoint(1, 100, 50);
    const line = new SketchLine(0, a, b);
    const h = new SketchConstraint('Horizontal', null, null, line, null, 0);
    const sketch = makeSketch([a, b], [line], [h]);
    const result = analyzeDof(sketch);
    expect(result.dof).toBe(1);
    expect(result.status).toBe('under');
  });

  it('reports 0 DOF (well-constrained) for anchored line + H + V', () => {
    const a = new SketchPoint(0, 0, 0);
    a.isAnchor = true;
    const b = new SketchPoint(1, 100, 50);
    const line = new SketchLine(0, a, b);
    const h = new SketchConstraint('Horizontal', null, null, line, null, 0);
    const v = new SketchConstraint('Vertical', null, null, line, null, 1);
    const sketch = makeSketch([a, b], [line], [h, v]);
    const result = analyzeDof(sketch);
    expect(result.dof).toBe(0);
    expect(result.status).toBe('well');
  });

  it('reports over-constrained for anchored line + H + V + dimension (redundant)', () => {
    const a = new SketchPoint(0, 0, 0);
    a.isAnchor = true;
    const b = new SketchPoint(1, 100, 0);
    const line = new SketchLine(0, a, b);
    const h = new SketchConstraint('Horizontal', null, null, line, null, 0);
    const v = new SketchConstraint('Vertical', null, null, line, null, 1);
    const dim = new SketchDimension(0, a, b, -1);
    dim.setDrivenValue(100);
    const sketch = makeSketch([a, b], [line], [h, v], [dim]);
    const result = analyzeDof(sketch);
    // nParams=2 (b.x, b.y), rank=2 (H + V are independent), nConstraints=3
    // nRedundant = 3 - 2 = 1 → over-constrained
    expect(result.dof).toBe(0);
    expect(result.nRedundant).toBe(1);
    expect(result.status).toBe('over');
  });

  it('merges coincident points into one group (2 DOF for 2 merged points)', () => {
    const a = new SketchPoint(0, 0, 0);
    const b = new SketchPoint(1, 0, 0);
    const c = new SketchPoint(2, 100, 0);
    const line1 = new SketchLine(0, a, c);
    const line2 = new SketchLine(1, b, c);
    const coincident = new SketchConstraint('Coincident', a, b, null, null, 0);
    const sketch = makeSketch([a, b, c], [line1, line2], [coincident]);
    const result = analyzeDof(sketch);
    // 3 points, 1 coincident → 2 groups → 4 DOF, no anchors
    expect(result.dof).toBe(4);
    expect(result.status).toBe('under');
  });

  it('handles disconnected components independently', () => {
    const a = new SketchPoint(0, 0, 0);
    a.isAnchor = true;
    const b = new SketchPoint(1, 100, 0);
    const line1 = new SketchLine(0, a, b);
    const h = new SketchConstraint('Horizontal', null, null, line1, null, 0);
    const v = new SketchConstraint('Vertical', null, null, line1, null, 1);

    const c = new SketchPoint(2, 200, 0);
    const d = new SketchPoint(3, 300, 50);
    const line2 = new SketchLine(1, c, d);

    const sketch = makeSketch([a, b, c, d], [line1, line2], [h, v]);
    const result = analyzeDof(sketch);
    // Component 1: 2 points, 1 anchor, H+V → 0 DOF
    // Component 2: 2 points, no anchor → 4 DOF
    expect(result.dof).toBe(4);
    expect(result.status).toBe('under');
  });

  it('reports over-constrained when one component is over', () => {
    const a = new SketchPoint(0, 0, 0);
    a.isAnchor = true;
    const b = new SketchPoint(1, 100, 0);
    const line = new SketchLine(0, a, b);
    const h = new SketchConstraint('Horizontal', null, null, line, null, 0);
    const v = new SketchConstraint('Vertical', null, null, line, null, 1);
    const dim = new SketchDimension(0, a, b, -1);
    dim.setDrivenValue(100);

    const c = new SketchPoint(2, 200, 0);
    const d = new SketchPoint(3, 300, 50);
    const line2 = new SketchLine(1, c, d);

    const sketch = makeSketch([a, b, c, d], [line, line2], [h, v], [dim]);
    const result = analyzeDof(sketch);
    expect(result.status).toBe('over');
  });

  it('detects redundant Horizontal on an already-horizontal line with H+V+anchor', () => {
    // Line is anchored + H + V (0 DOF). Adding another H is redundant → over.
    const a = new SketchPoint(0, 0, 0);
    a.isAnchor = true;
    const b = new SketchPoint(1, 100, 0);
    const line = new SketchLine(0, a, b);
    const h = new SketchConstraint('Horizontal', null, null, line, null, 0);
    const v = new SketchConstraint('Vertical', null, null, line, null, 1);
    const h2 = new SketchConstraint('Horizontal', null, null, line, null, 2);
    const sketch = makeSketch([a, b], [line], [h, v, h2]);
    const result = analyzeDof(sketch);
    expect(result.status).toBe('over');
  });
});

describe('wouldOverconstrain (Jacobian rank)', () => {
  it('returns false for a Horizontal on a free line', () => {
    const a = new SketchPoint(0, 0, 0);
    const b = new SketchPoint(1, 100, 50);
    const line = new SketchLine(0, a, b);
    const sketch = makeSketch([a, b], [line]);

    const result = wouldOverconstrain(sketch, { type: 'Horizontal', lineA: line });
    expect(result.wouldOverconstrain).toBe(false);
  });

  it('returns true for a dimension on a line that already has H+V with anchor', () => {
    const a = new SketchPoint(0, 0, 0);
    a.isAnchor = true;
    const b = new SketchPoint(1, 100, 0);
    const line = new SketchLine(0, a, b);
    const h = new SketchConstraint('Horizontal', null, null, line, null, 0);
    const v = new SketchConstraint('Vertical', null, null, line, null, 1);
    const sketch = makeSketch([a, b], [line], [h, v]);

    const dim = { isDimension: true, pointA: a, pointB: b };
    const result = wouldOverconstrain(sketch, dim);
    expect(result.wouldOverconstrain).toBe(true);
  });

  it('returns false for a dimension on a line with only H constraint and anchor', () => {
    const a = new SketchPoint(0, 0, 0);
    a.isAnchor = true;
    const b = new SketchPoint(1, 100, 50);
    const line = new SketchLine(0, a, b);
    const h = new SketchConstraint('Horizontal', null, null, line, null, 0);
    const sketch = makeSketch([a, b], [line], [h]);

    const dim = { isDimension: true, pointA: a, pointB: b };
    const result = wouldOverconstrain(sketch, dim);
    expect(result.wouldOverconstrain).toBe(false);
  });

  it('returns false for Perpendicular on a triangle with no other constraints', () => {
    const a = new SketchPoint(0, 0, 0);
    const b = new SketchPoint(1, 100, 0);
    const c = new SketchPoint(2, 50, 80);
    const line1 = new SketchLine(0, a, b);
    const line2 = new SketchLine(1, b, c);
    const line3 = new SketchLine(2, c, a);
    const sketch = makeSketch([a, b, c], [line1, line2, line3]);

    const result = wouldOverconstrain(sketch, { type: 'Perpendicular', lineA: line1, lineB: line2 });
    expect(result.wouldOverconstrain).toBe(false);
  });

  it('returns true for Equal constraint that would over-constrain two anchored lines', () => {
    const a = new SketchPoint(0, 0, 0);
    a.isAnchor = true;
    const b = new SketchPoint(1, 100, 0);
    const c = new SketchPoint(2, 0, 50);
    c.isAnchor = true;
    const d = new SketchPoint(3, 100, 50);
    const line1 = new SketchLine(0, a, b);
    const line2 = new SketchLine(1, c, d);
    const h1 = new SketchConstraint('Horizontal', null, null, line1, null, 0);
    const v1 = new SketchConstraint('Vertical', null, null, line1, null, 1);
    const h2 = new SketchConstraint('Horizontal', null, null, line2, null, 2);
    const v2 = new SketchConstraint('Vertical', null, null, line2, null, 3);
    const sketch = makeSketch([a, b, c, d], [line1, line2], [h1, v1, h2, v2]);

    const result = wouldOverconstrain(sketch, { type: 'Equal', lineA: line1, lineB: line2 });
    expect(result.wouldOverconstrain).toBe(true);
  });

  it('returns false for Midpoint on a free point and line', () => {
    const a = new SketchPoint(0, 0, 0);
    const b = new SketchPoint(1, 100, 0);
    const c = new SketchPoint(2, 50, 80);
    const line = new SketchLine(0, a, b);
    const sketch = makeSketch([a, b, c], [line]);

    const result = wouldOverconstrain(sketch, { type: 'Midpoint', pointA: c, lineA: line });
    expect(result.wouldOverconstrain).toBe(false);
  });

  it('returns true for a redundant Horizontal on a line that already has H+V+anchor', () => {
    const a = new SketchPoint(0, 0, 0);
    a.isAnchor = true;
    const b = new SketchPoint(1, 100, 0);
    const line = new SketchLine(0, a, b);
    const h = new SketchConstraint('Horizontal', null, null, line, null, 0);
    const v = new SketchConstraint('Vertical', null, null, line, null, 1);
    const sketch = makeSketch([a, b], [line], [h, v]);

    const result = wouldOverconstrain(sketch, { type: 'Horizontal', lineA: line });
    expect(result.wouldOverconstrain).toBe(true);
  });

  it('returns true for a duplicate dimension on the same pair of points', () => {
    const a = new SketchPoint(0, 0, 0);
    a.isAnchor = true;
    const b = new SketchPoint(1, 100, 0);
    const line = new SketchLine(0, a, b);
    const dim1 = new SketchDimension(0, a, b, -1);
    dim1.setDrivenValue(100);
    const sketch = makeSketch([a, b], [line], [], [dim1]);

    const result = wouldOverconstrain(sketch, { isDimension: true, pointA: a, pointB: b });
    expect(result.wouldOverconstrain).toBe(true);
  });
});
