export class SketchLine {
  constructor(id, start, end, isConstruction = false) {
    this.id = id;
    this.start = start;
    this.end = end;
    this.isConstruction = isConstruction;
    this.isSelected = false;
  }
}
