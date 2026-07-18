import { expect, test } from '@playwright/test';
import { openSketch, clickStage } from './helpers/sketchHelpers.js';

test.describe('Sketch import/export', () => {
  test('export then import (replace) round-trips a line and circle', async ({ page }) => {
    const box = await openSketch(page);

    // Draw a line from origin to (80, 0).
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });

    // Draw a circle: center at (120, 120), radius point at (160, 120) → r=40.
    await page.getByRole('button', { name: 'Circle' }).click();
    await clickStage(page, box, { x: 120, y: 120 });
    await clickStage(page, box, { x: 160, y: 120 });

    // Snapshot the pre-export sketch state for comparison after import.
    const before = await page.evaluate(() => {
      const s = window.__knitstitchStore.state.sketch;
      return {
        lineCount: s.lines.length,
        circleCount: s.circles.length,
        pointCount: s.points.length,
        // Capture geometry (not ids — replace keeps ids from the file).
        lineEnds: s.lines.map((l) => ({
          start: { x: l.start.x, y: l.start.y },
          end: { x: l.end.x, y: l.end.y },
        })),
        circles: s.circles.map((c) => ({
          center: { x: c.center.x, y: c.center.y },
          radius: c.radius,
        })),
      };
    });
    expect(before.lineCount).toBe(1);
    expect(before.circleCount).toBe(1);

    // Export via the UI and capture the download.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/knitstitch-pattern-.*\.json/);

    const tmpPath = `${test.info().outputPath('imported-pattern.json')}`;
    await download.saveAs(tmpPath);

    // Clear the sketch so we can verify import actually restores content.
    await page.evaluate(() => window.__knitstitchSketchService.clear());
    const afterClear = await page.evaluate(() => {
      const s = window.__knitstitchStore.state.sketch;
      return { lineCount: s.lines.length, circleCount: s.circles.length };
    });
    expect(afterClear.lineCount).toBe(0);
    expect(afterClear.circleCount).toBe(0);

    // Import the exported file via the hidden file input.
    const fileInput = page.locator('#sketch-import-file');
    await fileInput.setInputFiles(tmpPath);

    // The chooser overlay should appear; pick Replace.
    const chooser = page.locator('#sketch-import-chooser');
    await expect(chooser).toBeVisible();
    await chooser.locator('button[data-mode="replace"]').click();
    await expect(chooser).not.toBeVisible();

    // Verify the sketch was restored with matching geometry.
    const afterImport = await page.evaluate(() => {
      const s = window.__knitstitchStore.state.sketch;
      return {
        lineCount: s.lines.length,
        circleCount: s.circles.length,
        pointCount: s.points.length,
        lineEnds: s.lines.map((l) => ({
          start: { x: l.start.x, y: l.start.y },
          end: { x: l.end.x, y: l.end.y },
        })),
        circles: s.circles.map((c) => ({
          center: { x: c.center.x, y: c.center.y },
          radius: c.radius,
        })),
      };
    });
    expect(afterImport.lineCount).toBe(before.lineCount);
    expect(afterImport.circleCount).toBe(before.circleCount);
    expect(afterImport.lineEnds).toEqual(before.lineEnds);
    expect(afterImport.circles).toEqual(before.circles);
  });

  test('merge import appends to the current sketch without clobbering', async ({ page }) => {
    const box = await openSketch(page);

    // Draw one line in the current sketch.
    await clickStage(page, box, { x: 0, y: 0 });
    await clickStage(page, box, { x: 80, y: 0 });

    // Build a small pattern payload in-process and write it to a temp file
    // (the export UI is covered by the round-trip test above; here we focus
    // on the merge semantics).
    const exportJson = await page.evaluate(() =>
      window.__knitstitchSketchService.exportPattern(),
    );
    const tmpPath = `${test.info().outputPath('merge-pattern.json')}`;

    // Manually craft a second pattern with one extra line so merge has
    // something distinct to add. We reuse the exported envelope but replace
    // the sketch slice with a single-line snapshot built from the service.
    const payload = JSON.parse(exportJson);
    payload.sketch = {
      points: [
        { id: 100, x: 200, y: 200, isSelected: false, isAnchor: false },
        { id: 101, x: 280, y: 200, isSelected: false, isAnchor: false },
      ],
      lines: [
        { id: 50, startId: 100, endId: 101, isSelected: false },
      ],
      dimensions: [],
      constraints: [],
      circles: [],
      beziers: [],
      nextPointId: 102,
      nextLineId: 51,
      nextDimId: 0,
      nextConstraintId: 0,
      nextCircleId: 0,
      nextBezierId: 0,
    };

    const fs = await import('fs');
    fs.writeFileSync(tmpPath, JSON.stringify(payload));

    const beforeMerge = await page.evaluate(() => {
      const s = window.__knitstitchStore.state.sketch;
      return { lineCount: s.lines.length, pointCount: s.points.length };
    });

    // Import via the UI and choose Merge.
    await page.locator('#sketch-import-file').setInputFiles(tmpPath);
    const chooser = page.locator('#sketch-import-chooser');
    await expect(chooser).toBeVisible();
    await chooser.locator('button[data-mode="merge"]').click();
    await expect(chooser).not.toBeVisible();

    const afterMerge = await page.evaluate(() => {
      const s = window.__knitstitchStore.state.sketch;
      return {
        lineCount: s.lines.length,
        pointCount: s.points.length,
        // The merged line should be at (200,200)->(280,200).
        hasMergedLine: s.lines.some(
          (l) => l.start.x === 200 && l.start.y === 200 && l.end.x === 280 && l.end.y === 200,
        ),
      };
    });

    expect(afterMerge.lineCount).toBe(beforeMerge.lineCount + 1);
    expect(afterMerge.hasMergedLine).toBe(true);
  });

  test('importing a non-pattern file shows an error and does not mutate the sketch', async ({ page }) => {
    await openSketch(page);

    const fs = await import('fs');
    const tmpPath = `${test.info().outputPath('bad.json')}`;
    fs.writeFileSync(tmpPath, JSON.stringify({ hello: 'world' }));

    const before = await page.evaluate(() => {
      const s = window.__knitstitchStore.state.sketch;
      return { lineCount: s.lines.length, pointCount: s.points.length };
    });

    await page.locator('#sketch-import-file').setInputFiles(tmpPath);

    // No chooser should appear for an invalid format; the Import button
    // should flash an error message instead.
    await expect(page.locator('#sketch-import-chooser')).toHaveCount(0);
    await expect(page.locator('#sketch-import-objects')).toContainText(/Import failed/);

    const after = await page.evaluate(() => {
      const s = window.__knitstitchStore.state.sketch;
      return { lineCount: s.lines.length, pointCount: s.points.length };
    });
    expect(after).toEqual(before);
  });
});
