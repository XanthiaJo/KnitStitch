# DOF Analysis & Over-Constraint Prevention — Design Doc

## Goal

Prevent users from placing constraints (or driven dimensions) that would over-constrain the sketch, following FreeCAD's sketcher semantics as the baseline. Redundant constraints are treated as over-constrained.

## FreeCAD's approach (reference)

FreeCAD's sketcher uses the GCS (Geometric Constraint Solver) with these key concepts:

1. **Per-parameter DOF**: each point in 2D has 2 DOF (x, y). Anchors remove 2 DOF.
2. **Jacobian rank analysis**: FreeCAD builds a Jacobian matrix of constraint derivatives and computes `DOF = nParameters - rank(Jacobian)`.
3. **Three states**: under-constrained (DOF > 0), well-constrained (DOF = 0), over-constrained (DOF < 0 or redundant constraints exist).
4. **Redundant vs conflicting**: redundant constraints don't increase the rank; conflicting constraints demand incompatible values. FreeCAD reports both as over-constrained.

## Our approach: Jacobian rank with constraint function gradients

We build a Jacobian matrix where each row is the gradient of a **constraint function** (not the squared error). This is critical: the squared error gradient is zero when a constraint is satisfied, which would give incorrect rank values. The constraint function gradient is non-zero regardless of whether the constraint is currently satisfied.

### Constraint function gradients

| Constraint | Function f = 0 | Gradient |
| --- | --- | --- |
| Horizontal | `end.y - start.y` | ±1 in y |
| Vertical | `end.x - start.x` | ±1 in x |
| Perpendicular | `(otherA - anchor) · (otherB - anchor)` | geometry-dependent, generally non-zero |
| Midpoint | `point - (start + end) / 2` | constant (1, -0.5, -0.5) per coordinate |
| Equal | `len(lineA) - len(lineB)` | unit direction vectors |
| Driven Dimension (H) | `\|bx - ax\| - target` | ±1 in x |
| Driven Dimension (V) | `\|by - ay\| - target` | ±1 in y |
| Driven Dimension (aligned) | `dist(a, b) - target` | (dx, dy) / len |

### Over-constraint detection

The rank of the Jacobian can never exceed `nParams` (the number of columns). If there are more constraint rows than the rank, some constraints are linearly dependent — they are **redundant**. We treat redundant as over-constrained:

```
nRedundant = nConstraintRows - rank
status = nRedundant > 0 ? 'over'
       : DOF > 0 ? 'under'
       : 'well'
```

### Coincident handling

Coincident constraints are handled by merging points into equivalence classes via union-find before parameter enumeration. Each class has 2 DOF (or 0 if anchored). This avoids needing Jacobian rows for coincident constraints.

### Anchored points

Anchored points are excluded from the parameter list (they have 0 DOF). Constraints that only affect anchored points produce zero rows, which count toward `nConstraintRows` but don't increase the rank — correctly flagging them as redundant.

## File structure

```
src/services/sketch/solver/
  dofAnalyzer.js          — Jacobian rank analysis + wouldOverconstrain()
  overconstraintChecker.js — existing pattern-based checker (unchanged)
```

`dofAnalyzer.js` exports:
- `analyzeDof(sketch)` → `{ dof, status, nParams, rank, nConstraints, nRedundant }`
- `wouldOverconstrain(sketch, proposed)` → `{ wouldOverconstrain, dofAfter, status }`

## Integration points

| File | Where | What |
| --- | --- | --- |
| `constraintTool.js` | `_tryCreatePerpendicularConstraint` | Block if `wouldOverconstrain` returns true |
| `constraintTool.js` | `_tryCreateMidpointConstraint` | Block if `wouldOverconstrain` returns true |
| `constraintTool.js` | `_tryCreateEqualConstraint` | Block if `wouldOverconstrain` returns true |
| `constraintTool.js` | `_tryCreateAxisConstraint` | Block if `wouldOverconstrain` returns true |
| `dimensionTool.js` | `_applyDimConstraint` (onConfirm) | Block if `wouldOverconstrain` returns true |
| `sketchPanelController.js` | `updateSketchSidebar` | Show DOF status (under/well/over) |

## Status display

The `#sketch-constraint-status` area shows:
- **Under-constrained**: "N degrees of freedom remaining"
- **Well-constrained**: "Fully constrained"
- **Over-constrained**: "Over-constrained"
- Plus any existing overconstraint checker messages

## Test coverage

### Unit tests (`dofAnalyzer.test.js` — 20 tests)

- Free point: 2 DOF, under-constrained
- Anchored point: 0 DOF, well-constrained
- Two points + line: 4 DOF
- Two points + line + anchor: 2 DOF
- H constraint on anchored line: 1 DOF
- H + V on anchored line: 0 DOF (well-constrained)
- H + V + dimension on anchored line: 0 DOF, nRedundant=1 (over-constrained)
- Coincident points merged: correct DOF
- Disconnected components: independent DOF
- Redundant Horizontal on already-constrained line: over-constrained
- `wouldOverconstrain` for each constraint type
- Duplicate dimension detection

### E2E tests (`sketchConstraints.spec.js`)

- Over-constraining a line with dimension + H + second dimension is blocked
- DOF status text appears in the constraint status area

## Advantages over simple DOF accounting

The Jacobian approach correctly detects:
- **Redundant constraints**: a Horizontal constraint on a line that's already H+V constrained doesn't increase the rank → over-constrained
- **Implied constraints**: if line A is Horizontal and line B is Perpendicular to A, adding an explicit Vertical on B is redundant (the Jacobian shows linear dependence)
- **Any new constraint type**: just add its gradient function — the rank computation handles the rest automatically

## Limitations & future work

- **No conflict detection**: two constraints with the same gradient direction but different target values (e.g., V says dx=0, dimension says dx=100) are detected as redundant but not as conflicting. FreeCAD detects this by solving the system and checking residual error. We could add this by evaluating constraint errors after rank analysis.
- **No per-point DOF reporting**: FreeCAD highlights which specific points are under/over-constrained. We report at the sketch level only.
- **Discrete DOF (mirroring)**: FreeCAD issue #15850 notes that mirroring/orientation isn't counted. We have the same limitation.
- **Numerical stability**: the Gaussian elimination uses partial pivoting with an EPS threshold of 1e-9. For very small or very large coordinate values, the threshold may need adjustment.
