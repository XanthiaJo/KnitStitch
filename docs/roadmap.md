# KnitStitch Roadmap

A high-level feature roadmap organised by area. Checked items are shipped; unchecked items are planned or in progress.

For implementation details, internal notes, and refactoring phases see [agents/roadmap.md](agents/roadmap.md).

_Last updated: 2026-07-18_

---

## SolveSpace Solver Migration

Replace the hand-rolled constraint solver with SolveSpace's Newton's-method
solver compiled to WebAssembly. The SolveSpace backend is now the shipped
solver, with lazy WASM loading and e2e coverage for the supported workflows.

**Licensing note:** SolveSpace is GPL-3.0-or-later with no linking exception.
Distributing the compiled solver inside KnitStitch makes the whole app
GPL-3.0-or-later. KnitStitch has adopted GPL-3.0-or-later accordingly.

- [x] Phase 1 — Fork `solvespace/solvespace` → `XanthiaJo/SolverWasm`, build the `slvs-wasm` target, ship `slvs.js` + `slvs.wasm` as static assets (done: fork at https://github.com/XanthiaJo/SolverWasm, rebuild verified and copied into `public/wasm/`)
- [x] Phase 2 — Adapter layer translating the sketch model to SolveSpace (real-world units via gauge)
- [x] Phase 3 — Solver integration with lazy WASM loading
- [x] Phase 4 — Validate via e2e, make SolveSpace the shipped backend, and remove the old native solver modules

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
- [x] Degrees-of-freedom analysis / under-constrained warning
- [x] Horizontal/Vertical line constraint
- [x] Parallel lines constraint
- [ ] Fixed-angle constraint
- [ ] Symmetric/mirror constraint
- [ ] Collinear points constraint
- [ ] Tangent constraint (for future curves)
- [ ] Dimension between lines, points or mixed
- [x] Midpoint of a line constraint (point-on-midpoint and line-line midpoint)
- [x] SolveSpace WASM solver backend (see SolveSpace Solver Migration above)

---

## Sketch Tools

- [x] Line/polyline drawing
- [x] Circle drawing
- [x] Rectangle drawing
- [x] Bézier curve drawing
- [x] Select and drag with constraint solving
- [x] Dimension placement and driven-value editing
- [x] Constraint creation workflow
- [x] Anchor points
- [x] Origin anchor loaded at centre on grid load
- [x] Object list with selection and deletion
- [x] Undo/redo history
- [ ] Clear-template button
- [x] Construction lines
- [x] Visual indicator for under/over-constrained points
- [x] Hot keys for tools
- [x] Drag lines, not just points

---

## Accounts and Saved Patterns

Use a self-hosted Better Auth backend rather than implementing password and
session handling in the browser. The static Vite frontend will call a small
Node/TypeScript API that owns authentication, pattern persistence, and
authorization. Keep local drafts available, but treat them as browser-local
rather than account-protected data.

- [ ] Choose and document the backend deployment layout (same-origin `/api` routes preferred)
- [ ] Add a self-hosted Node/TypeScript API with Better Auth and database migrations
- [ ] Add email/password registration, login, logout, session lookup, email verification, and password reset
- [ ] Store auth and session secrets only in server environment configuration
- [ ] Add user-owned saved patterns with server-side ownership checks on every read/write/delete operation
- [ ] Add frontend account UI and authenticated API client
- [ ] Add rate limiting, secure cookie/HTTPS configuration, and security event handling
- [ ] Add e2e coverage for authentication, expired sessions, and cross-user pattern access
- [ ] Document deployment, backups, email delivery, and account recovery

---

## Pattern Output

- [x] Generate row-by-row stitch counts from filled cells
- [x] Preview knit instructions before export
- [ ] Export/print instructions
- [ ] Shareable pattern links
- [x] Export/Import sketch state

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
- [x] Improved measurement input sidebar
- [x] Export/import sketch state
- [x] Multiselect objects in list
- [x] Delete multiple objects via the list
- [ ] Clicking an object in the list focuses it on the canvas
- [ ] Moveable dimension labels (drag to reposition)
- [ ] Seperate constraints from dimensions in the object list
- [x] Resizable sidebar panels

---

## Testing

- [x] E2E Playwright tests for sketch constraints and interactions
- [x] Unit tests for pure geometry, state, and solver helpers
- [x] Vite-based E2E setup
- [x] Midpoint constraint creation E2E tests
- [x] Equal-length constraint creation E2E tests
- [ ] Zoom/pan unit and E2E tests
- [ ] `sockMeasurements.js` unit tests
- [ ] Measurement-driven template generation tests
- [ ] Template persistence and regenerate-on-hydrate tests

---

## Refactoring

- [x] dofAnalyzer.js
- [x] sketchLayer.js
