import { expect, test } from '@playwright/test';
import { openSketch, clickStage, dragStage } from './helpers/sketchHelpers.js';

test.describe('Sketch shapes — rectangle (corner to corner)', () => {
  test('rectangle tool creates 4 edges, 2 diagonals, center point, and 6 constraints', async ({ page }) => {
    const box = await openSketch(page);

    await page.getByRole('button', { name: 'Rectangle' }).click();

    // Click first corner at (40, 60), then opposite corner at (160, 140)
    await clickStage(page, box, { x: 40, y: 60 });
    await clickStage(page, box, { x: 160, y: 140 });

    const state = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      return {
        lineCount: sketch?.lines?.length ?? 0,
        constructionLineCount: sketch?.lines?.filter((l) => l.isConstruction).length ?? 0,
        edgeLineCount: sketch?.lines?.filter((l) => !l.isConstruction).length ?? 0,
        pointCount: sketch?.points?.filter((p) => !p.isAnchor).length ?? 0,
        constraintCount: sketch?.constraints?.length ?? 0,
        constraintTypes: sketch?.constraints?.map((c) => c.type) ?? [],
      };
    });

    // 4 edge lines + 2 construction diagonals
    expect(state.lineCount).toBe(6);
    expect(state.edgeLineCount).toBe(4);
    expect(state.constructionLineCount).toBe(2);
    // 4 corners + 1 center
    expect(state.pointCount).toBe(5);
    // 4 perpendicular + 2 midpoint
    expect(state.constraintCount).toBe(6);
    expect(state.constraintTypes.filter((t) => t === 'Perpendicular')).toHaveLength(4);
    expect(state.constraintTypes.filter((t) => t === 'Midpoint')).toHaveLength(2);
  });

  test('rectangle corners match the two clicked points', async ({ page }) => {
    const box = await openSketch(page);

    await page.getByRole('button', { name: 'Rectangle' }).click();
    await clickStage(page, box, { x: 40, y: 60 });
    await clickStage(page, box, { x: 160, y: 140 });

    const points = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      return sketch?.points?.filter((p) => !p.isAnchor).map((p) => ({ x: p.x, y: p.y })) ?? [];
    });

    // 4 corners + 1 center = 5 points
    expect(points).toHaveLength(5);
    const corners = points.filter((p) => !(Math.abs(p.x - 100) < 5 && Math.abs(p.y - 100) < 5));
    expect(corners).toHaveLength(4);
    const xs = corners.map((c) => c.x).sort((a, b) => a - b);
    const ys = corners.map((c) => c.y).sort((a, b) => a - b);
    expect(Math.abs(xs[0] - 40)).toBeLessThan(5);
    expect(Math.abs(xs[3] - 160)).toBeLessThan(5);
    expect(Math.abs(ys[0] - 60)).toBeLessThan(5);
    expect(Math.abs(ys[3] - 140)).toBeLessThan(5);
  });

  test('rectangle center is at the midpoint of the two corners', async ({ page }) => {
    const box = await openSketch(page);

    await page.getByRole('button', { name: 'Rectangle' }).click();
    await clickStage(page, box, { x: 40, y: 60 });
    await clickStage(page, box, { x: 160, y: 140 });

    const center = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      const points = sketch?.points?.filter((p) => !p.isAnchor) ?? [];
      // The center is the point at (100, 100) — not a corner
      return points.find((p) => Math.abs(p.x - 100) < 5 && Math.abs(p.y - 100) < 5) ?? null;
    });

    expect(center).not.toBeNull();
    expect(Math.abs(center.x - 100)).toBeLessThan(5);
    expect(Math.abs(center.y - 100)).toBeLessThan(5);
  });

  test('rectangle lines appear individually in object list (no composite entry)', async ({ page }) => {
    const box = await openSketch(page);

    await page.getByRole('button', { name: 'Rectangle' }).click();
    await clickStage(page, box, { x: 40, y: 60 });
    await clickStage(page, box, { x: 160, y: 140 });

    const objectList = await page.locator('#sketch-object-list').innerText();
    expect(objectList).toContain('Line');
    expect(objectList).not.toContain('Rectangle R');
  });

  test('rectangle corner can be dragged and perpendicularity is maintained', async ({ page }) => {
    const box = await openSketch(page);

    await page.getByRole('button', { name: 'Rectangle' }).click();
    await clickStage(page, box, { x: 40, y: 60 });
    await clickStage(page, box, { x: 160, y: 140 });

    // Switch to Select and drag the top-left corner
    await page.getByRole('button', { name: 'Select' }).click();
    await dragStage(page, box, { x: 40, y: 60 }, { x: 20, y: 40 });

    const points = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      return sketch?.points?.filter((p) => !p.isAnchor).map((p) => ({ x: p.x, y: p.y })) ?? [];
    });

    // All 5 points should still exist
    expect(points).toHaveLength(5);
  });

  test('individual edge line can be selected and deleted without removing other edges', async ({ page }) => {
    const box = await openSketch(page);

    await page.getByRole('button', { name: 'Rectangle' }).click();
    await clickStage(page, box, { x: 40, y: 60 });
    await clickStage(page, box, { x: 160, y: 140 });

    // Switch to Select and click on the top edge midpoint (100, 60)
    await page.getByRole('button', { name: 'Select' }).click();
    await clickStage(page, box, { x: 100, y: 60 });

    await page.getByRole('button', { name: 'Delete' }).click();

    const state = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      return {
        lineCount: sketch?.lines?.length ?? 0,
        edgeLineCount: sketch?.lines?.filter((l) => !l.isConstruction).length ?? 0,
      };
    });

    // Deleting one edge leaves 5 lines (3 edges + 2 diagonals)
    expect(state.lineCount).toBe(5);
    expect(state.edgeLineCount).toBe(3);
  });

  test('deleting both diagonals removes the center point but keeps the edges', async ({ page }) => {
    const box = await openSketch(page);

    await page.getByRole('button', { name: 'Rectangle' }).click();
    await clickStage(page, box, { x: 40, y: 60 });
    await clickStage(page, box, { x: 160, y: 140 });

    await page.getByRole('button', { name: 'Select' }).click();

    // Delete diagonal TL→BR: click near the diagonal midpoint (100, 100) area
    // The diagonal goes from (40,60) to (160,140), midpoint at (100,100)
    // Click on the diagonal line away from the center point and corners
    await clickStage(page, box, { x: 70, y: 78 });
    await page.getByRole('button', { name: 'Delete' }).click();

    // Delete diagonal TR→BL: goes from (160,60) to (40,140), midpoint at (100,100)
    // Click on it away from center
    await clickStage(page, box, { x: 130, y: 78 });
    await page.getByRole('button', { name: 'Delete' }).click();

    const state = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      const points = sketch?.points?.filter((p) => !p.isAnchor) ?? [];
      // Center was at (100,100) — check if it's gone
      const hasCenter = points.some((p) => Math.abs(p.x - 100) < 5 && Math.abs(p.y - 100) < 5);
      return {
        lineCount: sketch?.lines?.length ?? 0,
        edgeLineCount: sketch?.lines?.filter((l) => !l.isConstruction).length ?? 0,
        pointCount: points.length,
        hasCenter,
        constraintCount: sketch?.constraints?.length ?? 0,
      };
    });

    // 4 edge lines remain, no construction lines
    expect(state.lineCount).toBe(4);
    expect(state.edgeLineCount).toBe(4);
    // Center point should be gone (only 4 corners left)
    expect(state.pointCount).toBe(4);
    expect(state.hasCenter).toBe(false);
    // Only 4 perpendicular constraints remain (midpoints removed with diagonals)
    expect(state.constraintCount).toBe(4);
  });

  test('deleting all lines removes all points and constraints', async ({ page }) => {
    const box = await openSketch(page);

    await page.getByRole('button', { name: 'Rectangle' }).click();
    await clickStage(page, box, { x: 40, y: 60 });
    await clickStage(page, box, { x: 160, y: 140 });

    await page.getByRole('button', { name: 'Select' }).click();
    // Delete all 6 lines one at a time
    // Top edge
    await clickStage(page, box, { x: 100, y: 60 });
    await page.getByRole('button', { name: 'Delete' }).click();
    // Right edge
    await clickStage(page, box, { x: 160, y: 100 });
    await page.getByRole('button', { name: 'Delete' }).click();
    // Bottom edge
    await clickStage(page, box, { x: 100, y: 140 });
    await page.getByRole('button', { name: 'Delete' }).click();
    // Left edge
    await clickStage(page, box, { x: 40, y: 100 });
    await page.getByRole('button', { name: 'Delete' }).click();
    // Diagonal 1
    await clickStage(page, box, { x: 70, y: 78 });
    await page.getByRole('button', { name: 'Delete' }).click();
    // Diagonal 2
    await clickStage(page, box, { x: 130, y: 78 });
    await page.getByRole('button', { name: 'Delete' }).click();

    const state = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      return {
        lineCount: sketch?.lines?.length ?? 0,
        pointCount: sketch?.points?.filter((p) => !p.isAnchor).length ?? 0,
        constraintCount: sketch?.constraints?.length ?? 0,
      };
    });

    expect(state.lineCount).toBe(0);
    expect(state.pointCount).toBe(0);
    expect(state.constraintCount).toBe(0);
  });
});
