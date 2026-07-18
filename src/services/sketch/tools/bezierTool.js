import { SketchBezier } from '../../../models/sketch/sketchBezier.js';
import { SketchPoint } from '../../../models/sketch/sketchPoint.js';
import {
  flushSketchArrays,
  rebuildSketchObjects,
  setSnapCandidate,
} from '../state/sketchStateHelpers.js';

/**
 * Owns the Bézier-drawing workflow:
 *   1st click — start point
 *   2nd click — control point 1 (handle)
 *   3rd click — control point 2 (handle)
 *   4th click — end point (commits the curve)
 *
 * Mouse movement updates a live preview after the start point is placed.
 */
export class BezierTool {
  constructor(service) {
    this.service = service;
    this.pendingStart = null;
    this.pendingControl1 = null;
    this.pendingControl2 = null;
  }

  onBezierClick(position, modifiers = {}) {
    this.service._recordSnapshot('Draw Bézier');
    const snapEnabled = modifiers.snapEnabled !== false;

    if (!this.pendingStart) {
      this.pendingStart = this._resolveOrCreatePoint(position, snapEnabled);
      this._setPreview(position);
      setSnapCandidate(this.service, null);
      return;
    }

    if (!this.pendingControl1) {
      this.pendingControl1 = this._resolveOrCreatePoint(position, snapEnabled);
      this._setPreview(position);
      setSnapCandidate(this.service, null);
      return;
    }

    if (!this.pendingControl2) {
      this.pendingControl2 = this._resolveOrCreatePoint(position, snapEnabled);
      this._setPreview(position);
      setSnapCandidate(this.service, null);
      return;
    }

    // Fourth click: commit the Bézier with the end point.
    const end = this._resolveOrCreatePoint(position, snapEnabled);
    const dist = Math.hypot(end.x - this.pendingStart.x, end.y - this.pendingStart.y);
    if (dist < 2) {
      this.cancel();
      return;
    }
    this._commitBezier(this.pendingStart, this.pendingControl1, this.pendingControl2, end);
    this._reset();
  }

  onBezierMouseMove(position, modifiers = {}) {
    if (!this.pendingStart) return;
    const snapEnabled = modifiers.snapEnabled !== false;
    const near = this.service._findNearestPoint(position, snapEnabled);
    setSnapCandidate(this.service, near ?? null);
    this._setPreview(position);
  }

  cancel() {
    if (this.pendingStart) this.service._removeOrphanPoint(this.pendingStart);
    if (this.pendingControl1) this.service._removeOrphanPoint(this.pendingControl1);
    if (this.pendingControl2) this.service._removeOrphanPoint(this.pendingControl2);
    this._reset();
    this._clearPreview();
    setSnapCandidate(this.service, null);
  }

  _reset() {
    this.pendingStart = null;
    this.pendingControl1 = null;
    this.pendingControl2 = null;
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

  _setPreview(position) {
    if (!this.pendingStart) return;
    const c1 = this.pendingControl1 ?? position;
    const c2 = this.pendingControl2 ?? position;
    const preview = new SketchBezier(-1, this.pendingStart, c1, c2, position);
    this.service.store.set('sketch.previewBezier', preview);
  }

  _clearPreview() {
    this.service.store.set('sketch.previewBezier', null);
  }

  _commitBezier(start, control1, control2, end) {
    const bezier = new SketchBezier(this.service._nextBezierId++, start, control1, control2, end);
    this.service.store.state.sketch.beziers.push(bezier);
    this.service.store.set('sketch.beziers', [...this.service.store.state.sketch.beziers]);
    flushSketchArrays(this.service);
    rebuildSketchObjects(this.service);
  }
}
