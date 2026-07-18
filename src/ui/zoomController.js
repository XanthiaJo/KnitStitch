import {
  ZOOM_STEP,
  fitToView,
  resetView,
  zoomAt,
  zoomCentered,
} from '../services/zoomService.js';
import { computeFilledCellsFromSketch } from '../services/sketch/fill/closedShapeFill.js';
import { getCombinedBoundingBox } from '../services/gridService.js';
import { collectRefs, bindIfPresent } from './uiUtils.js';

const REF_IDS = {
  zoomInBtn: 'zoom-in',
  zoomOutBtn: 'zoom-out',
  zoomFitBtn: 'zoom-fit',
  zoomResetBtn: 'zoom-reset',
  zoomLevelDisplay: 'zoom-level',
  konvaStage: 'konva-stage',
};

/**
 * Owns zoom/pan controls: zoom in/out/fit/reset buttons, wheel zoom,
 * right-mouse drag pan, and the zoom level display.
 */
export function setupZoomController({ store, documentObj = globalThis.document }) {
  const refs = collectRefs(documentObj, REF_IDS);

  function updateZoomDisplay() {
    const level = store.get('zoomLevel');
    if (refs.zoomLevelDisplay) {
      refs.zoomLevelDisplay.textContent = `${Math.round(level * 100)}%`;
    }
  }

  function applyZoomResult(result) {
    store.set('zoomLevel', result.zoomLevel);
    store.set('panOffsetX', result.panOffsetX);
    store.set('panOffsetY', result.panOffsetY);
  }

  function getViewportSize() {
    if (!refs.konvaStage) return { w: 600, h: 400 };
    const el = refs.konvaStage;
    return { w: el.clientWidth, h: el.clientHeight };
  }

  function getGridPixelSize() {
    const cellW = store.get('cellWidthPx');
    const cellH = store.get('cellHeightPx');
    const filledCells = store.get('filledCells');
    const sketchFilled = computeFilledCellsFromSketch(
      store.get('sketch.lines'),
      cellW,
      cellH,
      store.get('fillThreshold'),
    );
    const bbox = getCombinedBoundingBox(filledCells, sketchFilled);
    if (!bbox) return { w: 0, h: 0 };
    const w = (bbox.maxCol - bbox.minCol + 1) * cellW;
    const h = (bbox.maxRow - bbox.minRow + 1) * cellH;
    return { w, h };
  }

  bindIfPresent(refs.zoomInBtn, 'click', () => {
    const { w, h } = getViewportSize();
    applyZoomResult(zoomCentered(
      store.get('zoomLevel'), store.get('panOffsetX'), store.get('panOffsetY'),
      w, h, ZOOM_STEP,
    ));
  });

  bindIfPresent(refs.zoomOutBtn, 'click', () => {
    const { w, h } = getViewportSize();
    applyZoomResult(zoomCentered(
      store.get('zoomLevel'), store.get('panOffsetX'), store.get('panOffsetY'),
      w, h, 1 / ZOOM_STEP,
    ));
  });

  bindIfPresent(refs.zoomResetBtn, 'click', () => {
    applyZoomResult(resetView());
  });

  bindIfPresent(refs.zoomFitBtn, 'click', () => {
    const { w: vw, h: vh } = getViewportSize();
    const { w: gw, h: gh } = getGridPixelSize();
    applyZoomResult(fitToView(gw, gh, vw, vh));
  });

  // Mouse-wheel zoom toward cursor
  bindIfPresent(refs.konvaStage, 'wheel', (e) => {
    e.preventDefault();
    const rect = refs.konvaStage.getBoundingClientRect();
    const focal = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    applyZoomResult(zoomAt(
      store.get('zoomLevel'), store.get('panOffsetX'), store.get('panOffsetY'),
      focal, factor,
    ));
  });

  // Right-mouse drag to pan
  let panState = null;
  bindIfPresent(refs.konvaStage, 'contextmenu', (e) => { e.preventDefault(); });
  bindIfPresent(refs.konvaStage, 'mousedown', (e) => {
    if (e.button !== 2) return;
    e.preventDefault();
    panState = { startX: e.clientX, startY: e.clientY, panX: store.get('panOffsetX'), panY: store.get('panOffsetY') };
  });
  bindIfPresent(refs.konvaStage, 'mousemove', (e) => {
    if (!panState) return;
    store.set('panOffsetX', panState.panX + (e.clientX - panState.startX));
    store.set('panOffsetY', panState.panY + (e.clientY - panState.startY));
  });
  bindIfPresent(documentObj, 'mouseup', () => { panState = null; });

  store.subscribe((path) => {
    if (path === 'zoomLevel') {
      updateZoomDisplay();
    }
  });

  return { updateZoomDisplay };
}
