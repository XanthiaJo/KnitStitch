import Konva from 'konva';
import {
  DEFAULT_STROKE_COLOR,
  DEFAULT_STROKE_THICKNESS,
  SELECTION_COLOR,
  PREVIEW_COLOR,
  getColorTriplet,
} from '../services/sketch/render/styleOptions.js';
import { SketchOverlay } from './sketchOverlay.js';
import { renderConstraintIcons } from './constraintIcons.js';
import { renderDimensions } from './dimensionRenderer.js';

const RENDER_TRIGGERS = new Set([
  'sketch.lines',
  'sketch.points',
  'sketch.previewLine',
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

export class SketchLayer {
  constructor(store, sketchService) {
    this.store = store;
    this.service = sketchService;
    this.layer = new Konva.Layer({ name: 'sketchLayer' });
    this._overlay = new SketchOverlay(store);
    this._unsubscribe = store.subscribe((path) => this._onStoreChange(path));
  }

  mount(stage) {
    stage.add(this.layer);
    this._setupEvents(stage);
    this._render();
  }

  destroy() {
    this._unsubscribe();
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

  _setupEvents(stage) {
    // Click on empty space → forward to VM
    stage.on('click tap', (e) => {
      if (!this.store.get('sketch.isActive')) return;
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;
      const target = e.target;
      if (target !== this.layer && target.getLayer() === this.layer) return;
      this.service.onCanvasClick({ x: pos.x, y: pos.y }, { snapEnabled: !e.evt.ctrlKey });
    });

    stage.on('mousemove', (e) => {
      if (!this.store.get('sketch.isActive')) return;
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;
      this.service.onCanvasMouseMove({ x: pos.x, y: pos.y }, { snapEnabled: !e.evt.ctrlKey });
    });

    stage.on('mousedown', (e) => {
      if (!this.store.get('sketch.isActive')) return;
      if (e.evt.button === 2) {
        this.service.onRightMouseDown();
        return;
      }
      if (e.evt.button === 1) return; // middle button = pan, handled by UI
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;
      this.service.onCanvasMouseDown({ x: pos.x, y: pos.y }, { snapEnabled: !e.evt.ctrlKey });
    });

    stage.on('mouseup', () => {
      if (!this.store.get('sketch.isActive')) return;
      this.service.onCanvasMouseUp();
      document.body.style.cursor = 'default';
    });

    // Right-click cancels current action and returns to Select tool
    stage.on('contextmenu', (e) => {
      if (!this.store.get('sketch.isActive')) return;
      e.evt.preventDefault();
      this.service.exitToSelect();
    });
  }

  _render() {
    this.layer.destroyChildren();
    const isActive = this.store.get('sketch.isActive');

    const lines = this.store.get('sketch.lines');
    const points = this.store.get('sketch.points');
    const dimensions = this.store.get('sketch.dimensions') || [];
    const constraints = this.store.get('sketch.constraints') || [];
    const preview = this.store.get('sketch.previewLine');
    const snap = this.store.get('sketch.snapCandidate');
    const color = this.store.get('sketch.strokeColor') || DEFAULT_STROKE_COLOR;
    const triplet = getColorTriplet(color);
    const thickness = this.store.get('sketch.strokeThickness') || DEFAULT_STROKE_THICKNESS;

    const group = new Konva.Group();

    // Committed lines
    for (const line of lines) {
      const kLine = new Konva.Line({
        points: [line.start.x, line.start.y, line.end.x, line.end.y],
        stroke: line.isSelected ? triplet.select : color,
        strokeWidth: line.isSelected ? thickness + 1 : thickness,
        dash: line.isConstruction ? [8, 6] : undefined,
        hitStrokeWidth: Math.max(10, thickness + 4),
        listening: true,
      });
      kLine.on('click tap', (e) => {
        e.cancelBubble = true;
        const pointer = this.layer.getStage()?.getRelativePointerPosition();
        const position = pointer ? { x: pointer.x, y: pointer.y } : null;
        this.service.onLineClick(line, position, {
          snapEnabled: !e.evt.ctrlKey,
          multiSelect: e.evt.ctrlKey,
        });
      });
      group.add(kLine);
    }

    const pointDisplayColor = triplet.select;

    // Points
    for (const pt of points) {
      const isSelectTool = this.store.get('sketch.activeTool') === 'Select';
      const isSelected = pt.isSelected;
      const isAnchor = pt.isAnchor;
      const size = isSelected ? 6 : isSelectTool ? 5 : 3;

      if (isAnchor) {
        // Anchor points render as squares to distinguish them
        const half = size;
        const anchorShape = new Konva.Rect({
          x: pt.x - half,
          y: pt.y - half,
          width: half * 2,
          height: half * 2,
          fill: isSelected ? pointDisplayColor : triplet.fill,
          stroke: isSelected ? pointDisplayColor : triplet.select,
          strokeWidth: isSelected ? 2 : 1,
          listening: true,
          hitStrokeWidth: 14,
        });
        anchorShape.on('click tap', (e) => {
          e.cancelBubble = true;
          const pointer = this.layer.getStage()?.getRelativePointerPosition();
          const position = pointer ? { x: pointer.x, y: pointer.y } : { x: pt.x, y: pt.y };
          this.service.onPointClick(pt, position, {
            snapEnabled: !e.evt.ctrlKey,
            multiSelect: e.evt.ctrlKey,
          });
        });
        if (isSelectTool) {
          anchorShape.on('mouseenter', () => { document.body.style.cursor = 'grab'; });
          anchorShape.on('mouseleave', () => { document.body.style.cursor = 'default'; });
          anchorShape.on('mousedown', (e) => {
            e.cancelBubble = true;
            document.body.style.cursor = 'grabbing';
            const pos = { x: pt.x, y: pt.y };
            this.service.startDrag(pos, { snapEnabled: !e.evt.ctrlKey });
          });
        }
        group.add(anchorShape);
      } else {
        const dot = new Konva.Circle({
          x: pt.x,
          y: pt.y,
          radius: size,
          fill: isSelected ? pointDisplayColor : triplet.fill,
          stroke: isSelected ? pointDisplayColor : null,
          strokeWidth: isSelected ? 1 : 0,
          listening: true,
          hitStrokeWidth: 14,
        });
        dot.on('click tap', (e) => {
          e.cancelBubble = true;
          const pointer = this.layer.getStage()?.getRelativePointerPosition();
          const position = pointer ? { x: pointer.x, y: pointer.y } : { x: pt.x, y: pt.y };
          this.service.onPointClick(pt, position, {
            snapEnabled: !e.evt.ctrlKey,
            multiSelect: e.evt.ctrlKey,
          });
        });
        if (isSelectTool) {
          dot.on('mouseenter', () => { document.body.style.cursor = 'grab'; });
          dot.on('mouseleave', () => { document.body.style.cursor = 'default'; });
          dot.on('mousedown', (e) => {
            e.cancelBubble = true;
            document.body.style.cursor = 'grabbing';
            const pos = { x: pt.x, y: pt.y };
            this.service.startDrag(pos, { snapEnabled: !e.evt.ctrlKey });
          });
        }
        group.add(dot);
      }
    }

    // Preview line (only shown when sketch input is active)
    if (isActive && preview) {
      const kPreview = new Konva.Line({
        points: [preview.start.x, preview.start.y, preview.end.x, preview.end.y],
        stroke: PREVIEW_COLOR,
        strokeWidth: thickness,
        dash: [5, 5],
        listening: false,
      });
      group.add(kPreview);
    }

    // Snap candidate highlight (only shown when sketch input is active)
    if (isActive && snap) {
      const ring = new Konva.Ring({
        x: snap.x,
        y: snap.y,
        innerRadius: 6,
        outerRadius: 10,
        fill: SELECTION_COLOR,
        listening: false,
      });
      group.add(ring);
    }

    const pendingEdit = this.store.get('sketch.pendingDimEdit');
    renderDimensions(group, dimensions, pendingEdit, this.service);
    renderConstraintIcons(group, constraints, this.service);

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
