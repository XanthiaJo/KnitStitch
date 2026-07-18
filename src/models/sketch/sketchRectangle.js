/**
 * SketchRectangle — a rectangle that expands from its center point.
 *
 * A rectangle is a grouping model that owns:
 *   - 1 center point (regular SketchPoint, draggable — moves the whole shape)
 *   - 4 corner points (regular SketchPoints)
 *   - 4 edge lines (regular SketchLines)
 *   - 2 construction lines (horizontal + vertical through the center)
 *   - 4 perpendicular constraints (one at each corner)
 *   - 2 midpoint constraints (center = midpoint of each diagonal pair)
 *
 * All components live in the global `sketch.points` / `sketch.lines` /
 * `sketch.constraints` arrays so the solver sees them. The rectangle model
 * itself is a grouping reference in `sketch.rectangles` for clean object-list
 * display and atomic deletion.
 *
 * "Expand from the middle": the user clicks the center, then a corner. The
 * other three corners are placed symmetrically about the center:
 *   C  = center
 *   P1 = clicked corner
 *   P2 = mirror of P1 across the vertical construction line
 *   P3 = mirror of P1 across the center (diagonal)
 *   P4 = mirror of P1 across the horizontal construction line
 */
export class SketchRectangle {
  constructor(id, center, corners, edges, constructionLines, constraints) {
    this.id = id;
    this.center = center;           // SketchPoint
    this.corners = corners;         // [SketchPoint x4] (TL, TR, BR, BL)
    this.edges = edges;             // [SketchLine x4] (top, right, bottom, left)
    this.constructionLines = constructionLines; // [SketchLine x2] (horizontal, vertical)
    this.constraints = constraints; // [SketchConstraint x6] (4 perpendicular + 2 midpoint)
    this.isSelected = false;
  }

  toString() {
    return `R${this.id} center=(${this.center.x.toFixed(1)},${this.center.y.toFixed(1)})`;
  }
}
