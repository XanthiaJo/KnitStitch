/**
 * Closed-shape cell fill logic.
 *
 * Given the current sketch lines, finds closed loops (cycles) in the line
 * graph and determines which grid cells are 50%+ inside any closed polygon.
 *
 * A cell is counted as filled when the configured fraction of its area falls
 * inside a closed shape. Coverage is calculated by clipping each polygon to
 * the cell rectangle rather than sampling points, which keeps symmetric
 * shapes symmetric at any grid alignment.
 */

const EPSILON = 0.01;

/**
 * Compute the set of grid cell keys ("r,c") that should be filled because they
 * are 50%+ inside a closed shape formed by the sketch lines.
 *
 * Instead of iterating a fixed grid, this computes the bounding box of all
 * sketch polygons and only tests cells within that region.
 *
 * @param {Array<{start:{x:number,y:number},end:{x:number,y:number}}>} lines
 * @param {number} cellW
 * @param {number} cellH
 * @param {number} fillThreshold - Fraction of cell that must be inside (0.0-1.0, default 0.5)
 * @returns {Set<string>} cell keys ("r,c") to fill
 */
export function computeFilledCellsFromSketch(lines, cellW, cellH, fillThreshold = 0.5) {
  const realLines = (lines || []).filter((l) => !l.isConstruction);
  if (realLines.length < 3 || cellW <= 0 || cellH <= 0) {
    return new Set();
  }

  const polygons = findClosedPolygons(realLines);
  if (polygons.length === 0) return new Set();

  // Compute bounding box of all polygon vertices
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polygons) {
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  const minCol = Math.floor(minX / cellW);
  const maxCol = Math.ceil(maxX / cellW);
  const minRow = Math.floor(minY / cellH);
  const maxRow = Math.ceil(maxY / cellH);

  const filled = new Set();
  const cellArea = cellW * cellH;
  const requiredArea = cellArea * Math.max(0, Math.min(1, fillThreshold));

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const x0 = c * cellW;
      const y0 = r * cellH;
      const coveredArea = polygons.reduce((largest, polygon) => {
        const clipped = clipPolygonToRect(polygon, x0, y0, x0 + cellW, y0 + cellH);
        return Math.max(largest, polygonArea(clipped));
      }, 0);

      if (coveredArea + EPSILON >= requiredArea) {
        filled.add(`${r},${c}`);
      }
    }
  }

  // Rasterisation can otherwise choose one side of a mathematically symmetric
  // edge when both mirrored cells are near the threshold. Mirror symmetric
  // polygons after thresholding so their knitted cell pattern is symmetric.
  for (const polygon of polygons) {
    const axis = verticalSymmetryAxis(polygon);
    if (axis === null) continue;
    const mirrored = new Set(filled);
    for (const key of filled) {
      const [r, c] = key.split(',').map(Number);
      const reflectedCenter = (2 * axis - (c + 0.5) * cellW) / cellW;
      const reflectedColumn = Math.floor(reflectedCenter);
      mirrored.add(`${r},${reflectedColumn}`);
    }
    for (const key of mirrored) filled.add(key);
  }

  return filled;
}

function verticalSymmetryAxis(polygon) {
  if (polygon.length < 3) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
  }
  const axis = (minX + maxX) / 2;
  const tolerance = EPSILON * 2;
  const hasMirror = (point) => polygon.some((candidate) =>
    Math.abs(candidate.x - (2 * axis - point.x)) <= tolerance
      && Math.abs(candidate.y - point.y) <= tolerance
  );
  return polygon.every(hasMirror) ? axis : null;
}

/**
 * Finds all minimal closed polygons (cycles) in the line graph.
 *
 * Points are matched by coordinates (within a small epsilon) so the result
 * is robust even when object identity is lost (e.g. after undo restore).
 *
 * @param {Array<{start:{x:number,y:number},end:{x:number,y:number}}>} lines
 * @returns {Array<Array<{x:number,y:number}>>}
 */
export function findClosedPolygons(lines) {
  const realLines = (lines || []).filter((l) => !l.isConstruction);
  if (realLines.length < 3) return [];

  // Build a coordinate-keyed node map and an adjacency list.
  const nodeKey = (p) => `${round(p.x)},${round(p.y)}`;
  const nodes = new Map(); // key -> { x, y }
  const adj = new Map(); // key -> Array<{ key, line }>

  const ensureNode = (p) => {
    const key = nodeKey(p);
    if (!nodes.has(key)) {
      nodes.set(key, { x: p.x, y: p.y });
      adj.set(key, []);
    }
    return key;
  };

  for (const line of lines) {
    const sk = ensureNode(line.start);
    const ek = ensureNode(line.end);
    if (sk === ek) continue; // degenerate zero-length line
    adj.get(sk).push({ key: ek, line });
    adj.get(ek).push({ key: sk, line });
  }

  const polygons = [];
  const seen = new Set();

  for (const line of lines) {
    const sk = nodeKey(line.start);
    const ek = nodeKey(line.end);
    if (sk === ek) continue;

    const path = bfsShortestPath(adj, ek, sk, line);
    if (!path || path.length < 2) continue;

    // path goes from ek to sk; polygon = [sk, ek, ...intermediate]
    const polyKeys = [sk, ...path.slice(0, -1)];
    const sig = signature(polyKeys);
    if (seen.has(sig)) continue;
    seen.add(sig);

    polygons.push(polyKeys.map((k) => nodes.get(k)));
  }

  return polygons;
}

/**
 * Breadth-first shortest path from `fromKey` to `toKey` that does not use
 * `excludedLine`. Returns an array of node keys (including both endpoints)
 * or null if no path exists.
 */
function bfsShortestPath(adj, fromKey, toKey, excludedLine) {
  const queue = [fromKey];
  const visited = new Set([fromKey]);
  const parent = new Map();

  while (queue.length > 0) {
    const node = queue.shift();
    if (node === toKey) {
      const path = [node];
      let cur = node;
      while (parent.has(cur)) {
        cur = parent.get(cur);
        path.unshift(cur);
      }
      return path;
    }
    const neighbors = adj.get(node) || [];
    for (const { key, line } of neighbors) {
      if (line === excludedLine) continue;
      if (visited.has(key)) continue;
      visited.add(key);
      parent.set(key, node);
      queue.push(key);
    }
  }
  return null;
}

/**
 * Clip a polygon against the four half-planes that form a cell rectangle.
 */
function clipPolygonToRect(polygon, minX, minY, maxX, maxY) {
  let clipped = polygon;
  const edges = [
    { inside: (p) => p.x >= minX, intersect: (a, b) => intersectVertical(a, b, minX) },
    { inside: (p) => p.x <= maxX, intersect: (a, b) => intersectVertical(a, b, maxX) },
    { inside: (p) => p.y >= minY, intersect: (a, b) => intersectHorizontal(a, b, minY) },
    { inside: (p) => p.y <= maxY, intersect: (a, b) => intersectHorizontal(a, b, maxY) },
  ];

  for (const edge of edges) {
    if (clipped.length === 0) break;
    const output = [];
    let previous = clipped[clipped.length - 1];
    let previousInside = edge.inside(previous);

    for (const current of clipped) {
      const currentInside = edge.inside(current);
      if (currentInside !== previousInside) {
        output.push(edge.intersect(previous, current));
      }
      if (currentInside) output.push(current);
      previous = current;
      previousInside = currentInside;
    }
    clipped = output;
  }
  return clipped;
}

function intersectVertical(a, b, x) {
  const denominator = b.x - a.x;
  if (Math.abs(denominator) < EPSILON) return { x, y: a.y };
  const t = (x - a.x) / denominator;
  return { x, y: a.y + (b.y - a.y) * t };
}

function intersectHorizontal(a, b, y) {
  const denominator = b.y - a.y;
  if (Math.abs(denominator) < EPSILON) return { x: a.x, y };
  const t = (y - a.y) / denominator;
  return { x: a.x + (b.x - a.x) * t, y };
}

function polygonArea(polygon) {
  if (polygon.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

/**
 * Ray-casting point-in-polygon test.
 */
function pointInPolygon(px, py, poly) {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = (yi > py) !== (yj > py)
      && px < (xj - xi) * (py - yi) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInAnyPolygon(px, py, polygons) {
  for (const poly of polygons) {
    if (pointInPolygon(px, py, poly)) return true;
  }
  return false;
}

/**
 * Produces a rotation- and direction-independent signature for a cycle so
 * duplicate detections of the same polygon can be skipped.
 */
function signature(keys) {
  const n = keys.length;
  let min = 0;
  for (let i = 1; i < n; i++) {
    if (keys[i] < keys[min]) min = i;
  }
  const fwd = [];
  const bwd = [];
  for (let i = 0; i < n; i++) {
    fwd.push(keys[(min + i) % n]);
    bwd.push(keys[(min - i + n) % n]);
  }
  const fwdStr = fwd.join('|');
  const bwdStr = bwd.join('|');
  return fwdStr < bwdStr ? fwdStr : bwdStr;
}

function round(v) {
  return Math.round(v / EPSILON) * EPSILON;
}
