# KnitStitch Agent Project Map

Detailed file index with imports, exports, and dependency map for agents working on KnitStitch.

For the surface-level file summaries, see [../project-map.md](../project-map.md).

---

## Complete file list (50 files, ~4,500 lines)

### Root

| File | Lines | Summary |
| --- | --- | --- |
| `src/main.js` | 33 | App bootstrap: creates Store, SketchService, persistence, AppStage, UI. Exposes `window.__knitstitchStore` and `window.__knitstitchSketchService` for E2E tests. |
| `src/ui/mainUi.js` | 63 | Thin orchestrator: wires panel controllers, cross-panel syncAll, setWorkspace wrapper. |
| `src/ui/uiUtils.js` | 35 | Shared DOM helpers: `getElement`, `bindIfPresent`, `toggleActive`, `collectRefs`. |
| `src/ui/gridPanelController.js` | 124 | Grid sidebar: gauge inputs, grid info, finished size, clear-manual. |
| `src/ui/sketchPanelController.js` | 158 | Sketch sidebar: tool buttons, object list, constraint status, color/undo/delete. |
| `src/ui/overlayPanelController.js` | 64 | Overlay sidebar: image browse/clear, visibility, opacity. |
| `src/ui/templatePanelController.js` | 131 | Template sidebar: template list, measurement inputs, derived values. |
| `src/ui/zoomController.js` | 123 | Zoom/pan: zoom buttons, wheel zoom, right-mouse pan, zoom display. |
| `src/ui/keyboardController.js` | 30 | Keyboard shortcuts: Escape, Delete. |

### Konva layers

| File | Lines | Summary |
| --- | --- | --- |
| `src/konva/appStage.js` | 121 | Creates `Konva.Stage`, mounts grid/overlay/sketch layers, handles resize, zoom/pan transform, origin anchor. |
| `src/konva/gridLayer.js` | 267 | Infinite grid as viewport-culled off-screen canvas → `Konva.Image`. Cell toggle on click. |
| `src/konva/overlayLayer.js` | 76 | Reference image overlay rendering. |
| `src/konva/sketchLayer.js` | 258 | Renders sketch points, lines, dimensions, constraints. Captures all canvas interactions and forwards to `sketchService`. |
| `src/konva/sketchOverlay.js` | 126 | Floating DOM overlays: dimension edit input (`#dim-edit-input`) and cursor error messages. |
| `src/konva/constraintIcons.js` | 202 | Per-type constraint icon renderers with shared click handler. |
| `src/konva/dimensionRenderer.js` | 102 | Renders dimension witness lines, dim line, arrowheads, clickable label. |

### Models

| File | Lines | Summary |
| --- | --- | --- |
| `src/models/gaugeSettings.js` | 16 | Gauge inputs (stitches/rows per 4 inches) and per-inch conversions. |
| `src/models/patternDimensions.js` | 8 | Pattern dimensions (stitch count, row count). |
| `src/models/point.js` | 11 | **Dead file** — legacy stub, not imported anywhere. |
| `src/models/sketch/sketchPoint.js` | 23 | `SketchPoint`: `{ id, x, y, isSelected, isAnchor }`. |
| `src/models/sketch/sketchLine.js` | 9 | `SketchLine`: `{ id, start, end, isConstruction, isSelected }`. |
| `src/models/sketch/sketchDimension.js` | 184 | Dimension model with H/V/Aligned kind detection, recompute geometry, driven values, display overrides. |
| `src/models/sketch/sketchConstraint.js` | 32 | Constraint model: Coincident, Perpendicular, Midpoint, Equal, Horizontal, Vertical. |
| `src/models/sketch/sketchColorOption.js` | 8 | Color triplet `{ stroke, fill, select }`. |

### Services (non-sketch)

| File | Lines | Summary |
| --- | --- | --- |
| `src/services/finishedSizeCalculator.js` | 11 | Finished size in inches from gauge and pattern dimensions. |
| `src/services/gridService.js` | 82 | Sparse cell toggle, bounding box, cell sizing, clear-manual-cells-outside-sketch. |
| `src/services/zoomService.js` | 102 | Pure zoom/pan helpers: zoomAt, fitToView, screenToContent. |

### Sketch — coordinator

| File | Lines | Imports | Exports |
| --- | --- | --- | --- |
| `src/services/sketch/sketchService.js` | 297 | ToolRegistry, ConstraintSolver, GlobalConstraintSolver, HistoryManager, 12 state modules, geometry, constants | `SketchService` class, re-exports `ConstraintSubMode`, `SketchObjectKind`, `SketchTool` |
| `src/services/sketch/tools/toolRegistry.js` | 131 | SketchTool, AnchorTool, ConstraintTool, DimensionTool, LineTool, TemplateTool | `ToolRegistry` class |
| `src/services/sketch/constants.js` | 34 | — | `SNAP_RADIUS`, `SNAP_ANGLE_DEG`, `SketchTool`, `ConstraintSubMode`, `SketchObjectKind` |

### Sketch — tools

| File | Lines | Key imports | Exports |
| --- | --- | --- | --- |
| `src/services/sketch/tools/lineTool.js` | 94 | SketchLine, SketchPoint, applyAngleSnap, sketchStateHelpers | `LineTool` class |
| `src/services/sketch/tools/dimensionTool.js` | 125 | SketchDimension, sketchStateHelpers | `DimensionTool` class |
| `src/services/sketch/tools/constraintTool.js` | 310 | SketchConstraint, ConstraintSubMode, sketchStateHelpers | `ConstraintTool` class |
| `src/services/sketch/tools/anchorTool.js` | 52 | SketchPoint, sketchStateHelpers | `AnchorTool` class |

### Sketch — solvers

| File | Lines | Key imports | Exports |
| --- | --- | --- | --- |
| `src/services/sketch/solver/globalConstraintSolver.js` | 125 | constraintErrorTerms, hardConstraintPropagator | `GlobalConstraintSolver` class |
| `src/services/sketch/solver/constraintSolver.js` | 637 | geometry, constants | `ConstraintSolver` class |
| `src/services/sketch/solver/constraintErrorTerms.js` | 228 | — | Error functions + analytical gradients |
| `src/services/sketch/solver/hardConstraintPropagator.js` | 317 | geometry | Hard constraint enforcement functions |
| `src/services/sketch/solver/overconstraintChecker.js` | 140 | — | `checkOverconstraints` function |

### Sketch — state

| File | Lines | Key imports | Exports |
| --- | --- | --- | --- |
| `src/services/sketch/state/lifecycle.js` | 85 | SketchPoint, sketchSnapshot, constants | `ensureOriginAnchor`, `undo`, `clear`, `cancelCurrentLine`, `recordSnapshot`, `exitToSelect` |
| `src/services/sketch/state/properties.js` | 57 | constants | Getters/setters for isActive, activeTool, constraintSubMode, strokeColor, strokeThickness, pendingStart, templates |
| `src/services/sketch/state/sketchSelection.js` | 64 | sketchStoreSync | `clearSelection`, `selectPoint`, `selectLine`, `selectDimension`, `selectConstraint`, `selectObjectByRef` |
| `src/services/sketch/state/selection.js` | 37 | deleteSketchSelection | `deleteSelected`, `getHasSelection` |
| `src/services/sketch/state/deleteSketchSelection.js` | 48 | — | `deleteSketchSelection` (pure function) |
| `src/services/sketch/state/sketchCleanup.js` | 31 | — | `removeOrphanPoint` |
| `src/services/sketch/state/sketchStoreSync.js` | 36 | buildSketchObjects, geometry, sketchIdManager | `syncSketchStateToStore`, `flushSketchArrays`, `rebuildSketchObjects`, `setPreviewLine`, `setSnapCandidate` |
| `src/services/sketch/state/sketchStateHelpers.js` | 5 | Re-exports from sketchSelection, sketchStoreSync, sketchIdManager, sketchFeedback, geometry | Barrel file |
| `src/services/sketch/state/sketchIdManager.js` | 23 | — | `nextId`, `seedIdCountersFromSketch`, `assignConstraintIds` |
| `src/services/sketch/state/sketchFeedback.js` | 20 | — | `showCursorMessage`, `clearCursorMessage` |
| `src/services/sketch/state/sketchSnapshot.js` | 209 | — | `captureSketchSnapshot`, `restoreSketchSnapshot`, `snapshotsEqual` |
| `src/services/sketch/state/historyManager.js` | 64 | sketchSnapshot | `HistoryManager` class |

### Sketch — interactions

| File | Lines | Key imports | Exports |
| --- | --- | --- | --- |
| `src/services/sketch/interactions/dragHandler.js` | 72 | solvers, sketchSnapshot, sketchSelection | `startDrag`, `onCanvasMouseUp`, `onSelectMouseMove` |

### Sketch — render

| File | Lines | Key imports | Exports |
| --- | --- | --- | --- |
| `src/services/sketch/render/buildSketchObjects.js` | 125 | constants | `buildSketchObjects` |
| `src/services/sketch/render/styleOptions.js` | 76 | — | `STROKE_COLOR_OPTIONS`, `DEFAULT_STROKE_COLOR`, `DEFAULT_STROKE_THICKNESS`, `getColorTriplet` |

### Sketch — fill

| File | Lines | Key imports | Exports |
| --- | --- | --- | --- |
| `src/services/sketch/fill/closedShapeFill.js` | 217 | geometry | `computeClosedShapeFill` |

### Sketch — templates

| File | Lines | Key imports | Exports |
| --- | --- | --- | --- |
| `src/services/sketch/templates/templateTool.js` | 359 | sockMeasurements, models, constants, sketchStateHelpers | `TemplateTool` class |
| `src/services/sketch/templates/templateActions.js` | 6 | — | `applyTemplate`, `regenerateTemplate` (thin wrappers) |
| `src/services/sketch/templates/sockMeasurements.js` | 278 | — | Pure measurement → outline/section functions |

### State

| File | Lines | Key imports | Exports |
| --- | --- | --- | --- |
| `src/state/store.js` | 83 | styleOptions | `Store` class |
| `src/state/storePersistence.js` | 234 | store, sketchSnapshot | `hydrateStore`, `saveStore` |

### Utils

| File | Lines | Key imports | Exports |
| --- | --- | --- | --- |
| `src/utils/geometry.js` | 64 | — | `distance`, `nearestPoint`, `applyAngleSnap`, `findSharedPoint`, `findLinesForPoint` |

---

## Dependency graph

```
main.js
  ├─> state/store.js
  │     └─> services/sketch/render/styleOptions.js
  ├─> state/storePersistence.js
  │     └─> services/sketch/state/sketchSnapshot.js
  ├─> services/sketch/sketchService.js
  │     ├─> services/sketch/tools/toolRegistry.js
  │     │     ├─> tools/lineTool.js
  │     │     ├─> tools/dimensionTool.js
  │     │     ├─> tools/constraintTool.js
  │     │     ├─> tools/anchorTool.js
  │     │     └─> templates/templateTool.js
  │     │           └─> templates/sockMeasurements.js
  │     ├─> solver/constraintSolver.js
  │     ├─> solver/globalConstraintSolver.js
  │     │     ├─> solver/constraintErrorTerms.js
  │     │     └─> solver/hardConstraintPropagator.js
  │     ├─> solver/overconstraintChecker.js
  │     ├─> state/historyManager.js
  │     │     └─> state/sketchSnapshot.js
  │     ├─> state/lifecycle.js
  │     ├─> state/properties.js
  │     ├─> state/sketchSelection.js
  │     ├─> state/selection.js
  │     │     └─> state/deleteSketchSelection.js
  │     ├─> state/sketchCleanup.js
  │     ├─> state/sketchStoreSync.js
  │     │     └─> render/buildSketchObjects.js
  │     ├─> state/sketchIdManager.js
  │     ├─> interactions/dragHandler.js
  │     ├─> templates/templateActions.js
  │     └─> utils/geometry.js
  ├─> konva/appStage.js
  │     ├─> konva/gridLayer.js
  │     ├─> konva/overlayLayer.js
  │     └─> konva/sketchLayer.js
  │           ├─> konva/sketchOverlay.js
  │           ├─> konva/constraintIcons.js
  │           ├─> konva/dimensionRenderer.js
  │           └─> render/styleOptions.js
  └─> ui/mainUi.js
        └─> services/finishedSizeCalculator.js
        └─> services/gridService.js
        └─> services/zoomService.js
```

## Dead files

| File | Notes |
| --- | --- |
| `src/models/point.js` | Legacy stub with TODO comment. Not imported anywhere. Safe to remove. |
