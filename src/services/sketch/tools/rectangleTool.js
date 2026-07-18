import { SketchLine } from '../../../models/sketch/sketchLine.js';
import { SketchPoint } from '../../../models/sketch/sketchPoint.js';
import { SketchConstraint } from '../../../models/sketch/sketchConstraint.js';
import {
  flushSketchArrays,
  rebuildSketchObjects,
  setSnapCandidate,
} from '../state/sketchStateHelpers.js';

/**
 * Owns the rectangle-drawing workflow: first click sets one corner,
 * mouse movement updates the preview (axis-aligned), second click sets
 * the opposite corner and commits the rectangle.
 *
 * On commit, the tool creates individual lines, points, and constraints
 * (no composite rectangle entity). Each line is its own first-class sketch
 * object that can be selected, deleted, or constrained independently —
 * matching the Fusion 360 model where a rectangle is just a convenience
 * for drawing 4 connected lines with built-in perpendicularity.
 *
 * Created entities:
 *   - 4 corner points + 1 center point (all in sketch.points)
 *   - 4 edge lines (top, right, bottom, left) in sketch.lines
 *   - 2 construction lines (diagonals through center) in sketch.lines
 *   - 4 perpendicular constraints (one at each corner) in sketch.constraints
 *   - 2 midpoint constraints (center = midpoint of each diagonal) in
 *     sketch.constraints
 *
 * The center point snaps to nearby existing points (e.g. the origin anchor)
 * so a rectangle drawn centered on the anchor shares that point rather than
 * creating a duplicate. Orphan cleanup handles the center point naturally:
 * if both diagonals are deleted, their midpoint constraints are removed too
 * (constraints referencing deleted lines are filtered), leaving the center
 * point unreferenced — so removeOrphanPoint reclaims it. If even one
 * diagonal survives, the center point stays because it is still referenced.
 */
export class RectangleTool {
  constructor(service) {
    this.service = service;
    this.pendingCorner = null;
  }

  onRectangleClick(position, modifiers = {}) {
    this.service._recordSnapshot('Draw rectangle');
    const snapEnabled = modifiers.snapEnabled !== false;

    if (!this.pendingCorner) {
      this.pendingCorner = this._resolveOrCreatePoint(position, snapEnabled);
      this._setPreview(position);
      setSnapCandidate(this.service, null);
      return;
    }

    // Second click: commit the rectangle with the opposite corner.
    const dx = Math.abs(position.x - this.pendingCorner.x);
    const dy = Math.abs(position.y - this.pendingCorner.y);
    if (dx < 2 || dy < 2) {
      this.cancel();
      return;
    }
    this._commitRectangle(this.pendingCorner, position);
    this.pendingCorner = null;
    this._clearPreview();
  }

  onRectangleMouseMove(position, modifiers = {}) {
    if (!this.pendingCorner) return;
    const snapEnabled = modifiers.snapEnabled !== false;
    const near = this.service._findNearestPoint(position, snapEnabled);
    setSnapCandidate(this.service, near ?? null);
    this._setPreview(position);
  }

  cancel() {
    if (this.pendingCorner) {
      this.service._removeOrphanPoint(this.pendingCorner);
      this.pendingCorner = null;
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

  _setPreview(position) {
    if (!this.pendingCorner) return;
    const x0 = this.pendingCorner.x;
    const y0 = this.pendingCorner.y;
    const x1 = position.x;
    const y1 = position.y;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const halfW = Math.abs(x1 - x0) / 2;
    const halfH = Math.abs(y1 - y0) / 2;
    this.service.store.set('sketch.previewRectangle', {
      cx, cy, halfW, halfH,
    });
  }

  _clearPreview() {
    this.service.store.set('sketch.previewRectangle', null);
  }

  _commitRectangle(cornerA, cornerB) {
    const s = this.service;
    const sketch = s.store.state.sketch;

    const minX = Math.min(cornerA.x, cornerB.x);
    const maxX = Math.max(cornerA.x, cornerB.x);
    const minY = Math.min(cornerA.y, cornerB.y);
    const maxY = Math.max(cornerA.y, cornerB.y);

    const tl = this._createPoint({ x: minX, y: minY });
    const tr = this._createPoint({ x: maxX, y: minY });
    const br = this._createPoint({ x: maxX, y: maxY });
    const bl = this._createPoint({ x: minX, y: maxY });

    // Edge lines: top, right, bottom, left
    const top    = new SketchLine(s._nextLineId++, tl, tr);
    const right  = new SketchLine(s._nextLineId++, tr, br);
    const bottom = new SketchLine(s._nextLineId++, br, bl);
    const left   = new SketchLine(s._nextLineId++, bl, tl);
    sketch.lines.push(top, right, bottom, left);

    // Center point — snap to a nearby existing point (e.g. the anchor) so
    // a rectangle drawn centered on the origin shares that point instead of
    // creating a duplicate.
    const centerPos = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    const center = this._resolveOrCreatePoint(centerPos, true);

    // Construction lines: the two diagonals through the center
    const diag1 = new SketchLine(s._nextLineId++, tl, br, true);
    const diag2 = new SketchLine(s._nextLineId++, tr, bl, true);
    sketch.lines.push(diag1, diag2);

    // Perpendicular constraints at each corner keep it rectangular
    const perpTL = new SketchConstraint('Perpendicular', tl, null, left, top, s._nextConstraintId++);
    const perpTR = new SketchConstraint('Perpendicular', tr, null, top, right, s._nextConstraintId++);
    const perpBR = new SketchConstraint('Perpendicular', br, null, right, bottom, s._nextConstraintId++);
    const perpBL = new SketchConstraint('Perpendicular', bl, null, bottom, left, s._nextConstraintId++);

    // Midpoint constraints: center is midpoint of each diagonal. These keep
    // the center point alive while at least one diagonal exists. When both
    // diagonals are deleted, these constraints are filtered out (they
    // reference the deleted lines), and the center point becomes an orphan
    // that removeOrphanPoint reclaims.
    const midDiag1 = new SketchConstraint('Midpoint', center, null, diag1, null, s._nextConstraintId++);
    const midDiag2 = new SketchConstraint('Midpoint', center, null, diag2, null, s._nextConstraintId++);

    sketch.constraints.push(perpTL, perpTR, perpBR, perpBL, midDiag1, midDiag2);

    flushSketchArrays(s);
    rebuildSketchObjects(s);
  }
}
