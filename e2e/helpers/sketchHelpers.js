import { expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Take a numbered screenshot of the KnitStitch canvas for visual debugging.
 * Screenshots are written to `test-screenshots/<testName>/`.
 */
export async function screenshotStep(page, testName, stepName) {
  const dir = path.resolve(process.cwd(), 'test-screenshots', sanitizeFilename(testName));
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${stepName}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  return filePath;
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9\-_]/g, '_');
}

/**
 * Open the KnitStitch page, dismiss the cookie banner via cookie, activate
 * the Sketch workspace, select the Line tool, and compute the canvas box
 * used by clickStage/dragStage.
 */
export async function openSketch(page) {
  await page.goto('/');

  // The live site sizes the canvas via flexbox, so the canvas height depends
  // on the viewport. Set a large viewport so all test coordinates fit.
  await page.setViewportSize({ width: 1600, height: 1400 });

  // The SolveSpace WASM solver now loads lazily (off the critical path)
  // instead of blocking page boot. Wait for it to be ready before clicking
  // anything, otherwise the boot overlay will intercept the click.
  await page.waitForFunction(
    () => window.__knitstitchSketchService?._slvsAdapter?.ready === true,
    null,
    { timeout: 120000 },
  );

  await page.getByRole('button', { name: 'Sketch' }).click();
  await page.getByRole('button', { name: 'Line' }).click();

  // Make sure the origin anchor at (0, 0) exists so every test shape can be
  // drawn from a fixed reference point.
  await page.evaluate(() => {
    const service = window.__knitstitchSketchService;
    if (service?.ensureOriginAnchor) {
      service.ensureOriginAnchor();
    }
  });

  // Konva's getRelativePointerPosition() calculates pointer coordinates
  // relative to the inner .konvajs-content div (not #konva-stage itself),
  // using getBoundingClientRect() on that content div. The canvas can be
  // offset from #konva-stage by flexbox centering and borders, so we must
  // use the content div's rect as the click origin.
  const canvas = page.locator('#konva-stage canvas').first();
  await expect(canvas).toBeVisible();

  const box = await page.evaluate(() => {
    const stage = document.getElementById('konva-stage');
    const content = stage?.querySelector('.konvajs-content');
    const el = content ?? stage;
    const rect = el.getBoundingClientRect();
    const store = window.__knitstitchStore;
    const panX = store?.get('panOffsetX') ?? rect.width / 2;
    const panY = store?.get('panOffsetY') ?? rect.height / 2;
    const scale = store?.get('zoomLevel') ?? 1;
    return {
      x: Math.round(rect.left + panX),
      y: Math.round(rect.top + panY),
      width: rect.width,
      height: rect.height,
      scale,
    };
  });

  return box;
}

/**
 * Click a point on the stage, accounting for canvas offset and zoom scale.
 */
export async function clickStage(page, box, point) {
  await page.mouse.click(box.x + point.x * box.scale, box.y + point.y * box.scale);
}

/**
 * Drag from one stage point to another, with intermediate steps.
 */
export async function dragStage(page, box, from, to) {
  await page.mouse.move(box.x + from.x * box.scale, box.y + from.y * box.scale);
  await page.mouse.down();
  await page.mouse.move(box.x + to.x * box.scale, box.y + to.y * box.scale, { steps: 12 });
  await page.mouse.up();
}
