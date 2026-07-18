/**
 * Removes a point from the sketch if it is not referenced by any line,
 * dimension, or constraint. The origin anchor is never removed.
 *
 * Mutates `sketch.points` in place. Returns `true` if the point was removed.
 *
 * @param {object} sketch - the mutable sketch state object
 * @param {object} point - the point to evaluate
 * @returns {boolean}
 */
export function removeOrphanPoint(sketch, point) {
  if (point.id < 0) return false;
  if (point.isOrigin) return false;

  for (const line of sketch.lines) {
    if (line.start === point || line.end === point) return false;
  }
  for (const dim of sketch.dimensions) {
    if (dim.a === point || dim.b === point) return false;
  }
  for (const constraint of sketch.constraints) {
    if (constraint?.pointA === point || constraint?.pointB === point) return false;
  }

  for (const bezier of sketch.beziers || []) {
    if (bezier.start === point || bezier.end === point ||
        bezier.control1 === point || bezier.control2 === point) return false;
  }

  const idx = sketch.points.indexOf(point);
  if (idx >= 0) {
    sketch.points.splice(idx, 1);
    return true;
  }
  return false;
}
