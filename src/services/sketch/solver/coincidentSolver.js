// coincidentSolver.js
// Snap-to-nearest-point and BFS coincident constraint propagation.
//
// These are pure functions used by the local ConstraintSolver during
// drag-time constraint solving.

import { SketchConstraint } from '../../../models/sketch/sketchConstraint.js';
import { nearestPoint } from '../../../utils/geometry.js';

/**
 * If movedPoint is within snapRadius of another point, snap it there and
 * create a Coincident constraint if one doesn't already exist.
 */
export function snapCoincidentPoint(sketch, movedPoint, snapRadius) {
  const nearest = nearestPoint(sketch.points, movedPoint, snapRadius, movedPoint);
  if (!nearest) return;

  ensureCoincidentConstraint(sketch, movedPoint, nearest);
  movedPoint.x = nearest.x;
  movedPoint.y = nearest.y;
}

/**
 * BFS propagation of coincident constraints starting from movedPoint.
 * Anchor points are immovable: non-anchor partners snap to the anchor.
 */
export function propagateCoincidentConstraints(sketch, movedPoint) {
  const queue = [movedPoint];
  const visited = new Set();

  while (queue.length > 0) {
    const point = queue.shift();
    if (!point || visited.has(point)) continue;
    visited.add(point);

    for (const constraint of sketch.constraints || []) {
      if (constraint?.type !== 'Coincident') continue;
      const partner = constraint.pointA === point
        ? constraint.pointB
        : constraint.pointB === point
          ? constraint.pointA
          : null;
      if (!partner) continue;

      // Anchor points are immovable: the non-anchor partner snaps to the
      // anchor, never the other way around.
      if (point.isAnchor && !partner.isAnchor) {
        if (partner.x !== point.x || partner.y !== point.y) {
          partner.x = point.x;
          partner.y = point.y;
        }
        queue.push(partner);
      } else if (partner.isAnchor && !point.isAnchor) {
        if (point.x !== partner.x || point.y !== partner.y) {
          point.x = partner.x;
          point.y = partner.y;
        }
        // Don't enqueue the anchor — it doesn't propagate further from here
      } else {
        // Neither is an anchor — normal bidirectional propagation
        if (partner.x !== point.x || partner.y !== point.y) {
          partner.x = point.x;
          partner.y = point.y;
        }
        queue.push(partner);
      }
    }
  }
}

/**
 * Find or create a Coincident constraint between pointA and pointB.
 */
export function ensureCoincidentConstraint(sketch, pointA, pointB) {
  if (!sketch.constraints) sketch.constraints = [];
  for (const constraint of sketch.constraints) {
    if (constraint?.type !== 'Coincident') continue;
    const samePair =
      (constraint.pointA === pointA && constraint.pointB === pointB)
      || (constraint.pointA === pointB && constraint.pointB === pointA);
    if (samePair) return constraint;
  }

  const constraint = new SketchConstraint('Coincident', pointA, pointB);
  sketch.constraints.push(constraint);
  return constraint;
}
