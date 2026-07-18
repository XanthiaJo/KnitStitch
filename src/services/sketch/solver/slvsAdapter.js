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
    this.normal2d = null;          // shared 2D normal for circles
    this.pointHandles = new Map(); // pointId → slvs Entity
    this.lineHandles = new Map();  // lineId  → slvs Entity
    this.circleHandles = new Map(); // circleId → { circle, radius } slvs Entities
    this.handleToObject = new Map(); // Slvs_Constraint.h → sketch object info
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
    this.normal2d = this.slvs.addNormal2D(this.g, this.wp);
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

  syncFromSketch(sketch, options = {}) {
    this.slvs.clearSketch();
    this.pointHandles.clear();
    this.lineHandles.clear();
    this.circleHandles.clear();
    this.handleToObject.clear();
    this.wp = this.slvs.addBase2D(this.g);
    this.normal2d = this.slvs.addNormal2D(this.g, this.wp);

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

    // Circles → slvs.addCircle (needs a normal + distance entity for radius)
    for (const c of sketch.circles || []) {
      const centerH = this.pointHandles.get(c.center.id);
      if (!centerH || !this.normal2d) continue;
      const radiusH = this.slvs.addDistance(this.g, this.pxToSolver(c.radius), this.wp);
      const circleH = this.slvs.addCircle(this.g, this.normal2d, centerH, radiusH, this.wp);
      this.circleHandles.set(c.id, { circle: circleH, radius: radiusH });
    }

    // Constraints → mapped per type
    for (const c of sketch.constraints) {
      const handles = this._addConstraint(c);
      if (handles && c.id != null) {
        for (const h of handles) {
          this.handleToObject.set(h.h, { kind: 'constraint', id: c.id, obj: c });
        }
      }
    }

    if (options.proposedConstraint) {
      this._addConstraint(options.proposedConstraint);
    }

    // Solver-only X and Y axis lines for projected distance constraints
    this._addAxisEntities(sketch);

    // Driving dimensions
    for (const d of sketch.dimensions) {
      if (!d.isConstrained) continue;
      const h = this._addDimensionConstraint(d, true);
      if (h && d.id != null) {
        this.handleToObject.set(h.h, { kind: 'dimension', id: d.id, obj: d });
      }
    }

    if (options.proposedDimension) {
      this._addDimensionConstraint(options.proposedDimension, false);
    }
  }

  _addAxisEntities(sketch) {
    const slvs = this.slvs;
    const g = this.g;
    const wp = this.wp;

    // Prefer the sketch origin; fall back to a solver-only origin if absent.
    const originPoint = sketch.points.find((p) => p.isOrigin);
    const originH = originPoint
      ? this.pointHandles.get(originPoint.id)
      : slvs.addPoint2D(g, 0, 0, wp);
    if (!originPoint) slvs.dragged(g, originH, wp);

    // X-axis: from origin to (1, 0) in the base workplane (unit direction is enough)
    const xP = slvs.addPoint2D(g, 1, 0, wp);
    slvs.dragged(g, xP, wp);
    this.xAxisLine = slvs.addLine2D(g, originH, xP, wp);

    // Y-axis: from origin to (0, 1)
    const yP = slvs.addPoint2D(g, 0, 1, wp);
    slvs.dragged(g, yP, wp);
    this.yAxisLine = slvs.addLine2D(g, originH, yP, wp);
  }

  _addDimensionConstraint(d, storeHandle) {
    const slvs = this.slvs;
    const g = this.g;
    const wp = this.wp;
    const E_NONE = slvs.E_NONE;

    const aH = this.pointHandles.get(d.a.id);
    const bH = this.pointHandles.get(d.b.id);
    if (!aH || !bH) return undefined;

    const value = this.pxToSolver(d.drivenValue);
    const kind = d.kind ?? 'Aligned';
    let h;

    if (kind === 'Horizontal') {
      const sign = Math.sign(d.b.x - d.a.x) || 1;
      h = slvs.addConstraint(
        g, slvs.C_PROJ_PT_DISTANCE, wp, sign * value,
        aH, bH, this.xAxisLine, E_NONE, E_NONE, E_NONE, false, false,
      );
    } else if (kind === 'Vertical') {
      const sign = Math.sign(d.b.y - d.a.y) || 1;
      h = slvs.addConstraint(
        g, slvs.C_PROJ_PT_DISTANCE, wp, sign * value,
        aH, bH, this.yAxisLine, E_NONE, E_NONE, E_NONE, false, false,
      );
    } else {
      h = slvs.distance(g, aH, bH, value, wp);
    }

    return h;
  }

  _addConstraint(c) {
    const slvs = this.slvs;
    const g = this.g;
    const wp = this.wp;
    const E_NONE = slvs.E_NONE;
    const handles = [];

    switch (c.type) {
      case 'Coincident': {
        if (c.pointA && c.pointB) {
          const aH = this.pointHandles.get(c.pointA.id);
          const bH = this.pointHandles.get(c.pointB.id);
          if (aH && bH) handles.push(slvs.coincident(g, aH, bH, wp));
        }
        return handles;
      }
      case 'Perpendicular': {
        if (c.lineA && c.lineB) {
          const aH = this.lineHandles.get(c.lineA.id);
          const bH = this.lineHandles.get(c.lineB.id);
          if (aH && bH) handles.push(slvs.perpendicular(g, aH, bH, wp, false));
        }
        return handles;
      }
      case 'Parallel': {
        if (c.lineA && c.lineB) {
          const aH = this.lineHandles.get(c.lineA.id);
          const bH = this.lineHandles.get(c.lineB.id);
          if (aH && bH) handles.push(slvs.parallel(g, aH, bH, wp));
        }
        return handles;
      }
      case 'Equal': {
        if (c.lineA && c.lineB) {
          const aH = this.lineHandles.get(c.lineA.id);
          const bH = this.lineHandles.get(c.lineB.id);
          if (aH && bH) handles.push(slvs.equal(g, aH, bH, wp));
        }
        return handles;
      }
      case 'Horizontal': {
        if (c.lineA) {
          const aH = this.lineHandles.get(c.lineA.id);
          if (aH) handles.push(slvs.horizontal(g, aH, wp, E_NONE));
        }
        return handles;
      }
      case 'Vertical': {
        if (c.lineA) {
          const aH = this.lineHandles.get(c.lineA.id);
          if (aH) handles.push(slvs.vertical(g, aH, wp, E_NONE));
        }
        return handles;
      }
      case 'Midpoint': {
        if (c.lineA && c.pointA) {
          // Point-on-midpoint: C_AT_MIDPOINT with ptA=point, entityA=line.
          const ptH = this.pointHandles.get(c.pointA.id);
          const lnH = this.lineHandles.get(c.lineA.id);
          if (ptH && lnH) {
            handles.push(slvs.addConstraint(g, slvs.C_AT_MIDPOINT, wp, 0, ptH, E_NONE, lnH, E_NONE, E_NONE, E_NONE, false, false));
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
            handles.push(slvs.addConstraint(g, slvs.C_AT_MIDPOINT, wp, 0, midA, E_NONE, lnAH, E_NONE, E_NONE, E_NONE, false, false));
            handles.push(slvs.addConstraint(g, slvs.C_AT_MIDPOINT, wp, 0, midB, E_NONE, lnBH, E_NONE, E_NONE, E_NONE, false, false));
            // Constrain the two midpoints to be coincident
            handles.push(slvs.coincident(g, midA, midB, wp));
          }
        }
        return handles;
      }
      default:
        // Unknown constraint type — skip for now
        return handles;
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
  solve(draggedPoints, freeMovePoints = null, calculateFaileds = false) {
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
    return this.slvs.solveSketch(this.g, calculateFaileds);
  }

  /**
   * Dry-run a sketch with a proposed constraint or dimension.
   * Does not write back to the sketch.
   * @param {object} sketch
   * @param {{ constraint?: object, dimension?: { a, b, drivenValue } }} options
   * @returns {{ wouldOverconstrain: boolean, result: object, bad: Uint32Array }}
   */
  wouldOverconstrain(sketch, { constraint, dimension } = {}) {
    this.syncFromSketch(sketch, { proposedConstraint: constraint, proposedDimension: dimension });
    const result = this.solve(null, null, true);
    const okay = result.result === this.slvs.RESULT_OKAY
              || result.result === this.slvs.RESULT_REDUNDANT_OKAY;
    return {
      wouldOverconstrain: !okay,
      result,
      bad: result.bad ?? [],
    };
  }

  /**
   * Analyze the current sketch state and report degrees of freedom plus any
   * overconstraint messages from the solver's failed-constraint list.
   * Does not write back to the sketch.
   * @param {object} sketch
   * @returns {{ dof: number, status: 'over'|'well'|'under', overconstrained: boolean, issues: object[], result: object }}
   */
  analyze(sketch) {
    this.syncFromSketch(sketch);
    const result = this.solve(null, null, true);
    const okay = result.result === this.slvs.RESULT_OKAY
              || result.result === this.slvs.RESULT_REDUNDANT_OKAY;
    let status = 'under';
    if (!okay) {
      status = 'over';
    } else if (result.dof === 0) {
      status = 'well';
    }
    return {
      dof: result.dof,
      status,
      overconstrained: !okay,
      issues: this._buildIssues(result.bad ?? []),
      result,
    };
  }

  _buildIssues(bad) {
    const issues = [];
    const seen = new Set();
    for (const h of bad) {
      const info = this.handleToObject.get(h);
      if (!info) continue;
      const key = `${info.kind}:${info.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (info.kind === 'dimension') {
        const a = info.obj.a.id + 1;
        const b = info.obj.b.id + 1;
        issues.push({ kind: 'Dimension', message: `Dimension between P${a} and P${b} could not be satisfied` });
      } else {
        issues.push({ kind: info.obj.type, message: `${info.obj.type} constraint could not be satisfied` });
      }
    }
    return issues;
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

    // Write back circle radii from the solver's distance entities.
    // Circle center positions are already written back above (they're
    // regular points in sketch.points).
    for (const c of sketch.circles || []) {
      const handles = this.circleHandles.get(c.id);
      if (!handles?.radius) continue;
      const rS = this.slvs.getParamValue(handles.radius.param[0]);
      c.radius = this.solverToPx(rS);
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
