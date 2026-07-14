// dofAnalyzer.js
// Degrees-of-freedom analysis for sketch constraint validation.
//
// Uses Jacobian rank computation to determine the DOF of a sketch:
//   DOF = nParameters - rank(Jacobian)
//
// Inspired by FreeCAD's sketcher. Each constraint contributes one or more
// rows to the Jacobian. The rows are the gradients of the *constraint
// functions* (not the squared error), so they are non-zero even when the
// constraint is already satisfied.
//
// Over-constraint detection:
//   rank can never exceed nParams. If there are more constraint rows than
//   the rank, some constraints are linearly dependent — they are redundant.
//   We treat redundant constraints as over-constrained.
//
//   nRedundant = nConstraintRows - rank
//   status = nRedundant > 0 ? 'over'
//          : DOF > 0 ? 'under'
//          : 'well'
//
// Coincident constraints are handled by merging points into equivalence
// classes (union-find) before parameter enumeration. Anchored points are
// excluded from the parameter list (they have 0 DOF).

import { findSharedPoint, otherPoint, lineLength } from '../../../utils/geometry.js';

const EPS = 1e-9;

/**
 * Analyze the degrees-of-freedom status of a sketch using Jacobian rank.
 *
 * @param {object} sketch - { points, lines, constraints, dimensions }
 * @returns {{ dof: number, status: 'under'|'well'|'over', nParams: number, rank: number, nConstraints: number, nRedundant: number }}
 */
export function analyzeDof(sketch) {
  const points = sketch.points || [];
  const constraints = sketch.constraints || [];
  const dimensions = sketch.dimensions || [];

  // --- 1. Build coincident groups via union-find ---
  const parent = new Map();
  for (const p of points) parent.set(p, p);

  function find(p) {
    if (!parent.has(p)) return p;
    if (parent.get(p) !== p) parent.set(p, find(parent.get(p)));
    return parent.get(p);
  }

  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const c of constraints) {
    if (c?.type === 'Coincident' && c.pointA && c.pointB) {
      union(c.pointA, c.pointB);
    }
  }

  // --- 2. Build effective parameter groups ---
  const groups = new Map();
  for (const p of points) {
    const root = find(p);
    if (!groups.has(root)) groups.set(root, { points: [], hasAnchor: false });
    const g = groups.get(root);
    g.points.push(p);
    if (p.isAnchor) g.hasAnchor = true;
  }

  const paramIndex = new Map();
  let nParams = 0;
  for (const [root, g] of groups) {
    if (g.hasAnchor) continue;
    paramIndex.set(root, { x: nParams, y: nParams + 1 });
    nParams += 2;
  }

  // --- 3. Build Jacobian rows from constraint function gradients ---
  // Unlike error term gradients (which are zero when satisfied), these
  // are the derivatives of the constraint functions themselves.
  const rows = [];

  for (const c of constraints) {
    if (!c || c.type === 'Coincident') continue; // handled by union-find
    const constraintRows = buildConstraintRows(c, paramIndex, find, nParams);
    for (const row of constraintRows) {
      rows.push(row);
    }
  }

  for (const dim of dimensions) {
    if (!dim?.a || !dim?.b || dim.drivenValue === null) continue;
    const row = buildDimensionRow(dim, paramIndex, find, nParams);
    rows.push(row); // always push — even if zero row (counts as redundant)
  }

  const nConstraints = rows.length;

  // --- 4. Compute rank via Gaussian elimination ---
  const rank = matrixRank(rows, nParams);

  // --- 5. Determine status ---
  const nRedundant = nConstraints - rank;
  const dof = nParams - rank || 0;
  const status = nRedundant > 0 ? 'over' : dof > 0 ? 'under' : 'well';

  return { dof, status, nParams, rank, nConstraints, nRedundant };
}

/**
 * Simulates adding a constraint (or driven dimension) and checks whether
 * it would over-constrain the sketch.
 */
export function wouldOverconstrain(sketch, proposed) {
  const simSketch = {
    points: sketch.points,
    lines: sketch.lines,
    dimensions: sketch.dimensions,
    constraints: sketch.constraints,
  };

  if (proposed.isDimension) {
    simSketch.dimensions = [...(sketch.dimensions || []), {
      a: proposed.pointA,
      b: proposed.pointB,
      drivenValue: 1,
    }];
  } else {
    simSketch.constraints = [...(sketch.constraints || []), proposed];
  }

  const analysis = analyzeDof(simSketch);
  return {
    wouldOverconstrain: analysis.status === 'over',
    dofAfter: analysis.dof,
    status: analysis.status,
  };
}

// ---------------------------------------------------------------------------
// Constraint function gradients
// ---------------------------------------------------------------------------
// These return the gradient of the constraint function f(x,y) = 0, not the
// squared error. This ensures the gradient is non-zero even when the
// constraint is already satisfied.
// ---------------------------------------------------------------------------

function buildConstraintRows(c, paramIndex, find, nParams) {
  switch (c.type) {
    case 'Perpendicular':
      return buildPerpendicularRows(c, paramIndex, find, nParams);
    case 'Midpoint':
      return buildMidpointRows(c, paramIndex, find, nParams);
    case 'Equal':
      return buildEqualRows(c, paramIndex, find, nParams);
    case 'Horizontal':
      return buildAxisRows(c, paramIndex, find, nParams, 'y');
    case 'Vertical':
      return buildAxisRows(c, paramIndex, find, nParams, 'x');
    default:
      return [];
  }
}

/**
 * Perpendicular: f = (otherA - anchor) · (otherB - anchor) = 0
 *
 * Gradient w.r.t. anchor:  (-(otherB - anchor) - (otherA - anchor))
 * Gradient w.r.t. otherA:  (otherB - anchor)
 * Gradient w.r.t. otherB:  (otherA - anchor)
 */
function buildPerpendicularRows(c, paramIndex, find, nParams) {
  if (!c.lineA || !c.lineB) return [];
  const anchor = c.pointA ?? findSharedPoint(c.lineA, c.lineB);
  if (!anchor) return [];
  const otherA = otherPoint(c.lineA, anchor);
  const otherB = otherPoint(c.lineB, anchor);
  if (!otherA || !otherB) return [];

  const bx = otherB.x - anchor.x;
  const by = otherB.y - anchor.y;
  const ax = otherA.x - anchor.x;
  const ay = otherA.y - anchor.y;

  const row = new Float64Array(nParams);
  let hasEntry = false;

  hasEntry = addToRow(row, anchor, paramIndex, find, -(bx + ax), -(by + ay)) || hasEntry;
  hasEntry = addToRow(row, otherA, paramIndex, find, bx, by) || hasEntry;
  hasEntry = addToRow(row, otherB, paramIndex, find, ax, ay) || hasEntry;

  return hasEntry ? [row] : [new Float64Array(nParams)];
}

/**
 * Midpoint (point-line): f = point - (line.start + line.end) / 2 = 0
 * Two rows: one for x, one for y.
 *
 * Gradient w.r.t. point:     (1, 0) for x-row, (0, 1) for y-row
 * Gradient w.r.t. line.start: (-0.5, 0) for x-row, (0, -0.5) for y-row
 * Gradient w.r.t. line.end:   (-0.5, 0) for x-row, (0, -0.5) for y-row
 *
 * Midpoint (line-line): f = mid(lineA) - mid(lineB) = 0
 * Two rows: one for x, one for y.
 *
 * Gradient w.r.t. lineA.start: (0.5, 0) for x-row, (0, 0.5) for y-row
 * Gradient w.r.t. lineA.end:   (0.5, 0) for x-row, (0, 0.5) for y-row
 * Gradient w.r.t. lineB.start: (-0.5, 0) for x-row, (0, -0.5) for y-row
 * Gradient w.r.t. lineB.end:   (-0.5, 0) for x-row, (0, -0.5) for y-row
 */
function buildMidpointRows(c, paramIndex, find, nParams) {
  if (!c.lineA) return [];

  // Line-line midpoint
  if (!c.pointA && c.lineB) {
    if (c.lineA === c.lineB) return [];
    const rowX = new Float64Array(nParams);
    const rowY = new Float64Array(nParams);
    let hasEntry = false;

    hasEntry = addToRow(rowX, c.lineA.start, paramIndex, find, 0.5, 0) || hasEntry;
    hasEntry = addToRow(rowX, c.lineA.end, paramIndex, find, 0.5, 0) || hasEntry;
    hasEntry = addToRow(rowX, c.lineB.start, paramIndex, find, -0.5, 0) || hasEntry;
    hasEntry = addToRow(rowX, c.lineB.end, paramIndex, find, -0.5, 0) || hasEntry;
    hasEntry = addToRow(rowY, c.lineA.start, paramIndex, find, 0, 0.5) || hasEntry;
    hasEntry = addToRow(rowY, c.lineA.end, paramIndex, find, 0, 0.5) || hasEntry;
    hasEntry = addToRow(rowY, c.lineB.start, paramIndex, find, 0, -0.5) || hasEntry;
    hasEntry = addToRow(rowY, c.lineB.end, paramIndex, find, 0, -0.5) || hasEntry;

    if (!hasEntry) return [new Float64Array(nParams)];
    return [rowX, rowY];
  }

  // Point-line midpoint
  if (!c.pointA) return [];
  const point = c.pointA;
  const line = c.lineA;

  const rowX = new Float64Array(nParams);
  const rowY = new Float64Array(nParams);
  let hasEntry = false;

  hasEntry = addToRow(rowX, point, paramIndex, find, 1, 0) || hasEntry;
  hasEntry = addToRow(rowX, line.start, paramIndex, find, -0.5, 0) || hasEntry;
  hasEntry = addToRow(rowX, line.end, paramIndex, find, -0.5, 0) || hasEntry;
  hasEntry = addToRow(rowY, point, paramIndex, find, 0, 1) || hasEntry;
  hasEntry = addToRow(rowY, line.start, paramIndex, find, 0, -0.5) || hasEntry;
  hasEntry = addToRow(rowY, line.end, paramIndex, find, 0, -0.5) || hasEntry;

  if (!hasEntry) return [new Float64Array(nParams)];
  return [rowX, rowY];
}

/**
 * Equal: f = len(lineA) - len(lineB) = 0
 *
 * Gradient w.r.t. lineA.start: -(lineA.end - lineA.start) / len(lineA)
 * Gradient w.r.t. lineA.end:   (lineA.end - lineA.start) / len(lineA)
 * Gradient w.r.t. lineB.start: (lineB.end - lineB.start) / len(lineB)
 * Gradient w.r.t. lineB.end:  -(lineB.end - lineB.start) / len(lineB)
 */
function buildEqualRows(c, paramIndex, find, nParams) {
  if (!c.lineA || !c.lineB || c.lineA === c.lineB) return [];

  const la = lineLength(c.lineA);
  const lb = lineLength(c.lineB);

  const row = new Float64Array(nParams);
  let hasEntry = false;

  if (la > EPS) {
    const ux = (c.lineA.end.x - c.lineA.start.x) / la;
    const uy = (c.lineA.end.y - c.lineA.start.y) / la;
    hasEntry = addToRow(row, c.lineA.start, paramIndex, find, -ux, -uy) || hasEntry;
    hasEntry = addToRow(row, c.lineA.end, paramIndex, find, ux, uy) || hasEntry;
  }
  if (lb > EPS) {
    const ux = (c.lineB.end.x - c.lineB.start.x) / lb;
    const uy = (c.lineB.end.y - c.lineB.start.y) / lb;
    hasEntry = addToRow(row, c.lineB.start, paramIndex, find, ux, uy) || hasEntry;
    hasEntry = addToRow(row, c.lineB.end, paramIndex, find, -ux, -uy) || hasEntry;
  }

  return hasEntry ? [row] : [new Float64Array(nParams)];
}

/**
 * Horizontal/Vertical: f = end.coord - start.coord = 0
 *
 * Gradient w.r.t. start: -1 in the relevant coordinate
 * Gradient w.r.t. end:   +1 in the relevant coordinate
 */
function buildAxisRows(c, paramIndex, find, nParams, coord) {
  if (!c.lineA) return [];
  const row = new Float64Array(nParams);
  let hasEntry = false;

  if (coord === 'x') {
    hasEntry = addToRow(row, c.lineA.start, paramIndex, find, -1, 0) || hasEntry;
    hasEntry = addToRow(row, c.lineA.end, paramIndex, find, 1, 0) || hasEntry;
  } else {
    hasEntry = addToRow(row, c.lineA.start, paramIndex, find, 0, -1) || hasEntry;
    hasEntry = addToRow(row, c.lineA.end, paramIndex, find, 0, 1) || hasEntry;
  }

  return hasEntry ? [row] : [new Float64Array(nParams)];
}

/**
 * Dimension: constrains the distance between two points.
 *
 * Horizontal dim: f = |bx - ax| - target, gradient ±1 in x
 * Vertical dim:   f = |by - ay| - target, gradient ±1 in y
 * Aligned dim:    f = sqrt(dx^2 + dy^2) - target, gradient (dx, dy)/len
 */
function buildDimensionRow(dim, paramIndex, find, nParams) {
  const a = find(dim.a);
  const b = find(dim.b);
  if (a === b) return new Float64Array(nParams); // zero row → redundant

  const idxA = paramIndex.get(a);
  const idxB = paramIndex.get(b);
  if (!idxA && !idxB) return new Float64Array(nParams); // both anchored → redundant

  const row = new Float64Array(nParams);
  const dx = dim.b.x - dim.a.x;
  const dy = dim.b.y - dim.a.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (dim.kind === 'Horizontal') {
    if (idxA) row[idxA.x] = -1;
    if (idxB) row[idxB.x] = 1;
  } else if (dim.kind === 'Vertical') {
    if (idxA) row[idxA.y] = -1;
    if (idxB) row[idxB.y] = 1;
  } else {
    // Aligned — use unit direction
    if (len < EPS) {
      // Degenerate — use x direction as fallback
      if (idxA) row[idxA.x] = -1;
      if (idxB) row[idxB.x] = 1;
    } else {
      const ux = dx / len;
      const uy = dy / len;
      if (idxA) {
        row[idxA.x] = -ux;
        row[idxA.y] = -uy;
      }
      if (idxB) {
        row[idxB.x] = ux;
        row[idxB.y] = uy;
      }
    }
  }

  return row;
}

// ---------------------------------------------------------------------------
// Matrix utilities
// ---------------------------------------------------------------------------

function addToRow(row, point, paramIndex, find, gx, gy) {
  const root = find(point);
  const idx = paramIndex.get(root);
  if (!idx) return false;
  row[idx.x] += gx;
  row[idx.y] += gy;
  return true;
}

/**
 * Compute the rank of a matrix via Gaussian elimination with partial pivoting.
 */
function matrixRank(rows, nCols) {
  if (rows.length === 0 || nCols === 0) return 0;

  const matrix = rows.map((r) => Float64Array.from(r));
  const nRows = matrix.length;
  let rank = 0;

  for (let col = 0; col < nCols && rank < nRows; col++) {
    let pivotRow = -1;
    let maxVal = EPS;
    for (let r = rank; r < nRows; r++) {
      const val = Math.abs(matrix[r][col]);
      if (val > maxVal) {
        maxVal = val;
        pivotRow = r;
      }
    }

    if (pivotRow < 0) continue;

    if (pivotRow !== rank) {
      const tmp = matrix[rank];
      matrix[rank] = matrix[pivotRow];
      matrix[pivotRow] = tmp;
    }

    const pivotVal = matrix[rank][col];

    for (let r = 0; r < nRows; r++) {
      if (r === rank) continue;
      const factor = matrix[r][col] / pivotVal;
      if (Math.abs(factor) < EPS) continue;
      for (let c = col; c < nCols; c++) {
        matrix[r][c] -= factor * matrix[rank][c];
      }
    }

    rank++;
  }

  return rank;
}
