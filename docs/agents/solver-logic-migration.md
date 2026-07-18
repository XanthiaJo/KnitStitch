# Solver Logic Migration Roadmap

_Last updated: 2026-07-18_

This doc is the single source of truth for moving KnitStitch's sketch constraint solving from hand-rolled JavaScript onto the SolveSpace WebAssembly solver (`public/wasm/slvs.js`). It covers what has already moved, what still lives in plain JS, and the concrete next steps to finish the migration.

For the high-level product roadmap, see [../roadmap.md](../roadmap.md). For the build/loading notes, see `AGENTS.md` under "SolveSpace WASM Solver Loading".

---

## 1. Goal

The sketch model (points, lines, dimensions, constraints) should be solved by SolveSpace. KnitStitch should only own:

1. Mapping our model to SolveSpace entities and back (`SlvsAdapter`).
2. Tool workflows, input handling, selection, and rendering.
3. Pure geometry helpers for snapping/hit-testing (`utils/geometry.js`).
4. Unit conversion between pixels and SolveSpace's arbitrary 2D workplane units.

Everything else — constraint satisfaction, DOF analysis, overconstraint detection, feasibility — should be delegated to SolveSpace.

---

## 2. What SolveSpace gives us

The WASM build is produced from the `solver-wasm` fork (`XanthiaJo/SolverWasm`) and exposes the full `slvs` Emscripten API. The relevant bindings are declared in `public/wasm/slvs.d.ts` and implemented in `solver-wasm/src/slvs/jslib.cpp`.

Key functions already used:

- `addBase2D(grouph)` — create a 2D workplane.
- `addPoint2D`, `addLine2D`, `addCircle` — sketch entities.
- `coincident`, `perpendicular`, `parallel`, `equal`, `horizontal`, `vertical`, `midpoint` — geometric constraints.
- `distance` — point-to-point distance constraint (used for aligned driven dimensions).
- `C_PROJ_PT_DISTANCE` — projected point-to-point distance (used for `Horizontal`/`Vertical` driven dimensions).
- `solveSketch(grouph, calculateFaileds)` — solve and return `result`, `dof`, `nbad`, `bad`.
- `getParamValue`, `setParamValue`, `markDragged` — drag-time point pinning.
- `clearSketch` — reset the internal SolveSpace graph.

Bindings present but not yet wired into `SlvsAdapter`:

- `angle`, `symmetric`, `symmetricH`, `symmetricV` — fixed angle and symmetry.
- `diameter`, `equal` for circles/arcs — needed if circles become real constrained entities.
- `tangent` — for arc/line tangency in future curve work.

---

## 3. Current architecture

`src/services/sketch/solver/slvsAdapter.js` is the only file that talks to the WASM.

Responsibilities:

- `init()` — lazy-load `slvs.js` and create the base group/workplane.
- `syncFromSketch(sketch)` — clear the solver graph and rebuild it from `sketch.points`, `lines`, `constraints`, and driven `dimensions`.
- `solve(draggedPoints, freeMovePoints, calculateFaileds)` — set drag preferences and call `solveSketch`.
- `writeBack(sketch)` — copy solved parameter values back into `SketchPoint` instances.
- `solveAndWriteBack(...)` — combined call that only writes back on `RESULT_OKAY` or `RESULT_REDUNDANT_OKAY`.
- `wouldOverconstrain(sketch, { constraint, dimension })` — dry-run solve with a proposed edit and return whether it would over-constrain.
- `analyze(sketch)` — dry-run solve that reports `dof`, under/well/over status, and overconstraint messages from `result.bad`.

`SketchService` uses the adapter through two paths:

- `_solve(sketch, movedPoints)` — during user drag.
- `_reconvergeConstraints(preferredMovePoints)` — after a constraint/dimension is created.

Coordinate system: the grid is non-square (stitches vs rows), but angles must be preserved. `SlvsAdapter` therefore uses a **uniform** X-axis pixel scale for both X and Y in solver units. Real-world inch labels are computed separately by `SketchDimension.recompute` and never passed to the solver. See `slvsAdapter.js` lines 70-80.

---

## 4. What is already on the solver

These constraint types are mapped and solved by SolveSpace:

| KnitStitch `SketchConstraint.type` | SolveSpace call | Constant |
|---|---|---|
| `Coincident` | `slvs.coincident(g, ptA, ptB, wp)` | `C_POINTS_COINCIDENT` |
| `Perpendicular` | `slvs.perpendicular(g, lineA, lineB, wp, false)` | `C_PERPENDICULAR` |
| `Parallel` | `slvs.parallel(g, lineA, lineB, wp)` | `C_PARALLEL` |
| `Equal` | `slvs.equal(g, lineA, lineB, wp)` | `C_EQUAL_LENGTH_LINES` |
| `Horizontal` | `slvs.horizontal(g, line, wp, E_NONE)` | `C_HORIZONTAL` |
| `Vertical` | `slvs.vertical(g, line, wp, E_NONE)` | `C_VERTICAL` |
| `Midpoint` (point-line) | `slvs.addConstraint(g, C_AT_MIDPOINT, wp, 0, pt, E_NONE, line, ...)` | `C_AT_MIDPOINT` |
| `Midpoint` (line-line) | helper points + `C_AT_MIDPOINT` + `coincident` | composite |
| Driven `Dimension` (`Aligned`) | `slvs.distance(g, ptA, ptB, value, wp)` | `C_PT_PT_DISTANCE` |
| Driven `Dimension` (`Horizontal`) | `slvs.addConstraint(g, C_PROJ_PT_DISTANCE, ... this.xAxisLine)` | `C_PROJ_PT_DISTANCE` |
| Driven `Dimension` (`Vertical`) | `slvs.addConstraint(g, C_PROJ_PT_DISTANCE, ... this.yAxisLine)` | `C_PROJ_PT_DISTANCE` |

Driven dimensions are synced as `C_PT_PT_DISTANCE` / `C_PROJ_PT_DISTANCE` constraints using `d.drivenValue` converted to solver units. Solver-only X and Y axis lines provide the projection direction for H/V dimensions.

---

## 5. What is still custom and why

### 5.1 Overconstraint / DOF pre-checks

`perpendicularFeasibility.js` remains as the only custom preflight. `dofAnalyzer.js` and `overconstraintChecker.js` have been deleted.

- `SlvsAdapter.wouldOverconstrain()` now performs a trial `solveSketch(g, true)` and rejects any proposed constraint or driven dimension that is inconsistent or over-constrained.
- `SlvsAdapter.analyze()` reports `dof` and overconstraint messages from the solver's `bad` array for the sidebar status.
- `perpendicularFeasibility.canAddPerpendicularConstraint()` 2-colours a perpendicular adjacency graph to reject impossible perpendicular chains before they reach the solver.

**Why `perpendicularFeasibility` still exists:** it gives an immediate, cheap structural rejection for odd-length perpendicular cycles (A ⟂ B ⟂ C ⟂ A) that SolveSpace might not surface as a clean message. It is not correctness-critical — the solver will also fail the same cases via `INCONSISTENT`/`DIDNT_CONVERGE`.

### 5.2 Manual dimension application [DONE]

`dimensionTool._applyDimConstraint` no longer moves the free endpoint by hand. It sets `dim.drivenValue` and lets `SlvsAdapter` / SolveSpace move the least-used endpoint.

- `Horizontal` and `Vertical` driven dimensions are enforced with `C_PROJ_PT_DISTANCE` against solver-only X/Y axis lines.
- `Aligned` dimensions continue to use `slvs.distance()` for the Euclidean point-to-point distance.
- `SketchDimension` now preserves `kind` once a dimension is driven, so a horizontal dimension stays horizontal even after the solver adjusts geometry.

### 5.3 Geometry helpers

`utils/geometry.js` provides `nearestPoint`, `findSharedPoint`, `applyAngleSnap`, `lineLength`, `otherPoint`, etc. These stay — they are pure, input-side helpers and have no solver equivalent.

### 5.4 Tool workflows and rendering

`constraintTool.js`, `dimensionTool.js`, `lineTool.js`, `rectangleTool.js`, `circleTool.js`, `dragHandler.js`, and `sketchPanelController.js` stay. They decide *what* to create; the solver decides *where* things end up.

---

## 6. Migration backlog

### Phase A — Boot loader fix [DONE]

`src/main.js` now calls `sketchService.ensureSolver().finally(hideBootOverlay)` after paint. The boot overlay stays visible until the solver finishes or fails, unblocking all downstream solver work.

```js
// in src/main.js
sketchService.ensureSolver().finally(hideBootOverlay);
```

### Phase B — Use SolveSpace for overconstraint detection [DONE]

1. `SlvsAdapter.wouldOverconstrain()` now does a trial `solveSketch(g, true)` with `calculateFaileds = true`.
2. `constraintTool._commit` and `dimensionTool.openDimEdit.onConfirm` use `wouldOverconstrain()` to reject over-constrained edits before committing.
3. `dofAnalyzer.js` and `overconstraintChecker.js` have been deleted; `SlvsAdapter.analyze()` supplies DOF and overconstraint messages for the sidebar.
4. `perpendicularFeasibility.js` is kept as a cheap structural preflight.

### Phase C — Horizontal/Vertical projected dimensions [DONE]

1. `SlvsAdapter._addDimensionConstraint` now builds solver-only X/Y axis lines and uses `C_PROJ_PT_DISTANCE` for `Horizontal` and `Vertical` driven dimensions.
2. `dimensionTool._applyDimConstraint` no longer moves the free endpoint by hand; it passes the least-used endpoint as `preferredMovePoints` to `_reconvergeConstraints`.
3. `SketchDimension` preserves `kind` once driven so labels remain H/V/Aligned after a solve.

### Phase D — Simplify driven dimension commit [DONE]

`dimensionTool._applyDimConstraint` is now reduced to:

1. Set `dim.drivenValue = targetPx`.
2. Call `this.service._reconvergeConstraints(new Set([freePoint]))`.
3. `SketchDimension.recompute(true)` updates labels and display values.

### Phase E — Optional new constraint types

These bindings already exist and only need UI + `SlvsAdapter._addConstraint` wiring:

- `Angle` (fixed angle between two lines) — `slvs.angle`.
- `Symmetric` / `SymmetricH` / `SymmetricV` — `slvs.symmetric`, `slvs.symmetricH`, `slvs.symmetricV`.
- `Collinear` could be expressed with `parallel` or `angle`.

These require entity support first:

- `Diameter` / `Radius` constraints for circles — `slvs.diameter`, `slvs.equal` on circles.
- `Tangent` for arcs/lines — `slvs.tangent`.

### Phase F — Performance (future)

`syncFromSketch` clears and rebuilds the entire SolveSpace graph on every drag and constraint creation. There is no incremental update today. If sketches grow large, investigate:

- Only re-sync the modified group instead of `clearSketch`.
- Mark only changed point parameters instead of rebuilding handles.
- This likely requires extending the WASM wrapper in `solver-wasm`, not KnitStitch code.

---

## 7. Open decisions and known issues

| Issue | Location | Decision needed |
|---|---|---|
| WASM loading block is too long | `public/wasm/slvs.js` (built from `solver-wasm`) | Rebuild the WASM without `-s SINGLE_FILE=1` so the browser can stream the `.wasm` file instead of base64-decoding it synchronously. Requires `emcc`/`em++`. |
| Result codes ignored by `_reconvergeConstraints` | `src/services/sketch/sketchService.js` | Inspect `solveAndWriteBack` return and abort flush/rebuild on failure. |
| Circles are not solver entities | `src/services/sketch/tools/circleTool.js` | Decide if circles should be constrained or remain decorative. |
| Uniform X-only scale for solver units | `src/services/sketch/solver/slvsAdapter.js` | Preserves angles but means real-world inch distances are only accurate in the display layer. Document and keep. |

---

## 8. File map

| File | Role in solver migration |
|---|---|
| `src/services/sketch/solver/slvsAdapter.js` | Sole bridge to SolveSpace. Owns loading, sync, solve, write-back. |
| `src/services/sketch/sketchService.js` | Coordinator; calls `_solve` during drag and `_reconvergeConstraints` after edits. |
| `src/services/sketch/tools/constraintTool.js` | Constraint creation workflow; uses `wouldOverconstrain` for preflight rejection. |
| `src/services/sketch/tools/dimensionTool.js` | Dimension placement, edit overlay, and solver-driven driven-value application. |
| `src/services/sketch/solver/perpendicularFeasibility.js` | Cheap perpendicular feasibility preflight — currently kept as a fast path. |
| `src/main.js` | Triggers `ensureSolver()` at boot; hides boot overlay when done. |
| `public/wasm/slvs.js` / `public/wasm/slvs.d.ts` | WASM runtime and TypeScript API. |
| `solver-wasm/` (sibling repo) | Source for the WASM build; the only way to fix the base64 single-file loading freeze is to rebuild without `-s SINGLE_FILE=1`. |

---

## 9. Definition of done

The migration is complete when:

- [x] 1. `main.js` loads the solver at boot.
- [x] 2. No hand-rolled DOF/overconstraint code runs on the hot path.
- [x] 3. Driven `Horizontal`/`Vertical` dimensions are enforced by the solver, not by `dimensionTool`.
- [x] 4. `constraintTool` and `dimensionTool` use a trial solve with `calculateFaileds` to reject impossible edits and surface which constraints conflict.
- [x] 5. `SlvsAdapter` is the only file importing or calling `slvs`.
- [ ] 6. The WASM is rebuilt without `SINGLE_FILE=1` so the boot/E2E loading block is fast enough to pass.
- [ ] 7. All existing `e2e/sketchConstraints*.spec.js` tests pass.
