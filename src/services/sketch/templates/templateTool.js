import { SketchLine } from '../../../models/sketch/sketchLine.js';
import { SketchPoint } from '../../../models/sketch/sketchPoint.js';
import { SketchDimension } from '../../../models/sketch/sketchDimension.js';
import { SketchConstraint } from '../../../models/sketch/sketchConstraint.js';
import {
  flushSketchArrays,
  rebuildSketchObjects,
} from '../state/sketchStateHelpers.js';
import {
  DEFAULT_SOCK_MEASUREMENTS,
  buildSockOutlineInInches,
} from './sockMeasurements.js';

/**
 * Template registry. Each template defines:
 * - id, label
 * - defaultMeasurements: the default body measurements for this template
 * - buildOutline(gauge, measurements): returns { outline, sections, minCols, minRows }
 *   where outline is an array of {x, y} in INCH coordinates,
 *   sections is { width, topRib, backLeg, heel, sole, toe, instep, bottomRib } in inches,
 *   and minCols/minRows are the grid size needed (in stitch/row units).
 */
const TEMPLATES = {
  sock: {
    id: 'sock',
    label: 'Sock',
    defaultMeasurements: { ...DEFAULT_SOCK_MEASUREMENTS },
    buildOutline(gauge, measurements) {
      return buildSockOutlineInInches(gauge, measurements);
    },
  },
};

const INCH_SUFFIX = ' in';

/**
 * Owns the template generation workflow. Given a template id, creates the
 * outline as sketch points and connected lines on the grid, using true inch
 * measurements converted to pixels via the gauge.
 *
 * The template geometry is defined in inches (real-world measurements), not
 * in stitch/row counts. This means changing the cell size or gauge changes
 * how many grid cells the template occupies, but the physical measurements
 * stay the same.
 *
 * Receives the SketchService instance so it can reuse shared helpers (point
 * creation, store access, object rebuild) without duplicating them.
 */
export class TemplateTool {
  constructor(service) {
    this.service = service;
  }

  get templates() {
    return Object.values(TEMPLATES);
  }

  /**
   * Returns the default measurements for a template.
   */
  getDefaultMeasurements(templateId) {
    const template = TEMPLATES[templateId];
    if (!template) return null;
    return { ...template.defaultMeasurements };
  }

  /**
   * Generates the named template onto the grid as sketch entities.
   * Clears any existing sketch content first, ensures the grid is large
   * enough, then creates points and lines from the inch-driven outline.
   */
  generate(templateId, measurements = null) {
    const template = TEMPLATES[templateId];
    if (!template) return;

    const store = this.service.store;
    const gauge = {
      stitchesPer4Inches: store.get('stitchesPer4Inches'),
      rowsPer4Inches: store.get('rowsPer4Inches'),
    };
    const m = measurements ?? store.get('templateMeasurements') ?? template.defaultMeasurements;

    // Store the active template + measurements so re-generation is possible
    store.set('activeTemplateId', templateId);
    store.set('templateMeasurements', { ...m });

    const { outline, sections } = template.buildOutline(gauge, m);

    this.service._recordSnapshot(`Apply template: ${template.label}`);
    this._clearSketch();

    const cellW = store.get('cellWidthPx');
    const cellH = store.get('cellHeightPx');

    // Convert inches to pixels using gauge:
    //   pxX = inches × stitchesPerInch × cellWidthPx
    //   pxY = inches × rowsPerInch × cellHeightPx
    const stitchPerInch = gauge.stitchesPer4Inches / 4;
    const rowPerInch = gauge.rowsPer4Inches / 4;
    const pxPerInchX = stitchPerInch * cellW;
    const pxPerInchY = rowPerInch * cellH;

    const points = outline.map((pt) => {
      const p = new SketchPoint(
        this.service._nextPointId++,
        pt.x * pxPerInchX,
        pt.y * pxPerInchY,
      );
      store.state.sketch.points.push(p);
      return p;
    });

    // Anchor the template's reference point to the origin. For the sock template
    // the reference point is the top-left corner (point 0).
    this._anchorTemplateToOrigin(points, templateId);

    for (let i = 0; i < points.length; i++) {
      const start = points[i];
      const end = points[(i + 1) % points.length];
      const line = new SketchLine(this.service._nextLineId++, start, end);
      store.state.sketch.lines.push(line);
    }

    // Add driving dimensions showing inch values
    this._addSockDimensions(points, sections, pxPerInchX, pxPerInchY);

    // Add geometric constraints for full constraint
    this._addSockConstraints(points);

    flushSketchArrays(this.service);
    rebuildSketchObjects(this.service);
  }

  /**
   * Regenerates the currently active template using updated measurements.
   * Called when the user edits measurement inputs.
   */
  regenerate(measurements) {
    const templateId = this.service.store.get('activeTemplateId');
    if (!templateId) return;
    this.generate(templateId, measurements);
  }

  _clearSketch() {
    const sketch = this.service.store.state.sketch;
    sketch.lines = [];
    sketch.points = [];
    sketch.dimensions = [];
    sketch.constraints = [];
    this.service._selectedPoints.clear();
    this.service._selectedLines.clear();
  }

  /**
   * Offsets a set of freshly created template points so the template's reference
   * point sits at the origin, then creates an anchor point at the origin and
   * adds a coincident constraint between the anchor and the reference point.
   *
   * @param {SketchPoint[]} points
   * @param {string} templateId
   */
  _anchorTemplateToOrigin(points, templateId) {
    if (!points?.length) return;

    const referenceIndex = this._templateReferencePointIndex(templateId);
    const referencePoint = points[referenceIndex];
    if (!referencePoint) return;

    const offsetX = -referencePoint.x;
    const offsetY = -referencePoint.y;
    for (const p of points) {
      p.x += offsetX;
      p.y += offsetY;
    }

    const store = this.service.store;
    let anchor = store.state.sketch.points.find((p) => p.isAnchor && p.x === 0 && p.y === 0);
    if (!anchor) {
      anchor = new SketchPoint(this.service._nextPointId++, 0, 0);
      anchor.isAnchor = true;
      store.state.sketch.points.push(anchor);
    }

    const constraint = new SketchConstraint(
      'Coincident',
      anchor,
      referencePoint,
      null,
      null,
      this.service._nextConstraintId++,
    );
    store.state.sketch.constraints.push(constraint);
  }

  /**
   * Returns the index of the template point that should be placed at the origin.
   * Each template defines its own reference corner/edge.
   */
  _templateReferencePointIndex(templateId) {
    switch (templateId) {
      case 'sock': return 0; // top-left corner
      default: return 0;
    }
  }

  /**
   * Creates driving dimensions for the sock template:
   * - 1 horizontal width dimension across the top
   * - 5 vertical section dimensions on each edge (non-notch segments only)
   * - 8 aligned dimensions for the notch points (2 per side × 2 notches × 2 sides)
   *
   * The heel/toe span dimensions (e.g. 2→4) are intentionally omitted because
   * the aligned notch dimensions already lock the same geometry; adding the
   * spans over-constrains the region and the sequential solver cannot resolve
   * them consistently during drags.
   *
   * The right-side notch points need their own aligned dimensions as well;
   * Equal Length only locks line length, not absolute position, so without these
   * dimensions the right toe/heel points would be free-floating relative to the
   * dimensioned right edge.
   *
   * All dimensions show inch values (with " in" suffix) and have driven pixel
   * values set so the lock icon appears.
   *
   * Outline point indices (see buildSockOutlineInInches):
   *   Left edge:  0(top) 1(end rib) 2(end leg) 3(heel) 4(end heel) 5(end sole)
   *               6(toe) 7(end toe) 8(end instep) 9(bottom)
   *   Right edge: 19(top) 18(end rib) 17(end leg) 16(heel) 15(end heel)
   *               14(end sole) 13(toe) 12(end toe) 11(end instep) 10(bottom)
   *
   * @param {SketchPoint[]} points - pixel-coordinate sketch points
   * @param {object} sections - { width, topRib, backLeg, heel, sole, toe, instep, bottomRib, notchDepth } in inches
   * @param {number} pxPerInchX - pixels per inch horizontally
   * @param {number} pxPerInchY - pixels per inch vertically
   */
  _addSockDimensions(points, sections, pxPerInchX, pxPerInchY) {
    const store = this.service.store;
    const dims = store.state.sketch.dimensions;

    const addDim = (a, b, offsetSign, inches, pxPerInch) => {
      const dim = new SketchDimension(this.service._nextDimId++, a, b, offsetSign);
      dim.setDrivenDisplay(inches * pxPerInch, inches, INCH_SUFFIX);
      dims.push(dim);
    };

    // Aligned dimension helper (for diagonal notch lines)
    const addAlignedDim = (a, b, offsetSign, inchesX, inchesY) => {
      const pxX = inchesX * pxPerInchX;
      const pxY = inchesY * pxPerInchY;
      const pxDist = Math.sqrt(pxX * pxX + pxY * pxY);
      const inchDist = Math.sqrt(inchesX * inchesX + inchesY * inchesY);
      const dim = new SketchDimension(this.service._nextDimId++, a, b, offsetSign);
      dim.setDrivenDisplay(pxDist, inchDist, INCH_SUFFIX);
      dims.push(dim);
    };

    // === Left edge: width + 7 vertical section dimensions (offset left) ===
    addDim(points[0], points[19], -1, sections.width, pxPerInchX);

    addDim(points[0], points[1],  -1, sections.topRib,    pxPerInchY); // top ribbing
    addDim(points[1], points[2],  -1, sections.backLeg,   pxPerInchY); // back leg
    // NOTE: the heel and toe spans (2→4 and 5→7) are intentionally omitted.
    // The same distances are already captured by the two aligned notch
    // dimensions on each side, and adding the spans over-constrains the notch
    // region in a way the sequential solver cannot resolve.
    addDim(points[4], points[5],  -1, sections.sole,      pxPerInchY); // sole
    addDim(points[7], points[8],  -1, sections.instep,    pxPerInchY); // instep + front leg
    addDim(points[8], points[9],  -1, sections.bottomRib, pxPerInchY); // bottom ribbing

    // === Right edge: 7 vertical section dimensions (offset right) ===
    addDim(points[19], points[18], 1, sections.topRib,    pxPerInchY); // top ribbing
    addDim(points[18], points[17], 1, sections.backLeg,   pxPerInchY); // back leg
    // NOTE: the heel and toe spans (17→15 and 14→12) are intentionally omitted
    // for the same reason as the left side: the aligned notch dimensions on the
    // left already define the notch, and the Equal constraints mirror them.
    addDim(points[15], points[14], 1, sections.sole,      pxPerInchY); // sole
    addDim(points[12], points[11], 1, sections.instep,    pxPerInchY); // instep + front leg
    addDim(points[11], points[10], 1, sections.bottomRib, pxPerInchY); // bottom ribbing

    // === Left-side notch points: 2 aligned dimensions each ===
    // Heel notch (point 3): diagonal from point 2 and from point 4
    const heelHalf = sections.heel / 2;
    addAlignedDim(points[2], points[3], 1, sections.notchDepth, heelHalf); // 2→3
    addAlignedDim(points[3], points[4], 1, sections.notchDepth, heelHalf); // 3→4

    // Toe notch (point 6): diagonal from point 5 and from point 7
    const toeHalf = sections.toe / 2;
    addAlignedDim(points[5], points[6], 1, sections.notchDepth, toeHalf); // 5→6
    addAlignedDim(points[6], points[7], 1, sections.notchDepth, toeHalf); // 6→7

    // === Right-side notch points: 2 aligned dimensions each ===
    // These mirror the left-side notch dimensions so the right heel/toe points
    // (16 and 13) are fully determined and cannot slide along the right edge.
    addAlignedDim(points[16], points[17], -1, sections.notchDepth, heelHalf); // 16→17
    addAlignedDim(points[15], points[16], -1, sections.notchDepth, heelHalf); // 15→16
    addAlignedDim(points[13], points[12], -1, sections.notchDepth, toeHalf); // 13→12
    addAlignedDim(points[14], points[13], -1, sections.notchDepth, toeHalf); // 14→13
  }

  /**
   * Creates Equal constraints linking right-side notch lines to their
   * left-side counterparts. This constrains the right-side notch points
   * (16 and 13) by ensuring their lines match the left-side notch lines
   * in length.
   *
   * Lines are indexed in creation order (see generate):
   *   Line 0:  0→1    Line 10: 10→11
   *   Line 1:  1→2    Line 11: 11→12
   *   Line 2:  2→3    Line 12: 12→13
   *   Line 3:  3→4    Line 13: 13→14
   *   Line 4:  4→5    Line 14: 14→15
   *   Line 5:  5→6    Line 15: 15→16
   *   Line 6:  6→7    Line 16: 16→17
   *   Line 7:  7→8    Line 17: 17→18
   *   Line 8:  8→9    Line 18: 18→19
   *   Line 9:  9→10   Line 19: 19→0
   *
   * @param {SketchPoint[]} points
   */
  _addSockConstraints(points) {
    const store = this.service.store;
    const lines = store.state.sketch.lines;
    const constraints = store.state.sketch.constraints;

    const addEqual = (lineA, lineB) => {
      const constraint = new SketchConstraint(
        'Equal',
        null,
        null,
        lineA,
        lineB,
        this.service._nextConstraintId++
      );
      constraints.push(constraint);
    };

    const addPerpendicular = (anchor, lineA, lineB) => {
      const constraint = new SketchConstraint(
        'Perpendicular',
        anchor,
        null,
        lineA,
        lineB,
        this.service._nextConstraintId++
      );
      constraints.push(constraint);
    };

    // Perpendicular constraints at the 4 corners of the sock outline:
    //   top-left (point 0):  top edge (line 19) ⊥ left edge (line 0)
    //   bottom-left (point 9):  left edge (line 8) ⊥ bottom edge (line 9)
    //   bottom-right (point 10): bottom edge (line 9) ⊥ right edge (line 10)
    //   top-right (point 19):  right edge (line 18) ⊥ top edge (line 19)
    addPerpendicular(points[0],  lines[19], lines[0]);
    addPerpendicular(points[9],  lines[8],  lines[9]);
    addPerpendicular(points[10], lines[9],  lines[10]);
    addPerpendicular(points[19], lines[18], lines[19]);
  }
}
