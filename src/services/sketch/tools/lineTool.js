import { SketchLine } from '../../../models/sketch/sketchLine.js';
import { SketchPoint } from '../../../models/sketch/sketchPoint.js';
import { applyAngleSnap } from '../../../utils/geometry.js';
import { SNAP_ANGLE_DEG } from '../constants.js';
import {
  rebuildSketchObjects,
  setPreviewLine,
  setSnapCandidate,
} from '../state/sketchStateHelpers.js';

/**
 * Owns the line-drawing workflow: first click sets the start point, second
 * click commits the line, subsequent clicks continue the polyline, and mouse
 * movement updates the preview line.
 *
 * Receives the SketchService instance so it can call shared helpers (point
 * creation, nearest-point lookup, store access) without duplicating them.
 */
export class LineTool {
  constructor(service) {
    this.service = service;
    this.pendingStart = null;
  }

  onLineClick(position, modifiers = {}) {
    this.service._recordSnapshot('Draw line');
    const snapEnabled = modifiers.snapEnabled !== false;

    if (!this.pendingStart) {
      this.pendingStart = this._resolveOrCreatePoint(position, snapEnabled);
      const temp = new SketchPoint(-1, position.x, position.y);
      setPreviewLine(this.service, new SketchLine(-1, this.pendingStart, temp));
      setSnapCandidate(this.service, null);
      return;
    }

    const near = this.service._findNearestPoint(position, snapEnabled);
    const resolved = near
      ? { x: near.x, y: near.y }
      : this._applyAngleSnap(this.pendingStart, position);
    const end = this._resolveOrCreatePoint(resolved, snapEnabled);
    this._commitLine(this.pendingStart, end);
    this.pendingStart = end;
    const temp = new SketchPoint(-1, end.x, end.y);
    setPreviewLine(this.service, new SketchLine(-1, this.pendingStart, temp));
    setSnapCandidate(this.service, null);
  }

  onLineMouseMove(position, modifiers = {}) {
    if (!this.pendingStart) return;
    const snapEnabled = modifiers.snapEnabled !== false;
    const near = this.service._findNearestPoint(position, snapEnabled);
    setSnapCandidate(this.service, near ?? null);
    const resolved = near
      ? { x: near.x, y: near.y }
      : this._applyAngleSnap(this.pendingStart, position);
    const temp = new SketchPoint(-1, resolved.x, resolved.y);
    setPreviewLine(this.service, new SketchLine(-1, this.pendingStart, temp));
  }

  cancel() {
    if (this.pendingStart) {
      this.service._removeOrphanPoint(this.pendingStart);
      this.pendingStart = null;
    }
    setPreviewLine(this.service, null);
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

  _commitLine(start, end) {
    const isConstruction = this.service.activeTool === 'ConstructionLine';
    const line = new SketchLine(this.service._nextLineId++, start, end, isConstruction);
    this.service.store.state.sketch.lines.push(line);
    this.service.store.set('sketch.lines', [...this.service.store.state.sketch.lines]);
    rebuildSketchObjects(this.service);
  }

  _applyAngleSnap(start, end) {
    return applyAngleSnap(start, end, SNAP_ANGLE_DEG);
  }
}
