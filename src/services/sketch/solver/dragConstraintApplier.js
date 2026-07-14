// dragConstraintApplier.js
// Drag-time constraint enforcement for perpendicular, equal, and midpoint
// constraints.
//
// These functions are called by the local ConstraintSolver during
// solveConstraintsForPoint to re-satisfy constraints after a point is
// dragged. They mutate point positions directly.
//
// Shared helpers (scaleLineToLength, resolveMidpointMovableLine,
// findLineUsingPoint) are also exported for use by the enforce* methods
// in ConstraintSolver.

import { findSharedPoint, otherPoint, lineUsesPoint } from '../../../utils/geometry.js';
import { propagateCoincidentConstraints } from './coincidentSolver.js';

const EPSILON = 0.000001;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function findLineUsingPoint(constraint, point) {
  if (lineUsesPoint(constraint.lineA, point)) return constraint.lineA;
  if (lineUsesPoint(constraint.lineB, point)) return constraint.lineB;
  return null;
}

export function resolveMovableLine(constraint, anchor, preferredLineToMove) {
  const candidates = [];
  if (preferredLineToMove) candidates.push(preferredLineToMove);
  candidates.push(constraint.lineB, constraint.lineA);

  for (const line of candidates) {
    if (!line) continue;
    if (line !== constraint.lineA && line !== constraint.lineB) continue;
    if (otherPoint(line, anchor)) return line;
  }
  return null;
}

export function resolveMidpointMovableLine(lineA, lineB) {
  const aAnchored = (lineA.start?.isAnchor || false) || (lineA.end?.isAnchor || false);
  const bAnchored = (lineB.start?.isAnchor || false) || (lineB.end?.isAnchor || false);
  if (aAnchored && bAnchored) return null;
  if (bAnchored && !aAnchored) return lineA;
  return lineB;
}

export function scaleLineToLength(line, targetLength) {
  if (!line) return;

  const startAnchored = line.start?.isAnchor;
  const endAnchored = line.end?.isAnchor;

  if (startAnchored && endAnchored) {
    // Both endpoints anchored: length is fully determined, cannot scale.
    return;
  }

  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const currentLength = Math.hypot(dx, dy);
  if (currentLength < EPSILON) return;

  const ux = dx / currentLength;
  const uy = dy / currentLength;

  if (startAnchored) {
    line.end.x = line.start.x + ux * targetLength;
    line.end.y = line.start.y + uy * targetLength;
    return;
  }

  if (endAnchored) {
    line.start.x = line.end.x - ux * targetLength;
    line.start.y = line.end.y - uy * targetLength;
    return;
  }

  // Neither endpoint anchored: center-scale around the midpoint.
  const midX = (line.start.x + line.end.x) / 2;
  const midY = (line.start.y + line.end.y) / 2;
  const half = targetLength / 2;

  line.start.x = midX - ux * half;
  line.start.y = midY - uy * half;
  line.end.x = midX + ux * half;
  line.end.y = midY + uy * half;
}

// ---------------------------------------------------------------------------
// Drag-time apply methods
// ---------------------------------------------------------------------------

export function applyPerpendicularConstraints(sketch, movedPoint, originalPosition = null) {
  const movedEndpointTargets = new Set();

  for (const constraint of sketch.constraints || []) {
    if (constraint?.type !== 'Perpendicular') continue;

    const anchor = constraint.pointA ?? findSharedPoint(constraint.lineA, constraint.lineB);
    if (!anchor) continue;

    if (movedPoint === anchor) {
      for (const line of [constraint.lineA, constraint.lineB]) {
        const ep = otherPoint(line, anchor);
        if (ep) movedEndpointTargets.add(ep);
      }
    }
  }

  if (movedEndpointTargets.size > 0 && originalPosition) {
    const dx = movedPoint.x - originalPosition.x;
    const dy = movedPoint.y - originalPosition.y;
    if (Math.abs(dx) >= EPSILON || Math.abs(dy) >= EPSILON) {
      for (const point of movedEndpointTargets) {
        point.x += dx;
        point.y += dy;
      }
    }
  }

  for (const constraint of sketch.constraints || []) {
    if (constraint?.type !== 'Perpendicular') continue;

    const anchor = constraint.pointA ?? findSharedPoint(constraint.lineA, constraint.lineB);
    if (!anchor) continue;

    // Case 1: movedPoint is the anchor - re-project the endpoint of the OTHER line
    if (movedPoint === anchor) {
      const lineWithMovedPoint = findLineUsingPoint(constraint, movedPoint);
      const lineWithoutMovedPoint = lineWithMovedPoint === constraint.lineA ? constraint.lineB : constraint.lineA;

      const referencePoint = otherPoint(lineWithMovedPoint, anchor);
      const movedEndpoint = otherPoint(lineWithoutMovedPoint, anchor);

      if (referencePoint && movedEndpoint) {
        const refDx = referencePoint.x - anchor.x;
        const refDy = referencePoint.y - anchor.y;
        const refLength = Math.hypot(refDx, refDy);
        if (refLength >= EPSILON) {
          const dist = Math.hypot(movedEndpoint.x - anchor.x, movedEndpoint.y - anchor.y);
          if (dist >= EPSILON) {
            const ux = refDx / refLength;
            const uy = refDy / refLength;

            // Check if we're already perpendicular to avoid unnecessary updates
            const currentDx = movedEndpoint.x - anchor.x;
            const currentDy = movedEndpoint.y - anchor.y;
            const currentDot = currentDx * ux + currentDy * uy;

            // Only update if not already perpendicular (dot should be 0)
            if (Math.abs(currentDot) > 0.01) {
              movedEndpoint.x = anchor.x - uy * dist;
              movedEndpoint.y = anchor.y + ux * dist;
            }
          }
        }
      }
      continue;
    }

    // Case 2: movedPoint is an endpoint - project it perpendicular to reference line
    const movedLine = findLineUsingPoint(constraint, movedPoint);
    if (!movedLine) continue;

    const referenceLine = movedLine === constraint.lineA ? constraint.lineB : constraint.lineA;
    if (!referenceLine) continue;

    const referencePoint = otherPoint(referenceLine, anchor);
    if (!referencePoint) continue;

    const distance = Math.hypot(movedPoint.x - anchor.x, movedPoint.y - anchor.y);
    if (distance < EPSILON) continue;

    const refDx = referencePoint.x - anchor.x;
    const refDy = referencePoint.y - anchor.y;
    const refLength = Math.hypot(refDx, refDy);
    if (refLength < EPSILON) continue;

    const ux = refDx / refLength;
    const uy = refDy / refLength;
    const currentDx = movedPoint.x - anchor.x;
    const currentDy = movedPoint.y - anchor.y;

    const candidates = [
      { x: -uy * distance, y: ux * distance },
      { x: uy * distance, y: -ux * distance },
    ];

    const chosen = candidates[0].x * currentDx + candidates[0].y * currentDy
      >= candidates[1].x * currentDx + candidates[1].y * currentDy
      ? candidates[0]
      : candidates[1];

    movedPoint.x = anchor.x + chosen.x;
    movedPoint.y = anchor.y + chosen.y;
  }
}

export function applyEqualConstraints(sketch, movedPoint, originalPosition = null) {
  if (!originalPosition || !sketch.constraints?.length) return;

  const updatedPoints = new Set();

  for (const line of sketch.lines || []) {
    if (line.start !== movedPoint && line.end !== movedPoint) continue;

    const originalLength = Math.hypot(
      (line.start === movedPoint ? originalPosition.x : line.start.x)
        - (line.end === movedPoint ? originalPosition.x : line.end.x),
      (line.start === movedPoint ? originalPosition.y : line.start.y)
        - (line.end === movedPoint ? originalPosition.y : line.end.y)
    );
    const newLength = Math.hypot(
      line.end.x - line.start.x,
      line.end.y - line.start.y
    );
    if (Math.abs(newLength - originalLength) < EPSILON) continue;

    const updatedLines = new Set();
    for (const constraint of sketch.constraints) {
      if (constraint?.type !== 'Equal') continue;
      const otherLine = constraint.lineA === line
        ? constraint.lineB
        : constraint.lineB === line
          ? constraint.lineA
          : null;
      if (!otherLine || otherLine === line) continue;
      if (updatedLines.has(otherLine)) continue;
      scaleLineToLength(otherLine, newLength);
      updatedLines.add(otherLine);
      updatedPoints.add(otherLine.start);
      updatedPoints.add(otherLine.end);
    }
  }

  for (const pt of updatedPoints) {
    propagateCoincidentConstraints(sketch, pt);
  }
}

export function applyMidpointConstraints(sketch, movedPoint, originalPosition = null) {
  if (!sketch.constraints?.length) return;

  const updatedPoints = new Set();

  for (const constraint of sketch.constraints) {
    if (constraint?.type !== 'Midpoint') continue;

    // Line-line midpoint: keep both line midpoints coincident on drag.
    if (!constraint.pointA && constraint.lineA && constraint.lineB) {
      const lineA = constraint.lineA;
      const lineB = constraint.lineB;
      const touchesA = movedPoint === lineA.start || movedPoint === lineA.end;
      const touchesB = movedPoint === lineB.start || movedPoint === lineB.end;
      if (!touchesA && !touchesB) continue;

      const movable = resolveMidpointMovableLine(lineA, lineB);
      if (!movable) continue;
      const reference = movable === lineA ? lineB : lineA;

      const refMidX = (reference.start.x + reference.end.x) / 2;
      const refMidY = (reference.start.y + reference.end.y) / 2;
      const movMidX = (movable.start.x + movable.end.x) / 2;
      const movMidY = (movable.start.y + movable.end.y) / 2;
      const dx = refMidX - movMidX;
      const dy = refMidY - movMidY;
      if (Math.abs(dx) >= EPSILON || Math.abs(dy) >= EPSILON) {
        movable.start.x += dx;
        movable.start.y += dy;
        movable.end.x += dx;
        movable.end.y += dy;
        updatedPoints.add(movable.start);
        updatedPoints.add(movable.end);
      }
      continue;
    }

    // Point-line midpoint
    const line = constraint.lineA;
    const point = constraint.pointA;
    if (!line || !point) continue;
    if (line.start === point || line.end === point) continue;

    const isEndpoint = movedPoint === line.start || movedPoint === line.end;
    const isMidpoint = movedPoint === point;
    if (!isEndpoint && !isMidpoint) continue;

    if (isEndpoint) {
      point.x = (line.start.x + line.end.x) / 2;
      point.y = (line.start.y + line.end.y) / 2;
      updatedPoints.add(point);
    } else if (isMidpoint && originalPosition) {
      const dx = movedPoint.x - originalPosition.x;
      const dy = movedPoint.y - originalPosition.y;
      if (Math.abs(dx) >= EPSILON || Math.abs(dy) >= EPSILON) {
        line.start.x += dx;
        line.start.y += dy;
        line.end.x += dx;
        line.end.y += dy;
        updatedPoints.add(line.start);
        updatedPoints.add(line.end);
      }
    }
  }

  for (const pt of updatedPoints) {
    propagateCoincidentConstraints(sketch, pt);
  }
}
