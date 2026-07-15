import { nearestLine } from '../../../utils/geometry.js';

export function startDrag(service, position, modifiers = {}) {
    const nearPoint = service._findNearestPoint(position, modifiers.snapEnabled !== false);
    if (nearPoint && !nearPoint.isAnchor) {
      service._dragPoint = nearPoint;
      service._dragLine = null;
      service._dragLineStartPos = null;
      service.selectPoint(nearPoint);
      service._history.beginDrag();
      return;
    }

    const nearLine = nearestLine(service.store.state.sketch.lines, position, 10);
    if (nearLine) {
      service._dragPoint = null;
      service._dragLine = nearLine;
      service._dragLineStartPos = { x: position.x, y: position.y };
      service._dragLineStart = { x: nearLine.start.x, y: nearLine.start.y };
      service._dragLineEnd = { x: nearLine.end.x, y: nearLine.end.y };
      service.selectLine(nearLine);
      service._history.beginDrag();
    } else {
      service._dragPoint = null;
      service._dragLine = null;
      service._dragLineStartPos = null;
      service._dragLineStart = null;
      service._dragLineEnd = null;
      service._history.cancelDrag();
    }
}
export function onCanvasMouseUp(service, ) {
    service._history.endDrag();
    const draggedPoint = service._dragPoint;
    const draggedLine = service._dragLine;
    service._dragPoint = null;
    service._dragLine = null;
    service._dragLineStartPos = null;
    service._dragLineStart = null;
    service._dragLineEnd = null;

    if (draggedPoint) {
      // Recompute dimension kinds once the drag is finished so Horizontal/Vertical
      // kinds only take effect after the user has released the point.
      for (const dim of service.store.state.sketch.dimensions) dim.recompute();
      const movedPoints = new Set([draggedPoint]);
      service._solve(service.store.state.sketch, movedPoints);
      service._flushSketchArrays(this);
      service._rebuildObjects(this);
    } else if (draggedLine) {
      for (const dim of service.store.state.sketch.dimensions) dim.recompute();
      const movedPoints = new Set([draggedLine.start, draggedLine.end]);
      service._solve(service.store.state.sketch, movedPoints);
      service._flushSketchArrays(this);
      service._rebuildObjects(this);
    }
}
export function onSelectMouseMove(service, position, modifiers = {}) {
    if (service._dragPoint && !service._dragPoint.isAnchor) {
      const originalPosition = { x: service._dragPoint.x, y: service._dragPoint.y };
      service._dragPoint.x = position.x;
      service._dragPoint.y = position.y;

      const movedPoints = new Set([service._dragPoint]);
      const result = service._solve(service.store.state.sketch, movedPoints);

      // If the SLVS or global solver returns null (over-constrained),
      // fall back to the local solver for graceful degradation.
      if (result === null && !service._slvsAdapter?.ready) {
        service._constraintSolver.solveConstraintsForPoint(
          service.store.state.sketch,
          service._dragPoint,
          originalPosition,
          modifiers
        );
      }

      service._assignConstraintIds(this);
      // During a drag, preserve the dimension kind so the solver doesn't switch a
      // dimension to Horizontal/Vertical and lock the line before the user releases.
      for (const dim of service.store.state.sketch.dimensions) dim.recompute(true);

      service._flushSketchArrays(this);
      service._rebuildObjects(this);
      return;
    }

    if (service._dragLine && service._dragLineStartPos) {
      const dx = position.x - service._dragLineStartPos.x;
      const dy = position.y - service._dragLineStartPos.y;

      if (!service._dragLine.start.isAnchor) {
        service._dragLine.start.x = service._dragLineStart.x + dx;
        service._dragLine.start.y = service._dragLineStart.y + dy;
      }
      if (!service._dragLine.end.isAnchor) {
        service._dragLine.end.x = service._dragLineEnd.x + dx;
        service._dragLine.end.y = service._dragLineEnd.y + dy;
      }

      const movedPoints = new Set();
      if (!service._dragLine.start.isAnchor) movedPoints.add(service._dragLine.start);
      if (!service._dragLine.end.isAnchor) movedPoints.add(service._dragLine.end);

      if (movedPoints.size > 0) {
        const result = service._solve(service.store.state.sketch, movedPoints);

        // Fallback to local solver if the global/SLVS solver fails
        if (result === null && !service._slvsAdapter?.ready) {
          for (const point of movedPoints) {
            service._constraintSolver.solveConstraintsForPoint(
              service.store.state.sketch,
              point,
              { x: point.x - dx, y: point.y - dy },
              modifiers
            );
          }
        }
      }

      service._assignConstraintIds(this);
      for (const dim of service.store.state.sketch.dimensions) dim.recompute(true);

      service._flushSketchArrays(this);
      service._rebuildObjects(this);
    }
}
