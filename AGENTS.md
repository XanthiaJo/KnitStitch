# KnitStitch Agent Notes

This file contains the agent guidance for the KnitStitch Grid app.
KnitStitch is a standalone front-end app (no longer embedded in Craft CMS).

## Scope

Applies to all work in this repository. The app is served from its own
subdomain and built with Vite.

## Product Model

KnitStitch Grid is a Konva.js web conversion of the original KnitStichGrid WPF desktop app.

- Entry point: `index.html` (standalone, no server-side templating)
- Source: `src/`
- Built assets: `dist/` (produced by `npm run build`)
- App styles: `public/css/app.css` (served as a static file, copied to `dist/css/app.css`)

## Running Locally

No CMS or backend is required. The app runs entirely through Vite.

```bash
npm install
npm run dev      # Vite dev server at http://localhost:5173
npm run build    # Production build to dist/
npm run preview  # Serve the built dist/ locally
```

## Architecture

Primary source layout:

- `src/main.js` - bootstrap and stage init
- `src/ui/mainUi.js` - sidebar wiring, store subscriptions, right-click pan, finished size calculation
- `src/konva/` - stage and render layers
- `src/models/` - sketch/grid data models
- `src/services/` - grid cell management, zoom/pan, finished size calculation
- `src/services/sketch/` - all sketch logic: service, solver, helpers, constants, deletion, style options
- `src/state/store.js` - reactive store (sparse filledCells, gauge, zoom/pan, sketch state)
- `src/state/storePersistence.js` - localStorage persistence with legacy migration
- `src/utils/geometry.js` - pure geometry helpers (distance, nearestPoint, applyAngleSnap)
- `unit/` - Vitest unit tests (pure logic)
- `e2e/` - Playwright E2E tests (user interaction coverage)
- `docs/` - human-level docs: architecture overview, project map, roadmap, testing guide
- `docs/agents/` - agent-level docs: low-level architecture, import/export maps, detailed roadmap

## DRY Rules

For KnitStitch work, prefer these rules before adding logic:

- keep tool constants and object-kind constants centralized
- move sketch-specific helpers into `src/services/sketch/` instead of growing `sketchService.js`
- extract pure projection logic and graph/deletion logic into standalone modules before splitting event-flow code
- avoid repeating store sync sequences; when a mutation path repeats, prefer a shared helper
- avoid duplicating geometry helpers like nearest-point lookup, shared-point lookup, and angle snap

The current direction is:

- `sketchService.js` acts as the coordinator
- extracted helpers under `src/services/sketch/` own pure or policy-heavy logic
- `constraintSolver.js` owns geometric enforcement, not UI selection flow
- `dimensionTool.js` owns the dimension lifecycle (placement, edit overlay, driven-value application)
- `constraintTool.js` owns the constraint creation workflow (line selection, feasibility check, commit)
- pure geometry helpers (`distance`, `nearestPoint`, `applyAngleSnap`) live in `src/utils/geometry.js`
- colour triplets and renderer colour constants live in `src/services/sketch/render/styleOptions.js`; use `getColorTriplet()` to resolve a stroke hex to its triplet

## Sketch Interaction Model

The sketch behavior should follow the mental model of Fusion 360 sketching as closely as is practical in this app.

That means:

- sketch entities are persistent geometric objects, not temporary drawing strokes
- constraints are relationships between entities and should immediately affect geometry when applied
- dimensions are driving constraints when confirmed, not passive labels
- selecting sketch entities should feel entity-based first: point, line, dimension label, constraint marker
- deleting a constrained entity should cascade to dependent constraints or dimensions where required
- impossible constraints should be rejected rather than stored in a broken state

For perpendicular constraints specifically:

- they are line-to-line constraints, not point constraints
- creation should mirror CAD behavior: choose one line, then the second line
- when the constraint is accepted, the geometry should move immediately so the relation is true
- the feasibility check matters; constraint graphs that cannot be satisfied should be rejected on creation

If behavior is ambiguous, prefer Fusion 360 style sketch semantics over lightweight drawing-app semantics.

## Workspace Model

The page has four workspaces:

- Sketch (default on load)
- Overlay
- Templates
- Options (gauge, grid info, finished size)

The Sketch workspace is the one governed by the Fusion-style rules above.

## Grid Model

The grid is infinite and viewport-culled. There is no fixed grid size.

- `filledCells` in the store is a `Set` of `"r,c"` string keys for manually toggled cells
- `GridLayer` renders only the cells visible in the current viewport (accounting for zoom and pan), re-rendering on zoom/pan changes
- cells can be at negative indices — the grid extends in all directions
- left-click toggles a cell fill; right-click pans the canvas (context menu is suppressed)
- `closedShapeFill.js` computes sketch-derived fills as a `Set` of `"r,c"` keys from closed polygon bounding boxes
- finished size is calculated from the bounding box of all filled cells (manual + sketch-derived), not from a fixed grid dimension
- `storePersistence.js` migrates the legacy `previewCells` array format to the sparse `Set` on hydrate

## Colour Triplets

Sketch stroke colours are defined as triplets `{ stroke, fill, select }`:

- `stroke` — the vivid line colour the user picks
- `fill` — the point fill colour (same as stroke for most)
- `select` — a darker shade used for selection highlight of lines and points

Each colour family has its own selection highlight instead of a single site-wide gold. The default colour is Gold. See `src/services/sketch/render/styleOptions.js`.

## Rendering Notes

- `GridLayer` uses an off-screen canvas promoted into a `Konva.Image`, repositioned to the visible cell range offset
- `SketchLayer` redraws sketch shapes from store state, using per-colour triplets for selection highlights
- `OverlayLayer` handles reference image display
- stage layer order is grid -> overlay -> sketch

## Testing Rules

Tests live at the repository root under `unit/` and `e2e/`.

### E2E-First Testing Approach

This is a UI/interaction-based system where the real test is whether constraints work when users interact with the canvas. We prioritize e2e tests over unit tests for the following reasons:

- **User experience matters most**: The success criteria are visual and interactive (perpendicular lines stay perpendicular, dimensions stay locked, etc.)
- **Complex interactions**: Constraints involve multiple moving parts (points, lines, dimensions, solver) that are best tested together
- **Implementation changes**: The solver implementation can change (local vs global) but user behavior should remain consistent
- **Visual feedback**: Many constraints are about visual relationships that are hard to unit test meaningfully

### Test Structure

**E2E Tests (Primary)**:
- `e2e/sketchConstraints.spec.js` - Comprehensive coverage of all user scenarios
- Tests real user interactions: clicking, dragging, constraint creation, deletion
- Validates visual outcomes: perpendicularity, dimension locking, constraint satisfaction

**Unit Tests (Supporting)**:
- Pure logic functions only (geometry calculations, store state, etc.)
- No testing of solver implementation details
- No testing of UI interaction flows

### Running Tests

Unit tests (Vitest):
```bash
npx vitest run
```

E2E tests (Playwright — starts the Vite dev server automatically):
```bash
npx playwright test
```

Build:
```bash
npm run build
```

### Testing Guidelines

**DO use E2E tests for**:
- Constraint creation and satisfaction
- Dimension behaviors (driven, locked, editing)
- User interactions (dragging, selecting, deleting)
- Visual relationships (perpendicular, coincident, etc.)
- Complex scenarios with multiple constraints

**DO use Unit tests for**:
- Pure mathematical functions
- State management logic
- Geometry calculations
- Data persistence
- Simple, isolated functions

**AVOID unit tests for**:
- Solver implementation details
- UI interaction flows
- Complex constraint scenarios
- Visual validation
- Integration between components

The e2e tests are the source of truth for whether the system works correctly from a user perspective.

## Local Artifacts

Keep these untracked:

- `node_modules/`
- `dist/`
- `coverage/`
- `test-results/`
- `playwright-report/`
- `test-screenshots/`
- `vite.config.js.timestamp-*.mjs`
