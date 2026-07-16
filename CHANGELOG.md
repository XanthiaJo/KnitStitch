# Changelog

> **Build Snapshot** — Version v2.1.0.3 · 6 commits · 9eedd1b

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

## Documentation

### Rewrite git-rules for KnitStitch project

**v2.1.0.3** · `9eedd1b` · 2026-07-16

- replace Craft CMS references with Node.js tooling
- update scopes to match project areas (sketch, solver, grid, etc.)
- add style commit type, update examples

## Refactors

### Remove dead native solver code

**v2.1.0.2** · `11f5463` · 2026-07-16

- delete 7 native solver modules and 4 unit tests (2275 lines)
- remove solverBackend flag, native fallback branches, enforce* calls
- adapter solve() distinguishes user-drag from reconverge semantics
- accept RESULT_REDUNDANT_OKAY, restore anchor positions in writeBack
- keep perpendicularFeasibility, dofAnalyzer, overconstraintChecker

## Maintenance

### Add VS Code workspace config and build tooling

**v2.0.0.1** · `a3edaf8` · 2026-07-15

Add VS Code launch/tasks config, the build-info generator script, generated buildInfo.js, CHANGELOG.md, and the historical CraftCMS changelog reference.

## Other Changes

### Update app styles and index.html

**v2.1.0.1** · `4f449b7` · 2026-07-15
