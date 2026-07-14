import { expect, test } from '@playwright/test';
import { openSketch, clickStage } from './helpers/sketchHelpers.js';

test.describe('Sketch constraints — equal length', () => {
  test('Equal constraint does not break Horizontal constraint on a shared line', async ({ page }) => {
    const box = await openSketch(page);

    // Draw a triangle anchored at the origin: P1(0,0) -> P2(180,300) -> P3(360,0) -> back to P1
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 180, y: 300 });
    await clickStage(page, box, { x: 360, y: 0 });
    await clickStage(page, box, { x: 0, y: 0 });

    // Add Horizontal constraint on the bottom line (Line 3: P3 -> P1)
    await page.getByRole('button', { name: 'H/V' }).click();
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      // Line 3 is the last line drawn (P3 -> P1)
      service.onConstraintLineClick(lines[2]);
    });

    // Verify Horizontal was added
    const hCount = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      return sketch?.constraints.filter((c) => c.type === 'Horizontal').length ?? 0;
    });
    expect(hCount).toBe(1);

    // Verify the bottom line is horizontal (both y equal)
    const beforeEqual = await page.evaluate(() => {
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      const line3 = lines[2];
      return { startY: line3.start.y, endY: line3.end.y };
    });
    expect(Math.abs(beforeEqual.startY - beforeEqual.endY)).toBeLessThan(0.1);

    // Add Equal constraint on Line 1 (P1->P2) and Line 2 (P2->P3)
    await page.getByRole('button', { name: 'Equal' }).click();
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      service.onConstraintLineClick(lines[0]);
      service.onConstraintLineClick(lines[1]);
    });

    // Verify Equal was added
    const equalCount = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      return sketch?.constraints.filter((c) => c.type === 'Equal').length ?? 0;
    });
    expect(equalCount).toBe(1);

    // THE KEY CHECK: the bottom line should STILL be horizontal after Equal
    const afterEqual = await page.evaluate(() => {
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      const line3 = lines[2];
      return { startY: line3.start.y, endY: line3.end.y };
    });
    expect(Math.abs(afterEqual.startY - afterEqual.endY)).toBeLessThan(1.0);

    // And the Equal constraint should be satisfied (both lines same length)
    const lengths = await page.evaluate(() => {
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      const len1 = Math.hypot(lines[0].end.x - lines[0].start.x, lines[0].end.y - lines[0].start.y);
      const len2 = Math.hypot(lines[1].end.x - lines[1].start.x, lines[1].end.y - lines[1].start.y);
      return { len1, len2 };
    });
    expect(Math.abs(lengths.len1 - lengths.len2)).toBeLessThan(1.0);
  });
});
