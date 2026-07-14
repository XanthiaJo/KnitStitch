import Konva from 'konva';
import {
  SELECTION_COLOR,
  ACCENT_COLOR,
  WITNESS_COLOR,
  LABEL_BG_COLOR,
  LABEL_STROKE_COLOR,
} from '../services/sketch/render/styleOptions.js';

/**
 * Renders dimension entities (witness lines, dimension line, arrowheads,
 * and the clickable label) into a Konva group.
 *
 * Extracted from SketchLayer so the layer stays a thin orchestrator.
 * The renderer only needs the dimensions, the pending edit (to highlight
 * the label being edited), and the service (for selection + edit-open
 * calls on label interaction).
 */
export function renderDimensions(group, dimensions, pendingEdit, service) {
  for (const dim of dimensions) {
    const dimGroup = new Konva.Group();
    const dimColor = dim.isSelected ? SELECTION_COLOR : ACCENT_COLOR;

    // Witness lines (dashed grey)
    for (const [p1, p2] of [
      [dim.witnessA1, dim.witnessA2],
      [dim.witnessB1, dim.witnessB2],
    ]) {
      dimGroup.add(new Konva.Line({
        points: [p1.x, p1.y, p2.x, p2.y],
        stroke: WITNESS_COLOR,
        strokeWidth: 1,
        dash: [3, 2],
        listening: false,
      }));
    }

    // Dimension line
    dimGroup.add(new Konva.Line({
      points: [dim.dimLine1.x, dim.dimLine1.y, dim.dimLine2.x, dim.dimLine2.y],
      stroke: dimColor,
      strokeWidth: 1.5,
      listening: false,
    }));

    // Arrowheads
    for (const pts of [dim.arrowAPoints, dim.arrowBPoints]) {
      if (pts.length === 3) {
        dimGroup.add(new Konva.Line({
          points: pts.flatMap(p => [p.x, p.y]),
          closed: true,
          fill: dimColor,
          listening: false,
        }));
      }
    }

    // Clickable label
    const isEditOpen = pendingEdit && pendingEdit.dimId === dim.id;
    const labelGroup = new Konva.Group({
      x: dim.labelPos.x,
      y: dim.labelPos.y,
      rotation: dim.labelAngle,
      listening: true,
      cursor: 'pointer',
    });
    const labelBg = new Konva.Rect({
      fill: isEditOpen ? SELECTION_COLOR : LABEL_BG_COLOR,
      stroke: dim.isSelected ? SELECTION_COLOR : LABEL_STROKE_COLOR,
      strokeWidth: 1.5,
      cornerRadius: 10,
      listening: true,
    });
    const labelTxt = new Konva.Text({
      text: dim.labelText,
      fontSize: 10,
      fontFamily: 'Open Sans, sans-serif',
      fontStyle: '600',
      fill: 'white',
      padding: 4,
      listening: false,
    });
    labelBg.width(labelTxt.width());
    labelBg.height(labelTxt.height());
    labelBg.offsetX(labelTxt.width() / 2);
    labelBg.offsetY(labelTxt.height() / 2);
    labelTxt.offsetX(labelTxt.width() / 2);
    labelTxt.offsetY(labelTxt.height() / 2);
    labelGroup.add(labelBg, labelTxt);
    labelGroup.on('mousedown touchstart', (e) => {
      e.cancelBubble = true;
      service.selectDimension(dim, e.evt.ctrlKey);
    });
    labelGroup.on('dblclick dbltap', (e) => {
      e.cancelBubble = true;
      service.selectDimension(dim, e.evt.ctrlKey);
      service._openDimEdit(dim);
    });
    dimGroup.add(labelGroup);
    group.add(dimGroup);
  }
}
