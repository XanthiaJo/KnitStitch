/**
 * Sock measurement calculations.
 *
 * Converts gauge (stitches/rows per 4 inches) and body measurements (inches)
 * into the stitch and row counts that define the flat one-piece fold-and-seam
 * sock template.
 *
 * Based on the Zoom Yummy "Easiest Knitted Socks Ever" pattern, which is
 * knitted flat as a single strip with two V-shaped notches (heel and toe).
 * The strip is then folded and seamed.
 *
 * Strip layout (top to bottom):
 *   1. Top ribbing (cuff back)       — ribRows
 *   2. Back leg (section A)          — legRows, straight
 *   3. Heel notch                    — notchRowsTotal, V-shaped (decrease + increase)
 *   4. Sole (section B)             — soleRows, straight
 *   5. Toe notch                     — notchRowsTotal, V-shaped (decrease + increase)
 *   6. Instep + front leg (section C)— instepRows = legRows + soleRows, straight
 *   7. Bottom ribbing (cuff front)   — ribRows
 *
 * The narrowest point of each notch is always 4 stitches wide (per the
 * pattern: "make the narrowest rows of the heel and toe part 4 stitches
 * wide").
 */

/** Narrowest stitch count at the heel/toe point. */
const NOTCH_MIN_STITCHES = 4;

/**
 * Default sock measurements (adult medium, in inches).
 */
export const DEFAULT_SOCK_MEASUREMENTS = {
  footCircumference: 8.5,    // ~22cm
  footLength: 9.5,           // ~24cm (sole length, heel to toe)
  legHeight: 5.5,            // ~14cm (back of leg, cuff to ankle)
  negativeEasePct: 10,       // 10% stretch fit
  ribbingLength: 1.0,        // ~2.5cm
};

/**
 * Rounds to the nearest even integer (required for centered machine-knit
 * shapes so decreases/increases are symmetric).
 */
function roundEven(value) {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/**
 * Compute the full set of stitch/row counts and section lengths from gauge
 * and body measurements.
 *
 * @param {{stitchesPer4Inches:number, rowsPer4Inches:number}} gauge
 * @param {{footCircumference:number, footLength:number, legHeight:number, negativeEasePct:number, ribbingLength:number}} measurements (inches)
 * @returns {object} derived counts
 */
export function computeSockCounts(gauge, measurements) {
  const stitchPerInch = gauge.stitchesPer4Inches / 4;
  const rowPerInch = gauge.rowsPer4Inches / 4;
  const easeFactor = 1 - (measurements.negativeEasePct ?? 0) / 100;

  // Width: foot circumference with negative ease, knit flat (half circumference)
  const fittedCirc = measurements.footCircumference * easeFactor;
  const flatWidthIn = fittedCirc / 2;
  const widthSts = roundEven(flatWidthIn * stitchPerInch);

  // Section rows from body measurements
  const ribRows = Math.max(0, Math.round(measurements.ribbingLength * rowPerInch));
  const legRows = Math.max(1, Math.round(measurements.legHeight * rowPerInch));
  const soleRows = Math.max(1, Math.round(measurements.footLength * rowPerInch));
  const instepRows = legRows + soleRows;   // C = A + B (instep + front leg = back leg + sole)

  // Notch: decrease from full width to NOTCH_MIN_STITCHES, then increase back.
  // 2 stitches decreased per row (1 on each end), so:
  //   notchDepthSts = (widthSts - NOTCH_MIN_STITCHES) / 2  (decrease on each side)
  //   notchRowsEachSide = notchDepthSts                     (rows to decrease to min)
  //   notchRowsTotal = notchRowsEachSide * 2               (decrease + increase)
  const notchDepthSts = Math.max(1, (widthSts - NOTCH_MIN_STITCHES) / 2);
  const notchRowsEachSide = notchDepthSts;
  const notchRowsTotal = notchRowsEachSide * 2;

  return {
    widthSts,
    ribRows,
    legRows,           // section A (back leg)
    soleRows,          // section B (sole)
    instepRows,        // section C (instep + front leg = A + B)
    notchDepthSts,
    notchRowsEachSide,
    notchRowsTotal,
  };
}

/**
 * Total rows the sock occupies on the grid:
 *   ribbing + back leg + heel + sole + toe + instep/front leg + ribbing
 */
export function sockTotalRows(counts) {
  return counts.ribRows * 2
    + counts.legRows
    + counts.notchRowsTotal
    + counts.soleRows
    + counts.notchRowsTotal
    + counts.instepRows;
}

/**
 * Total stitches the sock occupies on the grid (the common flat width).
 */
export function sockTotalStitches(counts) {
  return counts.widthSts;
}

/**
 * Builds the sock outline in stitch/row coordinates (0-based).
 *
 * The strip is vertical: x = stitches (width), y = rows (length).
 * Origin (0,0) is top-left. The sock hangs down from the top — ribbing at
 * the top and bottom, leg/foot sections in between. Notches are V-shaped
 * cuts into the left and right edges, with the narrowest point (4 stitches)
 * at the center of each notch section.
 *
 * @param {object} counts - output of computeSockCounts
 * @returns {Array<{x:number,y:number}>} outline points in stitch/row units
 */
export function buildSockOutlineInStitchRows(counts) {
  const {
    widthSts,
    ribRows,
    legRows,
    soleRows,
    instepRows,
    notchDepthSts,
    notchRowsEachSide,
    notchRowsTotal,
  } = counts;

  // Y positions of section boundaries (top to bottom)
  const y0 = 0;                                        // top edge
  const y1 = ribRows;                                  // end of top ribbing / start of back leg
  const y2 = y1 + legRows;                             // end of back leg / start of heel
  const y3 = y2 + notchRowsTotal;                      // end of heel / start of sole
  const y4 = y3 + soleRows;                            // end of sole / start of toe
  const y5 = y4 + notchRowsTotal;                      // end of toe / start of instep+front leg
  const y6 = y5 + instepRows;                          // end of instep+front leg / start of bottom ribbing
  const y7 = y6 + ribRows;                             // bottom edge

  // Notch narrowest points (at center of each notch section)
  const heelNarrowY = y2 + notchRowsEachSide;          // center of heel
  const toeNarrowY = y4 + notchRowsEachSide;           // center of toe

  // X positions: strip centered horizontally with margin
  const margin = Math.max(2, Math.round(widthSts * 0.1));
  const left = margin;
  const right = margin + widthSts;
  const notchLeftX = left + notchDepthSts;       // notch point goes right from left edge
  const notchRightX = right - notchDepthSts;     // notch point goes left from right edge

  return [
    // Left edge: top → bottom with notches going right
    { x: left, y: y0 },                                   // 0  top-left
    { x: left, y: y1 },                                   // 1  end of top ribbing
    { x: left, y: y2 },                                   // 2  end of back leg (before heel)
    { x: notchLeftX, y: heelNarrowY },                    // 3  heel narrowest point (right)
    { x: left, y: y3 },                                   // 4  end of heel (before sole)
    { x: left, y: y4 },                                   // 5  end of sole (before toe)
    { x: notchLeftX, y: toeNarrowY },                     // 6  toe narrowest point (right)
    { x: left, y: y5 },                                   // 7  end of toe (before instep)
    { x: left, y: y6 },                                   // 8  end of instep (before bottom ribbing)
    { x: left, y: y7 },                                   // 9  bottom-left
    // Bottom edge
    { x: right, y: y7 },                                  // 10 bottom-right
    // Right edge: bottom → top with notches going left
    { x: right, y: y6 },                                  // 11 end of instep (before bottom ribbing)
    { x: right, y: y5 },                                  // 12 end of toe (before instep)
    { x: notchRightX, y: toeNarrowY },                    // 13 toe narrowest point (left)
    { x: right, y: y4 },                                  // 14 end of sole (before toe)
    { x: right, y: y3 },                                  // 15 end of heel (before sole)
    { x: notchRightX, y: heelNarrowY },                   // 16 heel narrowest point (left)
    { x: right, y: y2 },                                  // 17 end of back leg (before heel)
    { x: right, y: y1 },                                  // 18 end of top ribbing
    { x: right, y: y0 },                                  // 19 top-right
  ];
}

/**
 * Computes the sock outline and section dimensions in true inches.
 *
 * Unlike buildSockOutlineInStitchRows which uses stitch/row counts, this
 * builds the outline directly from the body measurements in inches. The
 * notch dimensions are derived from the stitch counts (since the notch
 * shape is defined by the knitting process: decrease 2 sts per row to 4 sts,
 * then increase back), then converted back to inches via the gauge.
 *
 * @param {{stitchesPer4Inches:number, rowsPer4Inches:number}} gauge
 * @param {object} measurements - body measurements in inches
 * @returns {{outline: Array<{x:number,y:number}>, sections: object, minCols: number, minRows: number}}
 *   outline: points in inch coordinates
 *   sections: { width, topRib, backLeg, heel, sole, toe, instep, bottomRib } in inches
 *   minCols/minRows: grid size needed (in stitch/row units)
 */
export function buildSockOutlineInInches(gauge, measurements) {
  const counts = computeSockCounts(gauge, measurements);
  const stitchPerInch = gauge.stitchesPer4Inches / 4;
  const rowPerInch = gauge.rowsPer4Inches / 4;

  const easeFactor = 1 - (measurements.negativeEasePct ?? 0) / 100;
  const flatWidthIn = (measurements.footCircumference * easeFactor) / 2;

  // Section lengths in inches
  const sections = {
    width:      flatWidthIn,
    topRib:     measurements.ribbingLength,
    backLeg:    measurements.legHeight,
    heel:       counts.notchRowsTotal / rowPerInch,
    sole:       measurements.footLength,
    toe:        counts.notchRowsTotal / rowPerInch,
    instep:     measurements.legHeight + measurements.footLength,
    bottomRib:  measurements.ribbingLength,
    notchDepth: counts.notchDepthSts / stitchPerInch,
  };

  // Notch depth in inches (how far the notch cuts in from each side)
  const notchDepthIn = counts.notchDepthSts / stitchPerInch;

  // Y positions of section boundaries (top to bottom, in inches)
  const y0 = 0;
  const y1 = sections.topRib;
  const y2 = y1 + sections.backLeg;
  const y3 = y2 + sections.heel;
  const y4 = y3 + sections.sole;
  const y5 = y4 + sections.toe;
  const y6 = y5 + sections.instep;
  const y7 = y6 + sections.bottomRib;

  // Notch narrowest points (at center of each notch section)
  const heelNarrowY = y2 + sections.heel / 2;
  const toeNarrowY = y4 + sections.toe / 2;

  // X positions in inches (strip centered with margin)
  const marginIn = Math.max(0.5, flatWidthIn * 0.1);
  const left = marginIn;
  const right = marginIn + flatWidthIn;
  const notchLeftX = left + notchDepthIn;
  const notchRightX = right - notchDepthIn;

  const outline = [
    // Left edge: top → bottom with notches going right
    { x: left, y: y0 },                                   // 0  top-left
    { x: left, y: y1 },                                   // 1  end of top ribbing
    { x: left, y: y2 },                                   // 2  end of back leg (before heel)
    { x: notchLeftX, y: heelNarrowY },                    // 3  heel narrowest point (right)
    { x: left, y: y3 },                                   // 4  end of heel (before sole)
    { x: left, y: y4 },                                   // 5  end of sole (before toe)
    { x: notchLeftX, y: toeNarrowY },                     // 6  toe narrowest point (right)
    { x: left, y: y5 },                                   // 7  end of toe (before instep)
    { x: left, y: y6 },                                   // 8  end of instep (before bottom ribbing)
    { x: left, y: y7 },                                   // 9  bottom-left
    // Bottom edge
    { x: right, y: y7 },                                  // 10 bottom-right
    // Right edge: bottom → top with notches going left
    { x: right, y: y6 },                                  // 11 end of instep (before bottom ribbing)
    { x: right, y: y5 },                                  // 12 end of toe (before instep)
    { x: notchRightX, y: toeNarrowY },                    // 13 toe narrowest point (left)
    { x: right, y: y4 },                                  // 14 end of sole (before toe)
    { x: right, y: y3 },                                  // 15 end of heel (before sole)
    { x: notchRightX, y: heelNarrowY },                   // 16 heel narrowest point (left)
    { x: right, y: y2 },                                  // 17 end of back leg (before heel)
    { x: right, y: y1 },                                  // 18 end of top ribbing
    { x: right, y: y0 },                                  // 19 top-right
  ];

  // Grid sizing still uses stitch/row counts
  const minCols = sockTotalStitches(counts) + 8;
  const minRows = sockTotalRows(counts) + 4;

  return { outline, sections, minCols, minRows, counts };
}
