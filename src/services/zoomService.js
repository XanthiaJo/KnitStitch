/**
 * Zoom and pan logic for the Konva stage viewport.
 *
 * The stage is scaled by `zoomLevel` and translated by `panOffsetX/Y` (in
 * screen pixels). All sketch/grid coordinates are stored in unscaled space;
 * these helpers convert between screen space (pointer position) and content
 * space (sketch/grid coordinates).
 */

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5.0;
export const ZOOM_STEP = 1.2; // each button click multiplies/divides by this

function clampZoom(level) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level));
}

/**
 * Zoom in or out by one step, keeping the given focal point fixed in content
 * space. The focal point is the screen-space point that should stay under the
 * cursor after zooming (e.g. the mouse position).
 *
 * @param {number} level - current zoom level
 * @param {number} panX - current pan offset X (screen px)
 * @param {number} panY - current pan offset Y (screen px)
 * @param {{x:number,y:number}} focalScreen - focal point in screen px
 * @param {number} factor - zoom multiplier (>1 zooms in, <1 zooms out)
 * @returns {{zoomLevel:number,panOffsetX:number,panOffsetY:number}}
 */
export function zoomAt(level, panX, panY, focalScreen, factor) {
  const newLevel = clampZoom(level * factor);
  if (newLevel === level) {
    return { zoomLevel: level, panOffsetX: panX, panOffsetY: panY };
  }
  // Keep the focal point fixed: contentPoint = (screenPoint - pan) / level
  // After zoom: screenPoint = contentPoint * newLevel + newPan
  // => newPan = screenPoint - contentPoint * newLevel
  const contentX = (focalScreen.x - panX) / level;
  const contentY = (focalScreen.y - panY) / level;
  return {
    zoomLevel: newLevel,
    panOffsetX: focalScreen.x - contentX * newLevel,
    panOffsetY: focalScreen.y - contentY * newLevel,
  };
}

/**
 * Zoom in/out by one step centered on the viewport center.
 */
export function zoomCentered(level, panX, panY, viewportW, viewportH, factor) {
  return zoomAt(level, panX, panY, { x: viewportW / 2, y: viewportH / 2 }, factor);
}

/**
 * Pan by a delta in screen pixels.
 */
export function panBy(panX, panY, deltaX, deltaY) {
  return { panOffsetX: panX + deltaX, panOffsetY: panY + deltaY };
}

/**
 * Reset zoom to 100% and pan to origin.
 */
export function resetView() {
  return { zoomLevel: 1, panOffsetX: 0, panOffsetY: 0 };
}

/**
 * Fit the content (gridW x gridH) inside the viewport (viewW x viewH),
 * centered. Returns the zoom level and pan offset that achieve this.
 */
export function fitToView(gridW, gridH, viewW, viewH) {
  if (gridW <= 0 || gridH <= 0 || viewW <= 0 || viewH <= 0) {
    return resetView();
  }
  const scale = Math.min(viewW / gridW, viewH / gridH, 1);
  const level = clampZoom(scale);
  const contentW = gridW * level;
  const contentH = gridH * level;
  return {
    zoomLevel: level,
    panOffsetX: (viewW - contentW) / 2,
    panOffsetY: (viewH - contentH) / 2,
  };
}

/**
 * Convert a screen-space point (e.g. Konva pointer position) to content-space
 * coordinates, accounting for the current zoom and pan.
 *
 * @param {{x:number,y:number}} screenPos
 * @param {number} level
 * @param {number} panX
 * @param {number} panY
 * @returns {{x:number,y:number}}
 */
export function screenToContent(screenPos, level, panX, panY) {
  return {
    x: (screenPos.x - panX) / level,
    y: (screenPos.y - panY) / level,
  };
}
