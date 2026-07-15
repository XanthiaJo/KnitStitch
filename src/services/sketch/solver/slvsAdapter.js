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
      // Anchors get a C_WHERE_DRAGGED constraint (hard lock) so the solver
      // cannot move them. The user-dragged point gets markDragged() in
      // solve() instead, which is a soft preference that yields to hard
      // constraints like dimensions.
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
          if (aH) slvs.horizontal(g, aH, wp, E_NONE);
        }
        break;
      }
      case 'Vertical': {
        if (c.lineA) {
          const aH = this.lineHandles.get(c.lineA.id);
          if (aH) slvs.vertical(g, aH, wp, E_NONE);
        }
        break;
      }
      case 'Midpoint': {
        if (c.lineA && c.pointA) {
          // Point-on-midpoint: C_AT_MIDPOINT with ptA=point, entityA=line.
          const ptH = this.pointHandles.get(c.pointA.id);
          const lnH = this.lineHandles.get(c.lineA.id);
          if (ptH && lnH) {
            slvs.addConstraint(g, slvs.C_AT_MIDPOINT, wp, 0, ptH, E_NONE, lnH, E_NONE, E_NONE, E_NONE, false, false);
          }
        } else if (c.lineA && c.lineB) {
          // Line-line midpoint: the midpoints of the two lines must be
          // coincident. SolveSpace has no direct "line-line midpoint"
          // constraint, so we compose it: create a helper point at each
          // line's midpoint (C_AT_MIDPOINT), then constrain those two
          // helper points to be coincident (C_POINTS_COINCIDENT).
          const lnAH = this.lineHandles.get(c.lineA.id);
          const lnBH = this.lineHandles.get(c.lineB.id);
          if (lnAH && lnBH) {
            // Create helper points at each line's midpoint
            const midA = slvs.addPoint2D(g, 0, 0, wp);
            const midB = slvs.addPoint2D(g, 0, 0, wp);
            // Constrain each helper point to be at its line's midpoint
            slvs.addConstraint(g, slvs.C_AT_MIDPOINT, wp, 0, midA, E_NONE, lnAH, E_NONE, E_NONE, E_NONE, false, false);
            slvs.addConstraint(g, slvs.C_AT_MIDPOINT, wp, 0, midB, E_NONE, lnBH, E_NONE, E_NONE, E_NONE, false, false);
            // Constrain the two midpoints to be coincident
            slvs.coincident(g, midA, midB, wp);
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

  /**
   * Solve the sketch.
   * @param {Set|null} draggedPoints - points the user is dragging (soft
   *   preference to stay at their current position). null for reconverge.
   * @param {Set|null} freeMovePoints - points that should be free to move
   *   during a reconverge (e.g. the point in a midpoint constraint). All
   *   other non-anchor points will be marked as dragged (prefer to stay).
   */
  solve(draggedPoints, freeMovePoints = null) {
    if (draggedPoints && draggedPoints.size > 0) {
      // User drag: mark dragged points as preferring to stay at mouse pos.
      for (const pt of draggedPoints) {
        const h = this.pointHandles.get(pt.id);
        if (h) {
          this.slvs.setParamValue(h.param[0], this.pxToSolver(pt.x));
          this.slvs.setParamValue(h.param[1], this.pxToSolver(pt.y));
          this.slvs.markDragged(h);
        }
      }
    } else if (freeMovePoints && freeMovePoints.size > 0) {
      // Reconverge with preferred move targets: mark all points EXCEPT
      // the free-move points as dragged, so the solver prefers to move
      // only the free-move points to satisfy the new constraint.
      for (const [ptId, h] of this.pointHandles) {
        const pt = freeMovePoints.values().next().value;
        // Check if this point is in the freeMove set by comparing ids
        let isFree = false;
        for (const fp of freeMovePoints) {
          if (fp.id === ptId) { isFree = true; break; }
        }
        if (!isFree) {
          this.slvs.markDragged(h);
        }
      }
    } else {
      // Reconverge with no preference: mark all points as dragged so
      // the solver distributes movement minimally.
      for (const h of this.pointHandles.values()) {
        this.slvs.markDragged(h);
      }
    }
    return this.slvs.solveSketch(this.g, false);
  }

  // ── Write back ───────────────────────────────────────────────────

  writeBack(sketch) {
    // Save anchor positions so we can restore them after writeBack.
    // SolveSpace's C_WHERE_DRAGGED is a soft preference, not a hard
    // constraint, so anchors may drift during solving.
    const anchorPositions = new Map();
    for (const p of sketch.points) {
      if (p.isAnchor || p.isOrigin) {
        anchorPositions.set(p.id, { x: p.x, y: p.y });
      }
    }

    for (const p of sketch.points) {
      const h = this.pointHandles.get(p.id);
      if (!h) continue;
      const xS = this.slvs.getParamValue(h.param[0]);
      const yS = this.slvs.getParamValue(h.param[1]);
      p.x = this.solverToPx(xS);
      p.y = this.solverToPx(yS);
    }

    // Restore anchor positions
    for (const [id, pos] of anchorPositions) {
      const p = sketch.points.find((pt) => pt.id === id);
      if (p) {
        p.x = pos.x;
        p.y = pos.y;
      }
    }
  }

  // ── Combined sync + solve + writeBack ────────────────────────────

  /**
   * Sync, solve, and write back.
   * @param {object} sketch - sketch state
   * @param {Set} draggedPoints - user-dragged points (or empty set for reconverge)
   * @param {Set|null} freeMovePoints - for reconverge: points to move freely
   */
  solveAndWriteBack(sketch, draggedPoints, freeMovePoints = null) {
    this.syncFromSketch(sketch);
    const result = this.solve(draggedPoints?.size > 0 ? draggedPoints : null, freeMovePoints);
    // Accept both OKAY and REDUNDANT_OKAY — the latter means the system
    // is solvable but has redundant constraints (e.g. two ways to specify
    // the same distance). The solution is still valid.
    if (result.result === this.slvs.RESULT_OKAY ||
        result.result === this.slvs.RESULT_REDUNDANT_OKAY) {
      this.writeBack(sketch);
    }
    return result;
  }
}
