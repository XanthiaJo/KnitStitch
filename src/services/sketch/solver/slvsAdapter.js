// slvsAdapter.js
//
// Bridges KnitStitch's sketch model (points, lines, constraints, dimensions
// in pixel coordinates) to the SolveSpace constraint solver compiled to
// WebAssembly (public/wasm/slvs.js).
//
// SolveSpace works in arbitrary units in a 2D workplane. We solve in inches
// and convert to/from pixels via the gauge (stitchesPer4Inches, rowsPer4Inches,
// cellWidthPx, cellHeightPx) from the store. X and Y are converted
// independently because the grid is non-square (stitches ≠ rows).

const SOLVS_JS_URL = '/wasm/slvs.js';

export class SlvsAdapter {
  constructor(store) {
    this.store = store;
    this.slvs = null;
    this.g = 1;
    this.wp = null;
    this.pointHandles = new Map(); // pointId → slvs Entity
    this.lineHandles = new Map();  // lineId  → slvs Entity
    this.ready = false;
  }

  async init() {
    // slvs.js is a UMD module in /public/ — Vite serves it as-is and
    // doesn't allow importing from source. Load it via a <script> tag,
    // which makes the `solvespace` factory available as a global.
    if (!globalThis.solvespace) {
      await this._loadScript(SOLVS_JS_URL);
    }
    this.slvs = await globalThis.solvespace();
    this.wp = this.slvs.addBase2D(this.g);
    this.ready = true;
  }

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  // ── Unit conversion ──────────────────────────────────────────────
  //
  // The grid is non-square (stitches ≠ rows), so X and Y have different
  // real-world scales. If we passed those different scales to the solver,
  // angles would be distorted — a 90° angle in pixels would not be 90°
  // in solver-space, breaking perpendicular/horizontal/vertical constraints.
  //
  // Solution: use a UNIFORM scale (the X-axis stitch scale) for both axes.
  // This preserves all geometric relationships (angles, ratios, perpendicularity).
  // The real-world inch conversion only matters for dimension labels, which
  // the display layer (SketchDimension.recompute) already handles — the
  // solver never needs to know the real-world size.

  _gauge() {
    const s = this.store.state;
    return {
      cellWidthPx: s.cellWidthPx,
      cellHeightPx: s.cellHeightPx,
      stitchesPer4Inches: s.stitchesPer4Inches,
      rowsPer4Inches: s.rowsPer4Inches,
    };
  }

  // Uniform scale: pixels → solver-units (same for X and Y)
  pxToSolver(px) {
    const { cellWidthPx, stitchesPer4Inches } = this._gauge();
    return px / cellWidthPx * (4 / stitchesPer4Inches);
  }

  // Uniform scale: solver-units → pixels (same for X and Y)
  solverToPx(s) {
    const { cellWidthPx, stitchesPer4Inches } = this._gauge();
    return s * cellWidthPx * (stitchesPer4Inches / 4);
  }

  // ── Sync from sketch ─────────────────────────────────────────────

  syncFromSketch(sketch) {
    this.slvs.clearSketch();
    this.pointHandles.clear();
    this.lineHandles.clear();
    this.wp = this.slvs.addBase2D(this.g);

    // Points → slvs.addPoint2D, converted px → solver-units (uniform scale)
    for (const p of sketch.points) {
      const h = this.slvs.addPoint2D(
        this.g,
        this.pxToSolver(p.x),
        this.pxToSolver(p.y),
        this.wp,
      );
      this.pointHandles.set(p.id, h);
      if (p.isAnchor || p.isOrigin) {
        this.slvs.dragged(this.g, h, this.wp);
      }
    }

    // Lines → slvs.addLine2D
    for (const l of sketch.lines) {
      const startH = this.pointHandles.get(l.start.id);
      const endH = this.pointHandles.get(l.end.id);
      if (!startH || !endH) continue;
      const h = this.slvs.addLine2D(this.g, startH, endH, this.wp);
      this.lineHandles.set(l.id, h);
    }

    // Constraints → mapped per type
    for (const c of sketch.constraints) {
      this._addConstraint(c);
    }

    // Driving dimensions → slvs.distance (only if isConstrained)
    for (const d of sketch.dimensions) {
      if (!d.isConstrained) continue;
      const aH = this.pointHandles.get(d.a.id);
      const bH = this.pointHandles.get(d.b.id);
      if (!aH || !bH) continue;
      // drivenValue is in pixels — convert to solver-units (uniform scale).
      // SolveSpace's C_PT_PT_DISTANCE is the Euclidean distance between
      // the two points, which matches what the dimension measures.
      const solverUnits = this.pxToSolver(d.drivenValue);
      this.slvs.distance(this.g, aH, bH, solverUnits, this.wp);
    }
  }

  _addConstraint(c) {
    const slvs = this.slvs;
    const g = this.g;
    const wp = this.wp;
    const E_NONE = slvs.E_NONE;

    switch (c.type) {
      case 'Coincident': {
        if (c.pointA && c.pointB) {
          const aH = this.pointHandles.get(c.pointA.id);
          const bH = this.pointHandles.get(c.pointB.id);
          if (aH && bH) slvs.coincident(g, aH, bH, wp);
        }
        break;
      }
      case 'Perpendicular': {
        if (c.lineA && c.lineB) {
          const aH = this.lineHandles.get(c.lineA.id);
          const bH = this.lineHandles.get(c.lineB.id);
          if (aH && bH) slvs.perpendicular(g, aH, bH, wp, false);
        }
        break;
      }
      case 'Equal': {
        if (c.lineA && c.lineB) {
          const aH = this.lineHandles.get(c.lineA.id);
          const bH = this.lineHandles.get(c.lineB.id);
          if (aH && bH) slvs.equal(g, aH, bH, wp);
        }
        break;
      }
      case 'Horizontal': {
        if (c.lineA) {
          const aH = this.lineHandles.get(c.lineA.id);
          if (aH) slvs.horizontal(g, aH, wp);
        }
        break;
      }
      case 'Vertical': {
        if (c.lineA) {
          const aH = this.lineHandles.get(c.lineA.id);
          if (aH) slvs.vertical(g, aH, wp);
        }
        break;
      }
      case 'Midpoint': {
        if (c.lineA && c.pointA) {
          // Point-on-midpoint: use C_AT_MIDPOINT with the point as ptA
          // and the line as entityA.
          const ptH = this.pointHandles.get(c.pointA.id);
          const lnH = this.lineHandles.get(c.lineA.id);
          if (ptH && lnH) {
            slvs.midpoint(g, ptH, lnH, wp);
          }
        } else if (c.lineA && c.lineB) {
          // Line-line midpoint: both lines share a midpoint. This is a
          // composite — add a midpoint constraint on the shared endpoint.
          // Find the shared point between the two lines.
          const lA = c.lineA;
          const lB = c.lineB;
          const shared = (lA.start === lB.start || lA.start === lB.end) ? lA.start
                        : (lA.end === lB.start || lA.end === lB.end) ? lA.end
                        : null;
          if (shared) {
            const ptH = this.pointHandles.get(shared.id);
            // Use the other line as the entity
            const otherLine = shared === lA.start ? lB : lA;
            const lnH = this.lineHandles.get(otherLine.id);
            if (ptH && lnH) {
              slvs.midpoint(g, ptH, lnH, wp);
            }
          }
        }
        break;
      }
      default:
        // Unknown constraint type — skip for now
        break;
    }
  }

  // ── Solve ────────────────────────────────────────────────────────

  solve(movedPoint) {
    if (movedPoint) {
      const h = this.pointHandles.get(movedPoint.id);
      if (h) {
        this.slvs.setParamValue(h.param[0], this.pxToSolver(movedPoint.x));
        this.slvs.setParamValue(h.param[1], this.pxToSolver(movedPoint.y));
        this.slvs.dragged(this.g, h, this.wp);
      }
    }
    return this.slvs.solveSketch(this.g, false);
  }

  // ── Write back ───────────────────────────────────────────────────

  writeBack(sketch) {
    for (const p of sketch.points) {
      const h = this.pointHandles.get(p.id);
      if (!h) continue;
      const xS = this.slvs.getParamValue(h.param[0]);
      const yS = this.slvs.getParamValue(h.param[1]);
      p.x = this.solverToPx(xS);
      p.y = this.solverToPx(yS);
    }
  }

  // ── Combined sync + solve + writeBack ────────────────────────────

  solveAndWriteBack(sketch, movedPoints) {
    this.syncFromSketch(sketch);
    // SolveSpace handles all points at once; pick the first moved point
    // as the dragged one (if any).
    const moved = movedPoints?.values?.().next?.().value ?? null;
    const result = this.solve(moved);
    if (result.result === this.slvs.RESULT_OKAY) {
      this.writeBack(sketch);
    }
    return result;
  }
}
