// dimensionSolver.js
// Driven dimension enforcement — moves otherPoint to maintain the
// dimension's locked value when the referenced point moves.

const EPSILON = 0.000001;

/**
 * Move otherPoint so that the dimension between movedPoint and otherPoint
 * equals dim.drivenValue. The direction is preserved from the original
 * relative position.
 *
 * @param {object} dim - dimension with kind ('Horizontal'|'Vertical'|'Aligned'),
 *                       drivenValue, a, b
 * @param {object} movedPoint - the point that was directly manipulated
 * @param {object} otherPoint - the point to be moved
 * @param {{x:number,y:number}|null} originalPosition - movedPoint's position
 *   before the drag (used to determine direction)
 */
export function maintainDrivenDimension(dim, movedPoint, otherPoint, originalPosition) {
  const target = Number(dim.drivenValue);
  if (!Number.isFinite(target) || target <= 0) return;

  const source = originalPosition ?? movedPoint;
  const dx = otherPoint.x - source.x;
  const dy = otherPoint.y - source.y;

  if (dim.kind === 'Horizontal') {
    const signX = Math.sign(dx) || 1;
    otherPoint.x = movedPoint.x + signX * target;
    otherPoint.y = movedPoint.y;
    return;
  }

  if (dim.kind === 'Vertical') {
    const signY = Math.sign(dy) || 1;
    otherPoint.x = movedPoint.x;
    otherPoint.y = movedPoint.y + signY * target;
    return;
  }

  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < EPSILON) {
    otherPoint.x = movedPoint.x + target;
    otherPoint.y = movedPoint.y;
    return;
  }

  otherPoint.x = movedPoint.x + (dx / len) * target;
  otherPoint.y = movedPoint.y + (dy / len) * target;
}
