import Konva from 'konva';
import { toggleCell } from '../services/gridService.js';
import { computeFilledCellsFromSketch } from '../services/sketch/fill/closedShapeFill.js';

const FILL_COLOR = '#ca9b52';
const GRID_PADDING = 2; // extra cells rendered beyond viewport edges
const PAN_REDRAW_MS = 16; // ~60fps cap for pan/zoom redraws

export class GridLayer {
  constructor(store) {
    this.store = store;
    this.layer = new Konva.Layer({ name: 'gridLayer', listening: false });
    this._offscreen = document.createElement('canvas');
    this._imageNode = new Konva.Image({
      image: this._offscreen,
      listening: false,
    });
    this.layer.add(this._imageNode);
    this._unsubscribe = store.subscribe((path) => this._onStoreChange(path));

    // Cache for sketch-derived filled cells. Only recomputed when sketch.lines
    // changes — pan/zoom redraws reuse the cached set.
    this._sketchFilledCache = null;
    this._sketchFilledKey = null;

    // Throttle state for pan/zoom redraws
    this._panRedrawPending = false;
    this._lastPanRedraw = 0;

    this._drawGrid();
  }

  mount(stage) {
    stage.add(this.layer);
    stage.on('click.grid tap.grid', (e) => {
      if (e.target !== stage) return;
      this._onGridClick(stage.getRelativePointerPosition(), e.evt);
    });
    this.layer.batchDraw();
  }

  /**
   * Redraws the grid. Called after the stage has been sized to fill
   * its container, so the viewport dimensions are correct.
   */
  redraw() {
    this._drawGrid();
  }

  destroy() {
    this._unsubscribe();
    this.layer.getStage()?.off('.grid');
    this.layer.destroy();
  }

  _onStoreChange(path) {
    if (
      path === 'cellWidthPx' ||
      path === 'cellHeightPx' ||
      path === 'filledCells' ||
      path === 'fillThreshold' ||
      path === 'sketch.lines' ||
      path === 'sketch.isActive' ||
      path === 'cellFillEnabled'
    ) {
      // Content changed — redraw immediately
      this._sketchFilledCache = null;
      this._drawGrid();
    } else if (
      path === 'zoomLevel' ||
      path === 'panOffsetX' ||
      path === 'panOffsetY'
    ) {
      // Viewport changed — throttle to avoid redrawing on every mousemove pixel
      this._schedulePanRedraw();
    }
  }

  _schedulePanRedraw() {
    if (this._panRedrawPending) return;
    const now = performance.now();
    const elapsed = now - this._lastPanRedraw;
    if (elapsed >= PAN_REDRAW_MS) {
      this._lastPanRedraw = now;
      this._drawGrid();
    } else {
      this._panRedrawPending = true;
      const delay = PAN_REDRAW_MS - elapsed;
      setTimeout(() => {
        this._panRedrawPending = false;
        this._lastPanRedraw = performance.now();
        this._drawGrid();
      }, delay);
    }
  }

  /**
   * Returns the stage dimensions, falling back to a default
   * if the stage is not yet mounted.
   */
  _getViewportSize() {
    const stage = this.layer.getStage();
    if (stage) {
      return { width: stage.width(), height: stage.height() };
    }
    return { width: 800, height: 600 };
  }

  /**
   * Calculates which cells are visible in the current viewport (accounting
   * for zoom and pan) and returns the cell range to render.
   */
  _getVisibleCellRange(cellW, cellH) {
    const zoom = this.store.get('zoomLevel') || 1;
    const panX = this.store.get('panOffsetX') || 0;
    const panY = this.store.get('panOffsetY') || 0;
    const { width, height } = this._getViewportSize();

    // Convert screen-space viewport corners to content-space cell indices
    const contentLeft = (-panX) / zoom;
    const contentTop = (-panY) / zoom;
    const contentRight = (width - panX) / zoom;
    const contentBottom = (height - panY) / zoom;

    const minCol = Math.floor(contentLeft / cellW) - GRID_PADDING;
    const maxCol = Math.ceil(contentRight / cellW) + GRID_PADDING;
    const minRow = Math.floor(contentTop / cellH) - GRID_PADDING;
    const maxRow = Math.ceil(contentBottom / cellH) + GRID_PADDING;

    return { minCol, maxCol, minRow, maxRow };
  }

  /**
   * Returns the cached sketch-filled cells, recomputing only when
   * sketch.lines has changed since the last call.
   */
  _getSketchFilled() {
    const lines = this.store.get('sketch.lines');
    const beziers = this.store.get('sketch.beziers') || [];
    // Flatten Béziers into line segments so they participate in closed-shape
    // detection and cell-fill calculations alongside regular sketch lines.
    const bezierSegments = [];
    for (const b of beziers) {
      const { start, control1, control2, end } = b;
      const segs = 24;
      let prevX = start.x, prevY = start.y;
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        const mt = 1 - t;
        const x = mt * mt * mt * start.x + 3 * mt * mt * t * control1.x + 3 * mt * t * t * control2.x + t * t * t * end.x;
        const y = mt * mt * mt * start.y + 3 * mt * mt * t * control1.y + 3 * mt * t * t * control2.y + t * t * t * end.y;
        bezierSegments.push({ start: { x: prevX, y: prevY }, end: { x, y }, isConstruction: false });
        prevX = x;
        prevY = y;
      }
    }
    const allLines = [...(lines || []), ...bezierSegments];
    // Use line count + a fingerprint of line endpoints so that moving
    // a point (without adding/removing lines) invalidates the cache.
    const fillThreshold = this.store.get('fillThreshold');
    let key = `threshold:${fillThreshold}`;
    if (allLines.length > 0) {
      let h = allLines.length;
      for (const l of allLines) {
        h = h * 31 + (Math.round(l.start.x) + Math.round(l.start.y) * 7 + Math.round(l.end.x) * 13 + Math.round(l.end.y) * 17);
      }
      key = String(h);
    }
    if (this._sketchFilledKey !== key || this._sketchFilledCache === null) {
      const cellW = this.store.get('cellWidthPx');
      const cellH = this.store.get('cellHeightPx');
      this._sketchFilledCache = computeFilledCellsFromSketch(allLines, cellW, cellH, this.store.get('fillThreshold'));
      this._sketchFilledKey = key;
    }
    return this._sketchFilledCache;
  }

  _drawGrid() {
    const cellW = this.store.get('cellWidthPx');
    const cellH = this.store.get('cellHeightPx');
    const filledCells = this.store.get('filledCells');
    const sketchFilled = this._getSketchFilled();

    const { minCol, maxCol, minRow, maxRow } = this._getVisibleCellRange(cellW, cellH);
    const cols = maxCol - minCol + 1;
    const rows = maxRow - minRow + 1;

    if (cols <= 0 || rows <= 0) return;

    const w = cols * cellW;
    const h = rows * cellH;
    const offsetX = minCol * cellW;
    const offsetY = minRow * cellH;

    this._offscreen.width = w;
    this._offscreen.height = h;
    const ctx = this._offscreen.getContext('2d');

    // Fill background once instead of per-cell fillRect
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Only fill the gold cells (typically a small fraction)
    ctx.fillStyle = FILL_COLOR;
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const key = `${r},${c}`;
        if (filledCells.has(key) || sketchFilled.has(key)) {
          const x = (c - minCol) * cellW;
          const y = (r - minRow) * cellH;
          ctx.fillRect(x, y, cellW, cellH);
        }
      }
    }

    // Draw all grid lines as a single path — one stroke() call
    ctx.beginPath();
    for (let c = 0; c <= cols; c++) {
      const x = c * cellW;
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
    }
    for (let r = 0; r <= rows; r++) {
      const y = r * cellH;
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
    }
    ctx.strokeStyle = '#bdbdbd';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Draw the crosshair (origin column and row) with a bolder line
    const originCol = -minCol;
    const originRow = -minRow;
    if (originCol >= 0 && originCol <= cols) {
      const x = originCol * cellW + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.strokeStyle = '#9a9a9a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (originRow >= 0 && originRow <= rows) {
      const y = originRow * cellH + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.strokeStyle = '#9a9a9a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }


    this._imageNode.width(w);
    this._imageNode.height(h);
    this._imageNode.x(offsetX);
    this._imageNode.y(offsetY);
    this.layer.batchDraw();
  }

  _onGridClick(pos, event) {
    // Grid clicks toggle cells only in Sketch workspace when the Fill
    // tool is active (cellFillEnabled). No other workspace allows fill.
    const ws = this.store.get('currentWorkspace');
    const fillEnabled = this.store.get('cellFillEnabled');
    if (ws !== 'sketch' || !fillEnabled || event?.button !== 0 || !pos) {
      return;
    }
    const cellW = this.store.get('cellWidthPx');
    const cellH = this.store.get('cellHeightPx');
    const c = Math.floor(pos.x / cellW);
    const r = Math.floor(pos.y / cellH);
    toggleCell(this.store, r, c);
  }
}
