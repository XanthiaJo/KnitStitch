import { SketchPoint } from '../../../models/sketch/sketchPoint.js';
import {
  rebuildSketchObjects,
  flushSketchArrays,
  setSnapCandidate,
} from '../state/sketchStateHelpers.js';

/**
 * Owns the anchor-point workflow: click on empty canvas creates a new anchor,
 * click on an existing point converts it to an anchor, and mouse movement
 * updates the snap candidate for visual feedback.
 *
 * Receives the SketchService instance so it can call shared helpers
 * (nearest-point lookup, store access) without duplicating them.
 */
export class AnchorTool {
  constructor(service) {
    this.service = service;
  }

  onClick(position, modifiers = {}) {
    const near = this.service._findNearestPoint(position, modifiers.snapEnabled !== false);
    if (near) {
      this.convertToAnchor(near);
    } else {
      this.service._recordSnapshot('Add anchor point');
      const sketch = this.service.store.state.sketch;
      const pt = new SketchPoint(this.service._nextPointId++, position.x, position.y);
      pt.isAnchor = true;
      sketch.points.push(pt);
      flushSketchArrays(this.service);
      rebuildSketchObjects(this.service);
      this.service.exitToSelect();
    }
  }

  convertToAnchor(pt) {
    if (pt.isAnchor) return;
    this.service._recordSnapshot('Convert point to anchor');
    pt.isAnchor = true;
    flushSketchArrays(this.service);
    rebuildSketchObjects(this.service);
    this.service.exitToSelect();
  }

  onMouseMove(position, modifiers = {}) {
    setSnapCandidate(
      this.service,
      this.service._findNearestPoint(position, modifiers.snapEnabled !== false),
    );
  }
}
