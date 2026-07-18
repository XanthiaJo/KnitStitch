import { expect, test } from '@playwright/test';
import { openSketch, clickStage, dragStage, screenshotStep } from './helpers/sketchHelpers.js';

test.describe('Sketch constraints — anchor behavior', () => {
  test('origin anchor stays fixed while points and lines can be dragged', async ({ page }) => {
    const box = await openSketch(page);

    await page.getByRole('button', { name: 'Select' }).click();

    // Draw an L-shape anchored at the origin: (0,0) -> (80,0) -> (80,80).
    await page.getByRole('button', { name: 'Line' }).click();
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });
    await clickStage(page, box, { x: 80, y: 80 });

    // Switch to Select so drags are handled by the drag handler (startDrag
    // only runs when the active tool is Select).
    await page.getByRole('button', { name: 'Select' }).click();

    // 1. Origin anchor cannot be dragged.
    await dragStage(page, box, { x: 0, y: 0 }, { x: 50, y: 50 });
    const origin = await page.evaluate(() => {
      const points = window.__knitstitchStore?.state?.sketch?.points ?? [];
      const anchor = points.find((p) => p.isAnchor);
      return anchor ? { x: anchor.x, y: anchor.y } : null;
    });
    expect(origin).not.toBeNull();
    expect(origin.x).toBeCloseTo(0, 1);
    expect(origin.y).toBeCloseTo(0, 1);

    // 2. A free point can be dragged.
    await dragStage(page, box, { x: 80, y: 80 }, { x: 100, y: 100 });
    const draggedPoint = await page.evaluate(() => {
      const points = window.__knitstitchStore?.state?.sketch?.points ?? [];
      return points.find((p) => p.id === 2);
    });
    expect(draggedPoint).toBeDefined();
    expect(draggedPoint.x).toBeGreaterThan(80);
    expect(draggedPoint.y).toBeGreaterThan(80);

    // 3. A line can be dragged by clicking on its body.
    // Click the midpoint of the vertical line and drag it right.
    const before = await page.evaluate(() => {
      const line = window.__knitstitchStore?.state?.sketch?.lines?.find((l) => l.id === 1);
      return line ? { start: { x: line.start.x, y: line.start.y }, end: { x: line.end.x, y: line.end.y } } : null;
    });
    expect(before).not.toBeNull();

    await dragStage(page, box, { x: 80, y: 40 }, { x: 100, y: 40 });
    const after = await page.evaluate(() => {
      const line = window.__knitstitchStore?.state?.sketch?.lines?.find((l) => l.id === 1);
      return line ? { start: { x: line.start.x, y: line.start.y }, end: { x: line.end.x, y: line.end.y } } : null;
    });
    expect(after).not.toBeNull();

    // Both endpoints of the dragged line should have shifted right.
    expect(after.start.x).toBeGreaterThan(before.start.x);
    expect(after.end.x).toBeGreaterThan(before.end.x);
  });

  test('Horizontal constraint does not move anchored endpoint', async ({ page }) => {
    const testName = 'Horizontal_constraint_does_not_move_anchored_endpoint';
    const box = await openSketch(page);
    await screenshotStep(page, testName, '01_after_open');

    // Draw a non-horizontal line with one endpoint anchored at the origin
    // P1(0,0) anchored, P2(180,100) — slightly sloped
    await page.evaluate(() => {
      const store = window.__knitstitchStore;
      const { SketchPoint, SketchLine } = window.__knitstitchModules;
      const sketch = store.state.sketch;

      const p1 = new SketchPoint(0, 0, 0);
      p1.isAnchor = true;
      const p2 = new SketchPoint(1, 180, 100);
      const line = new SketchLine(0, p1, p2);

      sketch.points.push(p1, p2);
      sketch.lines.push(line);
      store.set('sketch.points', [...sketch.points]);
      store.set('sketch.lines', [...sketch.lines]);
    });
    await screenshotStep(page, testName, '02_after_line');

    // Record anchor before applying Horizontal
    const anchorBefore = await page.evaluate(() => {
      const points = window.__knitstitchStore?.state?.sketch?.points ?? [];
      const anchor = points.find((p) => p.isAnchor);
      return anchor ? { x: anchor.x, y: anchor.y } : null;
    });

    // Apply Horizontal constraint
    await page.getByRole('button', { name: 'H/V' }).click();
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      service.onConstraintLineClick(lines[0]);
    });
    await screenshotStep(page, testName, '03_after_horizontal');

    // Anchor must NOT move; free endpoint must become horizontal with anchor
    const state = await page.evaluate(() => {
      const points = window.__knitstitchStore?.state?.sketch?.points ?? [];
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      const anchor = points.find((p) => p.isAnchor);
      const line = lines[0];
      return {
        anchor: anchor ? { x: anchor.x, y: anchor.y } : null,
        startY: line.start.y,
        endY: line.end.y,
      };
    });
    expect(state.anchor).not.toBeNull();
    expect(Math.abs(state.anchor.x - anchorBefore.x)).toBeLessThan(0.5);
    expect(Math.abs(state.anchor.y - anchorBefore.y)).toBeLessThan(0.5);
    expect(Math.abs(state.startY - state.endY)).toBeLessThan(0.5);
  });

  test('Equal constraint does not move anchored points', async ({ page }) => {
    const testName = 'Equal_constraint_does_not_move_anchored_points';
    const box = await openSketch(page);
    await screenshotStep(page, testName, '01_after_open');

    // Draw a triangle anchored at the origin: P1(0,0) -> P2(180,300) -> P3(360,0) -> back to P1
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 180, y: 300 });
    await clickStage(page, box, { x: 360, y: 0 });
    await clickStage(page, box, { x: 0, y: 0 });
    await screenshotStep(page, testName, '02_after_triangle');

    // P1 is the origin anchor, so it is already fixed.
    await screenshotStep(page, testName, '03_after_anchor');

    // Record the anchored point's position
    const anchorBefore = await page.evaluate(() => {
      const points = window.__knitstitchStore?.state?.sketch?.points ?? [];
      const anchor = points.find((p) => p.isAnchor);
      return anchor ? { x: anchor.x, y: anchor.y } : null;
    });
    expect(anchorBefore).not.toBeNull();

    // Add Horizontal constraint on the bottom line (Line 3: P3 -> P1)
    await page.getByRole('button', { name: 'H/V' }).click();
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      service.onConstraintLineClick(lines[2]);
    });
    await screenshotStep(page, testName, '04_after_horizontal');

    // Add Equal constraint on Line 1 (P1->P2) and Line 2 (P2->P3)
    await page.getByRole('button', { name: 'Equal' }).click();
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      service.onConstraintLineClick(lines[0]);
      service.onConstraintLineClick(lines[1]);
    });
    await screenshotStep(page, testName, '05_after_equal');

    // THE KEY CHECK: the anchored point must NOT have moved
    const anchorAfter = await page.evaluate(() => {
      const points = window.__knitstitchStore?.state?.sketch?.points ?? [];
      const anchor = points.find((p) => p.isAnchor);
      return anchor ? { x: anchor.x, y: anchor.y } : null;
    });
    expect(anchorAfter).not.toBeNull();
    expect(Math.abs(anchorAfter.x - anchorBefore.x)).toBeLessThan(0.5);
    expect(Math.abs(anchorAfter.y - anchorBefore.y)).toBeLessThan(0.5);

    // The bottom line should still be horizontal
    const horizontalCheck = await page.evaluate(() => {
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      const line3 = lines[2];
      return { startY: line3.start.y, endY: line3.end.y };
    });
    expect(Math.abs(horizontalCheck.startY - horizontalCheck.endY)).toBeLessThan(1.0);

    // And Equal should be satisfied
    const lengths = await page.evaluate(() => {
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      const len1 = Math.hypot(lines[0].end.x - lines[0].start.x, lines[0].end.y - lines[0].start.y);
      const len2 = Math.hypot(lines[1].end.x - lines[1].start.x, lines[1].end.y - lines[1].start.y);
      return { len1, len2 };
    });
    expect(Math.abs(lengths.len1 - lengths.len2)).toBeLessThan(1.0);
  });

  test('Equal constraint with coincident at all corners does not move anchor', async ({ page }) => {
    const testName = 'Equal_constraint_with_coincident_at_all_corners';
    const box = await openSketch(page);
    await screenshotStep(page, testName, '01_after_open');

    // Build a triangle where ALL 3 corners have coincident constraints
    // (each line has its own endpoints, linked by coincident constraints).
    // This reproduces the user's exact scenario.
    await page.evaluate(() => {
      const store = window.__knitstitchStore;
      const { SketchPoint, SketchLine, SketchConstraint } = window.__knitstitchModules;
      const sketch = store.state.sketch;

      const p1a = new SketchPoint(0, 0, 0);
      const p2a = new SketchPoint(1, 180, 300);
      const p2b = new SketchPoint(2, 180, 300);
      const p3a = new SketchPoint(3, 360, 0);
      const p3b = new SketchPoint(4, 360, 0);
      const p1b = new SketchPoint(5, 0, 0);

      p1a.isAnchor = true;

      const line1 = new SketchLine(0, p1a, p2a);
      const line2 = new SketchLine(1, p2b, p3a);
      const line3 = new SketchLine(2, p3b, p1b);

      const co1 = new SketchConstraint('Coincident', p1a, p1b, null, null, 0);
      const co2 = new SketchConstraint('Coincident', p2a, p2b, null, null, 1);
      const co3 = new SketchConstraint('Coincident', p3a, p3b, null, null, 2);
      const horiz = new SketchConstraint('Horizontal', null, null, line3, null, 3);

      sketch.points.push(p1a, p2a, p2b, p3a, p3b, p1b);
      sketch.lines.push(line1, line2, line3);
      sketch.constraints.push(co1, co2, co3, horiz);
      store.set('sketch.points', [...sketch.points]);
      store.set('sketch.lines', [...sketch.lines]);
      store.set('sketch.constraints', [...sketch.constraints]);
    });
    await screenshotStep(page, testName, '02_after_triangle_built');

    // Record anchor position before Equal
    const anchorBefore = await page.evaluate(() => {
      const points = window.__knitstitchStore?.state?.sketch?.points ?? [];
      const anchor = points.find((p) => p.isAnchor);
      return anchor ? { x: anchor.x, y: anchor.y } : null;
    });
    expect(anchorBefore).not.toBeNull();

    // Add Equal constraint on Line 1 and Line 2
    await page.getByRole('button', { name: 'Equal' }).click();
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      service.onConstraintLineClick(lines[0]);
      service.onConstraintLineClick(lines[1]);
    });
    await screenshotStep(page, testName, '03_after_equal');

    // THE KEY CHECK: anchor must NOT have moved
    const anchorAfter = await page.evaluate(() => {
      const points = window.__knitstitchStore?.state?.sketch?.points ?? [];
      const anchor = points.find((p) => p.isAnchor);
      return anchor ? { x: anchor.x, y: anchor.y } : null;
    });
    expect(anchorAfter).not.toBeNull();
    expect(Math.abs(anchorAfter.x - anchorBefore.x)).toBeLessThan(0.5);
    expect(Math.abs(anchorAfter.y - anchorBefore.y)).toBeLessThan(0.5);

    // Bottom line (Line 3) should still be horizontal
    const horizontalCheck = await page.evaluate(() => {
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      const line3 = lines[2];
      return { startY: line3.start.y, endY: line3.end.y };
    });
    expect(Math.abs(horizontalCheck.startY - horizontalCheck.endY)).toBeLessThan(1.0);

    // Equal should be satisfied
    const lengths = await page.evaluate(() => {
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      const len1 = Math.hypot(lines[0].end.x - lines[0].start.x, lines[0].end.y - lines[0].start.y);
      const len2 = Math.hypot(lines[1].end.x - lines[1].start.x, lines[1].end.y - lines[1].start.y);
      return { len1, len2 };
    });
    expect(Math.abs(lengths.len1 - lengths.len2)).toBeLessThan(2.0);
  });
});
