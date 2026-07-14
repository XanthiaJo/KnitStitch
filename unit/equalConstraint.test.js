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
  const c = new SketchPoint(2, 200, 0);
  const d = new SketchPoint(3, 200, 50);
  const lineA = new SketchLine(0, a, b);
  const lineB = new SketchLine(1, c, d);
  return {
    points: [a, b, c, d],
    lines: [lineA, lineB],
    constraints: [],
    dimensions: [],
  };
}

describe('ConstraintSolver equal support', () => {
  it('scales the second line to match the first when created', () => {
    const solver = makeSolver();
    const sketch = makeSketch();
    const [lineA, lineB] = sketch.lines;
    const constraint = new SketchConstraint('Equal', null, null, lineA, lineB, 0);
    sketch.constraints.push(constraint);

    solver.enforceEqualConstraint(sketch, constraint, lineB);

    const lengthA = Math.hypot(lineA.end.x - lineA.start.x, lineA.end.y - lineA.start.y);
    const lengthB = Math.hypot(lineB.end.x - lineB.start.x, lineB.end.y - lineB.start.y);
    expect(lengthB).toBeCloseTo(lengthA, 5);
    // The midpoint of lineB should be preserved
    const midX = (lineB.start.x + lineB.end.x) / 2;
    const midY = (lineB.start.y + lineB.end.y) / 2;
    expect(midX).toBe(200);
    expect(midY).toBe(25);
  });

  it('propagates equal length when a line endpoint is dragged', () => {
    const solver = makeSolver();
    const sketch = makeSketch();
    const [lineA, lineB] = sketch.lines;
    const constraint = new SketchConstraint('Equal', null, null, lineA, lineB, 0);
    sketch.constraints.push(constraint);
    solver.enforceEqualConstraint(sketch, constraint, lineB);

    const originalLengthB = Math.hypot(lineB.end.x - lineB.start.x, lineB.end.y - lineB.start.y);
    const originalA = { x: lineA.end.x, y: lineA.end.y };

    // Double lineA's length by moving its end point
    lineA.end.x = 200;
    solver.solveConstraintsForPoint(sketch, lineA.end, originalA);

    const lengthA = Math.hypot(lineA.end.x - lineA.start.x, lineA.end.y - lineA.start.y);
    const lengthB = Math.hypot(lineB.end.x - lineB.start.x, lineB.end.y - lineB.start.y);
    expect(lengthA).toBeCloseTo(200, 5);
    expect(lengthB).toBeCloseTo(lengthA, 5);
    expect(lengthB).not.toBeCloseTo(originalLengthB, 5);
  });
});

describe('ConstraintTool equal creation', () => {
  it('creates an equal constraint between two lines', () => {
    const store = new Store();
    store.set('sketch.isActive', true);
    const service = new SketchService(store);
    service.activeTool = SketchTool.Line;

    // Draw two horizontal lines: 0,0->100,0 and 200,0->200,50
    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 100, y: 0 });
    service.onCanvasClick({ x: 200, y: 0 });
    service.onCanvasClick({ x: 200, y: 50 });

    const lineA = store.state.sketch.lines[0];
    const lineB = store.state.sketch.lines[1];

    service.activeTool = SketchTool.Constraint;
    service.constraintSubMode = ConstraintSubMode.Equal;

    service.onConstraintLineClick(lineA);
    service.onConstraintLineClick(lineB);

    expect(store.state.sketch.constraints).toHaveLength(1);
    const constraint = store.state.sketch.constraints[0];
    expect(constraint.type).toBe('Equal');
    expect(constraint.lineA).toBe(lineA);
    expect(constraint.lineB).toBe(lineB);

    const lengthA = Math.hypot(lineA.end.x - lineA.start.x, lineA.end.y - lineA.start.y);
    const lengthB = Math.hypot(lineB.end.x - lineB.start.x, lineB.end.y - lineB.start.y);
    expect(lengthB).toBeCloseTo(lengthA, 5);
  });

  it('rejects an equal constraint on the same line', () => {
    const store = new Store();
    store.set('sketch.isActive', true);
    const service = new SketchService(store);
    service.activeTool = SketchTool.Line;

    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 100, y: 0 });

    const line = store.state.sketch.lines[0];

    service.activeTool = SketchTool.Constraint;
    service.constraintSubMode = ConstraintSubMode.Equal;

    service.onConstraintLineClick(line);
    service.onConstraintLineClick(line);

    expect(store.state.sketch.constraints).toHaveLength(0);
    expect(store.state.sketch.cursorMessage?.text).toBe('Cannot constrain a line to itself');
  });

  it('undoes an equal constraint', () => {
    const store = new Store();
    store.set('sketch.isActive', true);
    const service = new SketchService(store);
    service.activeTool = SketchTool.Line;

    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 100, y: 0 });
    service.onCanvasClick({ x: 200, y: 0 });
    service.onCanvasClick({ x: 200, y: 50 });

    const lineA = store.state.sketch.lines[0];
    const lineB = store.state.sketch.lines[1];

    service.activeTool = SketchTool.Constraint;
    service.constraintSubMode = ConstraintSubMode.Equal;

    service.onConstraintLineClick(lineA);
    service.onConstraintLineClick(lineB);
    expect(store.state.sketch.constraints).toHaveLength(1);
    const originalLengthB = Math.hypot(lineB.end.x - lineB.start.x, lineB.end.y - lineB.start.y);

    service.undo();
    expect(store.state.sketch.constraints).toHaveLength(0);
    const restoredLengthB = Math.hypot(lineB.end.x - lineB.start.x, lineB.end.y - lineB.start.y);
    expect(restoredLengthB).toBeCloseTo(originalLengthB, 5);
  });
});
