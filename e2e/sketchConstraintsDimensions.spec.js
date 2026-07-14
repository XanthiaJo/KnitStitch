import { expect, test } from '@playwright/test';
import { openSketch, clickStage, dragStage } from './helpers/sketchHelpers.js';

test.describe('Sketch constraints — dimensions', () => {
  test('driven dimensions stay locked when a point is dragged', async ({ page }) => {
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

    const dimItem = page.locator('#sketch-object-list li').filter({ hasText: 'Dim 1' });
    await expect(dimItem).toContainText('80.0');

    await page.getByRole('button', { name: 'Select' }).click();
    // Drag the non-anchored endpoint; the origin anchor cannot be moved.
    await dragStage(page, box, { x: 80, y: 0 }, { x: 120, y: 30 });

    const lineLength = await page.evaluate(() => {
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      const line = lines[0];
      if (!line) return 0;
      return Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y);
    });

    expect(lineLength).toBeCloseTo(80, 1);
    await expect(dimItem).toContainText('80.0');
  });

  test('the first dimension point stays highlighted until the second click', async ({ page }) => {
    const box = await openSketch(page);

    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });
    await page.getByRole('button', { name: 'Dimension' }).click();
    await clickStage(page, box, { x: 0, y: 0 });

    const selectedPoints = await page.evaluate(() => {
      const points = window.__knitstitchStore?.state?.sketch?.points ?? [];
      return points
        .filter((point) => point.isSelected)
        .map((point) => ({ x: point.x, y: point.y }));
    });

    expect(selectedPoints).toHaveLength(1);
    expect(Math.round(selectedPoints[0].x)).toBe(0);
    expect(Math.round(selectedPoints[0].y)).toBe(0);
  });

  test('cancelling the dimension edit removes the pending dimension entirely', async ({ page }) => {
    const box = await openSketch(page);

    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });
    await page.getByRole('button', { name: 'Dimension' }).click();
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });

    await expect(page.locator('#dim-edit-input')).toBeVisible();
    await page.locator('#dim-edit-cancel').click();

    const sketchState = await page.evaluate(() => ({
      dimensions: window.__knitstitchStore?.state?.sketch?.dimensions.length ?? -1,
      hasPendingDimEdit: window.__knitstitchStore?.state?.sketch?.pendingDimEdit != null,
      dimensionObjects: (window.__knitstitchStore?.state?.sketch?.objects ?? []).filter((object) => object.kind === 'Dimension').length,
    }));

    expect(sketchState).toEqual({
      dimensions: 0,
      hasPendingDimEdit: false,
      dimensionObjects: 0,
    });
  });

  test('clicking a dimension label selects it without reopening the edit overlay', async ({ page }) => {
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
    await expect(editInput).toBeHidden();

    const labelPos = await page.evaluate(() => {
      const dim = window.__knitstitchStore?.state?.sketch?.dimensions?.[0];
      return dim ? { x: dim.labelPos.x, y: dim.labelPos.y } : null;
    });

    await page.getByRole('button', { name: 'Select' }).click();
    const hitOffsets = [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: -8, y: 0 },
      { x: 0, y: 8 },
      { x: 0, y: -8 },
    ];
    let stateAfterClick = null;
    for (const offset of hitOffsets) {
      await clickStage(page, box, { x: labelPos.x + offset.x, y: labelPos.y + offset.y });
      stateAfterClick = await page.evaluate(() => ({
        selectedDimensions: (window.__knitstitchStore?.state?.sketch?.dimensions ?? []).filter((dim) => dim.isSelected).length,
        hasPendingDimEdit: window.__knitstitchStore?.state?.sketch?.pendingDimEdit != null,
      }));
      if (stateAfterClick.selectedDimensions === 1) break;
    }

    expect(stateAfterClick).toEqual({
      selectedDimensions: 1,
      hasPendingDimEdit: false,
    });

    await page.keyboard.press('Delete');
    await expect(page.locator('#sketch-object-list')).not.toContainText('Dim 1');
  });

  test('object rows are selectable and deletable from the objects panel', async ({ page }) => {
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

    const row = page.locator('#sketch-object-list li').filter({ hasText: 'Dim 1' });
    await row.click();
    await expect(row).toHaveClass(/selected/);

    await page.keyboard.press('Delete');

    const remainingDimensions = await page.evaluate(() => window.__knitstitchStore?.state?.sketch?.dimensions.length ?? -1);
    expect(remainingDimensions).toBe(0);
  });

  test('sock template: driven dimensions stay locked when a corner is dragged', async ({ page }) => {
    const box = await openSketch(page);

    // Apply the sock template
    await page.getByRole('button', { name: 'Templates' }).click();
    await page.getByRole('button', { name: 'Sock' }).click();
    await page.getByRole('button', { name: 'Sketch' }).click();
    await page.getByRole('button', { name: 'Select' }).click();

    // Verify every driven dimension matches its locked pixel value before dragging.
    let state = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      const dims = sketch?.dimensions ?? [];
      const errors = dims
        .filter((dim) => dim?.isConstrained)
        .map((dim) => {
          const dx = dim.b.x - dim.a.x;
          const dy = dim.b.y - dim.a.y;
          let actual;
          if (dim.kind === 'Horizontal') actual = Math.abs(dx);
          else if (dim.kind === 'Vertical') actual = Math.abs(dy);
          else actual = Math.hypot(dx, dy);
          return Math.abs(actual - dim.drivenValue);
        });
      return {
        maxErrorBefore: errors.length ? Math.max(...errors) : 0,
        p19: { x: sketch?.points?.[19]?.x ?? 0, y: sketch?.points?.[19]?.y ?? 0 },
      };
    });

    expect(state.maxErrorBefore).toBeLessThan(1);

    // Drag the top-right corner (point 19) a long way from the template.
    const p19 = state.p19;
    await dragStage(page, box, { x: p19.x, y: p19.y }, { x: p19.x + 120, y: p19.y + 90 });

    // After the drag, no driven dimension should be violated: every measured
    // distance must stay within a small tolerance of its locked driven value.
    state = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      const dims = sketch?.dimensions ?? [];
      const errors = [];
      for (const dim of dims) {
        if (!dim?.isConstrained) continue;
        const dx = dim.b.x - dim.a.x;
        const dy = dim.b.y - dim.a.y;
        let actual;
        if (dim.kind === 'Horizontal') actual = Math.abs(dx);
        else if (dim.kind === 'Vertical') actual = Math.abs(dy);
        else actual = Math.hypot(dx, dy);
        errors.push(Math.abs(actual - dim.drivenValue));
      }
      return {
        maxErrorAfter: errors.length ? Math.max(...errors) : 0,
      };
    });

    expect(state.maxErrorAfter).toBeLessThan(2);
  });

  test('sock template: top width stays locked when right-edge ribbing point is dragged', async ({ page }) => {
    const box = await openSketch(page);

    // Apply the sock template
    await page.getByRole('button', { name: 'Templates' }).click();
    await page.getByRole('button', { name: 'Sock' }).click();
    await page.getByRole('button', { name: 'Sketch' }).click();
    await page.getByRole('button', { name: 'Select' }).click();

    // Point 18 is the end of the top ribbing on the right edge. Dragging it
    // causes both the width dimension (0→19) and the right top-rib dimension
    // (19→18) to drive point 19, which exposes the sequential-dimension bug.
    let state = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      const widthDim = sketch?.dimensions?.[0];
      const p18 = sketch?.points?.[18];
      const p19 = sketch?.points?.[19];
      const p0 = sketch?.points?.[0];
      return {
        expectedWidth: widthDim?.drivenValue,
        p18: { x: p18?.x ?? 0, y: p18?.y ?? 0 },
        initialWidth: Math.hypot((p19?.x ?? 0) - (p0?.x ?? 0), (p19?.y ?? 0) - (p0?.y ?? 0)),
      };
    });

    expect(state.expectedWidth).toBeGreaterThan(0);
    expect(state.initialWidth).toBeCloseTo(state.expectedWidth, 1);

    await dragStage(page, box, { x: state.p18.x, y: state.p18.y }, { x: state.p18.x + 120, y: state.p18.y + 90 });

    state = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      const widthDim = sketch?.dimensions?.[0];
      const p19 = sketch?.points?.[19];
      const p0 = sketch?.points?.[0];
      return {
        expectedWidth: widthDim?.drivenValue,
        actualWidth: Math.hypot((p19?.x ?? 0) - (p0?.x ?? 0), (p19?.y ?? 0) - (p0?.y ?? 0)),
      };
    });

    expect(state.actualWidth).toBeCloseTo(state.expectedWidth, 1);
  });
});
