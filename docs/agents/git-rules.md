# Git Rules

- This project uses [Conventional Commits](https://www.conventionalcommits.org/) to drive automatic versioning and changelog generation.
- Commit everything that is dirty unless specified otherwise.
- Use more than one commit if needed across multiple files.
- Do not commit before being asked to do so.

## Commit Message Format

```
<type>(<scope>): <description>

<optional body>
```

- The **type** is mandatory and determines the version bump.
- The **scope** is optional but encouraged for clarity (e.g. `solver`, `sketch`, `grid`).
- The **description** should be lowercase, imperative, and concise.
- The **body** is optional but encouraged unless it causes duplication of the description.
  - Bullet points are preferred.

### Footers

Avoid adding non-functional footers such as `Generated with [Devin](https://devin.ai)` or `Co-Authored-By: Devin ...` to commit messages. These are not part of the project's conventional commit format and add noise to the changelog.

Functional footers are allowed only when they carry meaning for the project:

- `BREAKING CHANGE:` to signal a breaking change
- `Signed-off-by:` if the project requires DCO sign-off

## Commit Types and Version Impact

| Type                                  | Version bump | Changelog group                  |
|---------------------------------------|-------------|----------------------------------|
| `feat`                                | **minor** (e.g. 1.3.0 → 1.4.0) | Features                         |
| `fix`                                 | **patch** (e.g. 1.3.0 → 1.3.1) | Fixes                            |
| `docs`                                | none (revision only) | Documentation                    |
| `refactor`                            | none (revision only) | Refactors                        |
| `test`                                | none (revision only) | Tests                            |
| `chore`                               | none (revision only) | Maintenance                      |
| `style`                               | none (revision only) | Styling (no logic change)        |
| any + `BREAKING CHANGE` footer or `!` | **major** (e.g. 1.3.0 → 2.0.0) | Breaking changes                 |

Commits that don't match a known type (anything not `feat`, `fix`, or breaking) increment the **revision** — the fourth version number (e.g. 1.3.0.1, 1.3.0.2). The revision resets to 0 whenever a `feat`, `fix`, or breaking change is encountered.

## Breaking Changes

To signal a breaking change, either:

- Add `BREAKING CHANGE:` in the commit body footer, or
- Add `!` after the type/scope: `feat(solver)!: replace native solver with SolveSpace`

## Examples

```
feat(sketch): add perpendicular constraint creation workflow
fix(grid): correct cell fill calculation for negative coordinates
docs(agents): update architecture and project-map for solver migration
refactor(solver): remove dead native solver code
test(e2e): add sock template dimension drag coverage
chore(build): regenerate build info for v1.4.0
style: update app styles and index.html
feat(solver)!: replace native solver with SolveSpace WASM

BREAKING CHANGE: the hand-rolled gradient-descent solver is removed;
SolveSpace is now the sole constraint backend.
```

## Versioning Mechanics

Versioning is handled by `scripts/generate-build-info.mjs`, run via `npm run build-info` (generates both `public/js/buildInfo.js` and `CHANGELOG.md`) or `npm run build-changelog` (just the changelog).

The generator:

1. Reads all git tags matching `vX.Y.Z` and uses the latest tag as the starting version.
2. Walks the commit log (oldest first) from the last tagged commit.
3. Bumps the version per the rules above for each commit.
4. Outputs the resolved version to `public/js/buildInfo.js` (JS format) and `CHANGELOG.md` (markdown changelog).

If no tags exist, the version starts at `v1.0.0`.

## Tagging

Tags are optional but should be created at release milestones:

```
git tag v1.4.0
git push origin v1.4.0
```

A tag pins the version at that point. All commits after the tag will increment from the tagged version.

## Scopes

Common scopes used in this project:

- **sketch** — sketch tools, interactions, models, or rendering
- **solver** — constraint solver (SolveSpace adapter, feasibility, DOF analysis)
- **grid** — grid layer, cell fill, or finished size calculation
- **konva** — Konva stage setup or render layers
- **ui** — sidebar, workspace switching, or panel controllers
- **state** — store, persistence, or history
- **docs** — documentation files
- **agents** — AGENTS.md or agent-level docs under `docs/agents/`
- **build** — build tooling, versioning, or changelog generation

Scopes are not enforced — use whatever best describes the area of change.
