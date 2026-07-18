# KnitStitch Agent Roadmap

Internal, detail-heavy notes for agents working on KnitStitch. This is the companion to the human-readable [../roadmap.md](../roadmap.md).

_Last updated: 2026-07-15_

---

## Status at a Glance

| Area | Status |
|---|---|
| Global constraint solver | Shipped |
| SolveSpace WASM solver migration | Planned — 4-phase, feature-flagged |
| Constraint types | 6 shipped (Coincident, Perpendicular, Midpoint, Equal Length, Horizontal/Vertical, Driven Dimensions) |
| E2E test coverage | 19 passing (run via Playwright against DDEV) |
| Unit test coverage | 67 passing across 12 files |
| Sketch service refactor (`sketchService.js`) | Complete — tool registry extracted, service is a thin coordinator (~300 lines, all forwarders) |
| UI refactor (`mainUi.js`) | Complete — split into 7 focused panel controllers, mainUi.js is a 63-line orchestrator |

---

## SolveSpace WASM Solver Migration

Replace the hand-rolled gradient-descent solver (`globalConstraintSolver.js`
+ supporting error/feasibility/DOF modules) with SolveSpace's Newton's-method
solver, compiled to WebAssembly via Emscripten. Shipped behind a feature flag
so the native solver stays the default until the WASM backend passes the
existing e2e suite.

Companion to the human-readable plan in [../roadmap.md](../roadmap.md#solvespace-solver-migration).

### Why SolveSpace

- Battle-tested parametric 2D/3D CAD solver (used by the SolveSpace desktop app)
- Handles constraint types we'd otherwise hand-code: parallel, fixed angle, symmetric, collinear, tangent, equal radius, etc.
- Internal feasibility + overconstraint detection via `SolveResult` codes — lets us delete `perpendicularFeasibility.js`, `overconstraintChecker.js`, `dofAnalyzer.js`
- Official JS/WASM bindings exist in-repo at `solvespace/solvespace/js/slvs.d.ts`

### Why not trivial

- **No published npm package.** However, as of December 2024 (PR #1343, commit `a208201c`), SolveSpace master includes a stateful C library (`src/slvs/lib.cpp`), embind JS bindings (`src/slvs/jslib.cpp`), a CMake `slvs-wasm` target (`src/slvs/CMakeLists.txt`), and a CI build script (`.github/scripts/build-wasmlib.sh`). We fork `solvespace/solvespace` directly and build the existing target — no custom bindings or CMake glue needed.
- **GPL-3.0 licensing.** SolveSpace is GPL-3.0-or-later with no linking exception. The compiled `slvs.wasm` is a derivative work, so distributing it inside KnitStitch makes the whole app GPL-3.0-or-later. KnitStitch has adopted GPL-3.0-or-later accordingly (see `LICENSE`).
- **Separate JS/WASM pair** first-load cost (`slvs.js` plus `slvs.wasm`) — mitigated by lazy loading only when `solverBackend === 'slvs'`.
- **Coordinate system mismatch** — SolveSpace works in arbitrary units in a 2D workplane; we solve in inches and convert to/from pixels via the gauge.

### Fork strategy

We maintain a fork of `solvespace/solvespace` at
`https://github.com/XanthiaJo/SolverWasm`. Rationale:

- SolveSpace master already includes the stateful C API (`src/slvs/lib.cpp`), embind JS bindings (`src/slvs/jslib.cpp`), and a CMake `slvs-wasm` target — no custom bindings or CMake glue needed
- Forking upstream directly means we can `git merge upstream/master` to pick up solver bug fixes
- We only init the `extlib/eigen` and `extlib/mimalloc` submodules (header-only deps for the solver); GUI/render submodules are not needed
- Can publish as an npm package later (`@knitstitch/solver-wasm`) so the build step disappears for downstream

The fork's only modification is deleting the stale `cmake/Platform/Emscripten.cmake` (from the 2018 emscripten branch) that hardcoded `.bat` compiler suffixes and conflicted with modern emsdk (6.0.3+) which ships `.exe` wrappers.

### Phase 1 — Ship the WASM (fork + build)

| Step | Detail |
|---|---|
| Fork | `https://github.com/XanthiaJo/SolverWasm` (fork of `solvespace/solvespace`) — already created |
| Submodule | `git submodule add https://github.com/XanthiaJo/SolverWasm.git vendor/solver-wasm` |
| Submodules | `cd vendor/solver-wasm && git submodule update --init extlib/eigen extlib/mimalloc` (only solver deps, not GUI) |
| Build script | `scripts/build-slvs.mjs` drives: `emsdk install/activate latest` → `cd vendor/solver-wasm && mkdir build-wasmlib && cd build-wasmlib && emcmake cmake .. -DCMAKE_BUILD_TYPE=RelWithDebInfo -DENABLE_GUI=OFF -DENABLE_CLI=OFF -DENABLE_TESTS=OFF -DENABLE_COVERAGE=OFF -DENABLE_OPENMP=OFF -DFORCE_VENDORED_Eigen3=ON -DENABLE_LTO=ON && cmake --build . --target slvs-wasm` |
| Artifacts | `slvs.js` + `slvs.wasm` copied to `public/wasm/` |
| Commit strategy | Commit the built `.wasm` + `.js` into the repo so the app builds without Emscripten installed; document the rebuild step in `AGENTS.md` |
| Vite | Verify `public/wasm/*.wasm` is served with `application/wasm` MIME (Vite default for `public/`) |
| License | KnitStitch adopts GPL-3.0-or-later (see `LICENSE`); `package.json` `license` field set to `"GPL-3.0-or-later"` |

**Risk**: ~~the fork's Emscripten build target doesn't exist yet~~ **Resolved.** The `slvs-wasm` target builds successfully with emsdk 6.0.3 and produces a working `slvs.js` that passes the SolveSpace README test case. The only fork modification needed was deleting a stale `cmake/Platform/Emscripten.cmake` that hardcoded `.bat` suffixes.

### Phase 2 — `SlvsAdapter` with real-world units

New file: `src/services/sketch/solver/slvsAdapter.js`

#### Unit conversion

Solve in inches; convert to/from pixels via the gauge. X and Y converted
independently because the grid is non-square (stitches ≠ rows).

```javascript
// px → inches
pxToInchesX(px) { return px / cellWidthPx * (4 / stitchesPer4Inches); }
pxToInchesY(px) { return px / cellHeightPx * (4 / rowsPer4Inches); }
// inches → px
inchesToPxX(in) { return in * cellWidthPx * (stitchesPer4Inches / 4); }
inchesToPxY(in) { return in * cellHeightPx * (rowsPer4Inches / 4); }
```

A "40 px" dimension thus means the real-world measurement the user expects,
not a raw pixel count.

#### Adapter API

```javascript
class SlvsAdapter {
  async init() {
    // Load WASM via the solvespace() factory promise.
    // Create base group g=1 and base 2D workplane wp.
    this.slvs = await solvespace({ locateFile: f => `/wasm/${f}` });
    this.g = 1;
    this.wp = this.slvs.addBase2D(this.g);
    this.pointHandles = new Map(); // pointId → slvs Entity
    this.lineHandles  = new Map(); // lineId  → slvs Entity
    this.ready = true;
  }

  syncFromSketch(sketch) {
    // Clear and rebuild all entities from store state.
    this.slvs.clearSketch();
    this.pointHandles.clear();
    this.lineHandles.clear();

    // Points → slvs.addPoint2D(g, xIn, yIn, wp), converted px→inches
    for (const p of sketch.points) {
      const h = this.slvs.addPoint2D(this.g, this.pxToInchesX(p.x), this.pxToInchesY(p.y), this.wp);
      this.pointHandles.set(p.id, h);
      if (p.isAnchor || p.isOrigin) this.slvs.dragged(this.g, h, this.wp);
    }

    // Lines → slvs.addLine2D(g, startH, endH, wp)
    for (const l of sketch.lines) {
      const h = this.slvs.addLine2D(this.g, this.pointHandles.get(l.start.id), this.pointHandles.get(l.end.id), this.wp);
      this.lineHandles.set(l.id, h);
    }

    // Constraints → mapped per type (see table below)
    for (const c of sketch.constraints) this._addConstraint(c);

    // Driving dimensions → slvs.distance(g, ptA, ptB, inchesValue, wp)
    // Non-driven dimensions are labels only, no constraint added.
    for (const d of sketch.dimensions) {
      if (d.isConstrained) {
        this.slvs.distance(this.g, this.pointHandles.get(d.a.id), this.pointHandles.get(d.b.id), this.pxToInches(d.drivenValue), this.wp);
      }
    }
  }

  solve(movedPoint) {
    // Set dragged point's param directly, add temporary slvs.dragged for the move,
    // solveSketch, return SolveResult.
    if (movedPoint) {
      const h = this.pointHandles.get(movedPoint.id);
      this.slvs.setParamValue(h.param[0], this.pxToInchesX(movedPoint.x));
      this.slvs.setParamValue(h.param[1], this.pxToInchesY(movedPoint.y));
      this.slvs.dragged(this.g, h, this.wp);
    }
    return this.slvs.solveSketch(this.g, false);
  }

  writeBack(sketch) {
    // For each point, read param values, convert inches→px, mutate in place.
    // Matches the existing object-reference mutation pattern.
    for (const p of sketch.points) {
      const h = this.pointHandles.get(p.id);
      p.x = this.inchesToPxX(this.slvs.getParamValue(h.param[0]));
      p.y = this.inchesToPxY(this.slvs.getParamValue(h.param[1]));
    }
  }

  solveAndWriteBack(sketch, movedPoints) {
    this.syncFromSketch(sketch);
    const moved = movedPoints.values().next().value; // SolveSpace handles all points at once
    const result = this.solve(moved);
    if (result.result === this.slvs.RESULT.OK) this.writeBack(sketch);
    return result;
  }
}
```

#### Constraint mapping

| KnitStitch `SketchConstraint.type` | SolveSpace call | Constant |
|---|---|---|
| Coincident | `slvs.coincident(g, ptA, ptB, wp)` | `C_POINTS_COINCIDENT` |
| Perpendicular | `slvs.perpendicular(g, lineA, lineB, wp, false)` | `C_PERPENDICULAR` |
| Equal | `slvs.addConstraint(g, C_EQUAL_LENGTH_LINES, wp, 0, E_NONE, E_NONE, lineA, lineB, ...)` | `C_EQUAL_LENGTH_LINES` |
| Horizontal | `slvs.addConstraint(g, C_HORIZONTAL, wp, 0, E_NONE, E_NONE, line, E_NONE, ...)` | `C_HORIZONTAL` |
| Vertical | `slvs.addConstraint(g, C_VERTICAL, wp, 0, E_NONE, E_NONE, line, E_NONE, ...)` | `C_VERTICAL` |
| Midpoint (point-line) | `slvs.addConstraint(g, C_AT_MIDPOINT, wp, 0, pt, E_NONE, line, ...)` | `C_AT_MIDPOINT` |
| Midpoint (line-line) | Add a point at each line midpoint, then `coincident` | composite |
| Driving Dimension | `slvs.distance(g, ptA, ptB, inchesValue, wp)` | `C_PT_PT_DISTANCE` |

### Phase 3 — Feature flag wiring

#### Store change

Add to `sketch` state in `src/state/store.js`:

```javascript
solverBackend: 'native',  // 'native' | 'slvs'
```

#### Single dispatch point in `sketchService.js`

The dual-solver branching has been replaced with one dispatch method:

```javascript
_solve(sketch, movedPoints) {
  if (!this._slvsAdapter?.ready) return null;
  return this._slvsAdapter.solveAndWriteBack(sketch, movedPoints);
}
```

Adapter loads lazily in the constructor:

```javascript
constructor(store) {
  // ...existing...
  this._slvsAdapter = null;
  if (store.state.sketch.solverBackend === 'slvs') this._initSlvsAdapter();
}
_initSlvsAdapter() {
  this._slvsAdapter = new SlvsAdapter();
  this._slvsAdapter.init().catch(e => console.error('SlvsAdapter init failed', e));
}
```

The native path stays the default; the WASM only downloads when the flag flips.

### Phase 4 — Validate, then delete

1. **E2E validation** — run `e2e/sketchConstraints.spec.js` with
   `solverBackend: 'slvs'`. The existing scenarios (perpendicularity, dimension
   locking, coincident, midpoint, equal) are the source of truth per the
   e2e-first testing approach in `AGENTS.md`. Run them under both backends.
2. **Result code mapping** — map SolveSpace `SolveResult` codes to user-facing
   feedback:
   - `RESULT.OK` → success
   - `RESULT.DIDNT_CONVERGE` → "constraint system could not be satisfied"
   - `RESULT.SINGULAR_JACOBIAN` → "over-constrained or redundant"
   - `RESULT.TOO_MANY_UNKNOWNS` → "sketch too large for solver"
3. **Flip default** to `'slvs'` once e2e is green. ✅ Done
4. **Delete** the now-redundant native solver modules: ✅ Done

| File | Status |
|---|---|
| `solver/globalConstraintSolver.js` | Deleted — replaced by SolveSpace |
| `solver/constraintErrorTerms.js` | Deleted — error functions no longer needed |
| `solver/hardConstraintPropagator.js` | Deleted — SolveSpace handles hard constraints |
| `solver/constraintSolver.js` | Deleted — replaced by SolveSpace |
| `solver/coincidentSolver.js` | Deleted — SolveSpace handles coincident constraints |
| `solver/dragConstraintApplier.js` | Deleted — SolveSpace handles drag-time enforcement |
| `solver/dimensionSolver.js` | Deleted — SolveSpace handles driven dimensions |
| `solver/dofAnalyzer.js` | Kept — still used by constraintTool/dimensionTool for overconstraint checking |
| `solver/overconstraintChecker.js` | Kept — still used by sketchService/sketchPanelController |
| `solver/perpendicularFeasibility.js` | Kept — pure graph-theory check, provides user-facing rejection before solver |

### Files touched (summary)

| Phase | File | Action |
|---|---|---|
| 1 | `vendor/solver-wasm` (submodule, fork of `solvespace/solvespace`) | Add |
| 1 | `scripts/build-slvs.mjs` | New |
| 1 | `public/wasm/slvs.js` + `public/wasm/slvs.wasm` | New (built artifacts) |
| 1 | `LICENSE` | New — GPL-3.0-or-later (required by SolveSpace licensing) |
| 1 | `package.json` | Add `"license": "GPL-3.0-or-later"` |
| 1 | `AGENTS.md` | Document Emscripten build + GPL-3.0 license note |
| 2 | `src/services/sketch/solver/slvsAdapter.js` | New |
| 3 | `src/state/store.js` | Add `solverBackend` flag |
| 3 | `src/services/sketch/sketchService.js` | Add `_solve` dispatch + lazy adapter init |
| 3 | `src/services/sketch/interactions/dragHandler.js` | Replace dual-solver branches with `service._solve` |
| 4 | `e2e/sketchConstraints.spec.js` | Add `solverBackend: 'slvs'` run |
| 4 | `src/services/sketch/solver/*.js` | Delete redundant modules |

---

## Recent Shipping: Global Constraint Solver + Sock Template Fix

### What shipped

| Feature | Notes |
|---|---|
| Global numerical optimization solver | Inspired by FreeCAD/OpenCASCADE |
| Gradient descent optimization | Error minimization across all constraints simultaneously |
| BFS-driven dimension enforcement | Dimensions propagate outward from the dragged/anchored point instead of using fixed creation order |
| E2E-first testing approach | User interaction tests over implementation details |
| Sock template consistency fix | Removed redundant heel/toe span dimensions that over-constrained the notch region |

### Constraint types supported

| Constraint | Status | Error Definition |
|---|---|---|
| Coincident | Shipped | Distance between points |
| Perpendicular | Shipped | Dot product of line vectors |
| Midpoint (point-line) | Shipped | Distance from point to line midpoint |
| Midpoint (line-line) | Shipped | Distance between the two line midpoints |
| Equal Length | Shipped | Difference in line lengths |
| Driven Dimensions | Shipped | Hard constraints applied after optimization |

### Solver implementation details

```text
Error Functions:
- Perpendicular: error = dx1*dx2 + dy1*dy2  (dot product = 0 at 90°)
- Coincident:    error = distance(point1, point2)  (distance = 0 when coincident)
- Midpoint:      error = distance(point, midpoint(line))  [point-line]
                 error = distance(midpoint(lineA), midpoint(lineB))  [line-line]
- Equal Length:  error = length(line1) - length(line2)

Optimization Loop:
while error > 1e-6 and iterations < 100:
    calculate_gradients()       # Analytical Jacobian
    apply_gradient_descent()    # Adaptive step size
    apply_driven_dimensions()   # Hard constraints via BFS propagation
```

### Known residual issues

| Issue | Description | Where to fix |
|---|---|---|
| Right-side notch drift | Points 13 and 16 are determined only by Equal-length constraints, which leaves a small residual drift (~6 px) when those points are dragged directly | Add an angle or symmetry constraint, or hard-enforce equal constraints after dimension application |
| DOF analysis | No degrees-of-freedom count; under-constrained sketches silently remain editable | New analysis pass in solver or UI |
| Over-constrained detection | Solver returns `null` and falls back to local solver; no user-facing message | Improve `_isFeasible` and add UI feedback |

---

## Working Rules

| Rule | Rationale |
|---|---|
| One mutation path per concept | Do not update the same sketch state in multiple places unless there is a strong reason. |
| Extract shared geometry/formatting logic | Avoid duplicating logic across model, service, and renderer layers. |
| Prefer small pure helpers | Avoid broad utility buckets. |
| Watch file size | If a file grows beyond 250–300 lines, consider splitting it. |
| Add regression tests | Whenever changing constraint solving, selection, drag behaviour, or persistence. |
| Keep `main.js` as bootstrap | Do not put business logic in `main.js`. |
| Generate UI text from shared helpers | Keep list view and canvas view in sync. |
| New constraint types | Belong in `constraintTool.js` (creation) and `slvsAdapter.js` (solver mapping), not `sketchService.js`. |
| New tool workflows | Belong in their own tool class, not inlined in `sketchService.js`. |

---

## Testing Gaps

Implementation for the following features is largely complete; coverage is missing.

| Test | Type | Coverage Needed |
|---|---|---|
| Midpoint constraint creation and dragging | E2E | Creation + drag interaction |
| Equal length constraint creation and dragging | E2E | Creation + drag interaction |
| Zoom/pan coordinate transforms | Unit | Projection math |
| Zoom controls changing stage scale | E2E | Button/wheel zoom |
| `sockMeasurements.js` | Unit | Gauge conversion, ease, roundEven, section math, notch derivation |
| Measurement-driven template generation | Unit | Pixel positions, line count, grid size |
| `ensureGridFits` | Unit | Grow when needed, no-op when big enough, preview preserved |
| Enter measurements → template/grid | E2E | Lines appear at correct pixel positions, grid grows |
| Measurement persistence round-trip | Unit | Save/load correctness |
| Regenerate template on hydrate | Unit/Integration | Restore from persisted measurements |
| Undo/redo for measurement changes | Unit/Integration | Snapshot before regenerate |
| Clear template button | E2E | Removes template lines and resets measurements |

---

## Future Constraint Types

The global solver architecture makes adding new constraints straightforward. Each needs:

1. **Error Function** — mathematical relationship that equals 0 when satisfied.
2. **Gradient Calculation** — partial derivatives w.r.t. point coordinates.
3. **UI Integration** — constraint tool workflow and feasibility checks.

### Planned constraints

| Constraint | Error Function |
|---|---|
| Horizontal/Vertical | `error = dx` or `error = dy` (simpler than dimensions) |
| Parallel | `error = cross_product(line1_vector, line2_vector)` (vectors parallel when cross product = 0) |
| Fixed Angle | `error = angle(line1, line2) - target_angle` (user-specified angle) |
| Tangent | `error = distance(point_offset_from_line, radius)` (for curves) |
| Collinear | `error = cross_product(line1_vector, line2_vector)` (points on same line) |
| Symmetric | `error = distance(point1, mirror(point2, axis))` (mirror constraints) |

### Implementation pattern

```javascript
// 1. Add constraint mapping to slvsAdapter.js _addConstraint()
case 'Parallel': {
  if (c.lineA && c.lineB) {
    const aH = this.lineHandles.get(c.lineA.id);
    const bH = this.lineHandles.get(c.lineB.id);
    if (aH && bH) slvs.parallel(this.g, aH, bH, this.wp);
  }
  break;
}

// 2. Add to SketchObjectKind constants
Parallel: 5,

// 3. Add UI button and constraint tool workflow
// 4. Add feasibility checks if needed (perpendicularFeasibility.js pattern)
```

### Solver benefits for new constraints

| Benefit | Description |
|---|---|
| Simultaneous Solving | New constraints automatically work with existing ones |
| No Special Cases | Same optimization loop handles all constraint types |
| Numerical Stability | Gradient-based approach handles floating-point precision |
| Scalable | Performance stays consistent as constraint types increase |

---

## Future Template Candidates

After the measurement-driven model is in place, adding new templates follows the same pattern.

| Template | Outline |
|---|---|
| Mitten | Thumb gusset outline |
| Hat | Brim + crown shaping |
| Sleeve | Tapered outline with cuff |
| Sweater body | Raglan or set-in sleeve outline |

Each template needs:

- Measurements model (`<name>Measurements.js`)
- Outline builder in `templateTool.js`
- Measurement fields in the sidebar
- Unit tests

---

## Refactor Plans

### `mainUi.js` refactor — COMPLETE

`mainUi.js` was a single 611-line `setupMainUi` function mixing DOM ref collection, sidebar rendering for 6 independent panels, event binding for ~25 controls, 5 store subscriptions, zoom/pan logic, and keyboard shortcuts. It has been split into 7 focused panel controllers plus a 63-line thin orchestrator.

#### What was done

| Phase | File | Lines | Owns |
|---|---|---|---|
| 1 — Shared UI utilities | `uiUtils.js` | 35 | `getElement`, `bindIfPresent`, `toggleActive`, `collectRefs` |
| 2 — Grid panel | `gridPanelController.js` | 124 | Gauge inputs, grid info, finished size, clear-manual |
| 3 — Sketch panel | `sketchPanelController.js` | 158 | Tool buttons, object list, constraint status, color/undo/delete |
| 4 — Overlay panel | `overlayPanelController.js` | 64 | Image browse/clear, visibility, opacity |
| 5 — Template panel | `templatePanelController.js` | 131 | Template list, measurement inputs, derived values |
| 6 — Zoom controller | `zoomController.js` | 123 | Zoom buttons, wheel zoom, right-mouse pan, zoom display |
| 7 — Keyboard controller | `keyboardController.js` | 30 | Escape and Delete key handling |
| 8 — Slim orchestrator | `mainUi.js` | 63 | Wires controllers, cross-panel syncAll, setWorkspace wrapper |

Each controller owns its own refs, event bindings, and store subscriptions. The orchestrator connects the cross-panel `syncAll` and the `sketch.lines → recalculateSize` bridge subscription.

### `sketchService.js` refactor — COMPLETE

The sketch service has been refactored from a 496-line monolith into a ~300-line thin coordinator. All logic has been extracted into focused modules under `src/services/sketch/`.

#### What was done

| Phase | Action | Status |
|---|---|---|
| 1 — Anchor tool | Extracted into `tools/anchorTool.js` | Done |
| 2 — Selection | Extracted into `state/sketchSelection.js` and `state/selection.js` | Done |
| 3 — Sketch cleanup | Extracted into `state/sketchCleanup.js` and `state/deleteSketchSelection.js` | Done |
| 4 — Tool registry | Created `tools/toolRegistry.js` with `Map<SketchTool, Tool>` dispatch | Done |
| 5 — Lifecycle | Extracted into `state/lifecycle.js` (ensureOriginAnchor, undo, clear, cancelCurrentLine, exitToSelect) | Done |
| 6 — Properties | Extracted into `state/properties.js` (store-backed getters/setters) | Done |
| 7 — Store sync | Extracted into `state/sketchStoreSync.js` | Done |
| 8 — ID management | Extracted into `state/sketchIdManager.js` | Done |
| 9 — History | Extracted into `state/historyManager.js` | Done |
| 10 — Snapshots | Extracted into `state/sketchSnapshot.js` | Done |
| 11 — Drag handling | Extracted into `interactions/dragHandler.js` | Done |
| 12 — Feedback | Extracted into `state/sketchFeedback.js` | Done |

#### Current structure (post-refactor)

`sketchService.js` is now a thin coordinator. Every method is a one-line forwarder to an extracted module. The service owns no business logic — it just wires together the tool registry, solvers, history manager, and state helpers.

| Section | Lines | Concern |
|---|---|---|
| Constructor | 22–43 | State init, tool registry, history manager, solver composition |
| Tool accessors | 45–64 | Getters that delegate to `ToolRegistry.getTool()` |
| Event forwarders | 66–92 | onCanvasClick, onLineClick, onPointClick, onCanvasMouseMove, etc. → tool registry |
| Lifecycle forwarders | 106–124 | ensureOriginAnchor, undo, clear, cancelCurrentLine, _recordSnapshot → lifecycle.js |
| Selection forwarders | 126–156 | deleteSelected, clearSelection, selectPoint/Line/Dimension/Constraint/ObjectByRef → sketchSelection.js |
| Property getters/setters | 158–208 | isActive, activeTool, constraintSubMode, strokeColor, strokeThickness, _pendingStart, templates → properties.js |
| Internal helpers | 218–276 | _findNearestPoint, _removeOrphanPoint, _applyAngleSnap, _rebuildObjects, etc. → geometry.js, sketchStoreSync.js, sketchCleanup.js |
| Tool-specific forwarders | 278–297 | onConstraintLineClick, _openDimEdit, _applyDimConstraint, etc. → constraintTool/dimensionTool |

---

## Runtime / Local Setup Notes

- Tests live at the repo root under `unit/` and `e2e/`.
- Unit tests: `npx vitest run` (from repo root)
- E2E tests: `npx playwright test` (from repo root; Playwright auto-starts the Vite dev server)
- Dev server: `npm run dev` (Vite, http://localhost:5173)
- Build: `npm run build` (outputs to `dist/`)
- `dist/` is generated and should not be committed.
