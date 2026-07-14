# KnitStitch Agent Roadmap

Internal, detail-heavy notes for agents working on KnitStitch. This is the companion to the human-readable [../roadmap.md](../roadmap.md).

_Last updated: 2026-07-12_

---

## Status at a Glance

| Area | Status |
|---|---|
| Global constraint solver | Shipped |
| Constraint types | 6 shipped (Coincident, Perpendicular, Midpoint, Equal Length, Horizontal/Vertical, Driven Dimensions) |
| E2E test coverage | 19 passing (run via Playwright against DDEV) |
| Unit test coverage | 67 passing across 12 files |
| Sketch service refactor (`sketchService.js`) | Complete — tool registry extracted, service is a thin coordinator (~300 lines, all forwarders) |
| UI refactor (`mainUi.js`) | Complete — split into 7 focused panel controllers, mainUi.js is a 63-line orchestrator |

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
| New constraint types | Belong in `constraintTool.js` (creation) and `constraintSolver.js`/`globalConstraintSolver.js` (enforcement), not `sketchService.js`. |
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
// 1. Add error function to globalConstraintSolver.js
_addParallelGradients(constraint, sketch, gradients) {
    const v1 = {
        x: constraint.lineA.end.x - constraint.lineA.start.x,
        y: constraint.lineA.end.y - constraint.lineA.start.y
    };
    const v2 = {
        x: constraint.lineB.end.x - constraint.lineB.start.x,
        y: constraint.lineB.end.y - constraint.lineB.start.y
    };
    const cross = v1.x * v2.y - v1.y * v2.x;
    // Add gradients to movable points...
}

// 2. Add to SketchObjectKind constants
Parallel: 5,

// 3. Add UI button and constraint tool workflow
// 4. Add feasibility checks if needed
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
