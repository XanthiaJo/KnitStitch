import { SketchConstraint } from '../../../models/sketch/sketchConstraint.js';
import { ConstraintSubMode } from '../constants.js';
import { canAddPerpendicularConstraint } from '../solver/perpendicularFeasibility.js';
import {
  assignConstraintIds,
  findSharedPoint,
  flushSketchArrays,
  rebuildSketchObjects,
  showCursorMessage,
} from '../state/sketchStateHelpers.js';

/**
 * Owns the constraint creation workflows for all constraint types:
 * perpendicular, midpoint (point-line and line-line), equal, H/V, and
 * coincident.
 *
 * Receives the SketchService instance so it can call shared helpers
 * (selectLine, clearSelection, store access) without duplicating them.
 */
export class ConstraintTool {
  constructor(service) {
    this.service = service;
  }

  get store() { return this.service.store; }
  get sketch() { return this.store.state.sketch; }

  // -------------------------------------------------------------------------
  // Shared helpers
  // -------------------------------------------------------------------------

  /** Reject a constraint attempt with a cursor message. */
  _reject(message, position) {
    this.service.clearSelection();
    showCursorMessage(this.service, message, position);
    return false;
  }

  /** Check overconstraint; reject if the draft would remove too many DOF. */
  _checkOverconstrain(draft, position) {
    if (!this.service._slvsAdapter?.ready) {
      return this._reject('Solver is not ready yet', position);
    }
    const overcheck = this.service._slvsAdapter.wouldOverconstrain(this.sketch, { constraint: draft });
    if (overcheck.wouldOverconstrain) {
      return this._reject(
        'Over-constrained: this would remove too many degrees of freedom', position,
      );
    }
    return true;
  }

  /** Find an existing constraint by type + symmetric pair predicate. */
  _findExisting(type, pairCheck) {
    return this.sketch.constraints.find((c) =>
      c?.type === type && pairCheck(c),
    ) ?? null;
  }

  /** Find an existing line-pair constraint (lineA/lineB, either order). */
  _findLinePair(type, lineA, lineB) {
    return this._findExisting(type, (c) =>
      (c.lineA === lineA && c.lineB === lineB)
      || (c.lineA === lineB && c.lineB === lineA),
    );
  }

  /** Find an existing point-pair constraint (pointA/pointB, either order). */
  _findPointPair(type, pointA, pointB) {
    return this._findExisting(type, (c) =>
      (c.pointA === pointA && c.pointB === pointB)
      || (c.pointA === pointB && c.pointB === pointA),
    );
  }

  /**
   * Commit a newly created constraint: record snapshot, push, assign IDs,
   * reconverge (the SolveSpace solver enforces the new constraint),
   * recompute dims, select, flush, rebuild.
   *
   * The constraint's pointA (if any) is passed as the preferred move
   * target so the solver moves that point rather than distributing
   * movement across all free points.
   *
   * @param {string} description - undo snapshot label
   * @param {SketchConstraint} constraint - the constraint to commit
   * @returns {true}
   */
  _commit(description, constraint, position = null) {
    if (!this.service._slvsAdapter?.ready) {
      return this._reject('Solver is not ready yet', position);
    }
    if (!this._checkOverconstrain(constraint, position)) {
      return false;
    }
    this.service._recordSnapshot(description);
    this.sketch.constraints.push(constraint);
    assignConstraintIds(this.service);
    // Build the set of points the solver should prefer to move.
    // For point-line constraints (midpoint), pointA is the point to move.
    // For line-line constraints (perpendicular, equal, H/V), the solver
    // should move whichever endpoints are free — pass empty set and let
    // the solver distribute.
    const preferredMove = new Set();
    if (constraint.pointA && !constraint.pointA.isAnchor) {
      preferredMove.add(constraint.pointA);
    }
    this.service._reconvergeConstraints(
      preferredMove.size > 0 ? preferredMove : null,
    );
    for (const dim of this.sketch.dimensions) dim.recompute();
    this.service.selectConstraint(constraint);
    flushSketchArrays(this.service);
    rebuildSketchObjects(this.service);
    return true;
  }

  /**
   * Two-step line-pick workflow: first click stores the pending line and
   * selects it; same line again cancels; second different line calls
   * `onCreate(firstLine, secondLine, position)`.
   */
  _pickPendingLine(line, onCreate, position = null, selfMessage = null) {
    if (!this.service._constraintPendingLine) {
      this.service._constraintPendingLine = line;
      this.service.selectLine(line);
      return;
    }

    if (this.service._constraintPendingLine === line) {
      this.service._constraintPendingLine = null;
      this.service.clearSelection();
      if (selfMessage) showCursorMessage(this.service, selfMessage, position);
      return;
    }

    const firstLine = this.service._constraintPendingLine;
    this.service._constraintPendingLine = null;
    onCreate(firstLine, line, position);
  }

  /**
   * Two-step point-pick workflow: first click stores the pending point and
   * selects it; same point again cancels; second different point calls
   * `onCreate(firstPoint, secondPoint, position)`.
   */
  _pickPendingPoint(point, onCreate, position = null) {
    if (!this.service._constraintPendingPoint) {
      this.service._constraintPendingPoint = point;
      this.service.selectPoint(point);
      return;
    }

    if (this.service._constraintPendingPoint === point) {
      this.service._constraintPendingPoint = null;
      this.service.clearSelection();
      return;
    }

    const firstPoint = this.service._constraintPendingPoint;
    this.service._constraintPendingPoint = null;
    onCreate(firstPoint, point, position);
  }

  // -------------------------------------------------------------------------
  // Canvas click dispatch
  // -------------------------------------------------------------------------

  onConstraintClick(/* position, modifiers */) {
    // Canvas click in constraint mode — nothing to do
    // (line/point clicks are handled via onConstraintLineClick/PointClick)
  }

  onConstraintLineClick(line, multiSelect = false, position = null) {
    const { activeTool, constraintSubMode } = this.service;
    if (activeTool !== 'Constraint') {
      this.service.selectLine(line, multiSelect);
      return;
    }

    if (constraintSubMode === ConstraintSubMode.Midpoint) {
      this._pickPendingLine(line, (a, b, pos) =>
        this._tryCreateMidpointLineLineConstraint(a, b, pos), position);
      return;
    }

    if (constraintSubMode === ConstraintSubMode.Perpendicular) {
      this._pickPendingLine(line, (a, b, pos) =>
        this._tryCreatePerpendicularConstraint(a, b, pos), position);
      return;
    }

    if (constraintSubMode === ConstraintSubMode.Parallel) {
      this._pickPendingLine(line, (a, b, pos) =>
        this._tryCreateParallelConstraint(a, b, pos), position,
        'Cannot constrain a line to itself');
      return;
    }

    if (constraintSubMode === ConstraintSubMode.Equal) {
      this._pickPendingLine(line, (a, b, pos) =>
        this._tryCreateEqualConstraint(a, b, pos), position,
        'Cannot constrain a line to itself');
      return;
    }

    if (constraintSubMode === ConstraintSubMode.HorizontalVertical) {
      this._tryCreateAxisConstraint(line, position);
      return;
    }

    this.service.selectLine(line, multiSelect);
  }

  onConstraintPointClick(point, multiSelect = false, position = null) {
    const { activeTool, constraintSubMode } = this.service;
    if (activeTool !== 'Constraint') {
      this.service.selectPoint(point, multiSelect);
      return;
    }

    if (constraintSubMode === ConstraintSubMode.Midpoint) {
      if (!this.service._constraintPendingLine) {
        showCursorMessage(this.service, 'Select a line first', position);
        return;
      }
      const line = this.service._constraintPendingLine;
      this.service._constraintPendingLine = null;
      this._tryCreateMidpointConstraint(line, point, position);
      return;
    }

    if (constraintSubMode === ConstraintSubMode.Coincident) {
      this._pickPendingPoint(point, (a, b, pos) =>
        this._tryCreateCoincidentConstraint(a, b, pos), position);
      return;
    }

    this.service.selectPoint(point, multiSelect);
  }

  // -------------------------------------------------------------------------
  // Constraint creation methods
  // -------------------------------------------------------------------------

  _tryCreatePerpendicularConstraint(firstLine, secondLine, position = null) {
    if (!firstLine || !secondLine) return false;

    const existing = this._findLinePair('Perpendicular', firstLine, secondLine);
    if (existing) {
      this.service.selectConstraint(existing);
      return true;
    }

    if (!canAddPerpendicularConstraint(
      this.sketch, firstLine, secondLine,
    )) {
      return this._reject('Constraint not possible', position);
    }

    const anchor = findSharedPoint(firstLine, secondLine);
    if (!anchor) {
      return this._reject('Constraint not possible', position);
    }

    const constraint = new SketchConstraint(
      'Perpendicular', anchor, null, firstLine, secondLine,
      this.service._nextConstraintId++,
    );
    return this._commit('Add perpendicular constraint', constraint, position);
  }

  _tryCreateParallelConstraint(firstLine, secondLine, position = null) {
    if (!firstLine || !secondLine) return false;
    if (firstLine === secondLine) {
      return this._reject('Cannot constrain a line to itself', position);
    }

    const existing = this._findLinePair('Parallel', firstLine, secondLine);
    if (existing) {
      this.service.selectConstraint(existing);
      return true;
    }

    const constraint = new SketchConstraint(
      'Parallel', null, null, firstLine, secondLine,
      this.service._nextConstraintId++,
    );
    return this._commit('Add parallel constraint', constraint, position);
  }

  _tryCreateMidpointConstraint(line, point, position = null) {
    if (!line || !point) return false;

    if (line.start === point || line.end === point) {
      return this._reject('Midpoint cannot be an endpoint of the same line', position);
    }

    const existing = this._findExisting('Midpoint', (c) =>
      c.lineA === line && c.pointA === point);
    if (existing) {
      this.service.selectConstraint(existing);
      return true;
    }

    const constraint = new SketchConstraint(
      'Midpoint', point, null, line, null,
      this.service._nextConstraintId++,
    );
    return this._commit('Add midpoint constraint', constraint, position);
  }

  _tryCreateMidpointLineLineConstraint(firstLine, secondLine, position = null) {
    if (!firstLine || !secondLine) return false;
    if (firstLine === secondLine) {
      return this._reject('Cannot constrain a line to itself', position);
    }

    const existing = this._findExisting('Midpoint', (c) =>
      !c.pointA
      && ((c.lineA === firstLine && c.lineB === secondLine)
        || (c.lineA === secondLine && c.lineB === firstLine)));
    if (existing) {
      this.service.selectConstraint(existing);
      return true;
    }

    const constraint = new SketchConstraint(
      'Midpoint', null, null, firstLine, secondLine,
      this.service._nextConstraintId++,
    );
    return this._commit('Add midpoint constraint', constraint, position);
  }

  _tryCreateEqualConstraint(firstLine, secondLine, position = null) {
    if (!firstLine || !secondLine) return false;
    if (firstLine === secondLine) {
      return this._reject('Cannot constrain a line to itself', position);
    }

    const existing = this._findLinePair('Equal', firstLine, secondLine);
    if (existing) {
      this.service.selectConstraint(existing);
      return true;
    }

    const constraint = new SketchConstraint(
      'Equal', null, null, firstLine, secondLine,
      this.service._nextConstraintId++,
    );
    return this._commit('Add equal constraint', constraint, position);
  }

  _tryCreateAxisConstraint(line, position = null) {
    if (!line) return false;

    // Auto-detect: if the line is closer to horizontal, apply Horizontal;
    // otherwise apply Vertical. This mirrors Fusion 360's H/V constraint.
    const dx = Math.abs(line.end.x - line.start.x);
    const dy = Math.abs(line.end.y - line.start.y);
    const type = dx >= dy ? 'Horizontal' : 'Vertical';

    const existing = this._findExisting(type, (c) => c.lineA === line);
    if (existing) {
      this.service.selectConstraint(existing);
      return true;
    }

    const constraint = new SketchConstraint(
      type, null, null, line, null,
      this.service._nextConstraintId++,
    );
    return this._commit(`Add ${type.toLowerCase()} constraint`, constraint, position);
  }

  _tryCreateCoincidentConstraint(firstPoint, secondPoint, position = null) {
    if (!firstPoint || !secondPoint) return false;

    const existing = this._findPointPair('Coincident', firstPoint, secondPoint);
    if (existing) {
      this.service.selectConstraint(existing);
      return true;
    }

    const constraint = new SketchConstraint(
      'Coincident', firstPoint, secondPoint, null, null,
      this.service._nextConstraintId++,
    );

    // Snap the non-anchored point to the anchored one (or second to first)
    const snap = () => {
      if (firstPoint.isAnchor && !secondPoint.isAnchor) {
        secondPoint.x = firstPoint.x;
        secondPoint.y = firstPoint.y;
      } else if (secondPoint.isAnchor && !firstPoint.isAnchor) {
        firstPoint.x = secondPoint.x;
        firstPoint.y = secondPoint.y;
      } else {
        secondPoint.x = firstPoint.x;
        secondPoint.y = firstPoint.y;
      }
    };

    return this._commit('Add coincident constraint', constraint, position);
  }
}
