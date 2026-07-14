import { describe, it, expect } from 'vitest';
import { Store } from '../src/state/store.js';
import { SketchService, SketchTool } from '../src/services/sketch/sketchService.js';
import { ConstraintSubMode } from '../src/services/sketch/constants.js';

function makeService() {
  const store = new Store();
  store.set('sketch.isActive', true);
  const service = new SketchService(store);
  service.activeTool = SketchTool.Line;
  return { store, service };
}

describe('H/V constraint (auto-detect)', () => {
  it('makes a near-horizontal line horizontal', () => {
    const { service, store } = makeService();
    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 60, y: 20 });
    const line = store.state.sketch.lines[0];
    expect(line.end.y).not.toBe(line.start.y);

    service.activeTool = SketchTool.Constraint;
    service.constraintSubMode = ConstraintSubMode.HorizontalVertical;
    service.onConstraintLineClick(line);

    expect(store.state.sketch.constraints).toHaveLength(1);
    expect(store.state.sketch.constraints[0].type).toBe('Horizontal');
    expect(line.start.y).toBeCloseTo(line.end.y, 5);
  });

  it('makes a near-vertical line vertical', () => {
    const { service, store } = makeService();
    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 20, y: 60 });
    const line = store.state.sketch.lines[0];
    expect(line.end.x).not.toBe(line.start.x);

    service.activeTool = SketchTool.Constraint;
    service.constraintSubMode = ConstraintSubMode.HorizontalVertical;
    service.onConstraintLineClick(line);

    expect(store.state.sketch.constraints).toHaveLength(1);
    expect(store.state.sketch.constraints[0].type).toBe('Vertical');
    expect(line.start.x).toBeCloseTo(line.end.x, 5);
  });

  it('does not duplicate an axis constraint on the same line', () => {
    const { service, store } = makeService();
    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 60, y: 20 });
    const line = store.state.sketch.lines[0];

    service.activeTool = SketchTool.Constraint;
    service.constraintSubMode = ConstraintSubMode.HorizontalVertical;
    service.onConstraintLineClick(line);
    service.onConstraintLineClick(line);

    expect(store.state.sketch.constraints).toHaveLength(1);
  });
});
