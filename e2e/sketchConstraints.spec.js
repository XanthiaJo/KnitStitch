import { expect, test } from '@playwright/test';
import { openSketch, clickStage, dragStage } from './helpers/sketchHelpers.js';

test.describe('Sketch constraints — core and over-constraint', () => {
  test('clicking a hovered endpoint selects the point instead of the line', async ({ page }) => {
    const box = await openSketch(page);

    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });
    await page.getByRole('button', { name: 'Select' }).click();

    await page.mouse.move(box.x + 4, box.y + 0);
    await page.mouse.click(box.x + 4, box.y + 0);

    const selection = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      return {
        selectedPoints: sketch?.points.filter((point) => point.isSelected).map((point) => ({ x: point.x, y: point.y })) ?? [],
        selectedLines: sketch?.lines.filter((line) => line.isSelected).length ?? 0,
      };
    });

    expect(selection.selectedLines).toBe(0);
    expect(selection.selectedPoints).toHaveLength(1);
    expect(Math.round(selection.selectedPoints[0].x)).toBe(0);
    expect(Math.round(selection.selectedPoints[0].y)).toBe(0);
  });

  test('coincident snapping creates a coincident constraint through pointer input', async ({ page }) => {
    const box = await openSketch(page);

    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 100, y: 0 });
    await clickStage(page, box, { x: 240, y: 0 });
    await clickStage(page, box, { x: 340, y: 0 });

    await page.getByRole('button', { name: 'Select' }).click();
    await dragStage(page, box, { x: 240, y: 0 }, { x: 6, y: 4 });

    await expect(page.locator('#sketch-object-list')).toContainText('Coincident');
    await expect(page.locator('#sketch-object-list')).toContainText('P3');
    await expect(page.locator('#sketch-object-list')).toContainText('P2');
  });

  test('deleting a constrained line removes the line, its endpoints, and attached constraints', async ({ page }) => {
    const box = await openSketch(page);

    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });

    await page.getByRole('button', { name: 'Dimension' }).click();
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });

    const editInput = page.locator('#dim-edit-input');
    await expect(editInput).toBeVisible();
    await editInput.fill('80');
    await editInput.press('Enter');

    await page.getByRole('button', { name: 'Select' }).click();
    const selectedLineCount = await page.evaluate(() => {
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      const service = window.__knitstitchSketchService;
      if (lines[0] && service) {
        service.selectLine(lines[0]);
      }
      return lines.filter((line) => line.isSelected).length;
    });
    expect(selectedLineCount).toBe(1);

    await page.keyboard.press('Delete');

    const sketchState = await page.evaluate(() => ({
      lines: window.__knitstitchStore?.state?.sketch?.lines.length ?? -1,
      points: window.__knitstitchStore?.state?.sketch?.points.length ?? -1,
      dimensions: window.__knitstitchStore?.state?.sketch?.dimensions.length ?? -1,
      constraints: window.__knitstitchStore?.state?.sketch?.constraints.length ?? -1,
    }));

    expect(sketchState).toEqual({
      lines: 0,
      points: 1,
      dimensions: 0,
      constraints: 0,
    });
  });

  test('deleting a selected endpoint removes its attached line and dependent dimensions', async ({ page }) => {
    const box = await openSketch(page);

    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });

    await page.getByRole('button', { name: 'Dimension' }).click();
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });

    const editInput = page.locator('#dim-edit-input');
    await expect(editInput).toBeVisible();
    await editInput.fill('80');
    await editInput.press('Enter');

    await page.getByRole('button', { name: 'Select' }).click();
    await page.mouse.move(box.x + 4, box.y + 0);
    await page.mouse.click(box.x + 4, box.y + 0);
    await page.keyboard.press('Delete');

    const sketchState = await page.evaluate(() => ({
      lines: window.__knitstitchStore?.state?.sketch?.lines.length ?? -1,
      points: window.__knitstitchStore?.state?.sketch?.points.length ?? -1,
      dimensions: window.__knitstitchStore?.state?.sketch?.dimensions.length ?? -1,
      constraints: window.__knitstitchStore?.state?.sketch?.constraints.length ?? -1,
    }));

    expect(sketchState).toEqual({
      lines: 0,
      points: 1,
      dimensions: 0,
      constraints: 0,
    });
  });

  test('over-constraining a line with dimension+H+second dimension is blocked', async ({ page }) => {
    const box = await openSketch(page);

    // Draw a line anchored at the origin: P1(0,0) -> P2(80,0)
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });

    // Add a driven dimension on the line (1 DOF removed, 1 remaining)
    await page.getByRole('button', { name: 'Dimension' }).click();
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });
    let editInput = page.locator('#dim-edit-input');
    await expect(editInput).toBeVisible();
    await editInput.fill('80');
    await editInput.press('Enter');

    // Add Horizontal constraint (line is horizontal, auto-detects H, 0 DOF remaining)
    await page.getByRole('button', { name: 'H/V' }).click();
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      service.onConstraintLineClick(lines[0]);
    });

    // Verify we have 1 dimension (driven) and 1 horizontal constraint
    const stateBefore = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      return {
        drivenDims: sketch?.dimensions.filter((d) => d.drivenValue !== null).length ?? 0,
        hConstraints: sketch?.constraints.filter((c) => c.type === 'Horizontal').length ?? 0,
      };
    });
    expect(stateBefore.drivenDims).toBe(1);
    expect(stateBefore.hConstraints).toBe(1);

    // Now try to add a second driven dimension — this should be blocked (0 DOF → -1)
    await page.getByRole('button', { name: 'Dimension' }).click();
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });

    // The second dimension should NOT have been driven
    const dimState = await page.evaluate(() => {
      const dims = window.__knitstitchStore?.state?.sketch?.dimensions ?? [];
      return {
        count: dims.length,
        drivenCount: dims.filter((d) => d.drivenValue !== null).length,
      };
    });

    // The second dimension may exist as undriven, but only 1 should be driven
    expect(dimState.drivenCount).toBe(1);
  });

  test('DOF status text appears in the constraint status area', async ({ page }) => {
    const box = await openSketch(page);

    // Draw a line from the origin
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });

    // Check that the status area shows degrees of freedom
    const statusText = await page.locator('#sketch-constraint-status').textContent();
    expect(statusText).toContain('degree');
    expect(statusText).toContain('of freedom');
  });
});
