// AppStage.js - Stage + layer composition + event wiring

import Konva from 'konva';
import { GridLayer } from './gridLayer.js';
import { OverlayLayer } from './overlayLayer.js';
import { SketchLayer } from './sketchLayer.js';

export class AppStage {
  constructor(containerId, store, sketchService) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`AppStage: container #${containerId} not found`);
    }

    this.store = store;
    this.sketchService = sketchService;
    this._resizeObserver = null;

    this.stage = new Konva.Stage({
      container: this.container,
      width: 1,
      height: 1,
    });

    this.gridLayer = new GridLayer(store);
    this.overlayLayer = new OverlayLayer(store);
    this.sketchLayer = new SketchLayer(store, sketchService);

    this.gridLayer.mount(this.stage);
    this.overlayLayer.mount(this.stage);
    this.sketchLayer.mount(this.stage);

    // Z-index: grid (0), overlay (1), sketch (2)
    this.gridLayer.layer.zIndex(0);
    this.overlayLayer.layer.zIndex(1);
    this.sketchLayer.layer.zIndex(2);

    this._fitStageToContainer();
    this.gridLayer.redraw();
    this.sketchService.ensureOriginAnchor();
    this._centerViewportOnOrigin();
    this._applyZoomPan();
    this._setupResizeObserver();

    // Re-apply zoom/pan when zoom state changes
    this._unsubscribe = store.subscribe((path) => {
      if (
        path === 'zoomLevel' ||
        path === 'panOffsetX' ||
        path === 'panOffsetY'
      ) {
        this._applyZoomPan();
      }
    });
  }

  /**
   * Pan the viewport so the content origin (0, 0) is at the centre of the stage.
   * This makes the default anchor point visible in the middle of the grid.
   */
  _centerViewportOnOrigin() {
    const stageW = this.stage.width();
    const stageH = this.stage.height();
    if (stageW > 0 && stageH > 0) {
      this.store.set('panOffsetX', stageW / 2);
      this.store.set('panOffsetY', stageH / 2);
    }
  }

  /**
   * Size the Konva stage to fill its container (the viewport).
   * The grid content is then zoomed/panned within this viewport.
   */
  _fitStageToContainer() {
    const parent = this.container.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w > 0 && h > 0) {
      this.stage.width(w);
      this.stage.height(h);
      this.stage.batchDraw();
    }
  }

  /**
   * Apply the current zoom level and pan offset from the store to the stage.
   * Each layer's content is drawn in unscaled coordinates; the stage scale
   * and position handle the viewport transform.
   */
  _applyZoomPan() {
    const level = this.store.get('zoomLevel');
    const panX = this.store.get('panOffsetX');
    const panY = this.store.get('panOffsetY');
    this.stage.scale({ x: level, y: level });
    this.stage.position({ x: panX, y: panY });
    this.stage.batchDraw();
  }

  _setupResizeObserver() {
    const parent = this.container.parentElement;
    if (!parent || !window.ResizeObserver) return;

    this._resizeObserver = new ResizeObserver(() => {
      this._fitStageToContainer();
      this.gridLayer.redraw();
    });
    this._resizeObserver.observe(parent);
  }

  destroy() {
    this._unsubscribe();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
    this.gridLayer.destroy();
    this.overlayLayer.destroy();
    this.sketchLayer.destroy();
    this.stage.destroy();
  }
}
