import { describe, it, expect } from 'vitest';
import { Store } from '../src/state/store.js';
import { SketchService, SketchTool } from '../src/services/sketch/sketchService.js';
import { ConstraintSubMode } from '../src/services/sketch/constants.js';
import { ConstraintSolver } from '../src/services/sketch/solver/constraintSolver.js';
import { SketchPoint } from '../src/models/sketch/sketchPoint.js';
import { SketchLine } from '../src/models/sketch/sketchLine.js';
import { SketchConstraint } from '../src/models/sketch/sketchConstraint.js';

function makeSolver() {
  return new ConstraintSolver();
}

function makeSketch() {
  const a = new SketchPoint(0, 0, 0);
  const b = new SketchPoint(1, 100, 0);
  const c = new SketchPoint(2, 50, 50);
  const line = new SketchLine(0, a, b);
  return { points: [a, b, c], lines: [line], constraints: [], dimensions: [] };
}

describe('ConstraintSolver midpoint support', () => {
  it('enforces a midpoint constraint by moving the point to the line centre', () => {
    const solver = makeSolver();
    const sketch = makeSketch();
    const [a, b, c] = sketch.points;
    const constraint = new SketchConstraint('Midpoint', c, null, sketch.lines[0], null, 0);
    sketch.constraints.push(constraint);

    solver.enforceMidpointConstraint(sketch, constraint);

    expect(c.x).toBe(50);
    expect(c.y).toBe(0);
    expect(a.x).toBe(0);
    expect(b.x).toBe(100);
  });

  it('moves the midpoint point when a line endpoint is dragged', () => {
    const solver = makeSolver();
    const sketch = makeSketch();
    const [a, b, c] = sketch.points;
    const constraint = new SketchConstraint('Midpoint', c, null, sketch.lines[0], null, 0);
    sketch.constraints.push(constraint);
    solver.enforceMidpointConstraint(sketch, constraint);
    expect(c.x).toBe(50);

    const original = { x: a.x, y: a.y };
    a.x = 50;
    solver.solveConstraintsForPoint(sketch, a, original);

    expect(c.x).toBe(75);
    expect(c.y).toBe(0);
  });

  it('moves the line endpoints when the midpoint point is dragged', () => {
    const solver = makeSolver();
    const sketch = makeSketch();
    const [a, b, c] = sketch.points;
    const constraint = new SketchConstraint('Midpoint', c, null, sketch.lines[0], null, 0);
    sketch.constraints.push(constraint);
    solver.enforceMidpointConstraint(sketch, constraint);

    const original = { x: c.x, y: c.y };
    c.y = 30;
    solver.solveConstraintsForPoint(sketch, c, original);

    expect(a.y).toBe(30);
    expect(b.y).toBe(30);
    expect(c.x).toBe(50);
  });
});

describe('ConstraintTool midpoint creation', () => {
  it('creates a midpoint constraint through line-then-point clicks', () => {
    const store = new Store();
    store.set('sketch.isActive', true);
    const service = new SketchService(store);
    service.activeTool = SketchTool.Line;

    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 100, y: 0 });
    service.onCanvasClick({ x: 100, y: 100 });

    const line = store.state.sketch.lines[0];
    const point = store.state.sketch.points[2];

    service.activeTool = SketchTool.Constraint;
    service.constraintSubMode = ConstraintSubMode.Midpoint;

    service.onConstraintLineClick(line);
    expect(service._constraintPendingLine).toBe(line);

    service.onConstraintPointClick(point);
    expect(store.state.sketch.constraints).toHaveLength(1);
    expect(store.state.sketch.constraints[0].type).toBe('Midpoint');
    expect(point.x).toBe(50);
    expect(point.y).toBe(0);
  });

  it('rejects a midpoint constraint on an endpoint of the same line', () => {
    const store = new Store();
    store.set('sketch.isActive', true);
    const service = new SketchService(store);
    service.activeTool = SketchTool.Line;

    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 100, y: 0 });

    const line = store.state.sketch.lines[0];
    const endpoint = line.start;

    service.activeTool = SketchTool.Constraint;
    service.constraintSubMode = ConstraintSubMode.Midpoint;

    service.onConstraintLineClick(line);
    service.onConstraintPointClick(endpoint);

    expect(store.state.sketch.constraints).toHaveLength(0);
    expect(store.state.sketch.cursorMessage?.text).toBe('Midpoint cannot be an endpoint of the same line');
  });
});

describe('ConstraintSolver line-line midpoint', () => {
  function makeTwoLineSketch() {
    // Line A: (0,0)->(100,0), midpoint (50,0)
    // Line B: (200,50)->(300,50), midpoint (250,50)
    const a1 = new SketchPoint(0, 0, 0);
    const a2 = new SketchPoint(1, 100, 0);
    const b1 = new SketchPoint(2, 200, 50);
    const b2 = new SketchPoint(3, 300, 50);
    const lineA = new SketchLine(0, a1, a2);
    const lineB = new SketchLine(1, b1, b2);
    return { points: [a1, a2, b1, b2], lines: [lineA, lineB], constraints: [], dimensions: [] };
  }

  it('enforces line-line midpoint by translating lineB to lineA midpoint', () => {
    const solver = makeSolver();
    const sketch = makeTwoLineSketch();
    const [a1, a2, b1, b2] = sketch.points;
    const [lineA, lineB] = sketch.lines;
    const constraint = new SketchConstraint('Midpoint', null, null, lineA, lineB, 0);
    sketch.constraints.push(constraint);

    solver.enforceMidpointConstraint(sketch, constraint);

    // lineA stays put; lineB translates so its midpoint == lineA midpoint (50,0)
    const midB = { x: (b1.x + b2.x) / 2, y: (b1.y + b2.y) / 2 };
    expect(midB.x).toBeCloseTo(50);
    expect(midB.y).toBeCloseTo(0);
    // lineB length preserved
    const lenB = Math.hypot(b2.x - b1.x, b2.y - b1.y);
    expect(lenB).toBeCloseTo(100);
  });

  it('moves lineB when a lineA endpoint is dragged', () => {
    const solver = makeSolver();
    const sketch = makeTwoLineSketch();
    const [a1, a2, b1, b2] = sketch.points;
    const [lineA, lineB] = sketch.lines;
    const constraint = new SketchConstraint('Midpoint', null, null, lineA, lineB, 0);
    sketch.constraints.push(constraint);
    solver.enforceMidpointConstraint(sketch, constraint);

    // Drag a1 from (0,0) to (0,40) → lineA midpoint moves to (50,20)
    const original = { x: a1.x, y: a1.y };
    a1.y = 40;
    solver.solveConstraintsForPoint(sketch, a1, original);

    const midA = { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2 };
    const midB = { x: (b1.x + b2.x) / 2, y: (b1.y + b2.y) / 2 };
    expect(midB.x).toBeCloseTo(midA.x);
    expect(midB.y).toBeCloseTo(midA.y);
  });

  it('respects anchored endpoints: anchored lineA wins, lineB moves', () => {
    const solver = makeSolver();
    const sketch = makeTwoLineSketch();
    const [a1, a2, b1, b2] = sketch.points;
    const [lineA, lineB] = sketch.lines;
    a1.isAnchor = true;
    a2.isAnchor = true;
    const constraint = new SketchConstraint('Midpoint', null, null, lineA, lineB, 0);
    sketch.constraints.push(constraint);

    const ok = solver.enforceMidpointConstraint(sketch, constraint);
    expect(ok).toBe(true);

    // lineA unchanged
    expect(a1.x).toBe(0);
    expect(a2.x).toBe(100);
    // lineB moved to lineA midpoint
    const midB = { x: (b1.x + b2.x) / 2, y: (b1.y + b2.y) / 2 };
    expect(midB.x).toBeCloseTo(50);
    expect(midB.y).toBeCloseTo(0);
  });

  it('returns false when both lines are fully anchored', () => {
    const solver = makeSolver();
    const sketch = makeTwoLineSketch();
    const [a1, a2, b1, b2] = sketch.points;
    const [lineA, lineB] = sketch.lines;
    a1.isAnchor = true;
    a2.isAnchor = true;
    b1.isAnchor = true;
    b2.isAnchor = true;
    const constraint = new SketchConstraint('Midpoint', null, null, lineA, lineB, 0);
    sketch.constraints.push(constraint);

    const ok = solver.enforceMidpointConstraint(sketch, constraint);
    expect(ok).toBe(false);
  });
});

describe('ConstraintTool line-line midpoint creation', () => {
  it('creates a line-line midpoint through two line clicks', () => {
    const store = new Store();
    store.set('sketch.isActive', true);
    const service = new SketchService(store);
    service.activeTool = SketchTool.Line;

    // Line A: (0,0)->(100,0)
    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 100, y: 0 });
    // Break the polyline chain so Line B is disjoint.
    service.cancelCurrentLine();

    // Line B: (200,50)->(300,50)
    service.onCanvasClick({ x: 200, y: 50 });
    service.onCanvasClick({ x: 300, y: 50 });

    const [lineA, lineB] = store.state.sketch.lines;

    service.activeTool = SketchTool.Constraint;
    service.constraintSubMode = ConstraintSubMode.Midpoint;

    service.onConstraintLineClick(lineA);
    expect(service._constraintPendingLine).toBe(lineA);

    service.onConstraintLineClick(lineB);

    const constraints = store.state.sketch.constraints;
    expect(constraints).toHaveLength(1);
    expect(constraints[0].type).toBe('Midpoint');
    expect(constraints[0].pointA).toBeNull();
    expect(constraints[0].lineA).toBe(lineA);
    expect(constraints[0].lineB).toBe(lineB);

    // lineB midpoint should now coincide with lineA midpoint (50,0)
    const b1 = lineB.start, b2 = lineB.end;
    const midB = { x: (b1.x + b2.x) / 2, y: (b1.y + b2.y) / 2 };
    expect(midB.x).toBeCloseTo(50);
    expect(midB.y).toBeCloseTo(0);
  });

  it('clicking the same line twice in midpoint mode cancels the selection', () => {
    const store = new Store();
    store.set('sketch.isActive', true);
    const service = new SketchService(store);
    service.activeTool = SketchTool.Line;

    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 100, y: 0 });

    const line = store.state.sketch.lines[0];

    service.activeTool = SketchTool.Constraint;
    service.constraintSubMode = ConstraintSubMode.Midpoint;

    service.onConstraintLineClick(line);
    service.onConstraintLineClick(line);

    expect(store.state.sketch.constraints).toHaveLength(0);
    expect(service._constraintPendingLine).toBeNull();
  });
});
