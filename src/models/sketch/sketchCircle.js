/**
 * SketchCircle — a first-class circle entity in the sketch.
 *
 * A circle is defined by a center point and a radius (in pixels). The center
 * is a regular SketchPoint that lives in `sketch.points` so it can be dragged,
 * snapped, and constrained like any other point. The radius is a scalar stored
 * on the circle itself.
 *
 * The SolveSpace solver syncs circles via `slvs.addCircle` with a distance
 * entity for the radius, so circles participate fully in constraint solving.
 */
export class SketchCircle {
  constructor(id, center, radius) {
    this.id = id;
    this.center = center;
    this.radius = radius;
    this.isSelected = false;
  }

  toString() {
    return `C${this.id} (${this.center.x.toFixed(1)},${this.center.y.toFixed(1)}) r=${this.radius.toFixed(1)}`;
  }
}
