import { describe, it, expect, vi } from 'vitest';
import { Store } from '../src/state/store.js';

describe('Store', () => {
  it('should get top-level and nested values', () => {
    const store = new Store();
    expect(store.get('cellWidthPx')).toBe(20);
    expect(store.get('sketch.activeTool')).toBe('Select');
    expect(store.get('sketch.nonexistent')).toBeUndefined();
  });

  it('should set values and notify subscribers', () => {
    const store = new Store();
    const fn = vi.fn();
    store.subscribe(fn);
    store.set('cellWidthPx', 40);
    expect(store.get('cellWidthPx')).toBe(40);
    expect(fn).toHaveBeenCalledWith('cellWidthPx', 40, store.state);
  });

  it('should not notify when value unchanged', () => {
    const store = new Store();
    const fn = vi.fn();
    store.subscribe(fn);
    store.set('cellWidthPx', 20); // same as default
    expect(fn).not.toHaveBeenCalled();
  });

  it('should support unsubscribe', () => {
    const store = new Store();
    const fn = vi.fn();
    const unsub = store.subscribe(fn);
    unsub();
    store.set('cellWidthPx', 99);
    expect(fn).not.toHaveBeenCalled();
  });

  it('should initialize filledCells as an empty Set', () => {
    const store = new Store();
    const cells = store.get('filledCells');
    expect(cells).toBeInstanceOf(Set);
    expect(cells.size).toBe(0);
  });
});
