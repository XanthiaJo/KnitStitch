export class SketchPoint {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.isSelected = false;
    this.isAnchor = false;
    this.isOrigin = false;
  }

  get dotX() {
    return this.x - 3;
  }

  get dotY() {
    return this.y - 3;
  }

  toString() {
    const prefix = this.isAnchor ? 'A' : 'P';
    return `${prefix}${this.id} (${this.x.toFixed(1)}, ${this.y.toFixed(1)})`;
  }
}
