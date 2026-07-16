# Changelog

> **Build Snapshot** — Version v2.4.0.2 · 13 commits · a1231e6

> Generated from conventional commits and git tags. The historical
> changelog from the CraftCMS era is preserved in
> `docs/craftcms-changelog-history.twig`.

---

## Breaking Changes

### Initialize standalone KnitStitch Grid app

**v2.0.0** · `4536f67` · 2026-07-14

- extract app from CraftCMS into standalone Vite project
- serve from own subdomain (www.knitstitch.misssponto.me.uk)
- standalone index.html with simple header, no Craft partials
- extract CSS into public/css/app.css with design tokens and components
- update test configs for Vite dev server (no DDEV/CraftCMS needed)
- 93 unit tests passing, Playwright E2E auto-starts dev server
- KnitStitch is now a standalone app, no longer embedded in CraftCMS.

## Features

### Add boot loading overlay for solver initialization

**v2.4.0** · `981b789` · 2026-07-16

Shown from first paint until the SolveSpace WASM solver finishes loading so the page reads as "loading" instead of "crashed" during the main-thread block. The spinner uses a transform-only CSS animation so it keeps visibly spinning even while the main thread is busy.

### Add GitHub webhook for VPS auto-deploy

**v2.3.0** · `0b250cb` · 2026-07-16

- Add webhook.php adapted from CraftCMS webhook (same HMAC-SHA256 signature verification) but with npm ci + npm run build instead of composer install
- Add .env.example with GITHUB_WEBHOOK_SECRET template
- Add .env to .gitignore, fix corrupted .gitignore encoding
- Update AGENTS.md with VPS deploy section, SSH setup steps, and architecture entries for webhook.php, .env.example, pages/
- Update README.md with deployment note

### Add changelog page with v1/v2 tabs

**v2.2.0** · `b60ef4d` · 2026-07-16

- Add pages/changelog.html with separated layout (global header, page header, content area, footer) and v1/v2 tab switching
- Add --format=html to generate-build-info.mjs for HTML changelog fragments
- Fix artificial line breaks in captions (trim git log fields) and word-wrapped paragraph lines becoming separate bullets
- Generate public/changelog-v2.html from KnitStitch git history
- Copy CraftCMS changelog history to public/changelog-v1.html with caption line breaks fixed
- Add CSS for chips, color-pairs, panels, lists, and tab bar
- Add pages/changelog.html as second Vite build entry
- Update nav link from /CHANGELOG.md to /pages/changelog.html
- Update build-info scripts to also generate HTML changelog

### Integrate SolveSpace WASM constraint solver

**v2.1.0** · `605165f` · 2026-07-15

- Replace the hand-rolled gradient-descent solver with SolveSpace's Newton's-method solver, compiled to WebAssembly. Shipped behind a solverBackend feature flag ('native' | 'slvs') so the existing solver stays available as a fallback.
- The SolveSpace solver is built from a fork of solvespace/solvespace (XanthiaJo/SolverWasm) which already includes embind JS bindings and a CMake slvs-wasm target. The built slvs.js (6 MB, single-file with embedded WASM) is committed as a static asset in public/wasm/.
- Key pieces:
- bridges KnitStitch's sketch model (points, lines, constraints, dimensions in pixels) to SolveSpace entities. Uses a uniform scale (X-axis stitch scale) for both axes to preserve angles despite the non-square grid.
- sketchService._solve: single dispatch point that routes to the SLVS adapter when the flag is set, otherwise falls through to the existing native solver path.
- all three dual-solver branches replaced with service._solve() calls.
- solverBackend flag added to sketch state, currently set to 'slvs'.
- SolveSpace is GPL-3.0-or-later, so KnitStitch adopts GPL-3.0-or-later accordingly (LICENSE added, package.json updated).

## Fixes

### Defer solver load and drop canvas hit-test reads

**v2.3.1** · `2a9f150` · 2026-07-16

- The page was sluggish and triggered recurring HTML5 canvas permission prompts. Two root causes: the ~6 MB SolveSpace WASM bundle was instantiated eagerly at boot (a long main-thread block), and Konva's pixel-based hit detection called getImageData() on every pointer event (prompting per-canvas privacy permissions in browsers like LibreWolf).
- load the solver lazily via ensureSolver() (idempotent, memoized) instead of in the SketchService constructor; main.js no longer blocks boot on it, and tool selection / solve attempts trigger it as a fallback
- set grid and sketch layers to listening:false and route pointer events through the app's own geometry hit testing (nearestPoint/nearestLine) instead of Konva's hit canvas, eliminating the getImageData() reads that caused the repeated prompts

## Documentation

### Document WASM solver loading and mitigations

**v2.4.0.2** · `a1231e6` · 2026-07-16

Record the root cause (SINGLE_FILE=1 base64 embed forcing synchronous decode + non-streaming instantiate), the lazy-load mitigations shipped here, and the approaches tried and rejected (requestIdleCallback, listening:false on grid/overlay layers, E2E flakiness) so future sessions don't re-investigate the freeze in circles.

### Rewrite git-rules for KnitStitch project

**v2.1.0.3** · `9eedd1b` · 2026-07-16

- replace Craft CMS references with Node.js tooling
- update scopes to match project areas (sketch, solver, grid, etc.)
- add style commit type, update examples

## Refactors

### Replace PHP webhook with Node.js webhook server

**v2.3.0.1** · `bb07945` · 2026-07-16

- Replace webhook.php with scripts/webhook-server.mjs (no external dependencies, uses only Node.js built-ins)
- Add ecosystem.config.cjs for PM2 process management
- Update .env.example to reference webhook-server.mjs
- Update AGENTS.md with Node.js webhook setup instructions (PM2, nginx proxy, ecosystem config)
- Update README.md deploy note
- nginx on the KnitStitch subdomain is a static/Node site with no PHP processing, so the PHP webhook returned 405. The Node.js server runs on 127.0.0.1:3001 with nginx proxying /webhook to it.

### Remove dead native solver code

**v2.1.0.2** · `11f5463` · 2026-07-16

- delete 7 native solver modules and 4 unit tests (2275 lines)
- remove solverBackend flag, native fallback branches, enforce* calls
- adapter solve() distinguishes user-drag from reconverge semantics
- accept RESULT_REDUNDANT_OKAY, restore anchor positions in writeBack
- keep perpendicularFeasibility, dofAnalyzer, overconstraintChecker

## Tests

### Wait for lazy solver load in sketch helpers

**v2.4.0.1** · `c1aabd7` · 2026-07-16

The solver no longer loads eagerly at boot, so automated tests that click through constraint/dimension steps in milliseconds race ahead of the async WASM load. Explicitly trigger ensureSolver() and wait for ready in openSketch() to keep constraint-dependent assertions deterministic.

## Maintenance

### Add VS Code workspace config and build tooling

**v2.0.0.1** · `a3edaf8` · 2026-07-15

Add VS Code launch/tasks config, the build-info generator script, generated buildInfo.js, CHANGELOG.md, and the historical CraftCMS changelog reference.

## Other Changes

### Update app styles and index.html

**v2.1.0.1** · `4f449b7` · 2026-07-15
