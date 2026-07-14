// perpendicularFeasibility.js
// Graph-theory feasibility check for perpendicular constraints.
//
// A set of perpendicular constraints is feasible iff the constraint adjacency
// graph is bipartite (2-colorable). Additionally, two lines in the same
// connected component that share a sketch point and have the same parity
// would be forced parallel at that shared corner — geometrically impossible
// in a closed polygon.
//
// This is a pure function with no dependency on the solver instance.

import { findSharedPoint, otherPoint } from '../../../utils/geometry.js';

/**
 * Check whether a perpendicular constraint between lineA and lineB can be
 * added to the sketch without creating an impossible constraint graph.
 *
 * @param {object} sketch - { lines, constraints }
 * @param {object} lineA
 * @param {object} lineB
 * @returns {boolean}
 */
export function canAddPerpendicularConstraint(sketch, lineA, lineB) {
  const anchor = findSharedPoint(lineA, lineB);
  if (!anchor) return false;
  if (!otherPoint(lineA, anchor) || !otherPoint(lineB, anchor)) return false;

  // Build a constraint adjacency graph from existing perpendicular constraints
  // plus the proposed new edge (lineA—lineB).
  const adjacency = new Map();
  for (const line of sketch.lines || []) {
    adjacency.set(line, new Set());
  }

  for (const constraint of sketch.constraints || []) {
    if (constraint?.type !== 'Perpendicular' || !constraint.lineA || !constraint.lineB) continue;
    if (!adjacency.has(constraint.lineA)) adjacency.set(constraint.lineA, new Set());
    if (!adjacency.has(constraint.lineB)) adjacency.set(constraint.lineB, new Set());
    adjacency.get(constraint.lineA).add(constraint.lineB);
    adjacency.get(constraint.lineB).add(constraint.lineA);
  }

  if (!adjacency.has(lineA)) adjacency.set(lineA, new Set());
  if (!adjacency.has(lineB)) adjacency.set(lineB, new Set());
  adjacency.get(lineA).add(lineB);
  adjacency.get(lineB).add(lineA);

  // Explicit duplicate check: if lineA and lineB are already directly
  // constraint-adjacent (before adding the proposed edge), reject.
  // The bipartite pass cannot catch this because a 2-cycle is bipartite.
  for (const constraint of sketch.constraints || []) {
    if (constraint?.type !== 'Perpendicular') continue;
    if (constraint.lineA === lineA && constraint.lineB === lineB) return false;
    if (constraint.lineA === lineB && constraint.lineB === lineA) return false;
  }

  // 2-color the graph (bipartite check). Each connected component is
  // processed separately and tracked; a conflict means the constraint is
  // impossible.
  const parity = new Map();
  const component = new Map(); // line → component-root (first node in its BFS)
  for (const line of adjacency.keys()) {
    if (parity.has(line)) continue;
    parity.set(line, 0);
    component.set(line, line);
    const queue = [line];
    while (queue.length > 0) {
      const current = queue.shift();
      const currentParity = parity.get(current);
      for (const neighbor of adjacency.get(current) || []) {
        const nextParity = 1 - currentParity;
        if (!parity.has(neighbor)) {
          parity.set(neighbor, nextParity);
          component.set(neighbor, component.get(current));
          queue.push(neighbor);
          continue;
        }
        if (parity.get(neighbor) !== nextParity) {
          return false;
        }
      }
    }
  }

  // Second pass: within the same connected component, two lines that share a
  // sketch point and have the same parity would be forced parallel at that
  // shared corner — geometrically impossible in a closed polygon.
  //
  // Example: triangle AB—BC—CA with AB⊥BC (proposed) and BC⊥CA (existing).
  // After 2-coloring: AB=0, BC=1, CA=0 (all in same component).  AB and CA
  // share point A, have the same parity, and no direct constraint edge →
  // they would need to be parallel at A → contradiction.
  const allLines = [...adjacency.keys()];
  for (let i = 0; i < allLines.length; i++) {
    for (let j = i + 1; j < allLines.length; j++) {
      const la = allLines[i];
      const lb = allLines[j];
      if (!parity.has(la) || !parity.has(lb)) continue;
      if (component.get(la) !== component.get(lb)) continue; // different components — independent
      if (parity.get(la) !== parity.get(lb)) continue;       // different parity — fine
      if (adjacency.get(la)?.has(lb)) continue;              // direct constraint edge already checked
      if (!findSharedPoint(la, lb)) continue;                // not geometrically connected
      // Same component + same parity + shared point + no direct edge
      // = forced parallel at the shared corner → contradiction.
      return false;
    }
  }

  return true;
}
