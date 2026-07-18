import { expect, test } from '@playwright/test';
import { openSketch, clickStage, dragStage } from './helpers/sketchHelpers.js';

// Two lines are parallel iff the cross product of their direction vectors is
// zero: dirA.x*dirB.y - dirA.y*dirB.x ≈ 0.
function crossOf(lines) {
  const [lineA, lineB] = lines;
  const dirA = { x: lineA.end.x - lineA.start.x, y: lineA.end.y - lineA.start.y };
  const dirB = { x: lineB.end.x - lineB.start.x, y: lineB.end.y - lineB.start.y };
  return dirA.x * dirB.y - dirA.y * dirB.x;
}

test.describe('Sketch constraints — parallel', () => {
  test('parallel constraints can be created and keep lines parallel', async ({ page }) => {
    const box = await openSketch(page);

    // Two non-parallel, non-touching lines:
    //   L0: (0,0) -> (80,0)   (horizontal)
    //   L1: (160,0) -> (200,40) (diagonal)
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });
    await clickStage(page, box, { x: 160, y: 0 });
    await clickStage(page, box, { x: 200, y: 40 });

    await page.getByRole('button', { name: 'Parallel' }).click();
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      service.onConstraintLineClick(lines[0]);
      service.onConstraintLineClick(lines[1]);
    });

    const createdState = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      return {
        constraintCount: sketch?.constraints.filter((c) => c.type === 'Parallel').length ?? 0,
      };
    });
    expect(createdState.constraintCount).toBe(1);

    const lines = await page.evaluate(() => window.__knitstitchStore?.state?.sketch?.lines ?? []);
    // After solving, the diagonal line should have rotated to become parallel
    // to the horizontal line (cross product ≈ 0).
    expect(crossOf(lines)).toBeCloseTo(0, 1);
  });

  test('parallel constraint is maintained when an endpoint is dragged', async ({ page }) => {
    const box = await openSketch(page);

    // L0: (0,0) -> (80,0)   L1: (160,0) -> (200,40)
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });
    await clickStage(page, box, { x: 160, y: 0 });
    await clickStage(page, box, { x: 200, y: 40 });

    await page.getByRole('button', { name: 'Parallel' }).click();
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      service.onConstraintLineClick(lines[0]);
      service.onConstraintLineClick(lines[1]);
    });

    // Drag the free endpoint of L1 (point at 200,40) to a new position.
    // The constraint should keep L1 parallel to L0.
    await page.getByRole('button', { name: 'Select' }).click();
    await dragStage(page, box, { x: 200, y: 40 }, { x: 240, y: 60 });

    const lines = await page.evaluate(() => window.__knitstitchStore?.state?.sketch?.lines ?? []);
    expect(crossOf(lines)).toBeCloseTo(0, 1);
  });

  test('parallel constraint shows in the object list', async ({ page }) => {
    const box = await openSketch(page);

    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });
    await clickStage(page, box, { x: 160, y: 0 });
    await clickStage(page, box, { x: 200, y: 40 });

    await page.getByRole('button', { name: 'Parallel' }).click();
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      service.onConstraintLineClick(lines[0]);
      service.onConstraintLineClick(lines[1]);
    });

    await expect(page.locator('#sketch-object-list')).toContainText('Parallel');
    await expect(page.locator('#sketch-object-list')).toContainText('L1');
    await expect(page.locator('#sketch-object-list')).toContainText('L2');
  });

  test('constraining a line to itself is rejected', async ({ page }) => {
    const box = await openSketch(page);

    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });

    await page.getByRole('button', { name: 'Parallel' }).click();
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      // Pick the same line twice — should cancel / reject, no constraint created.
      service.onConstraintLineClick(lines[0]);
      service.onConstraintLineClick(lines[0]);
    });

    const count = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      return sketch?.constraints.filter((c) => c.type === 'Parallel').length ?? 0;
    });
    expect(count).toBe(0);
  });
});
