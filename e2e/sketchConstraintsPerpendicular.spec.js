import { expect, test } from '@playwright/test';
import { openSketch, clickStage, dragStage } from './helpers/sketchHelpers.js';

test.describe('Sketch constraints — perpendicular', () => {
  test('perpendicular constraints can be created and keep lines at ninety degrees', async ({ page }) => {
    const box = await openSketch(page);

    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });
    await clickStage(page, box, { x: 110, y: 40 });

    await page.getByRole('button', { name: 'Perpendicular' }).click();
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      service.onConstraintLineClick(lines[0]);
      service.onConstraintLineClick(lines[1]);
    });

    const createdState = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      const [lineA, lineB] = sketch?.lines ?? [];
      const shared = lineA?.end;
      const otherA = lineA?.start;
      const otherB = lineB?.end;
      const vecA = { x: otherA.x - shared.x, y: otherA.y - shared.y };
      const vecB = { x: otherB.x - shared.x, y: otherB.y - shared.y };
      return {
        constraintCount: sketch?.constraints.filter((constraint) => constraint.type === 'Perpendicular').length ?? 0,
        dot: vecA.x * vecB.x + vecA.y * vecB.y,
      };
    });
    expect(createdState.constraintCount).toBe(1);
    expect(createdState.dot).toBeCloseTo(0, 1);

    await page.getByRole('button', { name: 'Select' }).click();
    await dragStage(page, box, { x: 80, y: 30 }, { x: 126, y: 50 });

    const geometry = await page.evaluate(() => {
      const [lineA, lineB] = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      const shared = lineA?.end;
      const otherA = lineA?.start;
      const otherB = lineB?.end;
      const vecA = { x: otherA.x - shared.x, y: otherA.y - shared.y };
      const vecB = { x: otherB.x - shared.x, y: otherB.y - shared.y };
      return {
        dot: vecA.x * vecB.x + vecA.y * vecB.y,
        movedX: otherB.x,
      };
    });

    expect(geometry.dot).toBeCloseTo(0, 1);
  });

  test('perpendicular constraint is maintained when moving a non-anchor endpoint', async ({ page }) => {
    const box = await openSketch(page);

    // Draw an L-shape: P1(120,400) -> P2(200,400) -> P3(200,480)
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });
    await clickStage(page, box, { x: 80, y: 80 });

    // Add perpendicular constraint between line 0 (P1→P2) and line 1 (P2→P3)
    await page.getByRole('button', { name: 'Perpendicular' }).click();
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      service.onConstraintLineClick(lines[0]);
      service.onConstraintLineClick(lines[1]);
    });

    // Verify it was created and is perpendicular
    let state = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      const [lineA, lineB] = sketch?.lines ?? [];
      const shared = lineA?.end;
      const otherA = lineA?.start;
      const otherB = lineB?.end;
      const vecA = { x: otherA.x - shared.x, y: otherA.y - shared.y };
      const vecB = { x: otherB.x - shared.x, y: otherB.y - shared.y };
      return {
        count: sketch?.constraints.filter((c) => c.type === 'Perpendicular').length ?? 0,
        dot: vecA.x * vecB.x + vecA.y * vecB.y,
      };
    });
    expect(state.count).toBe(1);
    expect(state.dot).toBeCloseTo(0, 1);

    // Switch to Select and drag P1 (the non-anchor endpoint of line 0)
    await page.getByRole('button', { name: 'Select' }).click();
    await dragStage(page, box, { x: 0, y: 0 }, { x: 20, y: 30 });

    // Perpendicular should still hold
    state = await page.evaluate(() => {
      const [lineA, lineB] = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      const shared = lineA?.end;
      const otherA = lineA?.start;
      const otherB = lineB?.end;
      const vecA = { x: otherA.x - shared.x, y: otherA.y - shared.y };
      const vecB = { x: otherB.x - shared.x, y: otherB.y - shared.y };
      return { dot: vecA.x * vecB.x + vecA.y * vecB.y };
    });
    expect(state.dot).toBeCloseTo(0, 1);
  });

  test('perpendicular constraint is maintained when a driven dimension moves a constrained point', async ({ page }) => {
    const box = await openSketch(page);

    // Draw an L-shape: P1(120,520) -> P2(200,520) -> P3(200,600)
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });
    await clickStage(page, box, { x: 80, y: 80 });

    // Add perpendicular constraint between line 0 (P1→P2) and line 1 (P2→P3)
    await page.getByRole('button', { name: 'Perpendicular' }).click();
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      service.onConstraintLineClick(lines[0]);
      service.onConstraintLineClick(lines[1]);
    });

    // Add a driven dimension on line 0 (P1→P2) = 80px
    await page.getByRole('button', { name: 'Dimension' }).click();
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });
    const editInput = page.locator('#dim-edit-input');
    await expect(editInput).toBeVisible();
    await editInput.fill('80');
    await editInput.press('Enter');

    // Verify perpendicular holds before drag
    let state = await page.evaluate(() => {
      const [lineA, lineB] = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      const shared = lineA?.end;
      const otherA = lineA?.start;
      const otherB = lineB?.end;
      const vecA = { x: otherA.x - shared.x, y: otherA.y - shared.y };
      const vecB = { x: otherB.x - shared.x, y: otherB.y - shared.y };
      return { dot: vecA.x * vecB.x + vecA.y * vecB.y };
    });
    expect(state.dot).toBeCloseTo(0, 1);

    // Switch to Select and drag P3 (the non-anchor endpoint of line 1).
    // This should NOT break the perpendicular at P2.
    await page.getByRole('button', { name: 'Select' }).click();
    await dragStage(page, box, { x: 80, y: 80 }, { x: 110, y: 120 });

    state = await page.evaluate(() => {
      const [lineA, lineB] = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      const shared = lineA?.end;
      const otherA = lineA?.start;
      const otherB = lineB?.end;
      const vecA = { x: otherA.x - shared.x, y: otherA.y - shared.y };
      const vecB = { x: otherB.x - shared.x, y: otherB.y - shared.y };
      return { dot: vecA.x * vecB.x + vecA.y * vecB.y };
    });
    expect(state.dot).toBeCloseTo(0, 1);
  });

  test('sock template: perpendicular at top-left holds when top-right corner is dragged', async ({ page }) => {
    const box = await openSketch(page);

    // Apply the sock template
    await page.getByRole('button', { name: 'Templates' }).click();
    await page.getByRole('button', { name: 'Sock' }).click();
    await page.getByRole('button', { name: 'Sketch' }).click();
    await page.getByRole('button', { name: 'Select' }).click();

    // Verify perpendicular constraints exist
    const perpCount = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      return sketch?.constraints.filter((c) => c.type === 'Perpendicular').length ?? 0;
    });
    expect(perpCount).toBe(4);

    // Check perpendicular at top-left (point 0) before drag
    // Line 19 = top edge (19→0), Line 0 = left edge (0→1), anchor = point 0
    let state = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      const points = sketch?.points ?? [];
      const lines = sketch?.lines ?? [];
      // point 0 = top-left, point 19 = top-right
      const p0 = points[0];
      const p1 = points[1];   // below p0 on left edge
      const p19 = points[19]; // top-right
      const vecTop = { x: p19.x - p0.x, y: p19.y - p0.y };
      const vecLeft = { x: p1.x - p0.x, y: p1.y - p0.y };
      return {
        dot: vecTop.x * vecLeft.x + vecTop.y * vecLeft.y,
        p0: { x: p0.x, y: p0.y },
        p19: { x: p19.x, y: p19.y },
      };
    });
    expect(state.dot).toBeCloseTo(0, 1);

    // Drag the top-right corner (point 19) down and to the right
    const p19 = state.p19;
    await dragStage(page, box, { x: p19.x, y: p19.y }, { x: p19.x + 40, y: p19.y + 30 });

    // Check perpendicular at top-left still holds
    state = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      const points = sketch?.points ?? [];
      const p0 = points[0];
      const p1 = points[1];
      const p19 = points[19];
      const vecTop = { x: p19.x - p0.x, y: p19.y - p0.y };
      const vecLeft = { x: p1.x - p0.x, y: p1.y - p0.y };
      return {
        dot: vecTop.x * vecLeft.x + vecTop.y * vecLeft.y,
        p0: { x: p0.x, y: p0.y },
      };
    });
    expect(state.dot).toBeCloseTo(0, 1);
    expect(state.p0.x).toBeCloseTo(0, 1);
    expect(state.p0.y).toBeCloseTo(0, 1);
  });

  test('sock template: perpendicular at top-left holds when top-left corner is dragged', async ({ page }) => {
    const box = await openSketch(page);

    // Apply the sock template
    await page.getByRole('button', { name: 'Templates' }).click();
    await page.getByRole('button', { name: 'Sock' }).click();
    await page.getByRole('button', { name: 'Sketch' }).click();
    await page.getByRole('button', { name: 'Select' }).click();

    let state = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      const points = sketch?.points ?? [];
      const p0 = points[0];
      const p1 = points[1];
      const p19 = points[19];
      const vecTop = { x: p19.x - p0.x, y: p19.y - p0.y };
      const vecLeft = { x: p1.x - p0.x, y: p1.y - p0.y };
      return {
        dot: vecTop.x * vecLeft.x + vecTop.y * vecLeft.y,
        p0: { x: p0.x, y: p0.y },
      };
    });
    expect(state.dot).toBeCloseTo(0, 1);

    // Drag the top-left corner (point 0) down and to the right
    const p0 = state.p0;
    await dragStage(page, box, { x: p0.x, y: p0.y }, { x: p0.x + 40, y: p0.y + 30 });

    // Check perpendicular at top-left still holds
    state = await page.evaluate(() => {
      const sketch = window.__knitstitchStore?.state?.sketch;
      const points = sketch?.points ?? [];
      const p0 = points[0];
      const p1 = points[1];
      const p19 = points[19];
      const vecTop = { x: p19.x - p0.x, y: p19.y - p0.y };
      const vecLeft = { x: p1.x - p0.x, y: p1.y - p0.y };
      return { dot: vecTop.x * vecLeft.x + vecTop.y * vecLeft.y };
    });
    expect(state.dot).toBeCloseTo(0, 1);
  });

  test('impossible perpendicular combinations are rejected', async ({ page }) => {
    const box = await openSketch(page);

    // Draw an open chain of three lines: P1(120,340) -> P2(240,340) ->
    // P3(240,380) -> P4(120,380). This is NOT a closed rectangle.
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 120, y: 0 });
    await clickStage(page, box, { x: 120, y: 40 });
    await clickStage(page, box, { x: 0, y: 40 });

    await page.getByRole('button', { name: 'Perpendicular' }).click();

    // line0 ⊥ line1 is valid — they share P2.
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      service.onConstraintLineClick(lines[0]);
      service.onConstraintLineClick(lines[1]);
    });

    let constraintCount = await page.evaluate(() => (
      window.__knitstitchStore?.state?.sketch?.constraints.filter((constraint) => constraint.type === 'Perpendicular').length ?? 0
    ));
    expect(constraintCount).toBe(1);

    // line1 ⊥ line2 is also valid — they share P3, and no conflict exists.
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      service.onConstraintLineClick(lines[1]);
      service.onConstraintLineClick(lines[2]);
    });

    constraintCount = await page.evaluate(() => (
      window.__knitstitchStore?.state?.sketch?.constraints.filter((constraint) => constraint.type === 'Perpendicular').length ?? 0
    ));
    expect(constraintCount).toBe(2);

    // line0 ⊥ line2 is impossible: with line0 ⊥ line1 and line1 ⊥ line2,
    // line0 is parallel to line2. Adding line0 ⊥ line2 would force them to
    // be both parallel and perpendicular, which is a contradiction. The
    // solver's bipartite feasibility check should reject this.
    await page.evaluate(() => {
      const service = window.__knitstitchSketchService;
      const lines = window.__knitstitchStore?.state?.sketch?.lines ?? [];
      service.onConstraintLineClick(lines[0]);
      service.onConstraintLineClick(lines[2]);
    });

    constraintCount = await page.evaluate(() => (
      window.__knitstitchStore?.state?.sketch?.constraints.filter((constraint) => constraint.type === 'Perpendicular').length ?? 0
    ));
    expect(constraintCount).toBe(2);
  });
});
