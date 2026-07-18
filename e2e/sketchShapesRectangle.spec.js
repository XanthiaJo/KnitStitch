import { expect, test } from '@playwright/test';
import { openSketch, clickStage, dragStage } from './helpers/sketchHelpers.js';

test.describe('Sketch shapes — rectangle', () => {
  test('rectangle is created from center outward with 4 corners and built-in constraints', async ({ page }) => {
    const box = await openSketch(page);

    await page.getByRole('button', { name: 'Rectangle' }).click();

    // Click center at (100, 100), then click at (160, 140) to set halfW=60, halfH=40
    await clickStage(page, box, { x: 100, y: 100 });
    await clickStage(page, box, { x: 160, y: 140 });

    const state = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      const rect = sketch?.rectangles?.[0];
      return {
        rectCount: sketch?.rectangles?.length ?? 0,
        corners: rect?.corners?.map((p) => ({ x: p.x, y: p.y })) ?? [],
        center: rect?.center ? { x: rect.center.x, y: rect.center.y } : null,
        edgeCount: rect?.edges?.length ?? 0,
        constructionLineCount: rect?.constructionLines?.length ?? 0,
        constraintCount: rect?.constraints?.length ?? 0,
        constraintTypes: rect?.constraints?.map((c) => c.type) ?? [],
      };
    });

    expect(state.rectCount).toBe(1);
    expect(state.corners).toHaveLength(4);
    expect(Math.abs(state.center.x - 100)).toBeLessThan(5);
    expect(Math.abs(state.center.y - 100)).toBeLessThan(5);
    expect(state.edgeCount).toBe(4);
    expect(state.constructionLineCount).toBe(2);
    expect(state.constraintCount).toBe(6);
    // 4 perpendicular + 2 midpoint
    expect(state.constraintTypes.filter((t) => t === 'Perpendicular')).toHaveLength(4);
    expect(state.constraintTypes.filter((t) => t === 'Midpoint')).toHaveLength(2);
  });

  test('rectangle corners are symmetric about the center', async ({ page }) => {
    const box = await openSketch(page);

    await page.getByRole('button', { name: 'Rectangle' }).click();
    await clickStage(page, box, { x: 100, y: 100 });
    await clickStage(page, box, { x: 160, y: 140 });

    const corners = await page.evaluate(() => {
      const rect = window.__knitstitchStore?.state?.sketch?.rectangles?.[0];
      return rect?.corners?.map((p) => ({ x: p.x, y: p.y })) ?? [];
    });

    expect(corners).toHaveLength(4);
    // All 4 corners should be at (100±60, 100±40)
    const xs = corners.map((c) => c.x).sort((a, b) => a - b);
    const ys = corners.map((c) => c.y).sort((a, b) => a - b);
    expect(Math.abs(xs[0] - 40)).toBeLessThan(5);
    expect(Math.abs(xs[3] - 160)).toBeLessThan(5);
    expect(Math.abs(ys[0] - 60)).toBeLessThan(5);
    expect(Math.abs(ys[3] - 140)).toBeLessThan(5);
  });

  test('rectangle appears in object list as a single entry', async ({ page }) => {
    const box = await openSketch(page);

    await page.getByRole('button', { name: 'Rectangle' }).click();
    await clickStage(page, box, { x: 100, y: 100 });
    await clickStage(page, box, { x: 160, y: 140 });

    const objectList = await page.locator('#sketch-object-list').innerText();
    expect(objectList).toContain('Rectangle');
  });

  test('rectangle center can be dragged and all corners move with it', async ({ page }) => {
    const box = await openSketch(page);

    await page.getByRole('button', { name: 'Rectangle' }).click();
    await clickStage(page, box, { x: 100, y: 100 });
    await clickStage(page, box, { x: 160, y: 140 });

    // Switch to Select and drag the center point
    await page.getByRole('button', { name: 'Select' }).click();
    await dragStage(page, box, { x: 100, y: 100 }, { x: 200, y: 200 });

    const state = await page.evaluate(() => {
      const rect = window.__knitstitchStore?.state?.sketch?.rectangles?.[0];
      return {
        center: rect?.center ? { x: rect.center.x, y: rect.center.y } : null,
        corners: rect?.corners?.map((p) => ({ x: p.x, y: p.y })) ?? [],
      };
    });

    expect(state.center).not.toBeNull();
    expect(state.center.x).toBeGreaterThan(150);
    expect(state.center.y).toBeGreaterThan(150);
    // All corners should have moved with the center
    for (const c of state.corners) {
      expect(c.x).toBeGreaterThan(100);
      expect(c.y).toBeGreaterThan(100);
    }
  });

  test('rectangle can be deleted and removes all its components', async ({ page }) => {
    const box = await openSketch(page);

    await page.getByRole('button', { name: 'Rectangle' }).click();
    await clickStage(page, box, { x: 100, y: 100 });
    await clickStage(page, box, { x: 160, y: 140 });

    // Select the rectangle by clicking on an edge
    await page.getByRole('button', { name: 'Select' }).click();
    // Click on the top edge midpoint (100, 60)
    await clickStage(page, box, { x: 100, y: 60 });

    await page.getByRole('button', { name: 'Delete' }).click();

    const state = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      return {
        rectCount: sketch?.rectangles?.length ?? 0,
        lineCount: sketch?.lines?.length ?? 0,
        pointCount: sketch?.points?.filter((p) => !p.isAnchor).length ?? 0,
        constraintCount: sketch?.constraints?.length ?? 0,
      };
    });

    expect(state.rectCount).toBe(0);
    // All rectangle lines and non-anchor points should be gone
    expect(state.lineCount).toBe(0);
    expect(state.pointCount).toBe(0);
    expect(state.constraintCount).toBe(0);
  });
});
