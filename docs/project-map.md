# KnitStitch Project Map

Short summaries of every source file, grouped by role.

For low-level import/export maps and dependency graphs, see [agents/project-map.md](agents/project-map.md).

## Docs

| File | Summary |
| --- | --- |
| `docs/architecture.md` | Surface-level overview: what the app does, what calls what. Read first. |
| `docs/project-map.md` | This file — a flat index of every source file. |
| `docs/roadmap.md` | Human-readable feature roadmap: shipped, in progress, planned. |
| `docs/testing.md` | How to run unit and E2E tests. |
| `docs/tests-map.md` | Index of test files and coverage notes. |
| `docs/agents/architecture.md` | Low-level architecture for agents: solver math, constraint internals, file responsibilities. |
| `docs/agents/project-map.md` | Detailed file index with imports, exports, and dependency graph. |
| `docs/agents/roadmap.md` | Agent-level roadmap with implementation details and refactor plans. |

## Planned Account Backend

The account backend does not exist yet. The roadmap calls for a self-hosted
Node/TypeScript API using Better Auth, with `/api` routes for authentication
and user-owned saved patterns. When implementation begins, add its source
layout, environment configuration, migrations, and test commands to this map.

## Bootstrap & Stage

| File | Summary |
| --- | --- |
| `src/main.js` | App bootstrap: creates Store, SketchService, persistence, stage, and UI. |
| `src/konva/appStage.js` | Creates the Konva stage, mounts grid/overlay/sketch layers, handles resize and zoom/pan. |

## Konva Layers

| File | Summary |
| --- | --- |
| `src/konva/gridLayer.js` | Infinite grid rendered as viewport-culled off-screen canvas. Handles cell toggle on click. |
| `src/konva/overlayLayer.js` | Renders the optional reference image overlay. |
| `src/konva/sketchLayer.js` | Renders sketch points, lines, dimensions, constraints. Captures all canvas interactions. |
| `src/konva/sketchOverlay.js` | Floating DOM overlays: dimension edit input and cursor error messages. |
| `src/konva/constraintIcons.js` | Per-type constraint icon renderers with click handling. |
| `src/konva/dimensionRenderer.js` | Renders dimension witness lines, dim line, arrowheads, and clickable label. |

## Models

| File | Summary |
| --- | --- |
| `src/models/gaugeSettings.js` | Gauge inputs (stitches/rows per 4 inches) and per-inch conversions. |
| `src/models/patternDimensions.js` | Pattern dimensions (stitch count and row count). |
| `src/models/sketch/sketchPoint.js` | Sketch point: `{ id, x, y, isSelected, isAnchor }`. |
| `src/models/sketch/sketchLine.js` | Sketch line: `{ id, start, end, isConstruction, isSelected }`. |
| `src/models/sketch/sketchDimension.js` | Dimension between two points. Snaps to H/V/Aligned. Supports driven values. |
| `src/models/sketch/sketchConstraint.js` | Constraint model: Coincident, Perpendicular, Midpoint, Equal, Horizontal, Vertical. |
| `src/models/sketch/sketchColorOption.js` | Color triplet (stroke, fill, select) for sketch strokes. |

## Services

| File | Summary |
| --- | --- |
| `src/services/finishedSizeCalculator.js` | Calculates finished size in inches from gauge and pattern dimensions. |
| `src/services/gridService.js` | Sparse cell toggle, bounding box, cell sizing from gauge. |
| `src/services/zoomService.js` | Pure zoom/pan helpers: zoom-at-focal, fit-to-view, screen-to-content. |

## Sketch Service

| File | Summary |
| --- | --- |
| `src/services/sketch/sketchService.js` | Thin coordinator: delegates to tool registry, state modules, and solvers. Entry point for all sketch actions. |
| `src/services/sketch/constants.js` | Shared constants: SketchTool, ConstraintSubMode, SketchObjectKind, snap radius/angle. |

## Sketch Tools

| File | Summary |
| --- | --- |
| `src/services/sketch/tools/toolRegistry.js` | Owns all tool instances, routes pointer events to the active tool. |
| `src/services/sketch/tools/lineTool.js` | Line/polyline drawing workflow (click-to-place, preview, angle snap). |
| `src/services/sketch/tools/dimensionTool.js` | Dimension placement, edit overlay, and driven-value application. |
| `src/services/sketch/tools/constraintTool.js` | Constraint creation workflow for perpendicular, midpoint, equal, and H/V constraints. |
| `src/services/sketch/tools/anchorTool.js` | Anchor point creation and point-to-anchor conversion. |

## Sketch Solvers

| File | Summary |
| --- | --- |
| `src/services/sketch/solver/slvsAdapter.js` | SolveSpace WASM constraint solver adapter (bridges sketch model to slvs). |
| `src/services/sketch/solver/perpendicularFeasibility.js` | Graph-theory bipartite check for perpendicular constraint feasibility. |
| `src/services/sketch/solver/dofAnalyzer.js` | Degree-of-freedom analysis and overconstraint detection. |
| `src/services/sketch/solver/overconstraintChecker.js` | Detects redundant/over-constrained patterns. |

## Sketch State

| File | Summary |
| --- | --- |
| `src/services/sketch/state/lifecycle.js` | Origin anchor, undo, clear, cancel, exit-to-select. |
| `src/services/sketch/state/properties.js` | Store-backed getters/setters for tool, color, thickness, etc. |
| `src/services/sketch/state/sketchSelection.js` | Selection state: clear, select point/line/dimension/constraint. |
| `src/services/sketch/state/selection.js` | Delete selected items (cascades to dependents). |
| `src/services/sketch/state/deleteSketchSelection.js` | Pure function that removes selected items and returns cleanup info. |
| `src/services/sketch/state/sketchCleanup.js` | Removes orphan points (unreferenced by any line/dim/constraint). |
| `src/services/sketch/state/sketchStoreSync.js` | Syncs sketch arrays to the store, rebuilds object list. |
| `src/services/sketch/state/sketchStateHelpers.js` | Barrel re-export of state helpers for convenient imports. |
| `src/services/sketch/state/sketchIdManager.js` | Sequential ID generation and constraint ID assignment. |
| `src/services/sketch/state/sketchFeedback.js` | Transient cursor messages (e.g., "impossible combination"). |
| `src/services/sketch/state/sketchSnapshot.js` | Captures and restores full sketch state for undo/redo. |
| `src/services/sketch/state/historyManager.js` | Undo/redo stack with drag snapshot support. |

## Sketch Interactions

| File | Summary |
| --- | --- |
| `src/services/sketch/interactions/dragHandler.js` | Point drag logic with constraint solving. |

## Sketch Rendering

| File | Summary |
| --- | --- |
| `src/services/sketch/render/buildSketchObjects.js` | Builds the sidebar object list from sketch state. |
| `src/services/sketch/render/styleOptions.js` | Default stroke colors, thickness, renderer color constants. |

## Sketch Fill

| File | Summary |
| --- | --- |
| `src/services/sketch/fill/closedShapeFill.js` | Detects closed loops and computes which grid cells are inside. |

## Sketch Templates

| File | Summary |
| --- | --- |
| `src/services/sketch/templates/templateTool.js` | Generates templates (sock) as sketch points/lines/dimensions/constraints. |
| `src/services/sketch/templates/templateActions.js` | Thin wrappers for apply and regenerate. |
| `src/services/sketch/templates/sockMeasurements.js` | Pure functions: gauge + body measurements → outline and section dimensions. |

## State

| File | Summary |
| --- | --- |
| `src/state/store.js` | Minimal reactive store: `get(path)` / `set(path, value)` / `subscribe(fn)`. |
| `src/state/storePersistence.js` | Hydrates and saves app state to localStorage with legacy migration. |

## UI

| File | Summary |
| --- | --- |
| `src/ui/mainUi.js` | Thin orchestrator: wires panel controllers, cross-panel syncAll, setWorkspace wrapper. |
| `src/ui/uiUtils.js` | Shared DOM helpers: `getElement`, `bindIfPresent`, `toggleActive`, `collectRefs`. |
| `src/ui/gridPanelController.js` | Grid sidebar: gauge inputs, grid info, finished size, clear-manual. |
| `src/ui/sketchPanelController.js` | Sketch sidebar: tool buttons, object list, constraint status, color/undo/delete. |
| `src/ui/overlayPanelController.js` | Overlay sidebar: image browse/clear, visibility, opacity. |
| `src/ui/templatePanelController.js` | Template sidebar: template list, measurement inputs, derived values. |
| `src/ui/zoomController.js` | Zoom/pan: zoom buttons, wheel zoom, right-mouse pan, zoom display. |
| `src/ui/keyboardController.js` | Keyboard shortcuts: Escape exits to Select, Delete removes selection. |

## Utils

| File | Summary |
| --- | --- |
| `src/utils/geometry.js` | Pure geometry helpers: `distance`, `nearestPoint`, `applyAngleSnap`, `findSharedPoint`, `findLinesForPoint`. |

## Entry Point & Styles

| File | Summary |
| --- | --- |
| `index.html` | Standalone page: workspace tabs, sidebar panels, zoom controls, measurement inputs. Loads `src/main.js` and `public/css/app.css`. |
| `public/css/app.css` | App styles: design tokens, base reset/typography, shared components, KnitStitch layout. Served as a static file by Vite. |
