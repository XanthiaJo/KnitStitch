# KnitStitch Roadmap

A high-level feature roadmap organised by area. Checked items are shipped; unchecked items are planned or in progress.

For implementation details, internal notes, and refactoring phases see [agents/roadmap.md](agents/roadmap.md).

_Last updated: 2026-07-15_

---

## SolveSpace Solver Migration

Replace the hand-rolled constraint solver with SolveSpace's Newton's-method
solver compiled to WebAssembly. Shipped behind a feature flag so the native
solver stays default until the WASM backend passes the existing e2e suite.

**Licensing note:** SolveSpace is GPL-3.0-or-later with no linking exception.
Distributing the compiled solver inside KnitStitch makes the whole app
GPL-3.0-or-later. KnitStitch has adopted GPL-3.0-or-later accordingly.

- [x] Phase 1 — Fork `solvespace/solvespace` → `XanthiaJo/SolverWasm`, build the `slvs-wasm` target, ship `slvs.js` as a static asset (done: fork at https://github.com/XanthiaJo/SolverWasm, build verified passing README test case)
- [ ] Phase 2 — Adapter layer translating the sketch model to SolveSpace (real-world units via gauge)
- [ ] Phase 3 — Feature flag (`solverBackend: 'native' | 'slvs'`) with lazy WASM loading
- [ ] Phase 4 — Validate via e2e, flip default, delete the old native solver modules

See [agents/roadmap.md](agents/roadmap.md) for the full spec.

---

## Constraint System

- [x] Coincident constraints
- [x] Perpendicular constraints
- [x] Midpoint constraints
- [x] Equal-length constraints
- [x] Driven dimensions (locked length values)
- [x] Global gradient-descent solver
- [x] BFS-driven dimension enforcement
- [ ] Degrees-of-freedom analysis / under-constrained warning
- [x] Horizontal/Vertical line constraint
- [ ] Parallel lines constraint
- [ ] Fixed-angle constraint
- [ ] Symmetric/mirror constraint
- [ ] Collinear points constraint
- [ ] Tangent constraint (for future curves)
- [ ] Dimension between lines, points or mixed
- [x] Midpoint of a line constraint (point-on-midpoint and line-line midpoint)
- [ ] SolveSpace WASM solver backend (see SolveSpace Solver Migration above)

---

## Sketch Tools

- [x] Line/polyline drawing
- [x] Select and drag with constraint solving
- [x] Dimension placement and driven-value editing
- [x] Constraint creation workflow
- [x] Anchor points
- [x] Origin anchor loaded at centre on grid load
- [x] Object list with selection and deletion
- [x] Undo/redo history
- [ ] Clear-template button
- [x] Construction lines
- [ ] Visual indicator for under/over-constrained points
- [ ] Hot keys for tools
- [x] Drag lines, not just points

---

## Pattern Output

- [ ] Generate row-by-row stitch counts from filled cells
- [ ] Preview knit instructions before export
- [ ] Export/print instructions
- [ ] Shareable pattern links
- [ ] Export/Import sketch state

---

## Templates

- [x] Sock template from body measurements
- [ ] Mitten template
- [ ] Hat template
- [ ] Sleeve template
- [ ] Sweater body template

---

## UI / Sidebar

- [ ] Clear-template button
- [ ] Improved measurement input sidebar
- [ ] Export/import sketch state
- [ ] Multiselect objects in list
- [ ] Delete multiple objects via the list
- [ ] Clicking an object in the list focuses it on the canvas
- [ ] Moveable dimension labels (drag to reposition)
- [ ] Seperate constraints from dimensions in the object list

---

## Testing

- [x] E2E Playwright tests for sketch constraints and interactions
- [x] Unit tests for pure geometry, state, and solver helpers
- [x] DDEV-based E2E setup
- [x] Midpoint constraint creation E2E tests
- [ ] Equal-length constraint creation E2E tests
- [ ] Zoom/pan unit and E2E tests
- [ ] `sockMeasurements.js` unit tests
- [ ] Measurement-driven template generation tests
- [ ] Template persistence and regenerate-on-hydrate tests

---

## Architecture

- [x] Slim `sketchService.js` into a thin coordinator with a tool registry
- [x] Split `mainUi.js` into focused panel controllers