import { SketchPoint } from '../../../models/sketch/sketchPoint.js';
import { SketchLine } from '../../../models/sketch/sketchLine.js';
import { SketchDimension } from '../../../models/sketch/sketchDimension.js';
import { SketchConstraint } from '../../../models/sketch/sketchConstraint.js';
import { SketchCircle } from '../../../models/sketch/sketchCircle.js';
import { SketchRectangle } from '../../../models/sketch/sketchRectangle.js';
import { flushSketchArrays, rebuildSketchObjects } from './sketchStateHelpers.js';

/**
 * Captures a complete, self-contained snapshot of the sketch state that can be
 * restored later.  This is used by the action history (undo) so every user
 * action can be reversed atomically.
 */
export function captureSketchSnapshot(sketch, service) {
  return {
    points: sketch.points.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      isSelected: p.isSelected,
      isAnchor: p.isAnchor,
    })),
    lines: sketch.lines.map((l) => ({
      id: l.id,
      startId: l.start.id,
      endId: l.end.id,
      isSelected: l.isSelected,
    })),
    dimensions: sketch.dimensions.map((d) => ({
      id: d.id,
      aId: d.a.id,
      bId: d.b.id,
      offsetSign: d.offsetSign,
      drivenValue: d.drivenValue,
      isSelected: d.isSelected,
    })),
    constraints: sketch.constraints.map((c) => ({
      id: c.id,
      type: c.type,
      pointAId: c.pointA?.id ?? null,
      pointBId: c.pointB?.id ?? null,
      lineAId: c.lineA?.id ?? null,
      lineBId: c.lineB?.id ?? null,
      isSelected: c.isSelected,
    })),
    circles: (sketch.circles || []).map((c) => ({
      id: c.id,
      centerId: c.center.id,
      radius: c.radius,
      isSelected: c.isSelected,
    })),
    rectangles: (sketch.rectangles || []).map((r) => ({
      id: r.id,
      centerId: r.center?.id ?? null,
      cornerIds: r.corners.map((p) => p.id),
      edgeIds: r.edges.map((l) => l.id),
      constructionLineIds: r.constructionLines.map((l) => l.id),
      constraintIds: r.constraints.map((c) => c.id),
      isSelected: r.isSelected,
    })),
    previewLine: sketch.previewLine
      ? {
          startId: sketch.previewLine.start.id,
          endX: sketch.previewLine.end.x,
          endY: sketch.previewLine.end.y,
        }
      : null,
    snapCandidate: sketch.snapCandidate
      ? {
          id: sketch.snapCandidate.id,
          x: sketch.snapCandidate.x,
          y: sketch.snapCandidate.y,
        }
      : null,
    pendingStartId: service._pendingStart?.id ?? null,
    dimPendingAId: service._dimPendingA?.id ?? null,
    constraintPendingLineId: service._constraintPendingLine?.id ?? null,
    nextPointId: service._nextPointId,
    nextLineId: service._nextLineId,
    nextDimId: service._nextDimId,
    nextConstraintId: service._nextConstraintId,
    nextCircleId: service._nextCircleId,
    nextRectangleId: service._nextRectangleId,
  };
}

/**
 * Restores the sketch and service state from a snapshot captured by
 * `captureSketchSnapshot`.  All object identity is replaced by new instances,
 * so callers must not hold references to the old sketch objects after restoring.
 */
export function restoreSketchSnapshot(snapshot, service) {
  const pointById = new Map();
  const points = snapshot.points.map((raw) => {
    const p = new SketchPoint(raw.id, raw.x, raw.y);
    p.isSelected = raw.isSelected;
    p.isAnchor = raw.isAnchor ?? false;
    pointById.set(p.id, p);
    return p;
  });

  const lineById = new Map();
  const lines = snapshot.lines.map((raw) => {
    const start = pointById.get(raw.startId) ?? new SketchPoint(raw.startId, 0, 0);
    const end = pointById.get(raw.endId) ?? new SketchPoint(raw.endId, 0, 0);
    const line = new SketchLine(raw.id, start, end);
    line.isSelected = raw.isSelected;
    lineById.set(line.id, line);
    return line;
  });

  const dimensions = snapshot.dimensions.map((raw) => {
    const a = pointById.get(raw.aId) ?? new SketchPoint(raw.aId, 0, 0);
    const b = pointById.get(raw.bId) ?? new SketchPoint(raw.bId, 0, 0);
    const dim = new SketchDimension(raw.id, a, b, raw.offsetSign);
    if (raw.drivenValue !== null && raw.drivenValue !== undefined) {
      dim.setDrivenValue(raw.drivenValue);
    }
    dim.isSelected = raw.isSelected;
    return dim;
  });

  const constraints = snapshot.constraints.map((raw) => {
    const pointA = raw.pointAId != null ? pointById.get(raw.pointAId) ?? null : null;
    const pointB = raw.pointBId != null ? pointById.get(raw.pointBId) ?? null : null;
    const lineA = raw.lineAId != null ? lineById.get(raw.lineAId) ?? null : null;
    const lineB = raw.lineBId != null ? lineById.get(raw.lineBId) ?? null : null;
    const constraint = new SketchConstraint(raw.type, pointA, pointB, lineA, lineB, raw.id);
    constraint.isSelected = raw.isSelected;
    return constraint;
  });
  const constraintById = new Map(constraints.map((c) => [c.id, c]));

  // Circles
  const circles = (snapshot.circles || []).map((raw) => {
    const center = pointById.get(raw.centerId) ?? new SketchPoint(raw.centerId, 0, 0);
    const circle = new SketchCircle(raw.id, center, raw.radius);
    circle.isSelected = raw.isSelected;
    return circle;
  });

  // Rectangles — reconnect to restored points, lines, and constraints
  const rectangles = (snapshot.rectangles || []).map((raw) => {
    const center = raw.centerId != null ? pointById.get(raw.centerId) ?? null : null;
    const corners = raw.cornerIds.map((id) => pointById.get(id)).filter(Boolean);
    const edges = raw.edgeIds.map((id) => lineById.get(id)).filter(Boolean);
    const constructionLines = raw.constructionLineIds.map((id) => lineById.get(id)).filter(Boolean);
    const rectConstraints = raw.constraintIds.map((id) => constraintById.get(id)).filter(Boolean);
    const rect = new SketchRectangle(raw.id, center, corners, edges, constructionLines, rectConstraints);
    rect.isSelected = raw.isSelected;
    return rect;
  });

  service._nextPointId = snapshot.nextPointId;
  service._nextLineId = snapshot.nextLineId;
  service._nextDimId = snapshot.nextDimId;
  service._nextConstraintId = snapshot.nextConstraintId;
  service._nextCircleId = snapshot.nextCircleId ?? 0;
  service._nextRectangleId = snapshot.nextRectangleId ?? 0;

  service._pendingStart = snapshot.pendingStartId != null
    ? pointById.get(snapshot.pendingStartId) ?? null
    : null;
  service._dimPendingA = snapshot.dimPendingAId != null
    ? pointById.get(snapshot.dimPendingAId) ?? null
    : null;
  service._constraintPendingLine = snapshot.constraintPendingLineId != null
    ? lineById.get(snapshot.constraintPendingLineId) ?? null
    : null;

  service._selectedPoints.clear();
  service._selectedLines.clear();
  for (const p of points) {
    if (p.isSelected) service._selectedPoints.add(p);
  }
  for (const l of lines) {
    if (l.isSelected) service._selectedLines.add(l);
  }

  let previewLine = null;
  if (snapshot.previewLine) {
    const start = pointById.get(snapshot.previewLine.startId) ?? service._pendingStart;
    if (start) {
      const end = new SketchPoint(-1, snapshot.previewLine.endX, snapshot.previewLine.endY);
      previewLine = new SketchLine(-1, start, end);
    }
  }

  let snapCandidate = null;
  if (snapshot.snapCandidate) {
    snapCandidate = pointById.get(snapshot.snapCandidate.id)
      ?? new SketchPoint(-1, snapshot.snapCandidate.x, snapshot.snapCandidate.y);
  }

  const sketch = service.store.state.sketch;
  sketch.points = points;
  sketch.lines = lines;
  sketch.dimensions = dimensions;
  sketch.constraints = constraints;
  sketch.circles = circles;
  sketch.rectangles = rectangles;
  sketch.previewLine = previewLine;
  sketch.snapCandidate = snapCandidate;

  rebuildSketchObjects(service);
  flushSketchArrays(service);
  service.store.set('sketch.previewLine', previewLine);
  service.store.set('sketch.snapCandidate', snapCandidate);
}

/**
 * Deep-equality check for two snapshots produced by `captureSketchSnapshot`.
 * Used to decide whether a drag actually changed the sketch state before
 * pushing it onto the undo history.
 */
export function snapshotsEqual(a, b) {
  if (!a || !b) return a === b;
  return (
    a.nextPointId === b.nextPointId
    && a.nextLineId === b.nextLineId
    && a.nextDimId === b.nextDimId
    && a.nextConstraintId === b.nextConstraintId
    && (a.nextCircleId ?? 0) === (b.nextCircleId ?? 0)
    && (a.nextRectangleId ?? 0) === (b.nextRectangleId ?? 0)
    && a.pendingStartId === b.pendingStartId
    && a.dimPendingAId === b.dimPendingAId
    && a.constraintPendingLineId === b.constraintPendingLineId
    && arraysEqual(a.points, b.points, (p1, p2) => p1.id === p2.id && p1.x === p2.x && p1.y === p2.y && p1.isSelected === p2.isSelected && p1.isAnchor === p2.isAnchor)
    && arraysEqual(a.lines, b.lines, (l1, l2) => l1.id === l2.id && l1.startId === l2.startId && l1.endId === l2.endId && l1.isSelected === l2.isSelected)
    && arraysEqual(a.dimensions, b.dimensions, (d1, d2) => d1.id === d2.id && d1.aId === d2.aId && d1.bId === d2.bId && d1.offsetSign === d2.offsetSign && d1.drivenValue === d2.drivenValue && d1.isSelected === d2.isSelected)
    && arraysEqual(a.constraints, b.constraints, (c1, c2) => c1.id === c2.id && c1.type === c2.type && c1.pointAId === c2.pointAId && c1.pointBId === c2.pointBId && c1.lineAId === c2.lineAId && c1.lineBId === c2.lineBId && c1.isSelected === c2.isSelected)
    && arraysEqual(a.circles || [], b.circles || [], (c1, c2) => c1.id === c2.id && c1.centerId === c2.centerId && c1.radius === c2.radius && c1.isSelected === c2.isSelected)
    && arraysEqual(a.rectangles || [], b.rectangles || [], (r1, r2) => r1.id === r2.id && r1.isSelected === r2.isSelected && arraysEqual(r1.cornerIds, r2.cornerIds, (x, y) => x === y))
    && previewLinesEqual(a.previewLine, b.previewLine)
    && snapCandidatesEqual(a.snapCandidate, b.snapCandidate)
  );
}

function arraysEqual(a, b, compare) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!compare(a[i], b[i])) return false;
  }
  return true;
}

function previewLinesEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.startId === b.startId && a.endX === b.endX && a.endY === b.endY;
}

function snapCandidatesEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.x === b.x && a.y === b.y;
}
