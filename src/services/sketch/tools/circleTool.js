import { SketchCircle } from '../../../models/sketch/sketchCircle.js';
import { SketchPoint } from '../../../models/sketch/sketchPoint.js';
import {
  flushSketchArrays,
  rebuildSketchObjects,
  setSnapCandidate,
} from '../state/sketchStateHelpers.js';

/**
 * Owns the circle-drawing workflow: first click sets the center point,
 * mouse movement updates the preview radius, second click commits the
 * circle. The circle expands from the center outward.
 *
 * Receives the SketchService instance so it can call shared helpers (point
 * creation, nearest-point lookup, store access) without duplicating them.
 */
export class CircleTool {
  constructor(service) {
    this.service = service;
    this.pendingCenter = null;
  }

  onCircleClick(position, modifiers = {}) {
    this.service._recordSnapshot('Draw circle');
    const snapEnabled = modifiers.snapEnabled !== false;

    if (!this.pendingCenter) {
      this.pendingCenter = this._resolveOrCreatePoint(position, snapEnabled);
      this._setPreview(position);
      setSnapCandidate(this.service, null);
      return;
    }

    // Second click: commit the circle with the current radius.
    const radius = this._distanceToCenter(position);
    if (radius < 2) {
      // Too small — cancel rather than create a degenerate circle.
      this.cancel();
      return;
    }
    this._commitCircle(this.pendingCenter, radius);
    this.pendingCenter = null;
    this._clearPreview();
  }

  onCircleMouseMove(position, modifiers = {}) {
    if (!this.pendingCenter) return;
    const snapEnabled = modifiers.snapEnabled !== false;
    const near = this.service._findNearestPoint(position, snapEnabled);
    setSnapCandidate(this.service, near ?? null);
    this._setPreview(position);
  }

  cancel() {
    if (this.pendingCenter) {
      this.service._removeOrphanPoint(this.pendingCenter);
      this.pendingCenter = null;
    }
    this._clearPreview();
    setSnapCandidate(this.service, null);
  }

  _resolveOrCreatePoint(position, snapEnabled = true) {
    return snapEnabled
      ? this.service._findNearestPoint(position, true) ?? this._createPoint(position)
      : this._createPoint(position);
  }

  _createPoint(position) {
    const p = new SketchPoint(this.service._nextPointId++, position.x, position.y);
    this.service.store.state.sketch.points.push(p);
    this.service.store.set('sketch.points', [...this.service.store.state.sketch.points]);
    return p;
  }

  _distanceToCenter(position) {
    const dx = position.x - this.pendingCenter.x;
    const dy = position.y - this.pendingCenter.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _setPreview(position) {
    if (!this.pendingCenter) return;
    const radius = this._distanceToCenter(position);
    const preview = new SketchCircle(-1, this.pendingCenter, radius);
    this.service.store.set('sketch.previewCircle', preview);
  }

  _clearPreview() {
    this.service.store.set('sketch.previewCircle', null);
  }

  _commitCircle(center, radius) {
    const circle = new SketchCircle(this.service._nextCircleId++, center, radius);
    this.service.store.state.sketch.circles.push(circle);
    this.service.store.set('sketch.circles', [...this.service.store.state.sketch.circles]);
    flushSketchArrays(this.service);
    rebuildSketchObjects(this.service);
  }
}
