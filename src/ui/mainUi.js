import { setupGridPanel } from './gridPanelController.js';
import { setupSketchPanel } from './sketchPanelController.js';
import { setupOverlayPanel } from './overlayPanelController.js';
import { setupTemplatePanel } from './templatePanelController.js';
import { setupZoomController } from './zoomController.js';
import { setupKeyboardController } from './keyboardController.js';

/**
 * Thin orchestrator that wires up each panel controller and returns the
 * shared API needed by main.js (recalculateSize, syncAll).
 *
 * Each panel controller owns its own refs, event bindings, and store
 * subscriptions. This function just calls them in order and connects
 * the cross-panel syncAll helper.
 */
export function setupMainUi({ store, sketchService, documentObj = globalThis.document, windowObj = globalThis.window }) {
  const grid = setupGridPanel({ store, documentObj });
  const sketch = setupSketchPanel({ store, sketchService, documentObj });
  const overlay = setupOverlayPanel({ store, documentObj });
  const template = setupTemplatePanel({ store, sketchService, documentObj });
  const zoom = setupZoomController({ store, documentObj });
  setupKeyboardController({ store, sketchService, documentObj });

  function syncAll() {
    grid.updateGridSidebar();
    sketch.updateSketchSidebar();
    overlay.updateOverlaySidebar();
    template.updateTemplatesSidebar();
    zoom.updateZoomDisplay();
    template.updateMeasurementsPanelVisibility();
  }

  // Cross-panel subscription: sketch line changes trigger recalculation
  // and grid sidebar update (sketch fills affect the grid display).
  store.subscribe((path) => {
    if (path === 'sketch.lines' || path === 'sketch.isActive') {
      grid.recalculateSize();
      grid.updateGridSidebar();
    }
  });

  // Wrap the global setWorkspace so workspace switches update store state
  // and sketch service activation.
  if (windowObj && typeof windowObj.setWorkspace === 'function') {
    const originalSetWorkspace = windowObj.setWorkspace;
    windowObj.setWorkspace = function (ws, btn) {
      if (originalSetWorkspace) originalSetWorkspace.call(this, ws, btn);
      store.set('currentWorkspace', ws);
      sketchService.isActive = ws === 'sketch' || ws === 'templates';
    };
  }

  return {
    recalculateSize: grid.recalculateSize,
    syncAll,
    updateGridSidebar: grid.updateGridSidebar,
    updateSketchSidebar: sketch.updateSketchSidebar,
    updateOverlaySidebar: overlay.updateOverlaySidebar,
    updateTemplatesSidebar: template.updateTemplatesSidebar,
    updateZoomDisplay: zoom.updateZoomDisplay,
    updateMeasurementsPanelVisibility: template.updateMeasurementsPanelVisibility,
  };
}
