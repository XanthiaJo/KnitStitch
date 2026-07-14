import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Store } from '../src/state/store.js';
import { StorePersistence } from '../src/state/storePersistence.js';
import { SketchService, SketchTool } from '../src/services/sketch/sketchService.js';

describe('StorePersistence', () => {
  let originalLocalStorage;
  let backing;

  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage;
    backing = {};
    globalThis.localStorage = {
      getItem: (key) => (key in backing ? backing[key] : null),
      setItem: (key, value) => {
        backing[key] = String(value);
      },
      removeItem: (key) => {
        delete backing[key];
      },
    };
  });

  afterEach(() => {
    if (originalLocalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = originalLocalStorage;
    }
  });

  it('rehydrates sketch references so loaded points still drive their lines and dimensions', () => {
    const payload = {
      sketch: {
        strokeColor: '#E63946',
        strokeThickness: 2,
        points: [
          { id: 0, x: 0, y: 0, isSelected: false },
          { id: 1, x: 100, y: 0, isSelected: false },
        ],
        lines: [
          {
            id: 0,
            start: { id: 0, x: 0, y: 0 },
            end: { id: 1, x: 100, y: 0 },
            isSelected: false,
          },
        ],
        dimensions: [
          {
            id: 0,
            a: { id: 0, x: 0, y: 0 },
            b: { id: 1, x: 100, y: 0 },
            offsetSign: 1,
            drivenValue: null,
            isSelected: false,
          },
        ],
        constraints: [],
      },
    };

    localStorage.setItem('knitstitch_state', JSON.stringify(payload));

    const store = new Store();
    store.set('sketch.isActive', true);

    const persistence = new StorePersistence(store);
    persistence.hydrate();

    const service = new SketchService(store);
    service.activeTool = SketchTool.Select;

    const line = store.state.sketch.lines[0];
    const dim = store.state.sketch.dimensions[0];

    expect(line.start).toBe(store.state.sketch.points[0]);
    expect(line.end).toBe(store.state.sketch.points[1]);
    expect(dim.a).toBe(store.state.sketch.points[0]);
    expect(typeof dim.recompute).toBe('function');

    service.onCanvasMouseDown({ x: 0, y: 0 });
    service.onCanvasMouseMove({ x: 20, y: 0 });
    service.onCanvasMouseUp();

    expect(line.start.x).toBe(20);
    expect(dim.a.x).toBe(20);

    service.activeTool = SketchTool.Line;
    service.onCanvasClick({ x: 200, y: 0 });
    service.onCanvasClick({ x: 250, y: 0 });

    expect(store.state.sketch.points[2].id).toBe(2);
    expect(store.state.sketch.points[3].id).toBe(3);
  });
});
