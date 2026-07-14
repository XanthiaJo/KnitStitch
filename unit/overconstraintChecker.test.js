import { describe, it, expect } from 'vitest';
import { Store } from '../src/state/store.js';
import { SketchService } from '../src/services/sketch/sketchService.js';
import { checkOverconstraints } from '../src/services/sketch/solver/overconstraintChecker.js';
import { SketchPoint } from '../src/models/sketch/sketchPoint.js';
import { SketchLine } from '../src/models/sketch/sketchLine.js';
import { SketchDimension } from '../src/models/sketch/sketchDimension.js';
import { SketchConstraint } from '../src/models/sketch/sketchConstraint.js';

describe('overconstraintChecker', () => {
  it('reports no issues on the fixed sock template', () => {
    const store = new Store();
    store.set('sketch.isActive', true);
    const service = new SketchService(store);
    service.applyTemplate('sock');

    const issues = checkOverconstraints(store.state.sketch);

    // The sock template used to have redundant right-side notch constraints
    // (aligned dimensions + Equal Length). The Equal constraints were removed
    // so the right side is determined only by its own dimensions.
    expect(issues).toHaveLength(0);
  });

  it('flags two Equal lines that both have length dimensions', () => {
    const a = new SketchPoint(0, 0, 0);
    const b = new SketchPoint(1, 100, 0);
    const c = new SketchPoint(2, 0, 50);
    const d = new SketchPoint(3, 100, 50);
    const line1 = new SketchLine(0, a, b);
    const line2 = new SketchLine(1, c, d);
    const dim1 = new SketchDimension(0, a, b, -1);
    dim1.setDrivenValue(100);
    const dim2 = new SketchDimension(1, c, d, -1);
    dim2.setDrivenValue(100);
    const equalConstraint = new SketchConstraint('Equal', null, null, line1, line2, 0);

    const sketch = {
      points: [a, b, c, d],
      lines: [line1, line2],
      dimensions: [dim1, dim2],
      constraints: [equalConstraint],
    };

    const issues = checkOverconstraints(sketch);
    expect(issues.some((i) => i.kind === 'RedundantLength')).toBe(true);
  });
});
