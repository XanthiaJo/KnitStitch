/**
 * Pure geometry helpers shared across sketch services.
 */

/**
 * Euclidean distance between two points.
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {number}
 */
export function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Returns the nearest point in `points` within `snapRadius` of `position`,
 * optionally excluding one point. Returns null if none found.
 * @param {Array<{x:number,y:number}>} points
 * @param {{x:number,y:number}} position
 * @param {number} snapRadius
 * @param {{x:number,y:number}|null} excludePoint
 * @returns {{x:number,y:number}|null}
 */
export function nearestPoint(points, position, snapRadius, excludePoint = null) {
  let best = null;
  let bestDist = snapRadius;
  for (const p of points || []) {
    if (p === excludePoint) continue;
    const d = distance(p, position);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

/**
 * Snaps `end` to horizontal or vertical relative to `start` when within
 * `thresholdDeg` of those axes. Returns the (possibly snapped) position.
 * @param {{x:number,y:number}} start
 * @param {{x:number,y:number}} end
 * @param {number} thresholdDeg
 * @returns {{x:number,y:number}}
 */
export function applyAngleSnap(start, end, thresholdDeg) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angleDeg = Math.abs(Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI);
  if (angleDeg <= thresholdDeg) return { x: end.x, y: start.y };
  if (angleDeg >= 90 - thresholdDeg) return { x: start.x, y: end.y };
  return { x: end.x, y: end.y };
}
export function findSharedPoint(lineA, lineB) {
  if (!lineA || !lineB) return null;
  if (lineA.start === lineB.start || lineA.start === lineB.end) return lineA.start;
  if (lineA.end === lineB.start || lineA.end === lineB.end) return lineA.end;
  return null;
}

/**
 * Returns the endpoint of `line` that is not `point`, or null if `point`
 * is not an endpoint of `line`.
 * @param {{start:*,end:*}} line
 * @param {*} point
 * @returns {*|null}
 */
export function otherPoint(line, point) {
  if (!line) return null;
  if (line.start === point) return line.end;
  if (line.end === point) return line.start;
  return null;
}

/**
 * Returns true if `point` is an endpoint of `line`.
 * @param {{start:*,end:*}} line
 * @param {*} point
 * @returns {boolean}
 */
export function lineUsesPoint(line, point) {
  return !!line && (line.start === point || line.end === point);
}

/**
 * Euclidean length of a line.
 * @param {{start:{x:number,y:number},end:{x:number,y:number}}} line
 * @returns {number}
 */
export function lineLength(line) {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function findLinesForPoint(point, lines) {
  return lines.filter((line) => line.start === point || line.end === point);
}

/**
 * Shortest distance from `position` to the line segment `start`->`end`.
 * @param {{x:number,y:number}} position
 * @param {{x:number,y:number}} start
 * @param {{x:number,y:number}} end
 * @returns {number}
 */
function distanceToSegment(position, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return distance(position, start);
  let t = ((position.x - start.x) * dx + (position.y - start.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const projection = { x: start.x + t * dx, y: start.y + t * dy };
  return distance(position, projection);
}

/**
 * Returns the nearest line in `lines` within `snapRadius` of `position`.
 * Returns null if none found.
 * @param {Array<{start:{x:number,y:number},end:{x:number,y:number}}>} lines
 * @param {{x:number,y:number}} position
 * @param {number} snapRadius
 * @returns {{start:{x:number,y:number},end:{x:number,y:number}}|null}
 */
export function nearestLine(lines, position, snapRadius) {
  let best = null;
  let bestDist = snapRadius;
  for (const line of lines || []) {
    const d = distanceToSegment(position, line.start, line.end);
    if (d < bestDist) {
      bestDist = d;
      best = line;
    }
  }
  return best;
}
