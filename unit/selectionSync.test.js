import { describe, it, expect } from 'vitest';
import { Store } from '../src/state/store.js';
import { SketchService, SketchTool } from '../src/services/sketch/sketchService.js';

function makeService() {
  const store = new Store();
  store.set('sketch.isActive', true);
  const service = new SketchService(store);
  service.activeTool = SketchTool.Line;
  return { store, service };
}

describe('List/canvas selection sync', () => {
  it('selects a line from the object list and marks it selected in the store', () => {
    const { service, store } = makeService();
    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 50, y: 20 });

    const line = store.state.sketch.lines[0];
    expect(line.isSelected).toBe(false);

    service.selectObjectByRef('line', line.id);

    expect(line.isSelected).toBe(true);
    expect(store.state.sketch.objects.find((o) => o.refType === 'line' && o.refId === line.id).isSelected).toBe(true);
  });

  it('selects an anchor point from the object list and marks it selected in the store', () => {
    const { service, store } = makeService();
    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 50, y: 20 });

    const point = store.state.sketch.points[0];
    point.isAnchor = true;
    service.store.set('sketch.points', [...store.state.sketch.points]);

    expect(point.isSelected).toBe(false);

    service.selectObjectByRef('point', point.id);

    expect(point.isSelected).toBe(true);
    expect(store.state.sketch.objects.find((o) => o.refType === 'point' && o.refId === point.id).isSelected).toBe(true);
  });

  it('highlights a regular point in the object list after selecting it on the canvas', () => {
    const { service, store } = makeService();
    service.onCanvasClick({ x: 0, y: 0 });
    service.onCanvasClick({ x: 50, y: 20 });

    const point = store.state.sketch.points[0];
    expect(point.isSelected).toBe(false);
    expect(store.state.sketch.objects.some((o) => o.refType === 'point' && o.refId === point.id)).toBe(true);

    service.selectPoint(point);

    expect(point.isSelected).toBe(true);
    expect(store.state.sketch.objects.find((o) => o.refType === 'point' && o.refId === point.id).isSelected).toBe(true);
  });
});
