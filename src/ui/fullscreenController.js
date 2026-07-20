// fullscreenController.js - App-level canvas fullscreen toggle.
//
// Toggles a body class that hides the top site headers and expands the
// .shell to full width. The tool ribbon, vertical workspace tabs, floating
// panels, and footer remain visible. The Konva stage auto-resizes via its
// ResizeObserver, so no manual resize call is needed.
//
// The toggle button lives in the zoom control panel. Esc also exits.

import { collectRefs, bindIfPresent } from './uiUtils.js';

const FULLSCREEN_CLASS = 'is-canvas-fullscreen';
const ENTER_ICON = '\u26F6'; // ⛶ — square four corners
const EXIT_ICON = '\u29C9';  // ⧉ — reuse the "fit" glyph as a restore cue

const REF_IDS = {
  toggleBtn: 'canvas-fullscreen',
};

export function setupFullscreenController({
  documentObj = globalThis.document,
} = {}) {
  const refs = collectRefs(documentObj, REF_IDS);

  function isFullscreen() {
    return documentObj.body.classList.contains(FULLSCREEN_CLASS);
  }

  function updateButton() {
    if (!refs.toggleBtn) return;
    refs.toggleBtn.textContent = isFullscreen() ? EXIT_ICON : ENTER_ICON;
    refs.toggleBtn.title = isFullscreen()
      ? 'Exit fullscreen canvas'
      : 'Fullscreen canvas';
  }

  function enter() {
    if (isFullscreen()) return;
    documentObj.body.classList.add(FULLSCREEN_CLASS);
    updateButton();
  }

  function exit() {
    if (!isFullscreen()) return;
    documentObj.body.classList.remove(FULLSCREEN_CLASS);
    updateButton();
  }

  function toggle() {
    if (isFullscreen()) exit();
    else enter();
  }

  bindIfPresent(refs.toggleBtn, 'click', toggle);

  // Esc exits fullscreen (but only when fullscreen is active, so we don't
  // swallow Esc from other handlers like the sketch tool cancel).
  bindIfPresent(documentObj, 'keydown', (e) => {
    if (e.key === 'Escape' && isFullscreen()) {
      e.preventDefault();
      exit();
    }
  });

  return { enter, exit, toggle, isFullscreen };
}
