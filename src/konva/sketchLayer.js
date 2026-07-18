import Konva from 'konva';
import {
  DEFAULT_STROKE_COLOR,
  DEFAULT_STROKE_THICKNESS,
  getColorTriplet,
} from '../services/sketch/render/styleOptions.js';
import { SketchOverlay } from './sketchOverlay.js';
import { renderConstraintIcons } from './constraintIcons.js';
import { renderDimensions } from './dimensionRenderer.js';
import { hitTestSketch } from './sketchHitTest.js';
import { renderSketchEntities } from './sketchEntityRenderer.js';
import { renderPreviews } from './sketchPreviewRenderer.js';
import { setupSketchStageEvents } from './sketchStageEvents.js';

const RENDER_TRIGGERS = new Set([
  'sketch.lines',
  'sketch.points',
  'sketch.circles',
  'sketch.beziers',
  'sketch.previewLine',
  'sketch.previewCircle',
  'sketch.previewRectangle',
  'sketch.previewBezier',
  'sketch.snapCandidate',
  'sketch.strokeColor',
  'sketch.strokeThickness',
  'sketch.isActive',
  'sketch.activeTool',
  'sketch.dimensions',
  'sketch.constraints',
  'sketch.pendingDimEdit',
  'zoomLevel',
  'panOffsetX',
  'panOffsetY',
]);

/**
 * Renders the sketch (points, lines, circles, béziers, dimensions, constraint
 * icons, previews, and the snap highlight) and captures all canvas
 * interactions, forwarding them to SketchService.
 *
 * This class is a thin orchestrator: hit-testing, entity rendering, preview
 * rendering, and stage event wiring each live in their own modules
 * (`sketchHitTest.js`, `sketchEntityRenderer.js`, `sketchPreviewRenderer.js`,
 * `sketchStageEvents.js`). Dimension and constraint rendering were already
 * extracted (`dimensionRenderer.js`, `constraintIcons.js`).
 */
export class SketchLayer {
  constructor(store, sketchService) {
    this.store = store;
    this.service = sketchService;
    this.layer = new Konva.Layer({ name: 'sketchLayer', listening: false });
    this._overlay = new SketchOverlay(store);
    this._events = null;
    this._unsubscribe = store.subscribe((path) => this._onStoreChange(path));
  }

  mount(stage) {
    stage.add(this.layer);
    this._events = setupSketchStageEvents(
      stage,
      this.store,
      this.service,
      (pos) => hitTestSketch(pos, this.store.state.sketch, this.service),
    );
    this._render();
  }

  destroy() {
    this._unsubscribe();
    this._events?.destroy();
    this._overlay.destroy();
    this.layer.destroy();
  }

  _onStoreChange(path) {
    if (RENDER_TRIGGERS.has(path)) {
      this._render();
    }
    if (path === 'sketch.cursorMessage') {
      this._overlay.showCursorMessage(this.store.get('sketch.cursorMessage'), this.layer.getStage());
    }
  }

  _render() {
    this.layer.destroyChildren();
    const sketch = this.store.state.sketch;

    const color = sketch.strokeColor || DEFAULT_STROKE_COLOR;
    const triplet = getColorTriplet(color);
    const thickness = sketch.strokeThickness || DEFAULT_STROKE_THICKNESS;

    const group = new Konva.Group();

    renderSketchEntities(group, sketch, {
      triplet,
      color,
      thickness,
      activeTool: sketch.activeTool,
      getStage: () => this.layer.getStage(),
      service: this.service,
    });

    renderPreviews(group, {
      isActive: sketch.isActive,
      previewLine: sketch.previewLine,
      previewCircle: sketch.previewCircle,
      previewRectangle: sketch.previewRectangle,
      previewBezier: sketch.previewBezier,
      snapCandidate: sketch.snapCandidate,
    }, { thickness });

    const pendingEdit = this.store.get('sketch.pendingDimEdit');
    renderDimensions(group, sketch.dimensions || [], pendingEdit, this.service);
    renderConstraintIcons(group, sketch.constraints || [], this.service);

    // Floating dim-edit input overlay
    if (pendingEdit) {
      this._overlay.showDimEdit(pendingEdit, this.layer.getStage());
    } else {
      this._overlay.hideDimEdit();
    }

    this.layer.add(group);
    this.layer.batchDraw();
  }
}
