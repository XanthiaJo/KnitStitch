// SketchConstraint.js - Port of SketchConstraint
// TODO: Port from Legacy/Models/Sketch/SketchConstraint.cs
// Port icon positioning. Remove PropertyChanged event subscriptions.

export class SketchConstraint {
  constructor(type, pointA = null, pointB = null, lineA = null, lineB = null, id = null) {
    this.id = id;
    this.type = type;
    this.pointA = pointA;
    this.pointB = pointB;
    this.lineA = lineA;
    this.lineB = lineB;
    this.isSelected = false;
  }

  get description() {
    if (this.type === 'Coincident' && this.pointA && this.pointB) {
      return `Coincident P${this.pointA.id + 1} & P${this.pointB.id + 1}`;
    }
    if (this.type === 'Perpendicular' && this.lineA && this.lineB) {
      return `Perpendicular L${this.lineA.id + 1} & L${this.lineB.id + 1}`;
    }
    if (this.type === 'Parallel' && this.lineA && this.lineB) {
      return `Parallel L${this.lineA.id + 1} & L${this.lineB.id + 1}`;
    }
    if (this.type === 'Midpoint' && this.lineA && this.lineB && !this.pointA) {
      return `Midpoint L${this.lineA.id + 1} & L${this.lineB.id + 1}`;
    }
    if (this.type === 'Midpoint' && this.lineA && this.pointA) {
      return `Midpoint P${this.pointA.id + 1} on L${this.lineA.id + 1}`;
    }
    if (this.type === 'Equal' && this.lineA && this.lineB) {
      return `Equal L${this.lineA.id + 1} & L${this.lineB.id + 1}`;
    }
    if (this.type === 'Coincident') return 'Coincident';
    return this.type ?? 'Constraint';
  }
}
