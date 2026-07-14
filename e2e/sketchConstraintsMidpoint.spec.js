import { expect, test } from '@playwright/test';
import { openSketch, clickStage, dragStage } from './helpers/sketchHelpers.js';

test.describe('Sketch constraints — midpoint', () => {
  test('point-line midpoint moves the point to the line centre', async ({ page }) => {
    const box = await openSketch(page);

    // Draw an L-shape: (0,0) -> (100,0) -> (50,60)
    // Line 0: (0,0)->(100,0), Line 1: (100,0)->(50,60)
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 100, y: 0 });
    await clickStage(page, box, { x: 50, y: 60 });

    // Apply midpoint: line = Line 0, point = the third point (50,60).
    await page.getByRole('button', { name: 'Midpoint' }).click();
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const sketch = window.__knitstitchStore.state.sketch;
      const line = sketch.lines[0];
      const point = sketch.points[2];
      service.onConstraintLineClick(line);
      service.onConstraintPointClick(point);
    });

    const result = await page.evaluate(() => {
      const sketch = window.__knitstitchStore.state.sketch;
      const point = sketch.points[2];
      return { x: point.x, y: point.y };
    });
    expect(result.x).toBeCloseTo(50, 0);
    expect(result.y).toBeCloseTo(0, 0);
  });

  test('line-line midpoint makes two lines cross at their midpoints', async ({ page }) => {
    const box = await openSketch(page);

    // Line A: (0,0) -> (100,0)  (midpoint 50,0)
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 100, y: 0 });
    // Break chain so Line B is disjoint.
    await page.evaluate(() => window.__knitstitchSketchService.cancelCurrentLine());

    // Line B: (200,80) -> (300,80)  (midpoint 250,80)
    await clickStage(page, box, { x: 200, y: 80 });
    await clickStage(page, box, { x: 300, y: 80 });

    // Apply midpoint constraint between the two lines.
    await page.getByRole('button', { name: 'Midpoint' }).click();
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const lines = window.__knitstitchStore.state.sketch.lines;
      service.onConstraintLineClick(lines[0]);
      service.onConstraintLineClick(lines[1]);
    });

    const created = await page.evaluate(() => {
      const sketch = window.__knitstitchStore.state.sketch;
      const [lineA, lineB] = sketch.lines;
      const midA = { x: (lineA.start.x + lineA.end.x) / 2, y: (lineA.start.y + lineA.end.y) / 2 };
      const midB = { x: (lineB.start.x + lineB.end.x) / 2, y: (lineB.start.y + lineB.end.y) / 2 };
      return {
        count: sketch.constraints.filter((c) => c.type === 'Midpoint').length,
        midA,
        midB,
        lenB: Math.hypot(lineB.end.x - lineB.start.x, lineB.end.y - lineB.start.y),
      };
    });
    expect(created.count).toBe(1);
    expect(created.midB.x).toBeCloseTo(created.midA.x, 0);
    expect(created.midB.y).toBeCloseTo(created.midA.y, 0);
    // Line B length preserved (translation, not scaling).
    expect(created.lenB).toBeCloseTo(100, 0);
  });

  test('line-line midpoint is maintained when dragging a line endpoint', async ({ page }) => {
    const box = await openSketch(page);

    // Line A: (0,0) -> (100,0)
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 100, y: 0 });
    await page.evaluate(() => window.__knitstitchSketchService.cancelCurrentLine());

    // Line B: (200,80) -> (300,80)
    await clickStage(page, box, { x: 200, y: 80 });
    await clickStage(page, box, { x: 300, y: 80 });

    await page.getByRole('button', { name: 'Midpoint' }).click();
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const lines = window.__knitstitchStore.state.sketch.lines;
      service.onConstraintLineClick(lines[0]);
      service.onConstraintLineClick(lines[1]);
    });

    // Switch to Select and drag line A's free endpoint (100,0) to (100,60).
    await page.getByRole('button', { name: 'Select' }).click();
    await dragStage(page, box, { x: 100, y: 0 }, { x: 100, y: 60 });

    const after = await page.evaluate(() => {
      const sketch = window.__knitstitchStore.state.sketch;
      const [lineA, lineB] = sketch.lines;
      const midA = { x: (lineA.start.x + lineA.end.x) / 2, y: (lineA.start.y + lineA.end.y) / 2 };
      const midB = { x: (lineB.start.x + lineB.end.x) / 2, y: (lineB.start.y + lineB.end.y) / 2 };
      return { midA, midB };
    });
    expect(after.midB.x).toBeCloseTo(after.midA.x, 0);
    expect(after.midB.y).toBeCloseTo(after.midA.y, 0);
  });
});
