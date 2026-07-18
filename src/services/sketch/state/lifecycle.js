import { SketchPoint } from '../../../models/sketch/sketchPoint.js';
import { restoreSketchSnapshot } from './sketchSnapshot.js';
import { SketchTool } from '../constants.js';

export function ensureOriginAnchor(service, ) {
    const sketch = service.store.state.sketch;
    const exists = sketch.points.some((p) => p.isAnchor && p.x === 0 && p.y === 0);
    if (exists) return;

    const anchor = new SketchPoint(service._nextPointId++, 0, 0);
    anchor.isAnchor = true;
    anchor.isOrigin = true;
    sketch.points.push(anchor);
    service.store.set('sketch.points', [...sketch.points]);
    service._seedIdCountersFromSketch();
}
export function undo(service, ) {
    // If there is an in-progress drag, complete it without recording it, then
    // continue with the next undo.
    service._dragPoint = null;
    service._history.cancelDrag();

    const action = service._history.pop();
    if (action) {
      restoreSketchSnapshot(action.snapshot, service);
      return;
    }

    // Fallback for empty history: cancel an in-progress line.
    const sketch = service.store.state.sketch;
    if (service._pendingStart) {
      service._removeOrphanPoint(service._pendingStart);
      service._pendingStart = null;
      service._setPreviewLine(null);
      service._setSnapCandidate(null);
      service._rebuildObjects();
    } else if (sketch.lines.length > 0) {
      const last = sketch.lines[sketch.lines.length - 1];
      sketch.lines.pop();
      service._removeOrphanPoint(last.start);
      service._removeOrphanPoint(last.end);
      service._rebuildObjects();
      service.store.set('sketch.lines', [...sketch.lines]);
    }
}
export function clear(service, ) {
    service._recordSnapshot('Clear sketch');
    const sketch = service.store.state.sketch;

    // Preserve anchor points so the origin reference stays on the canvas.
    const keptPoints = sketch.points.filter((p) => p.isAnchor);
    sketch.points = keptPoints;
    sketch.lines = [];
    sketch.dimensions = [];
    sketch.constraints = [];
    sketch.circles = [];
    sketch.beziers = [];
    service._seedIdCountersFromSketch();
    service._pendingStart = null;
    service._setPreviewLine(null);
    service._setSnapCandidate(null);
    service._selectedPoints.clear();
    service._selectedLines.clear();
    service._rebuildObjects();
    service.store.set('sketch.lines', []);
    service.store.set('sketch.points', [...sketch.points]);
    service.store.set('sketch.dimensions', []);
    service.store.set('sketch.constraints', []);
    service.store.set('sketch.circles', []);
    service.store.set('sketch.beziers', []);
}
export function cancelCurrentLine(service, ) {
    service._lineTool.cancel();
    if (service._circleTool) service._circleTool.cancel();
    if (service._rectangleTool) service._rectangleTool.cancel();
    if (service._bezierTool) service._bezierTool.cancel();
    if (service._dimPendingA) {
      service._removeOrphanPoint(service._dimPendingA);
      service._dimPendingA = null;
      service.clearSelection();
    }
    service._constraintPendingLine = null;
    service._constraintPendingPoint = null;
    service.store.set('sketch.pendingDimEdit', null);
}
export function recordSnapshot(service, description) {
    service._history.record(description);
}
export function exitToSelect(service) {
    service.cancelCurrentLine();
    service.clearSelection();
    service._constraintPendingPoint = null;
    service.store.set('sketch.activeTool', SketchTool.Select);
}