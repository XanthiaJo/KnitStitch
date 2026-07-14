// overconstraintChecker.js
// Detects common overconstraint and redundancy patterns in a sketch.
//
// A full DOF/Jacobian analysis is not performed because the sketches are small
// and the practical issues are captured by local redundancy patterns:
// - a line whose length is fixed by both a dimension and an Equal constraint
// - a line whose orientation is fixed by both an axis constraint and a
//   Perpendicular constraint against an already-orthogonal line
// - two or more dimensions on the same pair of points
// - a point referenced by more than two dimensions when the other endpoint of
//   each dimension is already fixed

export function checkOverconstraints(sketch) {
  const issues = [];
  if (!sketch) return issues;

  const dimensions = sketch.dimensions || [];
  const constraints = sketch.constraints || [];
  const points = sketch.points || [];
  const lines = sketch.lines || [];

  // 1. Lines with both a length dimension and an Equal Length constraint.
  // Both fix the same scalar DOF, so they are redundant.
  const linesWithDimension = new Set();
  for (const dim of dimensions) {
    if (!dim?.a || !dim?.b) continue;
    const line = findLineBetween(lines, dim.a, dim.b);
    if (line) linesWithDimension.add(line);
  }
  for (const c of constraints) {
    if (c?.type !== 'Equal' || !c.lineA || !c.lineB) continue;
    if (linesWithDimension.has(c.lineA) && linesWithDimension.has(c.lineB)) {
      issues.push({
        kind: 'RedundantLength',
        lineA: c.lineA,
        lineB: c.lineB,
        message: `Lines L${c.lineA.id + 1} and L${c.lineB.id + 1} are Equal and both have length dimensions.`,
      });
    }
  }

  // 2. Two or more dimensions on the same pair of points.
  const dimPairs = new Map(); // key "a,b" -> count
  for (const dim of dimensions) {
    if (!dim?.a || !dim?.b) continue;
    const key = [dim.a.id, dim.b.id].sort().join(',');
    dimPairs.set(key, (dimPairs.get(key) || 0) + 1);
  }
  for (const [key, count] of dimPairs.entries()) {
    if (count > 1) {
      const [aId, bId] = key.split(',').map(Number);
      issues.push({
        kind: 'RedundantDimensions',
        pointA: points.find((p) => p.id === aId),
        pointB: points.find((p) => p.id === bId),
        message: `Points P${aId + 1} and P${bId + 1} have ${count} dimensions between them.`,
      });
    }
  }

  // 3. Perpendicular constraints that are redundant because both lines already
  // have orthogonal axis constraints.
  for (const c of constraints) {
    if (c?.type !== 'Perpendicular' || !c.lineA || !c.lineB) continue;
    const axisA = axisConstraintFor(constraints, c.lineA);
    const axisB = axisConstraintFor(constraints, c.lineB);
    if (axisA && axisB && axisA !== axisB) {
      issues.push({
        kind: 'RedundantPerpendicular',
        constraint: c,
        message: 'Perpendicular constraint is redundant because both lines already have orthogonal axis constraints.',
      });
    }
  }

  // 4. Points driven by more than two dimensions when the other endpoint of each
  // dimension is fixed (anchor or driven by a coincident chain).
  const fixed = findFixedPoints(points, constraints);
  const dimCount = new Map();
  for (const dim of dimensions) {
    if (!dim?.a || !dim?.b) continue;
    if (fixed.has(dim.a) && !fixed.has(dim.b)) {
      dimCount.set(dim.b, (dimCount.get(dim.b) || 0) + 1);
    } else if (fixed.has(dim.b) && !fixed.has(dim.a)) {
      dimCount.set(dim.a, (dimCount.get(dim.a) || 0) + 1);
    } else if (fixed.has(dim.a) && fixed.has(dim.b)) {
      // Both endpoints fixed; the dimension is redundant.
    }
  }
  for (const [point, count] of dimCount.entries()) {
    if (count > 2) {
      issues.push({
        kind: 'OverconstrainedPoint',
        point,
        message: `Point P${point.id + 1} is driven by ${count} dimensions from fixed points; expect at most 2.`,
      });
    }
  }

  return issues;
}

function findFixedPoints(points, constraints) {
  const fixed = new Set();
  for (const p of points || []) {
    if (p?.isAnchor) fixed.add(p);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of constraints || []) {
      if (c?.type !== 'Coincident' || !c.pointA || !c.pointB) continue;
      const aFixed = fixed.has(c.pointA);
      const bFixed = fixed.has(c.pointB);
      if (aFixed && !bFixed) {
        fixed.add(c.pointB);
        changed = true;
      } else if (bFixed && !aFixed) {
        fixed.add(c.pointA);
        changed = true;
      }
    }
  }
  return fixed;
}

function findLineBetween(lines, a, b) {
  return lines.find((line) =>
    (line.start === a && line.end === b) || (line.start === b && line.end === a)
  );
}

function axisConstraintFor(constraints, line) {
  for (const c of constraints) {
    if (!c.lineA || c.lineA !== line) continue;
    if (c.type === 'Horizontal') return 'Horizontal';
    if (c.type === 'Vertical') return 'Vertical';
  }
  return null;
}
