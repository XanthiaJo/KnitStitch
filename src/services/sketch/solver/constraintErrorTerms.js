// constraintErrorTerms.js
// Error functions and analytical gradients for geometric (soft) constraints.
//
// Each constraint is compiled into a lightweight term object. The solver can
// then sum term errors and combine term gradients without knowing the original
// constraint types.

import { findSharedPoint, otherPoint, lineLength } from '../../../utils/geometry.js';

export const EPSILON = 1e-9;

/**
 * Build a list of error terms from sketch constraints.
 *
 * @param {Array} constraints
 * @returns {Array<{ kind:string, error():number, gradient(grads:Map) }>}
 */
export function buildErrorTerms(constraints) {
  const terms = [];
  for (const c of constraints || []) {
    if (!c) continue;
    switch (c.type) {
      case 'Perpendicular': {
        const anchor = c.pointA ?? findSharedPoint(c.lineA, c.lineB);
        if (!anchor || !c.lineA || !c.lineB) continue;
        const otherA = otherPoint(c.lineA, anchor);
        const otherB = otherPoint(c.lineB, anchor);
        if (!otherA || !otherB) continue;
        terms.push({
          kind: 'Perpendicular',
          anchor,
          otherA,
          otherB,
          error() {
            const ax = this.otherA.x - this.anchor.x;
            const ay = this.otherA.y - this.anchor.y;
            const bx = this.otherB.x - this.anchor.x;
            const by = this.otherB.y - this.anchor.y;
            const dot = ax * bx + ay * by;
            return dot * dot;
          },
          gradient(grads) {
            const ax = this.otherA.x - this.anchor.x;
            const ay = this.otherA.y - this.anchor.y;
            const bx = this.otherB.x - this.anchor.x;
            const by = this.otherB.y - this.anchor.y;
            const dot = ax * bx + ay * by;
            const f = 2 * dot;
            acc(grads, this.otherA, f * bx, f * by);
            acc(grads, this.otherB, f * ax, f * ay);
            acc(grads, this.anchor, f * (-bx - ax), f * (-by - ay));
          },
        });
        break;
      }
      case 'Coincident': {
        if (!c.pointA || !c.pointB) continue;
        const a = c.pointA;
        const b = c.pointB;
        terms.push({
          kind: 'Coincident',
          a,
          b,
          error() {
            const dx = this.a.x - this.b.x;
            const dy = this.a.y - this.b.y;
            return dx * dx + dy * dy;
          },
          gradient(grads) {
            const dx = this.a.x - this.b.x;
            const dy = this.a.y - this.b.y;
            acc(grads, this.a, 2 * dx, 2 * dy);
            acc(grads, this.b, -2 * dx, -2 * dy);
          },
        });
        break;
      }
      case 'Midpoint': {
        if (!c.lineA) continue;

        // Line-line midpoint: midpoints of both lines must coincide.
        if (!c.pointA && c.lineB) {
          if (c.lineA === c.lineB) continue;
          const lineA = c.lineA;
          const lineB = c.lineB;
          terms.push({
            kind: 'MidpointLineLine',
            lineA,
            lineB,
            error() {
              const ax = (this.lineA.start.x + this.lineA.end.x) / 2;
              const ay = (this.lineA.start.y + this.lineA.end.y) / 2;
              const bx = (this.lineB.start.x + this.lineB.end.x) / 2;
              const by = (this.lineB.start.y + this.lineB.end.y) / 2;
              const dx = ax - bx;
              const dy = ay - by;
              return dx * dx + dy * dy;
            },
            gradient(grads) {
              const ax = (this.lineA.start.x + this.lineA.end.x) / 2;
              const ay = (this.lineA.start.y + this.lineA.end.y) / 2;
              const bx = (this.lineB.start.x + this.lineB.end.x) / 2;
              const by = (this.lineB.start.y + this.lineB.end.y) / 2;
              const dx = ax - bx;
              const dy = ay - by;
              acc(grads, this.lineA.start, dx, dy);
              acc(grads, this.lineA.end, dx, dy);
              acc(grads, this.lineB.start, -dx, -dy);
              acc(grads, this.lineB.end, -dx, -dy);
            },
          });
          break;
        }

        // Point-line midpoint: point sits at the midpoint of the line.
        if (!c.pointA) continue;
        if (c.lineA.start === c.pointA || c.lineA.end === c.pointA) continue;
        const point = c.pointA;
        const line = c.lineA;
        terms.push({
          kind: 'Midpoint',
          point,
          line,
          error() {
            const mx = (this.line.start.x + this.line.end.x) / 2;
            const my = (this.line.start.y + this.line.end.y) / 2;
            const dx = this.point.x - mx;
            const dy = this.point.y - my;
            return dx * dx + dy * dy;
          },
          gradient(grads) {
            const mx = (this.line.start.x + this.line.end.x) / 2;
            const my = (this.line.start.y + this.line.end.y) / 2;
            const dx = this.point.x - mx;
            const dy = this.point.y - my;
            acc(grads, this.point, 2 * dx, 2 * dy);
            acc(grads, this.line.start, -dx, -dy);
            acc(grads, this.line.end, -dx, -dy);
          },
        });
        break;
      }
      case 'Equal': {
        if (!c.lineA || !c.lineB || c.lineA === c.lineB) continue;
        const lineA = c.lineA;
        const lineB = c.lineB;
        terms.push({
          kind: 'Equal',
          lineA,
          lineB,
          error() {
            const d = lineLength(this.lineA) - lineLength(this.lineB);
            return d * d;
          },
          gradient(grads) {
            const la = lineLength(this.lineA);
            const lb = lineLength(this.lineB);
            const diff = 2 * (la - lb);
            if (la > EPSILON) {
              const ux = (this.lineA.end.x - this.lineA.start.x) / la;
              const uy = (this.lineA.end.y - this.lineA.start.y) / la;
              acc(grads, this.lineA.start, -diff * ux, -diff * uy);
              acc(grads, this.lineA.end, diff * ux, diff * uy);
            }
            if (lb > EPSILON) {
              const ux = (this.lineB.end.x - this.lineB.start.x) / lb;
              const uy = (this.lineB.end.y - this.lineB.start.y) / lb;
              acc(grads, this.lineB.start, diff * ux, diff * uy);
              acc(grads, this.lineB.end, -diff * ux, -diff * uy);
            }
          },
        });
        break;
      }
      case 'Horizontal': {
        if (!c.lineA) continue;
        const line = c.lineA;
        terms.push({
          kind: 'Horizontal',
          line,
          error() {
            const dy = this.line.end.y - this.line.start.y;
            return dy * dy;
          },
          gradient(grads) {
            const dy = this.line.end.y - this.line.start.y;
            const f = 2 * dy;
            acc(grads, this.line.start, 0, -f);
            acc(grads, this.line.end, 0, f);
          },
        });
        break;
      }
      case 'Vertical': {
        if (!c.lineA) continue;
        const line = c.lineA;
        terms.push({
          kind: 'Vertical',
          line,
          error() {
            const dx = this.line.end.x - this.line.start.x;
            return dx * dx;
          },
          gradient(grads) {
            const dx = this.line.end.x - this.line.start.x;
            const f = 2 * dx;
            acc(grads, this.line.start, -f, 0);
            acc(grads, this.line.end, f, 0);
          },
        });
        break;
      }
    }
  }
  return terms;
}

/**
 * Sum the error of all terms.
 */
export function totalError(terms) {
  let total = 0;
  for (const t of terms) total += t.error();
  return total;
}

/**
 * Compute the combined gradient for all terms.
 *
 * @returns {Map<SketchPoint, {x:number, y:number}>}
 */
export function computeGradients(terms) {
  const grads = new Map();
  for (const t of terms) t.gradient(grads);
  return grads;
}

function acc(grads, point, gx, gy) {
  if (!point) return;
  const g = grads.get(point);
  if (g) {
    g.x += gx;
    g.y += gy;
  } else {
    grads.set(point, { x: gx, y: gy });
  }
}
