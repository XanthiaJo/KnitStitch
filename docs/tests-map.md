# KnitStitch Tests Map

Short summaries of current test coverage.

Tests live at the repository root under `unit/` and `e2e/`. Run them from the repo root:

```bash
npx vitest run          # unit tests
npx playwright test     # e2e tests
```

## Unit tests (`unit/`)

| File | What it covers |
| --- | --- |
| `closedShapeFill.test.js` | Closed-loop detection from sketch lines and 50%+ area cell fill computation. |
| `dofAnalyzer.test.js` | Jacobian-based DOF analysis for over-constraint detection. |
| `finishedSizeCalculator.test.js` | Finished size calculation from gauge and pattern dimensions. |
| `gridService.test.js` | Preview cell rebuild, toggle, grid fitting, and cell sizing. |
| `overconstraintChecker.test.js` | Over-constraint detection and error reporting. |
| `selectionSync.test.js` | Selection state sync between models and store. |
| `store.test.js` | Store get/set/subscribe behaviour. |
| `storePersistence.test.js` | localStorage hydration round-trip. |
| `undoHistory.test.js` | Undo/redo history for lines, dimensions, constraints, point moves, deletions, and clear. |

## E2E tests (`e2e/`)

| File | What it covers |
| --- | --- |
| `sketchConstraints.spec.js` | Core: endpoint selection, coincident snapping, deletion, over-constraint rejection, DOF status. |
| `sketchConstraintsAnchor.spec.js` | Anchor behavior: origin anchor cannot be dragged, constraints don't move anchored points. |
| `sketchConstraintsDimensions.spec.js` | Driven dimensions, edit/cancel, label selection, object panel. |
| `sketchConstraintsEqual.spec.js` | Equal length constraints and interactions with Horizontal on a shared line. |
| `sketchConstraintsPerpendicular.spec.js` | Perpendicular creation, dragging, sock template, impossible-combination rejection. |
| `sketchConstraintsMidpoint.spec.js` | Point-line and line-line midpoint creation, midpoint maintenance on drag. |
| `sketchCellFill.spec.js` | Cell fill updates when dragging points, negative coordinate fill verification. |

## Planned coverage

| Area | Priority |
| --- | --- |
| Equal-length constraint creation E2E | High |
| Zoom/pan coordinate transforms | Medium |
| `sockMeasurements.js` unit tests | Medium |
| Measurement-driven template generation | Medium |
| Template persistence and regenerate-on-hydrate | Medium |

## Notes

- Unit tests use plain object stubs (no Konva, no DOM) — keep it that way.
- Playwright E2E tests go in `e2e/`.
- Constraint-related behavior should have both unit and E2E coverage when a new constraint type is added.
- The `package.json` declares `"type": "module"` so Node loads Vite's ESM build, avoiding the CJS deprecation warning.
