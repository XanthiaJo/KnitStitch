// sketchHitTest.js — pure hit-testing for the sketch layer.
//
// Extracted from SketchLayer so the layer stays a thin orchestrator. Each
// finder returns the matched entity or null; `hitTestSketch` returns the
// first match in priority order (dimension > point > constraint > circle >
// bezier > line) as `{ dimension | point | constraint | circle | bezier | line }`.
//
// `service` is only needed for the shared-point lookup used by constraint
// icon hit-testing; pass `null` if constraints don't need to be hit-tested.

import { nearestLine, nearestPoint } from '../utils/geometry.js';

const HIT_RADIUS = 10;
const CIRCLE_HIT_RADIUS = 10;
const BEZIER_HIT_RADIUS = 10;
const CONSTRAINT_HIT_RADIUS = 12;
const DIMENSION_LABEL_HALF_HEIGHT = 10;
const BEZIER_SEGMENTS = 24;

/**
 * @param {{ x: number, y: number }} position
 * @param {{ points: any[], lines: any[], circles: any[], beziers: any[], dimensions: any[], constraints: any[] }} sketch
 * @param {{ _findSharedPoint?: Function } | null} service
 * @returns {{ dimension?: any, point?: any, constraint?: any, circle?: any, bezier?: any, line?: any } | null}
 */
export function hitTestSketch(position, sketch, service) {
  const dimension = findDimension(position, sketch.dimensions);
  if (dimension) return { dimension };
  const point = nearestPoint(sketch.points, position, HIT_RADIUS);
  if (point) return { point };
  const constraint = findConstraint(position, sketch.constraints, service);
  if (constraint) return { constraint };
  const circle = findCircle(position, sketch.circles);
  if (circle) return { circle };
  const bezier = findBezier(position, sketch.beziers);
  if (bezier) return { bezier };
  const line = nearestLine(sketch.lines, position, HIT_RADIUS);
  return line ? { line } : null;
}

export function findCircle(position, circles = []) {
  let best = null;
  let bestDist = CIRCLE_HIT_RADIUS;
  for (const c of circles) {
    const dx = position.x - c.center.x;
    const dy = position.y - c.center.y;
    const distToCenter = Math.sqrt(dx * dx + dy * dy);
    const distToCircumference = Math.abs(distToCenter - c.radius);
    if (distToCircumference < bestDist) {
      bestDist = distToCircumference;
      best = c;
    }
  }
  return best ?? null;
}

export function findBezier(position, beziers = []) {
  let best = null;
  let bestDist = BEZIER_HIT_RADIUS;
  for (const b of beziers) {
    const { start, control1, control2, end } = b;
    let prevX = start.x, prevY = start.y;
    for (let i = 1; i <= BEZIER_SEGMENTS; i++) {
      const t = i / BEZIER_SEGMENTS;
      const mt = 1 - t;
      const x = mt * mt * mt * start.x + 3 * mt * mt * t * control1.x + 3 * mt * t * t * control2.x + t * t * t * end.x;
      const y = mt * mt * mt * start.y + 3 * mt * mt * t * control1.y + 3 * mt * t * t * control2.y + t * t * t * end.y;
      const dx = x - prevX, dy = y - prevY;
      const len2 = dx * dx + dy * dy;
      const dist = len2 > 0
        ? Math.sqrt(Math.max(0, (position.x - prevX) * dx + (position.y - prevY) * dy) / len2 * len2)
        : Math.hypot(position.x - prevX, position.y - prevY);
      const perp = Math.hypot(position.x - prevX - dist * dx / (Math.sqrt(len2) || 1), position.y - prevY - dist * dy / (Math.sqrt(len2) || 1));
      if (perp < bestDist) {
        bestDist = perp;
        best = b;
      }
      prevX = x;
      prevY = y;
    }
  }
  return best ?? null;
}

export function findDimension(position, dimensions = []) {
  return dimensions.find((dim) => {
    const angle = -(dim.labelAngle || 0) * Math.PI / 180;
    const dx = position.x - dim.labelPos.x;
    const dy = position.y - dim.labelPos.y;
    const x = dx * Math.cos(angle) - dy * Math.sin(angle);
    const y = dx * Math.sin(angle) + dy * Math.cos(angle);
    return Math.abs(x) <= dim.labelText.length * 3 + 8 && Math.abs(y) <= DIMENSION_LABEL_HALF_HEIGHT;
  }) ?? null;
}

export function findConstraint(position, constraints = [], service = null) {
  return constraints.find((constraint) => {
    let point = constraint.pointA;
    if (!point && constraint.lineA && constraint.lineB) {
      point = service?._findSharedPoint?.(constraint.lineA, constraint.lineB) ?? null;
    }
    if (!point && constraint.lineA && constraint.lineB) {
      point = {
        x: (constraint.lineA.start.x + constraint.lineA.end.x + constraint.lineB.start.x + constraint.lineB.end.x) / 4,
        y: (constraint.lineA.start.y + constraint.lineA.end.y + constraint.lineB.start.y + constraint.lineB.end.y) / 4,
      };
    }
    if (!point && constraint.lineA) {
      point = {
        x: (constraint.lineA.start.x + constraint.lineA.end.x) / 2,
        y: (constraint.lineA.start.y + constraint.lineA.end.y) / 2,
      };
    }
    return point && Math.hypot(position.x - point.x, position.y - point.y) <= CONSTRAINT_HIT_RADIUS;
  }) ?? null;
}
