import { bindIfPresent } from './uiUtils.js';
import { SketchTool } from '../services/sketch/constants.js';

// Single-letter hotkeys → tool / constraint sub-mode.
// Follows Fusion 360 sketch shortcuts where practical.
const TOOL_HOTKEYS = {
  'l': SketchTool.Line,
  'd': SketchTool.Dimension,
};

const CONSTRAINT_HOTKEYS = {
  'p': 'Perpendicular',
  'm': 'Midpoint',
  'e': 'Equal',
  'h': 'HorizontalVertical',
  'v': 'HorizontalVertical',
  'c': 'Coincident',
};

/**
 * Owns keyboard shortcuts:
 *   Esc      — exit to Select tool
 *   Del      — delete current sketch selection
 *   L        — Line tool
 *   D        — Dimension tool
 *   P        — Perpendicular constraint
 *   M        — Midpoint constraint
 *   E        — Equal length constraint
 *   H / V    — Horizontal/Vertical constraint
 *   C        — Coincident constraint
 */
export function setupKeyboardController({ store, sketchService, documentObj = globalThis.document }) {
  bindIfPresent(documentObj, 'keydown', (e) => {
    if (e.key === 'Escape') {
      sketchService.exitToSelect();
      return;
    }

    // Ignore hotkeys when editing a text field
    const activeEl = documentObj.activeElement;
    const isEditingField = !!activeEl && (
      activeEl.tagName === 'INPUT'
      || activeEl.tagName === 'TEXTAREA'
      || activeEl.tagName === 'SELECT'
      || activeEl.isContentEditable
    );
    if (isEditingField) return;

    if (e.key === 'Delete') {
      if (!store.get('sketch.isActive')) return;
      if (!sketchService.hasSelection) return;
      e.preventDefault();
      sketchService.deleteSelected();
      return;
    }

    // Tool hotkeys only apply in the sketch workspace
    if (!store.get('sketch.isActive')) return;

    const key = e.key.toLowerCase();
    if (TOOL_HOTKEYS[key]) {
      e.preventDefault();
      sketchService.activeTool = TOOL_HOTKEYS[key];
      return;
    }

    if (CONSTRAINT_HOTKEYS[key]) {
      e.preventDefault();
      sketchService.activeTool = SketchTool.Constraint;
      sketchService.constraintSubMode = CONSTRAINT_HOTKEYS[key];
      return;
    }
  });
}
