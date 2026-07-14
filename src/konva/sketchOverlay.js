import { ERROR_COLOR } from '../services/sketch/render/styleOptions.js';

/**
 * Manages the floating DOM overlays for the sketch canvas: the dimension
 * edit input and the transient cursor error message.
 *
 * Extracted from SketchLayer so the layer stays focused on Konva rendering.
 * The overlay only needs the store (for zoom/pan projection) and the stage
 * (to compute screen coordinates from canvas-space positions).
 *
 * The dim-edit overlay uses the CSS classes defined in app.css
 * (#dim-edit-overlay, .dim-edit-overlay__*) so its appearance stays
 * consistent with the rest of the site palette.
 */
export class SketchOverlay {
  constructor(store) {
    this.store = store;
  }

  showDimEdit(pendingEdit, stage) {
    this.hideDimEdit();
    const canvasRect = this._getCanvasRect(stage);
    if (!canvasRect) return;

    const screen = this._toScreen(pendingEdit.labelPos, canvasRect);

    const el = document.createElement('div');
    el.id = 'dim-edit-overlay';
    el.style.left = `${screen.x}px`;
    el.style.top = `${screen.y - 52}px`;
    const unitLabel = pendingEdit.unitLabel || 'Distance (px):';
    el.innerHTML = `
      <span class="dim-edit-overlay__label">${unitLabel}</span>
      <div class="dim-edit-overlay__controls">
        <input id="dim-edit-input" class="dim-edit-overlay__input" type="number" min="0.1" step="0.1"
          value="${pendingEdit.initialText}" />
        <button id="dim-edit-confirm" class="dim-edit-overlay__button dim-edit-overlay__button--primary" title="Apply (Enter)">✓</button>
        <button id="dim-edit-cancel" class="dim-edit-overlay__button" title="Cancel (Esc)">✕</button>
      </div>
      <span class="dim-edit-overlay__hint">Enter to apply, Esc to skip</span>
    `;
    document.body.appendChild(el);

    const input = el.querySelector('#dim-edit-input');
    const confirmBtn = el.querySelector('#dim-edit-confirm');
    const cancelBtn = el.querySelector('#dim-edit-cancel');

    const confirm = () => {
      const v = parseFloat(input.value);
      if (v > 0) pendingEdit.onConfirm(v);
      else pendingEdit.onCancel();
    };
    const cancel = () => pendingEdit.onCancel();

    confirmBtn.addEventListener('click', confirm);
    cancelBtn.addEventListener('click', cancel);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confirm(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });

    requestAnimationFrame(() => { input.focus(); input.select(); });
  }

  hideDimEdit() {
    const el = document.getElementById('dim-edit-overlay');
    if (el) el.remove();
  }

  showCursorMessage(message, stage) {
    this.hideCursorMessage();
    if (!message || !message.position) return;

    const canvasRect = this._getCanvasRect(stage);
    if (!canvasRect) return;

    const screen = this._toScreen(message.position, canvasRect);

    const msg = document.createElement('div');
    msg.id = 'knitstitch-cursor-message';
    msg.style.cssText = `
      position: fixed;
      left: ${screen.x + 12}px;
      top: ${screen.y - 28}px;
      background: ${ERROR_COLOR};
      color: white;
      font-size: 12px;
      font-family: 'Open Sans', sans-serif;
      padding: 4px 8px;
      border-radius: 4px;
      pointer-events: none;
      white-space: nowrap;
      z-index: 10000;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    `;
    msg.textContent = message.text;
    document.body.appendChild(msg);
  }

  hideCursorMessage() {
    const el = document.getElementById('knitstitch-cursor-message');
    if (el) el.remove();
  }

  destroy() {
    this.hideDimEdit();
    this.hideCursorMessage();
  }

  _getCanvasRect(stage) {
    const container = stage?.container?.();
    if (!container) return null;
    return container.querySelector('canvas')?.getBoundingClientRect()
      ?? container.getBoundingClientRect();
  }

  _toScreen(point, canvasRect) {
    const level = this.store.get('zoomLevel');
    const panX = this.store.get('panOffsetX');
    const panY = this.store.get('panOffsetY');
    return {
      x: canvasRect.left + point.x * level + panX,
      y: canvasRect.top + point.y * level + panY,
    };
  }
}
