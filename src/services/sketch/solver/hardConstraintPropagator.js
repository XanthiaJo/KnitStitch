// hardConstraintPropagator.js
// Exact enforcement of hard sketch constraints: driven dimensions, coincident
// points, and equal-length propagation.

const EPSILON = 1e-12;
const MAX_ITERATIONS = 100;

/**
 * Find all points that are effectively fixed: anchors plus any point connected
 * to an anchor via one or more Coincident constraints.
 */
export function findFixedPoints(points, constraints) {
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

/**
 * Quick feasibility check: if a single non-fixed point is the driven endpoint
 * of more than two dimensions, the sketch is locally over-constrained.
 */
export function isFeasible(dimensions, movedPoints, fixed) {
  const drivenCount = new Map();
  for (const dim of dimensions || []) {
    if (!dim?.isConstrained || !dim.a || !dim.b) continue;

    let driven = null;
    if (movedPoints?.has(dim.a) && !movedPoints?.has(dim.b)) driven = dim.b;
    else if (movedPoints?.has(dim.b) && !movedPoints?.has(dim.a)) driven = dim.a;
    else if (!movedPoints?.has(dim.a) && !movedPoints?.has(dim.b)) {
      driven = fixed?.has(dim.b) ? dim.a : dim.b;
    }
    if (!driven || fixed?.has(driven)) continue;

    drivenCount.set(driven, (drivenCount.get(driven) || 0) + 1);
  }
  for (const count of drivenCount.values()) {
    if (count > 2) return false;
  }
  return true;
}

/**
 * Snap coincident points to their component leader.
 *
 * Leader priority:
 * 1. Fixed point (anchor) — never moves
 * 2. Moved point (user drag) — user's cursor position wins
 * 3. Reachable point (positioned by applyDrivenDimensions) — hard constraint
 *    position wins over gradient descent
 * 4. No leader — snap to centroid (least disruptive, works with gradient descent)
 */
export function propagateCoincident(constraints, fixed, movedPoints, reachable = null) {
  const adj = new Map();
  for (const c of constraints || []) {
    if (c?.type !== 'Coincident' || !c.pointA || !c.pointB) continue;
    if (!adj.has(c.pointA)) adj.set(c.pointA, new Set());
    if (!adj.has(c.pointB)) adj.set(c.pointB, new Set());
    adj.get(c.pointA).add(c.pointB);
    adj.get(c.pointB).add(c.pointA);
  }

  const visited = new Set();
  for (const start of adj.keys()) {
    if (visited.has(start)) continue;

    const component = [];
    const queue = [start];
    let leader = null;
    let leaderPriority = 0; // 0 = none, 1 = reachable, 2 = moved, 3 = fixed
    while (queue.length > 0) {
      const p = queue.shift();
      if (visited.has(p)) continue;
      visited.add(p);
      component.push(p);

      let priority = 0;
      if (fixed?.has(p)) priority = 3;
      else if (movedPoints?.has(p)) priority = 2;
      else if (reachable?.has(p)) priority = 1;

      if (priority > leaderPriority) {
        leader = p;
        leaderPriority = priority;
      }

      for (const partner of adj.get(p) || []) {
        if (!visited.has(partner)) queue.push(partner);
      }
    }

    if (leader) {
      for (const p of component) {
        if (p === leader) continue;
        p.x = leader.x;
        p.y = leader.y;
      }
    } else {
      let cx = 0, cy = 0;
      for (const p of component) { cx += p.x; cy += p.y; }
      cx /= component.length;
      cy /= component.length;
      for (const p of component) {
        p.x = cx;
        p.y = cy;
      }
    }
  }
}

/**
 * Enforce driven dimensions and Equal Length constraints by propagating from the
 * root (anchors or the dragged point). For each dimension the shallower endpoint
 * is the driver and the deeper endpoint is moved to the locked distance. Equal
 * constraints then copy a known length to lines whose other endpoint is still
 * free. Repeats until the geometry converges.
 */
export function applyDrivenDimensions(dimensions, constraints, movedPoints, fixed) {
  const dimInfos = [];
  for (const dim of dimensions || []) {
    if (!dim?.isConstrained) continue;
    const target = Number(dim.drivenValue);
    if (!Number.isFinite(target) || target <= 0) continue;
    if (!dim.a || !dim.b) continue;
    dimInfos.push({ dim, target });
  }

  const reachable = new Set(fixed ?? []);
  const depth = new Map();
  for (const p of fixed ?? []) depth.set(p, 0);
  // Dragged points are also roots so that dimensions in unconnected sketch
  // regions can still propagate. They start with a high depth so fixed-root
  // propagation takes precedence in the depth-based driver selection.
  for (const p of movedPoints ?? []) {
    if (!reachable.has(p)) {
      reachable.add(p);
      depth.set(p, Infinity);
    }
  }

  let progress = true;
  let iterations = 0;
  while (progress && iterations < MAX_ITERATIONS) {
    iterations++;
    progress = false;

    for (const info of dimInfos) {
      const a = info.dim.a;
      const b = info.dim.b;
      const aReach = reachable.has(a);
      const bReach = reachable.has(b);

      let driver = null;
      let driven = null;
      if (aReach && bReach) {
        const aDepth = depth.get(a) ?? Infinity;
        const bDepth = depth.get(b) ?? Infinity;
        driver = aDepth <= bDepth ? a : b;
        driven = driver === a ? b : a;
      } else if (aReach && !bReach) {
        driver = a;
        driven = b;
      } else if (!aReach && bReach) {
        driver = b;
        driven = a;
      } else {
        continue;
      }

      const beforeX = driven.x;
      const beforeY = driven.y;
      setDimensionDistance(info.dim, driver, driven, info.target);
      if (!reachable.has(driven)) {
        reachable.add(driven);
        depth.set(driven, (depth.get(driver) ?? 0) + 1);
        progress = true;
      } else if (
        Math.abs(driven.x - beforeX) > EPSILON ||
        Math.abs(driven.y - beforeY) > EPSILON
      ) {
        progress = true;
      }
    }

    for (const c of constraints || []) {
      if (c?.type !== 'Equal' || !c.lineA || !c.lineB) continue;

      const aFixed = isLineDetermined(c.lineA, reachable);
      const bFixed = isLineDetermined(c.lineB, reachable);

      let targetLine = null;
      let drivenLine = null;
      if (aFixed && !bFixed) {
        targetLine = c.lineA;
        drivenLine = c.lineB;
      } else if (!aFixed && bFixed) {
        targetLine = c.lineB;
        drivenLine = c.lineA;
      } else {
        continue;
      }

      const target = Math.hypot(
        targetLine.end.x - targetLine.start.x,
        targetLine.end.y - targetLine.start.y,
      );
      if (target <= 0) continue;

      const moved = setLineLength(drivenLine, target, reachable);
      if (moved.length) {
        const fixedEnd = lineFixedEndpoint(drivenLine, reachable);
        for (const p of moved) {
          reachable.add(p);
          depth.set(p, (depth.get(fixedEnd) ?? 0) + 1);
        }
        progress = true;
      }
    }

    // Enforce Horizontal/Vertical constraints as hard constraints when at least
    // one endpoint is already reachable. The free endpoint inherits the matching
    // coordinate from the reachable one, becoming reachable itself.
    for (const c of constraints || []) {
      if ((c?.type !== 'Horizontal' && c?.type !== 'Vertical') || !c.lineA) continue;
      const a = c.lineA.start;
      const b = c.lineA.end;
      const aReach = reachable.has(a);
      const bReach = reachable.has(b);
      const axis = c.type === 'Horizontal' ? 'y' : 'x';

      if (aReach && bReach) {
        const aDepth = depth.get(a) ?? Infinity;
        const bDepth = depth.get(b) ?? Infinity;
        const leader = aDepth <= bDepth ? a : b;
        const follower = leader === a ? b : a;
        if (Math.abs(follower[axis] - leader[axis]) > EPSILON) {
          follower[axis] = leader[axis];
          progress = true;
        }
      } else if (aReach && !bReach) {
        b[axis] = a[axis];
        reachable.add(b);
        depth.set(b, (depth.get(a) ?? 0) + 1);
        progress = true;
      } else if (!aReach && bReach) {
        a[axis] = b[axis];
        reachable.add(a);
        depth.set(a, (depth.get(b) ?? 0) + 1);
        progress = true;
      }
    }
  }

  return reachable;
}

function isLineDetermined(line, reachable) {
  return reachable.has(line?.start) && reachable.has(line?.end);
}

function lineFixedEndpoint(line, reachable) {
  return reachable.has(line?.start) ? line?.start : line?.end;
}

function setLineLength(line, target, reachable) {
  const a = line?.start;
  const b = line?.end;
  if (!a || !b) return [];
  const aReach = reachable.has(a);
  const bReach = reachable.has(b);

  let fixed = null;
  let free = null;
  if (aReach && !bReach) {
    fixed = a;
    free = b;
  } else if (bReach && !aReach) {
    fixed = b;
    free = a;
  } else {
    return [];
  }

  const beforeX = free.x;
  const beforeY = free.y;
  const dx = free.x - fixed.x;
  const dy = free.y - fixed.y;
  const current = Math.hypot(dx, dy);
  if (current === 0) return [];
  const scale = target / current;
  free.x = fixed.x + dx * scale;
  free.y = fixed.y + dy * scale;

  if (
    Math.abs(free.x - beforeX) < EPSILON &&
    Math.abs(free.y - beforeY) < EPSILON
  ) {
    return [];
  }
  return [free];
}

function setDimensionDistance(dim, driver, driven, target) {
  const dx = driven.x - driver.x;
  const dy = driven.y - driver.y;

  if (dim.kind === 'Horizontal') {
    driven.x = driver.x + (Math.sign(dx) || 1) * target;
    driven.y = driver.y;
    return;
  }
  if (dim.kind === 'Vertical') {
    driven.x = driver.x;
    driven.y = driver.y + (Math.sign(dy) || 1) * target;
    return;
  }
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < EPSILON) {
    driven.x = driver.x + target;
    driven.y = driver.y;
    return;
  }
  driven.x = driver.x + (dx / len) * target;
  driven.y = driver.y + (dy / len) * target;
}
