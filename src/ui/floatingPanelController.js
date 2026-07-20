// floatingPanelController.js - Collapse/expand behavior for floating panels.
//
// Each floating panel has a header with a toggle button. Clicking the header
// (or the toggle) collapses/expands the panel body. The collapsed state is
// persisted per panel in localStorage so it survives page reloads.

const STORAGE_PREFIX = 'knitstitch.floatingPanel.';
const COLLAPSED_CLASS = 'collapsed';
const HEADER_SELECTOR = '.floating-panel-header';

export function setupFloatingPanels({
  documentObj = globalThis.document,
  windowObj = globalThis.window,
} = {}) {
  function loadCollapsed(panelId) {
    try {
      return windowObj.localStorage.getItem(STORAGE_PREFIX + panelId) === '1';
    } catch {
      return false;
    }
  }

  function saveCollapsed(panelId, collapsed) {
    try {
      windowObj.localStorage.setItem(STORAGE_PREFIX + panelId, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  function initPanel(panel) {
    if (panel.dataset.floatingInit) return;
    panel.dataset.floatingInit = '1';

    if (loadCollapsed(panel.id)) {
      panel.classList.add(COLLAPSED_CLASS);
    }

    const header = panel.querySelector(HEADER_SELECTOR);
    if (!header) return;

    header.addEventListener('click', () => {
      const collapsed = panel.classList.toggle(COLLAPSED_CLASS);
      saveCollapsed(panel.id, collapsed);
    });
  }

  documentObj.querySelectorAll('.floating-panel').forEach(initPanel);

  return { initPanel };
}
