// floatingPanelResizer.js - Horizontal resize drag handle for the right-hand
// floating panels. Changes a CSS custom property so every panel resizes
// together, and persists the width in localStorage.

const STORAGE_KEY = 'knitstitch.floating-panel-width';
const MIN_WIDTH = 180;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 300;
const PROPERTY_NAME = '--floating-panel-width';

export function setupFloatingPanelResizer({
  documentObj = globalThis.document,
  windowObj = globalThis.window,
} = {}) {
  function getInitialWidth() {
    try {
      const stored = windowObj.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const w = Number.parseInt(stored, 10);
        if (Number.isFinite(w)) return w;
      }
    } catch { /* ignore */ }
    return DEFAULT_WIDTH;
  }

  function setWidth(px) {
    const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, px));
    const value = `${clamped}px`;
    if (documentObj.body) {
      documentObj.body.style.setProperty(PROPERTY_NAME, value);
    }
    try {
      windowObj.localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch { /* ignore */ }
    return clamped;
  }

  const startWidth = setWidth(getInitialWidth());

  function onPointerDown(e) {
    const handle = e.target.closest('.floating-panel-resizer');
    if (!handle) return;

    const panel = handle.closest('.floating-panel');
    if (!panel) return;

    e.preventDefault();
    handle.classList.add('is-active');
    const startX = e.clientX;
    const rect = panel.getBoundingClientRect();
    const startingWidth = rect.width;

    function onPointerMove(moveEvent) {
      const delta = startX - moveEvent.clientX;
      setWidth(startingWidth + delta);
    }

    function onPointerUp() {
      handle.classList.remove('is-active');
      documentObj.removeEventListener('pointermove', onPointerMove);
      documentObj.removeEventListener('pointerup', onPointerUp);
      documentObj.body.classList.remove('is-panel-resizing');
    }

    documentObj.addEventListener('pointermove', onPointerMove);
    documentObj.addEventListener('pointerup', onPointerUp);
    documentObj.body.classList.add('is-panel-resizing');
  }

  documentObj.addEventListener('pointerdown', onPointerDown);

  return { setWidth, getInitialWidth, startWidth };
}
