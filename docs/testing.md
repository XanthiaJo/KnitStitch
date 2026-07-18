# KnitStitch Testing Guide

How the KnitStitch test suite runs and how to add to it.

Tests live at the repository root under `unit/` and `e2e/`. All commands below assume you are in the repo root.

## Quick start

| Suite | Command | Files | Count |
| --- | --- | --- | --- |
| Unit | `npx vitest run` | `unit/**/*.test.js` | 93 tests across 13 files |
| E2E | `npx playwright test` | `e2e/**/*.spec.js` | 15+ tests across 7 files |

## Unit tests (Vitest)

Unit tests exercise pure logic and small service helpers without Konva or a browser. They import source files directly from `src/`.

### Running unit tests

```bash
npx vitest run
```

For watch mode during development:

```bash
npx vitest
```

Vitest reads `vitest.config.js` at the repo root. That config uses Node environment and only includes `unit/**/*.test.js`. The `package.json` declares `"type": "module"` so Node loads Vite's ESM build (avoiding the CJS deprecation warning).

### What to unit test

Good candidates:

- Pure geometry helpers (`utils/geometry.js`)
- State/store logic (`state/store.js`, `state/storePersistence.js`)
- Calculator helpers (`finishedSizeCalculator.js`, `gridService.js`)
- Individual constraint enforcement methods on `ConstraintSolver`
- Sketch model behavior (`SketchPoint`, `SketchLine`, `SketchDimension`, `SketchConstraint`)

Avoid unit tests for:

- Full UI interaction flows
- Solver convergence on complex multi-constraint graphs
- Visual relationships that are easier to assert in the browser

### Creating a unit test

Create a file under `unit/` ending in `.test.js`. Import the module under test from `../src/...`.

Example pattern:

```js
import { describe, it, expect } from 'vitest';
import { analyzeDof } from '../src/services/sketch/solver/dofAnalyzer.js';
import { SketchPoint } from '../src/models/sketch/sketchPoint.js';
import { SketchLine } from '../src/models/sketch/sketchLine.js';
```

Use the real model classes rather than hand-rolled stubs when the logic under test reads model properties such as `line.start`, `dim.drivenValue`, or `constraint.type`.

## E2E tests (Playwright)

E2E tests drive the app through the browser and assert visual/interactive outcomes: perpendicular lines stay perpendicular, dimensions stay locked, points move as expected, and so on.

### Required runtime

The E2E tests navigate to `/`, served by the Vite dev server. Playwright starts the dev server automatically via the `webServer` config — no manual setup is needed.

### Running E2E tests

```bash
npx playwright test
```

Run a single spec file:

```bash
npx playwright test e2e/sketchConstraints.spec.js
```

Run a single test by title:

```bash
npx playwright test e2e/sketchConstraints.spec.js --grep "driven dimensions stay locked"
```

### Current Playwright configuration

`playwright.config.js` is set up to auto-start the Vite dev server:

```js
use: {
  baseURL: 'http://localhost:5173',
},
webServer: {
  command: 'npm run dev',
  url: 'http://localhost:5173',
  reuseExistingServer: !process.env.CI,
}
```

The current frontend E2E suite does not require DDEV or an application
backend. Just run the tests.

```bash
npx playwright test
```

When the planned Better Auth API is introduced, the authentication and saved
pattern E2E suite will need a test database and API process. Keep the existing
frontend-only suite fast and add a separate authenticated test configuration
or setup path rather than making every canvas test depend on the account
backend.

If you need to point at a different host, edit `use.baseURL` and
`webServer.url` in `playwright.config.js`.

### Creating an E2E test

Create a file under `e2e/` ending in `.spec.js` and import from `@playwright/test`.

Reusable helpers in `e2e/helpers/sketchHelpers.js`:

- `openSketch(page)` — navigates to `/`, switches to Sketch workspace, clicks Line tool, and returns the canvas bounding box.
- `clickStage(page, box, point)` — clicks a point relative to the canvas box.
- `dragStage(page, box, from, to)` — drags from one relative point to another with intermediate steps.

Use `page.evaluate(() => window.__knitstitchStore?.state?.sketch)` to inspect sketch state (points, lines, dimensions, constraints) from the browser.

Common patterns:

```js
const selection = await page.evaluate(() => {
  const sketch = window.__knitstitchStore?.state?.sketch;
  return {
    selectedPoints: sketch?.points.filter((p) => p.isSelected).map((p) => ({ x: p.x, y: p.y })),
  };
});
```

### Coordinate system

Konva’s `getRelativePointerPosition()` computes coordinates relative to the inner `.konvajs-content` div, not `#konva-stage`. The helpers in `sketchConstraints.spec.js` use the content div’s bounding box as the origin so clicks land where expected. Always use `box.x + point.x` and `box.y + point.y` rather than raw screen coordinates.

## Test coverage notes

- The E2E suite is the source of truth for user-visible constraint behavior.
- Unit tests are the source of truth for isolated logic and model behavior.
- When adding a new constraint type, add both a unit test for the enforcement method and an E2E test for the creation workflow.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `No test files found` when running Vitest | You are not in the repo root, or `vitest.config.js` is missing. |
| `Process from config.webServer was not able to start` | The Vite dev server failed to start. Check that `npm install` has been run and port 5173 is free. |
| Canvas clicks miss the intended point | Coordinates are screen-relative instead of content-div-relative. Use the `box` returned by `openSketch()`. |

