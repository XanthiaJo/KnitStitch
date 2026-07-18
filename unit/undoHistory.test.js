import { describe, it, expect } from 'vitest';
import { Store } from '../src/state/store.js';
import { SketchService, SketchTool } from '../src/services/sketch/sketchService.js';
import { ConstraintSubMode } from '../src/services/sketch/constants.js';

function makeService() {
  const store = new Store();
  store.set('sketch.isActive', true);
  const service = new SketchService(store);
  // Unit tests run in Node where the WASM solver cannot load, so provide a
  // ready stub so constraint/dimension paths don't reject.
  service._slvsAdapter = {
    ready: true,
    wouldOverconstrain: () => ({ wouldOverconstrain: false }),
    solveAndWriteBack: () => ({ result: 0 }),
  };
  service.activeTool = SketchTool.Line;
  return { store, service };
}

describe('Undo history', () => {
  it('undoes line drawing one click at a time', () => {
    const { service, store } = makeService();
    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 50, y: 0 });
    service.onCanvasClick({ x: 100, y: 0 });

    expect(store.state.sketch.lines).toHaveLength(2);
    expect(store.state.sketch.points).toHaveLength(3);

    // Undo the last click — removes the second line and restores the pending start
    service.undo();
    expect(store.state.sketch.lines).toHaveLength(1);
    expect(store.state.sketch.points).toHaveLength(2);
    expect(service._pendingStart?.x).toBe(50);

    // Undo again — removes the first line and the second point
    service.undo();
    expect(store.state.sketch.lines).toHaveLength(0);
    expect(store.state.sketch.points).toHaveLength(1);
    expect(service._pendingStart?.x).toBe(0);

    // Undo once more — cancels the pending start
    service.undo();
    expect(store.state.sketch.points).toHaveLength(0);
    expect(service._pendingStart).toBeNull();
    expect(store.state.sketch.previewLine).toBeNull();
  });

  it('undoes adding a dimension', () => {
    const { service, store } = makeService();
    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 60, y: 0 });
    expect(store.state.sketch.dimensions).toHaveLength(0);

    service.activeTool = SketchTool.Dimension;
    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 60, y: 0 });
    expect(store.state.sketch.dimensions).toHaveLength(1);

    service.undo();
    expect(store.state.sketch.dimensions).toHaveLength(0);
    expect(store.state.sketch.lines).toHaveLength(1);
    expect(store.state.sketch.points).toHaveLength(2);
  });

  it('undoes adding a perpendicular constraint', () => {
    const { service, store } = makeService();
    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 50, y: 0 });
    service.onCanvasClick({ x: 50, y: 50 });
    expect(store.state.sketch.lines).toHaveLength(2);

    service.activeTool = SketchTool.Constraint;
    service.constraintSubMode = ConstraintSubMode.Perpendicular;
    service.onConstraintLineClick(store.state.sketch.lines[0]);
    service.onConstraintLineClick(store.state.sketch.lines[1]);
    expect(store.state.sketch.constraints).toHaveLength(1);

    service.undo();
    expect(store.state.sketch.constraints).toHaveLength(0);
    expect(store.state.sketch.lines).toHaveLength(2);
  });

  it('undoes deleting a selected line', () => {
    const { service, store } = makeService();
    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 50, y: 0 });
    expect(store.state.sketch.lines).toHaveLength(1);

    service.activeTool = SketchTool.Select;
    service.selectLine(store.state.sketch.lines[0]);
    service.deleteSelected();
    expect(store.state.sketch.lines).toHaveLength(0);

    service.undo();
    expect(store.state.sketch.lines).toHaveLength(1);
    expect(store.state.sketch.points).toHaveLength(2);
  });

  it('undoes moving a point', () => {
    const { service, store } = makeService();
    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 50, y: 0 });
    const originalX = store.state.sketch.points[0].x;

    service.activeTool = SketchTool.Select;
    service.onCanvasMouseDown({ x: 0, y: 0 });
    service.onCanvasMouseMove({ x: 20, y: 0 });
    service.onCanvasMouseUp();

    expect(store.state.sketch.points[0].x).toBe(20);

    service.undo();
    expect(store.state.sketch.points[0].x).toBe(originalX);
  });

  it('undoes clearing the sketch', () => {
    const { service, store } = makeService();
    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 50, y: 0 });
    expect(store.state.sketch.lines).toHaveLength(1);

    service.clear();
    expect(store.state.sketch.lines).toHaveLength(0);
    expect(store.state.sketch.points).toHaveLength(0);

    service.undo();
    expect(store.state.sketch.lines).toHaveLength(1);
    expect(store.state.sketch.points).toHaveLength(2);
  });
});
