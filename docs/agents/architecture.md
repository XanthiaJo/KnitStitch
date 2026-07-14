# KnitStitch Agent Architecture

Low-level implementation details for agents working on KnitStitch. Covers solver internals, constraint math, file responsibilities, and data flow.

For the surface-level overview, see [../architecture.md](../architecture.md).

---

## Sketch state

The sketch owns four arrays on the reactive store at `store.state.sketch`:

| Array | Contents |
| --- | --- |
| `points` | `SketchPoint` instances: `{ id, x, y, isSelected, isAnchor }` |
| `lines` | `SketchLine` instances: `{ id, start, end, isConstruction, isSelected }` |
| `dimensions` | `SketchDimension` instances between two points |
| `constraints` | `SketchConstraint` instances: Perpendicular, Coincident, Midpoint, Equal, Horizontal, Vertical |

IDs are sequential integers managed by `state/sketchIdManager.js`. Selection is tracked both in the models (`isSelected`) and in private `Set`s inside `SketchService` (`_selectedPoints`, `_selectedLines`).

### Construction lines

Lines can be marked as construction (`isConstruction = true`). They render with a dashed stroke and are excluded from closed-shape cell filling, but their endpoints are still real points and can participate in constraints.

## Coordinate system

All sketch geometry is stored in canvas pixels. The grid and cell fills use cell units, but the sketch uses the pixel space Konva renders into. A point at `(0, 0)` is the top-left of the Konva stage; negative coordinates are valid and supported.

## Constraint types

### Perpendicular

A line-to-line constraint. Two lines must meet at 90° at their shared endpoint (the anchor). When created, the geometry moves immediately so the relation is true. The solver rejects impossible combinations (e.g., a triangle with two perpendicular constraints on the same line).

### Coincident

Two points occupy the same location. Coincident points propagate like a connected component: moving any member moves the whole group. Anchors win — if one point in the group is an anchor, all others snap to it.

### Midpoint

Two forms:

1. **Point-line**: a point is constrained to the midpoint of a line. The point must not be an endpoint of that line.
2. **Line-line**: two lines must share the same midpoint (they cross at their midpoints). The solver translates the second line so its midpoint coincides with the first. Anchor endpoints are respected — if one line is anchored, the other moves.

### Equal

Two non-identical lines must have the same length. The solver scales the second line around its midpoint to match the first.

### Horizontal / Vertical

A single line is forced to be horizontal (`start.y === end.y`) or vertical (`start.x === end.x`). These are added as soft error terms in the global solver and are also enforced locally when the constraint is created.

## Dimensions

A dimension measures the distance between two points. When confirmed with a value it becomes **driven** (`drivenValue !== null`) and is displayed with a lock icon. The dimension kind is derived from the current geometry:

- `Horizontal` when the line is within 10° of horizontal
- `Vertical` when within 10° of vertical
- `Aligned` otherwise

Driven dimensions are the primary way to lock real-world measurements (inches) in the sock template.

## Solver architecture

There are two solvers. `SketchService._useGlobalSolver` is `true` by default, so the global solver runs first.

### GlobalConstraintSolver

A numerical optimizer inspired by FreeCAD/OpenCASCADE sketch solvers. It minimizes total constraint error using gradient descent and then enforces driven dimensions and coincident constraints as hard constraints after every step.

Error terms (squared):

- `Perpendicular`: `(dot product of the two line vectors)^2`
- `Coincident`: `(distance between the two points)^2`
- `Midpoint`: `(distance from point to line midpoint)^2`
- `Equal`: `(length(lineA) - length(lineB))^2`
- `Horizontal`: `(dy)^2`
- `Vertical`: `(dx)^2`

The dragged point is the only point the user directly controls; anchors are fixed. All other points are free and adjusted by the optimizer.

After each gradient step, `_applyDrivenDimensions` repositions the driven endpoint of every dimension relative to its driver. `_propagateCoincident` then collapses coincident groups onto their leader (anchor, then moved point, then first member).

If the dimension graph looks infeasible (a single non-moved point would be driven by more than two dimensions), the solver returns `null` and `SketchService` falls back to the local solver.

### Local ConstraintSolver

The original per-point solver. It applies constraints one at a time for the dragged point:

1. Snap to a nearby point and create a Coincident constraint if within radius.
2. Propagate Coincident constraints.
3. Apply Perpendicular, Midpoint, and Equal constraints.
4. Apply driven dimensions that touch the dragged point.
5. Re-apply geometric constraints to any points moved by those dimensions.

It does not propagate driven dimensions through chains. It is kept as a fallback when the global solver reports an infeasible graph.

### Solver file split

The global solver is split into three focused pieces:

- `solver/constraintErrorTerms.js` — error functions and analytical gradients for Perpendicular, Coincident, Midpoint, Equal, Horizontal, and Vertical constraints.
- `solver/hardConstraintPropagator.js` — exact enforcement of driven dimensions, Coincident constraints, and Equal Length propagation.
- `solver/globalConstraintSolver.js` — the gradient-descent loop that orchestrates the above.

### Overconstraint checking

`solver/overconstraintChecker.js` detects redundant or conflicting constraint patterns and surfaces them in the sidebar so the user knows before dragging.

## Why some points can still move

A point is movable when the set of active constraints and dimensions does not fully determine its position. Two common cases:

### 1. A point is only constrained by `Equal` length

`Equal` locks the length of a line but not its position or angle. A line can rotate around its midpoint and still satisfy an `Equal` constraint. Therefore the endpoints remain free unless other constraints or dimensions pin them down.

### 2. A point is not reached by any driven dimension chain

The global solver treats driven dimensions as a graph rooted at the moved/fixed point. Points that are not reachable from that root are only affected by soft geometric constraints and can drift.

## Sock template example

The sock template creates:

- 20 outline points connected into a closed loop.
- One horizontal width dimension across the top (points 0→19).
- Vertical section dimensions down both sides for the non-notch segments (ribbing, leg, sole, instep, ribbing). The heel/toe span dimensions that skipped the notch points are omitted because they over-constrain the region.
- Aligned dimensions for the left-side heel and toe notches.
- `Perpendicular` constraints at the four corners.
- `Equal` constraints making the right-side notch lines match the left-side notch lines.

### Top width being violated

When a point on the right edge such as point 18 (end of top ribbing) is dragged, both the width dimension (0→19) and the right top-rib dimension (19→18) try to drive point 19. With fixed-order sequential enforcement, the later dimension overrides the earlier one, so the top line stretches even though its dimension is still displayed as locked.

The global solver now uses BFS propagation from the dragged/anchored point instead of a fixed creation order. When an anchor exists, propagation starts from the anchor (and points coincident with it) so the entire constrained chain is positioned from the fixed root, keeping every dimension locked.

### Origin anchor

When the grid first loads, `AppStage` creates an anchor point at `(0, 0)` and pans the viewport so the origin sits at the centre of the canvas. This gives every sketch a fixed reference point. Templates generate their reference corner coincident with this anchor, so the template is rooted to the origin and becomes fully constrained.

### Equal Length constraints

`Equal` is now treated as a hard constraint during dimension propagation. When one line in an Equal pair has a known length (because both of its endpoints are positioned by dimensions or by earlier propagation), the solver positions the free endpoint of the other line at the same distance.

This is only half the story for mirrored geometry: Equal locks length, but not position. The right-side toe notch initially had no dimensioned link to the right edge, so those points were still free-floating. The sock template adds aligned dimensions on both sides of each notch to fully lock the shape.

### Dimension re-enforcement and driver/driven assignment

The solver tracks the BFS depth of each reachable point from the anchor (or dragged point). For every dimension, the shallower endpoint is the driver and the deeper endpoint is driven. Dimensions are re-enforced in every iteration by moving only the driven point, which keeps the entire constraint chain locked while still allowing gradient descent to clean up residual soft-constraint error.

## FreeCAD-style semantics

FreeCAD and Fusion 360 treat the sketch as a geometric constraint problem (GCP). Each constraint removes degrees of freedom:

- A point in 2D has 2 DOF.
- A line has 4 DOF (two endpoints).
- A dimension removes 1 DOF.
- A perpendicular constraint removes 1 DOF.
- A coincident constraint removes 2 DOF.
- An equal-length constraint removes 1 DOF.

A sketch is well-constrained when the remaining DOF count equals zero (ignoring the sketch's overall position, which is usually anchored). If DOF > 0, points can move while keeping all constraints true — exactly what happens with the under-constrained right-side notch points.

The current KnitStitch solver does not compute a DOF count. It either finds a numerical solution or returns `null`. That means under-constrained sketches can silently remain editable instead of being flagged.

## Current limitations

- Driven dimensions are enforced by BFS propagation from moved/anchored points. This fixes cases where a shared endpoint (e.g., point 19) was overwritten by a later dimension, but interdependent dimension clusters (e.g., heel/toe notches dimensioned both vertically and diagonally) are still solved sequentially, leaving small residual errors.
- The global solver bails out and falls back to the local solver when a point appears to be overdriven. This fallback does not enforce dimension chains, so dragging can stretch lines in complex templates.
- `Equal` constraints preserve midpoint but do not lock orientation, leaving endpoints free to rotate.
- There is no DOF analysis or visual indication of which points are under-constrained.

## Selection sync

Selecting an entity in the object list (`selectObjectByRef`) selects the underlying model, which rebuilds the object list and re-renders the sketch layer. This keeps the highlighted list row and the highlighted canvas entity (line, point, anchor, dimension label, or constraint icon) in sync. Constraint icons use `iconColor(constraint)` to switch to the accent color when `constraint.isSelected` is true.

The object list includes every sketch point, not just anchors, so regular points can be selected and highlighted too.

## File responsibilities

### Core coordinator

| File | Role |
| --- | --- |
| `src/services/sketch/sketchService.js` | Thin coordinator: delegates to tool registry, state modules, solvers. All methods are one-line forwarders. |
| `src/services/sketch/tools/toolRegistry.js` | Owns all tool instances, routes pointer events to the active tool via a `Map<SketchTool, Tool>`. |

### Tools

| File | Role |
| --- | --- |
| `src/services/sketch/tools/lineTool.js` | Line/polyline drawing workflow (click-to-place, preview, angle snap). |
| `src/services/sketch/tools/dimensionTool.js` | Dimension placement, edit overlay, driven-value application. |
| `src/services/sketch/tools/constraintTool.js` | Constraint creation workflow (line/point picking, validation, commit) for perpendicular, midpoint, equal, H/V. |
| `src/services/sketch/tools/anchorTool.js` | Anchor point creation and point-to-anchor conversion. |
| `src/services/sketch/templates/templateTool.js` | Template generation (sock) with points, lines, dimensions, and constraints. |
| `src/services/sketch/templates/templateActions.js` | Thin wrappers: `applyTemplate`, `regenerateTemplate`. |
| `src/services/sketch/templates/sockMeasurements.js` | Pure functions: gauge + body measurements → stitch/row counts, inch outline, section dimensions. |

### Solvers

| File | Role |
| --- | --- |
| `src/services/sketch/solver/globalConstraintSolver.js` | Global numerical solver: gradient descent + hard dimension/coincident enforcement. |
| `src/services/sketch/solver/constraintSolver.js` | Local per-point solver: snap, coincident, perpendicular, midpoint, equal, dimensions. Fallback only. |
| `src/services/sketch/solver/constraintErrorTerms.js` | Error functions and analytical gradients for soft constraints. |
| `src/services/sketch/solver/hardConstraintPropagator.js` | Exact enforcement of driven dimensions, Coincident points, and Equal Length propagation. |
| `src/services/sketch/solver/overconstraintChecker.js` | Detects redundant/over-constrained patterns and surfaces issues in the sidebar. |

### State

| File | Role |
| --- | --- |
| `src/services/sketch/state/lifecycle.js` | `ensureOriginAnchor`, `undo`, `clear`, `cancelCurrentLine`, `recordSnapshot`, `exitToSelect`. |
| `src/services/sketch/state/properties.js` | Store-backed getters/setters: `isActive`, `activeTool`, `constraintSubMode`, `strokeColor`, `strokeThickness`, `pendingStart`, `templates`. |
| `src/services/sketch/state/sketchSelection.js` | `clearSelection`, `selectPoint`, `selectLine`, `selectDimension`, `selectConstraint`, `selectObjectByRef`. |
| `src/services/sketch/state/selection.js` | `deleteSelected` (cascades to constraints/dims), `getHasSelection`. |
| `src/services/sketch/state/deleteSketchSelection.js` | Pure function that removes selected items and returns what to clean up. |
| `src/services/sketch/state/sketchCleanup.js` | `removeOrphanPoint` — removes a point if nothing references it. |
| `src/services/sketch/state/sketchStoreSync.js` | `syncSketchStateToStore`, `flushSketchArrays`, `rebuildSketchObjects`, `setPreviewLine`, `setSnapCandidate`. |
| `src/services/sketch/state/sketchStateHelpers.js` | Barrel re-export of the above state helpers for convenient imports. |
| `src/services/sketch/state/sketchIdManager.js` | `nextId`, `seedIdCountersFromSketch`, `assignConstraintIds`. |
| `src/services/sketch/state/sketchFeedback.js` | `showCursorMessage`, `clearCursorMessage` — transient cursor tooltips. |
| `src/services/sketch/state/sketchSnapshot.js` | `captureSketchSnapshot`, `restoreSketchSnapshot`, `snapshotsEqual` — for undo/redo. |
| `src/services/sketch/state/historyManager.js` | Action-based undo/redo stack with drag snapshot support. |

### Interactions

| File | Role |
| --- | --- |
| `src/services/sketch/interactions/dragHandler.js` | `startDrag`, `onCanvasMouseUp`, `onSelectMouseMove` — point drag with constraint solving. |

### Rendering

| File | Role |
| --- | --- |
| `src/services/sketch/render/buildSketchObjects.js` | Builds the sidebar object list from sketch state. |
| `src/services/sketch/render/styleOptions.js` | Default stroke colour triplets, thickness defaults, renderer colour constants, slider limits. |

### Fill

| File | Role |
| --- | --- |
| `src/services/sketch/fill/closedShapeFill.js` | Detects closed loops in non-construction lines and computes which grid cells are 50%+ inside. |

### Constants

| File | Role |
| --- | --- |
| `src/services/sketch/constants.js` | `SketchTool`, `ConstraintSubMode`, `SketchObjectKind`, `SNAP_RADIUS`, `SNAP_ANGLE_DEG`. |

## Event flow

```
User input on canvas
  └─> SketchLayer (konva/sketchLayer.js) captures Konva events
        └─> sketchService.onCanvasClick / onCanvasMouseMove / onCanvasMouseDown
              └─> toolRegistry.onCanvasClick / onCanvasMouseMove / onCanvasMouseDown
                    └─> [active tool].onLineClick / onDimensionClick / etc.
                          └─> Tool updates store.state.sketch
                                └─> Store._notify() fires subscribers
                                      ├─> SketchLayer._onStoreChange() → _render()
                                      ├─> mainUi.js sidebar update functions
                                      └─> AppStage zoom/pan re-apply
```

## Dead files

- `src/models/point.js` — legacy stub with a TODO, not imported anywhere. Safe to remove.
