// globalConstraintSolver.js
// Global numerical optimization solver for sketch constraints.
//
// Inspired by FreeCAD/OpenCASCADE: instead of applying constraints one at a
// time (the local ConstraintSolver approach), this solver minimizes the total
// constraint error across all points simultaneously using gradient descent.
//
// Error functions (squared):
//   Perpendicular: (dot product of the two line vectors at the shared anchor)^2
//   Coincident:    (distance between the two points)^2
//   Midpoint:      (distance from point to line midpoint)^2
//   Equal length:  (length(lineA) - length(lineB))^2
//
// After each gradient step, driven dimensions and coincident constraints are
// applied as hard constraints (exact enforcement), then the loop repeats until
// the error drops below tolerance or the iteration cap is reached.
//
// Anchor points (isAnchor === true) are immovable. The dragged point starts at
// the user's position but is adjustable by the solver to satisfy constraints.

import {
  buildErrorTerms,
  totalError,
  computeGradients,
  EPSILON,
} from './constraintErrorTerms.js';
import {
  findFixedPoints,
  isFeasible,
  propagateCoincident,
  applyDrivenDimensions,
} from './hardConstraintPropagator.js';

const MAX_ITERATIONS = 100;
const ERROR_TOLERANCE = 1e-6;
const INITIAL_STEP = 5.0; // max pixels moved per iteration
const STEP_SHRINK = 0.5;
const STEP_GROW = 1.2;
const MIN_STEP = 1e-4;

export class GlobalConstraintSolver {
  /**
   * Solves all constraints simultaneously.
   *
   * @param {object} sketch - { points, lines, dimensions, constraints }
   * @param {Set} movedPoints - points directly manipulated by the user
   * @returns {number|null} iteration count on success, null if over-constrained
   */
  solve(sketch, movedPoints) {
    if (!sketch) return null;
    const points = sketch.points || [];
    const constraints = sketch.constraints || [];
    const dimensions = sketch.dimensions || [];

    const hasDriven = dimensions.some((d) => d?.isConstrained);
    if (points.length === 0 || (constraints.length === 0 && !hasDriven)) {
      return 0;
    }

    const fixed = findFixedPoints(points, constraints);
    const free = points.filter((p) => !fixed.has(p));
    if (free.length === 0) return 0;

    if (!isFeasible(dimensions, movedPoints, fixed)) return null;

    const terms = buildErrorTerms(constraints);

    const reachable = applyDrivenDimensions(dimensions, constraints, movedPoints, fixed);
    propagateCoincident(constraints, fixed, movedPoints, reachable);

    let step = INITIAL_STEP;
    let prevError = totalError(terms);

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      if (prevError < ERROR_TOLERANCE) return iter;

      const grads = computeGradients(terms);
      if (grads.size === 0) return iter;

      const saved = this._savePositions(free);
      this._applyGradients(free, grads, step);
      const reachable = applyDrivenDimensions(dimensions, constraints, movedPoints, fixed);
      propagateCoincident(constraints, fixed, movedPoints, reachable);

      const newError = totalError(terms);
      if (newError < prevError) {
        step *= STEP_GROW;
        prevError = newError;
      } else {
        this._restorePositions(saved);
        step *= STEP_SHRINK;
        if (step < MIN_STEP) return iter;
      }
    }
    return MAX_ITERATIONS;
  }

  _applyGradients(free, grads, step) {
    let maxMag = 0;
    for (const g of grads.values()) {
      const mag = Math.sqrt(g.x * g.x + g.y * g.y);
      if (mag > maxMag) maxMag = mag;
    }
    if (maxMag < EPSILON) return;

    const scale = step / maxMag;
    for (const p of free) {
      const g = grads.get(p);
      if (!g) continue;
      p.x -= scale * g.x;
      p.y -= scale * g.y;
    }
  }

  _savePositions(points) {
    return points.map((p) => ({ point: p, x: p.x, y: p.y }));
  }

  _restorePositions(saved) {
    for (const s of saved) {
      s.point.x = s.x;
      s.point.y = s.y;
    }
  }
}
