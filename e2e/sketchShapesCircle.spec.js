import { expect, test } from '@playwright/test';
import { openSketch, clickStage, dragStage } from './helpers/sketchHelpers.js';

test.describe('Sketch shapes — circle', () => {
  test('circle is created from center outward and appears in object list', async ({ page }) => {
    const box = await openSketch(page);

    // Switch to the Circle tool
    await page.getByRole('button', { name: 'Circle' }).click();

    // Click center at (100, 100), then click at (160, 100) to set radius = 60
    await clickStage(page, box, { x: 100, y: 100 });
    await clickStage(page, box, { x: 160, y: 100 });

    const circle = await page.evaluate(() => {
      const circles = window.__knitstitchStore?.state?.sketch?.circles ?? [];
      return circles.map((c) => ({
        id: c.id,
        center: { x: c.center.x, y: c.center.y },
        radius: c.radius,
      }));
    });
    expect(circle).toHaveLength(1);
    expect(Math.abs(circle[0].center.x - 100)).toBeLessThan(5);
    expect(Math.abs(circle[0].center.y - 100)).toBeLessThan(5);
    expect(Math.abs(circle[0].radius - 60)).toBeLessThan(5);

    // Object list should show the circle
    const objectList = await page.locator('#sketch-object-list').innerText();
    expect(objectList).toContain('Circle');
  });

  test('circle center can be dragged and the circle moves', async ({ page }) => {
    const box = await openSketch(page);

    await page.getByRole('button', { name: 'Circle' }).click();
    await clickStage(page, box, { x: 100, y: 100 });
    await clickStage(page, box, { x: 160, y: 100 });

    // Switch to Select and drag the center point
    await page.getByRole('button', { name: 'Select' }).click();
    await dragStage(page, box, { x: 100, y: 100 }, { x: 150, y: 150 });

    const circle = await page.evaluate(() => {
      const circles = window.__knitstitchStore?.state?.sketch?.circles ?? [];
      return circles[0] ? { center: { x: circles[0].center.x, y: circles[0].center.y }, radius: circles[0].radius } : null;
    });
    expect(circle).not.toBeNull();
    expect(circle.center.x).toBeGreaterThan(120);
    expect(circle.center.y).toBeGreaterThan(120);
  });

  test('circle can be selected by clicking on its circumference', async ({ page }) => {
    const box = await openSketch(page);

    await page.getByRole('button', { name: 'Circle' }).click();
    await clickStage(page, box, { x: 100, y: 100 });
    await clickStage(page, box, { x: 160, y: 100 });

    // Switch to Select and click on the circumference (right side of circle)
    await page.getByRole('button', { name: 'Select' }).click();
    await clickStage(page, box, { x: 160, y: 100 });

    const isSelected = await page.evaluate(() => {
      const circles = window.__knitstitchStore?.state?.sketch?.circles ?? [];
      return circles[0]?.isSelected ?? false;
    });
    expect(isSelected).toBe(true);
  });

  test('circle can be deleted after selection', async ({ page }) => {
    const box = await openSketch(page);

    await page.getByRole('button', { name: 'Circle' }).click();
    await clickStage(page, box, { x: 100, y: 100 });
    await clickStage(page, box, { x: 160, y: 100 });

    await page.getByRole('button', { name: 'Select' }).click();
    await clickStage(page, box, { x: 160, y: 100 });

    await page.getByRole('button', { name: 'Delete' }).click();

    const circles = await page.evaluate(() => {
      return (window.__knitstitchStore?.state?.sketch?.circles ?? []).length;
    });
    expect(circles).toBe(0);
  });
});
