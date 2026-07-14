// ConstraintSolver.js
// Local per-point constraint solver.
//
// This is a thin coordinator that delegates to focused modules:
//   - coincidentSolver.js       — snap + BFS coincident propagation
//   - perpendicularFeasibility.js — bipartite graph feasibility check
//   - dragConstraintApplier.js  — drag-time perpendicular/equal/midpoint enforcement
//   - dimensionSolver.js        — driven dimension maintenance
//
// The enforce*Constraint methods remain here because they are the public API
// called by ConstraintTool when a constraint is first created.

import { findSharedPoint, otherPoint } from '../../../utils/geometry.js';
import { canAddPerpendicularConstraint } from './perpendicularFeasibility.js';
import {
  snapCoincidentPoint,
  propagateCoincidentConstraints,
} from './coincidentSolver.js';
import {
  applyPerpendicularConstraints,
  applyEqualConstraints,
  applyMidpointConstraints,
  findLineUsingPoint,
  resolveMovableLine,
  resolveMidpointMovableLine,
  scaleLineToLength,
} from './dragConstraintApplier.js';
import { maintainDrivenDimension } from './dimensionSolver.js';

const EPSILON = 0.000001;
const DEFAULT_SNAP_RADIUS = 10.0;

export class ConstraintSolver {
  /**
   * Solve all constraints affected by dragging movedPoint.
   * This is the main entry point called by the drag handler.
   */
  solveConstraintsForPoint(sketch, movedPoint, originalPosition = null, options = {}) {
    if (!sketch || !movedPoint) return;

    const snapEnabled = options.snapEnabled !== false;
    const snapRadius = options.snapRadius ?? DEFAULT_SNAP_RADIUS;

    if (snapEnabled) {
      snapCoincidentPoint(sketch, movedPoint, snapRadius);
    }

    propagateCoincidentConstraints(sketch, movedPoint);

    // Apply geometric constraints once for the dragged point
    applyPerpendicularConstraints(sketch, movedPoint, originalPosition);
    applyMidpointConstraints(sketch, movedPoint, originalPosition);
    applyEqualConstraints(sketch, movedPoint, originalPosition);

    if (!sketch.dimensions?.length) return;

    // Apply driven dimensions
    const movedPoints = new Set([movedPoint]);
    for (const dim of sketch.dimensions) {
      if (!dim?.isConstrained) continue;
      if (dim.a !== movedPoint && dim.b !== movedPoint) continue;

      const otherPt = dim.a === movedPoint ? dim.b : dim.a;
      maintainDrivenDimension(dim, movedPoint, otherPt, originalPosition);
      movedPoints.add(otherPt);
    }

    // Re-apply perpendicular constraints for points moved by dimensions
    for (const point of movedPoints) {
      if (point !== movedPoint) {
        applyPerpendicularConstraints(sketch, point, null);
      }
    }

    // Re-apply equal constraints for points moved by dimensions
    for (const point of movedPoints) {
      if (point !== movedPoint) {
        applyEqualConstraints(sketch, point, null);
      }
    }

    // Propagate coincident constraints again
    for (const point of movedPoints) {
      propagateCoincidentConstraints(sketch, point);
    }
  }

  // -------------------------------------------------------------------------
  // Feasibility
  // -------------------------------------------------------------------------

  canAddPerpendicularConstraint(sketch, lineA, lineB) {
    return canAddPerpendicularConstraint(sketch, lineA, lineB);
  }

  // -------------------------------------------------------------------------
  // One-shot enforce methods (called by ConstraintTool on creation)
  // -------------------------------------------------------------------------

  enforcePerpendicularConstraint(sketch, constraint, preferredLineToMove = null) {
    if (constraint?.type !== 'Perpendicular') return false;

    const anchor = constraint.pointA ?? findSharedPoint(constraint.lineA, constraint.lineB);
    if (!anchor) return false;

    const movable = resolveMovableLine(constraint, anchor, preferredLineToMove);
    if (!movable) return false;

    const reference = movable === constraint.lineA ? constraint.lineB : constraint.lineA;
    const movedPt = otherPoint(movable, anchor);
    const referencePoint = otherPoint(reference, anchor);
    if (!movedPt || !referencePoint) return false;

    const radius = Math.hypot(movedPt.x - anchor.x, movedPt.y - anchor.y);
    const refDx = referencePoint.x - anchor.x;
    const refDy = referencePoint.y - anchor.y;
    const refLength = Math.hypot(refDx, refDy);
    if (radius < EPSILON || refLength < EPSILON) return false;

    const ux = refDx / refLength;
    const uy = refDy / refLength;
    const currentDx = movedPt.x - anchor.x;
    const currentDy = movedPt.y - anchor.y;

    const candidates = [
      { x: -uy * radius, y: ux * radius },
      { x: uy * radius, y: -ux * radius },
    ];
    const chosen = candidates[0].x * currentDx + candidates[0].y * currentDy
      >= candidates[1].x * currentDx + candidates[1].y * currentDy
      ? candidates[0]
      : candidates[1];

    movedPt.x = anchor.x + chosen.x;
    movedPt.y = anchor.y + chosen.y;
    return true;
  }

  enforceMidpointConstraint(sketch, constraint) {
    if (constraint?.type !== 'Midpoint') return false;

    // Line-line midpoint: midpoints of both lines must coincide.
    if (!constraint.pointA && constraint.lineA && constraint.lineB) {
      return this._enforceMidpointLineLine(constraint);
    }

    // Point-line midpoint: point sits at the midpoint of the line.
    const line = constraint.lineA;
    const point = constraint.pointA;
    if (!line || !point) return false;
    if (line.start === point || line.end === point) return false;

    point.x = (line.start.x + line.end.x) / 2;
    point.y = (line.start.y + line.end.y) / 2;
    return true;
  }

  _enforceMidpointLineLine(constraint) {
    const lineA = constraint.lineA;
    const lineB = constraint.lineB;
    if (!lineA || !lineB || lineA === lineB) return false;

    const movable = resolveMidpointMovableLine(lineA, lineB);
    if (!movable) return false;
    const reference = movable === lineA ? lineB : lineA;

    const refMidX = (reference.start.x + reference.end.x) / 2;
    const refMidY = (reference.start.y + reference.end.y) / 2;
    const movMidX = (movable.start.x + movable.end.x) / 2;
    const movMidY = (movable.start.y + movable.end.y) / 2;
    const dx = refMidX - movMidX;
    const dy = refMidY - movMidY;

    movable.start.x += dx;
    movable.start.y += dy;
    movable.end.x += dx;
    movable.end.y += dy;
    return true;
  }

  enforceEqualConstraint(sketch, constraint, preferredLineToMove = null) {
    if (constraint?.type !== 'Equal') return false;

    const lineA = constraint.lineA;
    const lineB = constraint.lineB;
    if (!lineA || !lineB) return false;
    if (lineA === lineB) return false;

    const reference = preferredLineToMove === lineB ? lineA : lineB;
    const movable = preferredLineToMove === lineB ? lineB : lineA;
    const targetLength = Math.hypot(
      reference.end.x - reference.start.x,
      reference.end.y - reference.start.y
    );
    scaleLineToLength(movable, targetLength);
    return true;
  }

  enforceHorizontalConstraint(sketch, constraint) {
    if (constraint?.type !== 'Horizontal') return false;
    return this._enforceAxisConstraint(constraint.lineA, 'y');
  }

  enforceVerticalConstraint(sketch, constraint) {
    if (constraint?.type !== 'Vertical') return false;
    return this._enforceAxisConstraint(constraint.lineA, 'x');
  }

  _enforceAxisConstraint(line, axis) {
    if (!line) return false;

    const startAnchored = line.start?.isAnchor;
    const endAnchored = line.end?.isAnchor;

    if (startAnchored && endAnchored) {
      // Both endpoints anchored: line is over-constrained; don't move either.
      return false;
    }

    if (startAnchored) {
      // Anchor wins: free endpoint inherits the anchor's coordinate.
      line.end[axis] = line.start[axis];
      return true;
    }

    if (endAnchored) {
      // Anchor wins: free endpoint inherits the anchor's coordinate.
      line.start[axis] = line.end[axis];
      return true;
    }

    // Neither endpoint anchored: center the line on the axis (existing behavior).
    const avg = (line.start[axis] + line.end[axis]) / 2;
    line.start[axis] = avg;
    line.end[axis] = avg;
    return true;
  }
}
