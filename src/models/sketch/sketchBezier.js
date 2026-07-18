/**
 * SketchBezier — a cubic Bézier curve entity in the sketch.
 *
 * Defined by four control points: start, two handle points (control1 and
 * control2), and end. All four are regular SketchPoints that live in
 * `sketch.points` so they can be dragged, snapped, and constrained like
 * any other point.
 *
 * The curve is rendered smoothly on the canvas but flattened into line
 * segments for closed-shape detection and cell-fill calculations.
 */
export class SketchBezier {
  constructor(id, start, control1, control2, end) {
    this.id = id;
    this.start = start;
    this.control1 = control1;
    this.control2 = control2;
    this.end = end;
    this.isSelected = false;
  }

  toString() {
    return `B${this.id} (${this.start.x.toFixed(1)},${this.start.y.toFixed(1)}) -> (${this.end.x.toFixed(1)},${this.end.y.toFixed(1)})`;
  }
}

/**
 * Flatten a cubic Bézier into a series of line segments.
 *
 * @param {SketchBezier} bezier
 * @param {number} [segments=24] - number of subdivisions
 * @returns {Array<{start:{x:number,y:number},end:{x:number,y:number},isConstruction:boolean}>}
 */
export function flattenBezier(bezier, segments = 24) {
  const { start, control1, control2, end } = bezier;
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const x = mt * mt * mt * start.x + 3 * mt * mt * t * control1.x + 3 * mt * t * t * control2.x + t * t * t * end.x;
    const y = mt * mt * mt * start.y + 3 * mt * mt * t * control1.y + 3 * mt * t * t * control2.y + t * t * t * end.y;
    points.push({ x, y });
  }
  const lines = [];
  for (let i = 0; i < points.length - 1; i++) {
    lines.push({
      start: points[i],
      end: points[i + 1],
      isConstruction: false,
    });
  }
  return lines;
}
