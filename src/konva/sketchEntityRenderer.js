// sketchEntityRenderer.js — renders committed sketch entities (lines, circles,
// béziers, points) into a Konva group.
//
// Extracted from SketchLayer so the layer stays a thin orchestrator. Each
// renderer is a pure function that builds Konva shapes for one entity type
// and attaches the shared click/drag handlers. The layer passes a `ctx`
// object with the colour triplet, current stroke colour/thickness, the active
// tool (for point sizing + drag wiring), a `getStage()` accessor (for pointer
// position on click), and the sketch service (for selection/drag calls).
//
// Dimension and constraint rendering already live in their own modules
// (`dimensionRenderer.js`, `constraintIcons.js`); this module owns the
// first-class geometric entities only.

import Konva from 'konva';

const POINT_HIT_STROKE = 14;
const ENTITY_HIT_STROKE_FLOOR = 10;
const SELECT_TOOL = 'Select';

/**
 * Renders all committed sketch entities into `group`.
 *
 * @param {Konva.Group} group
 * @param {{ lines: any[], circles: any[], beziers: any[], points: any[] }} sketch
 * @param {{
 *   triplet: { stroke: string, fill: string, select: string },
 *   color: string,
 *   thickness: number,
 *   activeTool: string,
 *   getStage: () => Konva.Stage | null,
 *   service: object,
 * }} ctx
 */
export function renderSketchEntities(group, sketch, ctx) {
  renderLines(group, sketch.lines, ctx);
  renderCircles(group, sketch.circles, ctx);
  renderBeziers(group, sketch.beziers, ctx);
  renderPoints(group, sketch.points, ctx);
}

function entityHitStrokeWidth(thickness) {
  return Math.max(ENTITY_HIT_STROKE_FLOOR, thickness + 4);
}

function selectedStrokeWidth(thickness) {
  return thickness + 1;
}

function renderLines(group, lines, { triplet, color, thickness, getStage, service }) {
  for (const line of lines) {
    const kLine = new Konva.Line({
      points: [line.start.x, line.start.y, line.end.x, line.end.y],
      stroke: line.isSelected ? triplet.select : color,
      strokeWidth: line.isSelected ? selectedStrokeWidth(thickness) : thickness,
      dash: line.isConstruction ? [8, 6] : undefined,
      hitStrokeWidth: entityHitStrokeWidth(thickness),
      listening: true,
    });
    kLine.on('click tap', (e) => {
      e.cancelBubble = true;
      const pointer = getStage()?.getRelativePointerPosition();
      const position = pointer ? { x: pointer.x, y: pointer.y } : null;
      service.onLineClick(line, position, {
        snapEnabled: !e.evt.ctrlKey,
        multiSelect: e.evt.ctrlKey,
      });
    });
    group.add(kLine);
  }
}

function renderCircles(group, circles, { triplet, color, thickness, service }) {
  for (const circle of circles) {
    const kCircle = new Konva.Circle({
      x: circle.center.x,
      y: circle.center.y,
      radius: circle.radius,
      stroke: circle.isSelected ? triplet.select : color,
      strokeWidth: circle.isSelected ? selectedStrokeWidth(thickness) : thickness,
      listening: true,
      hitStrokeWidth: entityHitStrokeWidth(thickness),
    });
    kCircle.on('click tap', (e) => {
      e.cancelBubble = true;
      service.selectCircle(circle, e.evt.ctrlKey);
    });
    group.add(kCircle);
  }
}

function renderBeziers(group, beziers, { triplet, color, thickness, service }) {
  for (const bezier of beziers) {
    const kBezier = new Konva.Shape({
      sceneFunc: (ctx, shape) => {
        const { start, control1, control2, end } = bezier;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.bezierCurveTo(control1.x, control1.y, control2.x, control2.y, end.x, end.y);
        ctx.strokeStrokeShape(shape);
      },
      stroke: bezier.isSelected ? triplet.select : color,
      strokeWidth: bezier.isSelected ? selectedStrokeWidth(thickness) : thickness,
      listening: true,
      hitStrokeWidth: entityHitStrokeWidth(thickness),
    });
    kBezier.on('click tap', (e) => {
      e.cancelBubble = true;
      service.selectBezier(bezier, e.evt.ctrlKey);
    });
    group.add(kBezier);
  }
}

function renderPoints(group, points, { triplet, activeTool, getStage, service }) {
  const isSelectTool = activeTool === SELECT_TOOL;
  const pointDisplayColor = triplet.select;

  for (const pt of points) {
    const isSelected = pt.isSelected;
    const isAnchor = pt.isAnchor;
    const size = isSelected ? 6 : isSelectTool ? 5 : 3;

    const shape = isAnchor
      ? new Konva.Rect({
          x: pt.x - size,
          y: pt.y - size,
          width: size * 2,
          height: size * 2,
          fill: isSelected ? pointDisplayColor : triplet.fill,
          stroke: isSelected ? pointDisplayColor : triplet.select,
          strokeWidth: isSelected ? 2 : 1,
          listening: true,
          hitStrokeWidth: POINT_HIT_STROKE,
        })
      : new Konva.Circle({
          x: pt.x,
          y: pt.y,
          radius: size,
          fill: isSelected ? pointDisplayColor : triplet.fill,
          stroke: isSelected ? pointDisplayColor : null,
          strokeWidth: isSelected ? 1 : 0,
          listening: true,
          hitStrokeWidth: POINT_HIT_STROKE,
        });

    attachPointInteractions(shape, pt, { isSelectTool, getStage, service });
    group.add(shape);
  }
}

function attachPointInteractions(shape, pt, { isSelectTool, getStage, service }) {
  shape.on('click tap', (e) => {
    e.cancelBubble = true;
    const pointer = getStage()?.getRelativePointerPosition();
    const position = pointer ? { x: pointer.x, y: pointer.y } : { x: pt.x, y: pt.y };
    service.onPointClick(pt, position, {
      snapEnabled: !e.evt.ctrlKey,
      multiSelect: e.evt.ctrlKey,
    });
  });

  if (!isSelectTool) return;

  shape.on('mouseenter', () => { document.body.style.cursor = 'grab'; });
  shape.on('mouseleave', () => { document.body.style.cursor = 'default'; });
  shape.on('mousedown', (e) => {
    e.cancelBubble = true;
    document.body.style.cursor = 'grabbing';
    const pos = { x: pt.x, y: pt.y };
    service.startDrag(pos, { snapEnabled: !e.evt.ctrlKey });
  });
}
