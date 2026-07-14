import { captureSketchSnapshot, snapshotsEqual } from './sketchSnapshot.js';

/**
 * Action-based undo/redo stack for sketch operations.
 *
 * Captures full snapshots before mutating the sketch so any action can be
 * restored. Drag operations are recorded on mouse-up only when the geometry
 * actually changed.
 */
export class HistoryManager {
  constructor(service, limit = 50) {
    this.service = service;
    this._limit = limit;
    this._stack = [];
    this._dragSnapshot = null;
  }

  record(description) {
    this._stack.push({
      description,
      snapshot: captureSketchSnapshot(this.service.store.state.sketch, this.service),
    });
    if (this._stack.length > this._limit) {
      this._stack.shift();
    }
  }

  beginDrag() {
    this._dragSnapshot = captureSketchSnapshot(this.service.store.state.sketch, this.service);
  }

  endDrag() {
    if (!this._dragSnapshot) return;

    const current = captureSketchSnapshot(this.service.store.state.sketch, this.service);
    if (!snapshotsEqual(current, this._dragSnapshot)) {
      this._stack.push({
        description: 'Move point',
        snapshot: this._dragSnapshot,
      });
      if (this._stack.length > this._limit) {
        this._stack.shift();
      }
    }
    this._dragSnapshot = null;
  }

  cancelDrag() {
    this._dragSnapshot = null;
  }

  pop() {
    return this._stack.pop() ?? null;
  }

  clear() {
    this._stack = [];
    this._dragSnapshot = null;
  }

  get canUndo() {
    return this._stack.length > 0;
  }
}
