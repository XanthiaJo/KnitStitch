import { SketchTool } from '../constants.js';
import { AnchorTool } from './anchorTool.js';
import { ConstraintTool } from './constraintTool.js';
import { DimensionTool } from './dimensionTool.js';
import { LineTool } from './lineTool.js';
import { CircleTool } from './circleTool.js';
import { RectangleTool } from './rectangleTool.js';
import { TemplateTool } from '../templates/templateTool.js';

/**
 * Registry of sketch tools. Each active tool handles pointer input for its
 * workspace mode, keeping SketchService focused on high-level coordination.
 */
export class ToolRegistry {
  constructor(service) {
    this.service = service;

    this._lineTool = new LineTool(service);
    this._dimensionTool = new DimensionTool(service);
    this._constraintTool = new ConstraintTool(service);
    this._anchorTool = new AnchorTool(service);
    this._circleTool = new CircleTool(service);
    this._rectangleTool = new RectangleTool(service);
    this.templateTool = new TemplateTool(service);

    this._tools = new Map([
      [SketchTool.Line, this._lineTool],
      [SketchTool.ConstructionLine, this._lineTool],
      [SketchTool.Dimension, this._dimensionTool],
      [SketchTool.Constraint, this._constraintTool],
      [SketchTool.Anchor, this._anchorTool],
      [SketchTool.Circle, this._circleTool],
      [SketchTool.Rectangle, this._rectangleTool],
    ]);
  }

  getTool(kind) {
    return this._tools.get(kind) ?? null;
  }

  onCanvasClick(position, modifiers = {}) {
    if (!this.service.isActive) return;
    if (this.service._suppressNextClick) {
      this.service._suppressNextClick = false;
      return;
    }
    const tool = this.service.activeTool;
    switch (tool) {
      case SketchTool.Select:
        this.service.clearSelection();
        break;
      case SketchTool.Line:
      case SketchTool.ConstructionLine:
        this._lineTool.onLineClick(position, modifiers);
        break;
      case SketchTool.Dimension:
        this._dimensionTool.onDimensionClick(position, modifiers);
        break;
      case SketchTool.Constraint:
        this._constraintTool.onConstraintClick(position, modifiers);
        break;
      case SketchTool.Anchor:
        this._anchorTool.onClick(position, modifiers);
        break;
      case SketchTool.Circle:
        this._circleTool.onCircleClick(position, modifiers);
        break;
      case SketchTool.Rectangle:
        this._rectangleTool.onRectangleClick(position, modifiers);
        break;
    }
  }

  onCanvasMouseMove(position, modifiers = {}) {
    if (!this.service.isActive) return;
    const tool = this.service.activeTool;
    switch (tool) {
      case SketchTool.Line:
      case SketchTool.ConstructionLine:
        this._lineTool.onLineMouseMove(position, modifiers);
        break;
      case SketchTool.Select:
        this.service._onSelectMouseMove(position, modifiers);
        break;
      case SketchTool.Dimension:
        this.service._setSnapCandidate(this.service._findNearestPoint(position, modifiers.snapEnabled !== false));
        break;
      case SketchTool.Constraint:
        this.service._setSnapCandidate(null);
        break;
      case SketchTool.Anchor:
        this._anchorTool.onMouseMove(position, modifiers);
        break;
      case SketchTool.Circle:
        this._circleTool.onCircleMouseMove(position, modifiers);
        break;
      case SketchTool.Rectangle:
        this._rectangleTool.onRectangleMouseMove(position, modifiers);
        break;
    }
  }

  onCanvasMouseDown(position, modifiers = {}) {
    if (!this.service.isActive) return;
    const tool = this.service.activeTool;
    if (tool === SketchTool.Select) {
      return this.service.startDrag(position, modifiers);
    }
  }

  onLineClick(line, position, modifiers = {}) {
    if (!this.service.isActive) return;
    const multiSelect = modifiers.multiSelect ?? false;
    const tool = this.service.activeTool;
    switch (tool) {
      case SketchTool.Select:
        this.service.selectLine(line, multiSelect);
        return;
      case SketchTool.Constraint:
        this._constraintTool.onConstraintLineClick(line, multiSelect, position);
        return;
    }
    this.service.onCanvasClick(position, modifiers);
  }

  onPointClick(pt, position, modifiers = {}) {
    if (!this.service.isActive) return;
    const multiSelect = modifiers.multiSelect ?? false;
    const tool = this.service.activeTool;
    switch (tool) {
      case SketchTool.Select:
        this.service.selectPoint(pt, multiSelect);
        return;
      case SketchTool.Constraint:
        this._constraintTool.onConstraintPointClick(pt, multiSelect, position);
        return;
      case SketchTool.Anchor:
        this._anchorTool.convertToAnchor(pt);
        return;
    }
    this.service.onCanvasClick(position ?? { x: pt.x, y: pt.y }, modifiers);
  }

  onRightMouseDown() {
    if (!this.service.isActive) return;
    this.service._suppressNextClick = true;
  }
}
