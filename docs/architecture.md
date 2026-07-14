# KnitStitch Architecture

A surface-level overview of how KnitStitch fits together: what the app does, what calls what, and where the pieces live.

For low-level implementation details (solver math, constraint internals, file-by-file responsibilities), see [agents/architecture.md](agents/architecture.md).

---

## What is KnitStitch?

KnitStitch is a parametric sketch tool for knitters. It lets users draw shapes on an infinite grid, apply geometric constraints (like Fusion 360), and generate knitting patterns from the resulting filled cells.

The app is built with Konva.js (canvas rendering) and a small reactive store. It is a standalone front-end app served from its own subdomain — there is no backend.

## The big picture

```
index.html (standalone entry point)
  └─> KnitStitch app (dist/assets/index.js)
        ├─> Store          — central reactive state
        ├─> SketchService  — coordinator for all sketch logic
        ├─> AppStage       — Konva canvas with three layers
        └─> MainUI         — sidebar panels and controls
```

### What each piece does

| Piece | Role |
| --- | --- |
| **Store** | Holds all state (sketch entities, grid cells, zoom/pan, gauge settings). Notifies subscribers when state changes. |
| **SketchService** | Thin coordinator. Receives canvas events, delegates to the active tool, manages selection and undo/redo. No business logic — just forwarders. |
| **AppStage** | Creates the Konva canvas and mounts three layers: grid (bottom), overlay (middle), sketch (top). Handles resize and zoom/pan. |
| **MainUI** | Thin orchestrator that wires 7 focused panel controllers (grid, sketch, overlay, template, zoom, keyboard). Each controller owns its own refs, events, and store subscriptions. |

## Canvas layers

The Konva stage has three layers stacked bottom to top:

| Layer | What it renders |
| --- | --- |
| **GridLayer** | Infinite grid, viewport-culled. Cell fills render as colored squares. Left-click toggles cells. |
| **OverlayLayer** | Optional reference image (for tracing a photo). |
| **SketchLayer** | Sketch points, lines, dimensions, constraint icons. Captures all mouse interactions and forwards them to SketchService. |

## How a click flows through the app

```
User clicks the canvas
  → SketchLayer captures the Konva event
    → SketchService.onCanvasClick()
      → ToolRegistry.onCanvasClick()
        → [active tool].onClick()  (LineTool, DimensionTool, etc.)
          → Tool updates the Store
            → Store notifies subscribers
              → SketchLayer re-renders
              → Sidebar updates
```

The same pattern applies to mouse moves, drags, and right-clicks. SketchService is just a pass-through — the ToolRegistry picks the right tool and the tool does the work.

## Tools

Each tool owns its own workflow:

| Tool | What it does |
| --- | --- |
| **Line** | Click-to-place polyline drawing with angle snap. |
| **Dimension** | Click two points to place a dimension, then type a value to lock it. |
| **Constraint** | Pick lines or points to create perpendicular, midpoint, equal, or H/V constraints. |
| **Anchor** | Click a point to pin it (anchors don't move when constraints are solved). |
| **Select** | Click to select entities, drag to move points (triggers constraint solving). |
| **Fill** | Click grid cells to toggle manual fills. |

The ToolRegistry owns all tool instances and routes events based on `sketch.activeTool` in the store.

## Constraints

KnitStitch supports Fusion 360-style parametric constraints:

| Constraint | What it enforces |
| --- | --- |
| **Coincident** | Two points share the same location. |
| **Perpendicular** | Two lines meet at 90°. |
| **Midpoint** | A point sits at the midpoint of a line. |
| **Equal** | Two lines have the same length. |
| **Horizontal/Vertical** | A line is locked to horizontal or vertical. |
| **Driven Dimension** | A locked distance between two points. |

When a point is dragged, a solver adjusts all other points to satisfy the active constraints. There are two solvers — a global gradient-descent solver (default) and a local per-point solver (fallback).

## Templates

Templates generate a complete sketch from body measurements. The sock template creates a 20-point outline with dimensions and constraints that match a real knitting pattern. Templates are fully constrained — every point is locked by dimensions or constraints so the shape holds when dragged.

## State persistence

The entire app state (sketch entities, grid cells, gauge, zoom/pan) is saved to localStorage automatically (debounced 300ms). On page load, the state is hydrated and legacy formats are migrated.

## File layout

```
src/
  main.js                  — bootstrap
  ui/
    mainUi.js              — thin orchestrator
    uiUtils.js             — shared DOM helpers
    gridPanelController.js — grid sidebar
    sketchPanelController.js — sketch sidebar
    overlayPanelController.js — overlay sidebar
    templatePanelController.js — template sidebar
    zoomController.js      — zoom/pan controls
    keyboardController.js  — keyboard shortcuts
  konva/
    appStage.js            — Konva stage + layers
    gridLayer.js           — infinite grid
    overlayLayer.js        — reference image
    sketchLayer.js         — sketch rendering + event capture
    sketchOverlay.js       — DOM overlays (dim edit, cursor messages)
    constraintIcons.js     — constraint marker icons
    dimensionRenderer.js   — dimension lines and labels
  models/
    gaugeSettings.js
    patternDimensions.js
    sketch/                — SketchPoint, SketchLine, SketchDimension, etc.
  services/
    finishedSizeCalculator.js
    gridService.js
    zoomService.js
    sketch/
      sketchService.js     — thin coordinator
      constants.js         — shared enums
      tools/               — LineTool, DimensionTool, ConstraintTool, AnchorTool, ToolRegistry
      solver/              — global + local solvers, error terms, hard constraint propagation
      state/               — lifecycle, selection, properties, history, snapshots, cleanup
      interactions/        — drag handling
      render/              — object list builder, style options
      fill/                — closed shape cell fill
      templates/           — sock template, measurements, actions
  state/
    store.js               — reactive store
    storePersistence.js    — localStorage save/load
  utils/
    geometry.js            — pure geometry helpers
```

For a complete file-by-file index with line counts and import/export details, see [agents/project-map.md](agents/project-map.md).
