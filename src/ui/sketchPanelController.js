import { SketchTool } from '../services/sketch/sketchService.js';
import { collectRefs, bindIfPresent, toggleActive } from './uiUtils.js';
import { computeFilledCellsFromSketch } from '../services/sketch/fill/closedShapeFill.js';
import { buildRowInstructions } from '../services/rowCountService.js';

const REF_IDS = {
  sketchColorSelect: 'sketch-color',
  sketchThicknessSlider: 'sketch-thickness',
  sketchUndoBtn: 'sketch-undo',
  sketchClearBtn: 'sketch-clear',
  sketchDeleteBtn: 'sketch-delete',
  sketchObjectList: 'sketch-object-list',
  sketchCopyObjectsBtn: 'sketch-copy-objects',
  sketchConstraintStatus: 'sketch-constraint-status',
  toolLineBtn: 'tool-line',
  toolConstructionLineBtn: 'tool-construction-line',
  toolCircleBtn: 'tool-circle',
  toolRectangleBtn: 'tool-rectangle',
  toolSelectBtn: 'tool-select',
  toolAnchorBtn: 'tool-anchor',
  toolFillBtn: 'tool-fill',
  toolDimensionBtn: 'tool-dimension',
  toolPerpendicularBtn: 'tool-perpendicular',
  toolParallelBtn: 'tool-parallel',
  toolHvBtn: 'tool-hv',
  toolMidpointBtn: 'tool-midpoint',
  toolEqualBtn: 'tool-equal',
  toolCoincidentBtn: 'tool-coincident',
};

const OBJECT_ICONS = {
  Line: '&#9473;',
  Point: '&#9679;',
  Anchor: '&#9632;',
  Perpendicular: '&#8869;',
  Parallel: '&#8741;',
  Horizontal: '&#9472;',
  Vertical: '&#9474;',
  Equal: '&#8801;',
  Coincident: '&#9678;',
  Circle: '&#9711;',
  Rectangle: '&#9645;',
};

/**
 * Owns the sketch sidebar: tool buttons, color/thickness, undo/clear/delete,
 * object list, and constraint status display.
 */
export function setupSketchPanel({ store, sketchService, documentObj = globalThis.document }) {
  const refs = collectRefs(documentObj, REF_IDS);

  function updateSketchSidebar() {
    const sketch = store.state.sketch;
    if (refs.sketchColorSelect) refs.sketchColorSelect.value = sketch.strokeColor;
    if (refs.sketchThicknessSlider) refs.sketchThicknessSlider.value = sketch.strokeThickness;
    if (refs.sketchUndoBtn) refs.sketchUndoBtn.disabled = sketch.lines.length === 0 && !sketchService._pendingStart;
    if (refs.sketchClearBtn) refs.sketchClearBtn.disabled = sketch.lines.length === 0;
    if (refs.sketchDeleteBtn) refs.sketchDeleteBtn.disabled = !sketchService.hasSelection;

    toggleActive(refs.toolLineBtn, sketch.activeTool === SketchTool.Line);
    toggleActive(refs.toolConstructionLineBtn, sketch.activeTool === SketchTool.ConstructionLine);
    toggleActive(refs.toolCircleBtn, sketch.activeTool === SketchTool.Circle);
    toggleActive(refs.toolRectangleBtn, sketch.activeTool === SketchTool.Rectangle);
    toggleActive(refs.toolSelectBtn, sketch.activeTool === SketchTool.Select);
    toggleActive(refs.toolAnchorBtn, sketch.activeTool === SketchTool.Anchor);
    toggleActive(refs.toolFillBtn, sketch.activeTool === SketchTool.Fill);
    toggleActive(refs.toolDimensionBtn, sketch.activeTool === SketchTool.Dimension);
    toggleActive(
      refs.toolPerpendicularBtn,
      sketch.activeTool === SketchTool.Constraint && sketch.constraintSubMode === 'Perpendicular',
    );
    toggleActive(
      refs.toolParallelBtn,
      sketch.activeTool === SketchTool.Constraint && sketch.constraintSubMode === 'Parallel',
    );
    toggleActive(
      refs.toolHvBtn,
      sketch.activeTool === SketchTool.Constraint && sketch.constraintSubMode === 'HorizontalVertical',
    );
    toggleActive(
      refs.toolMidpointBtn,
      sketch.activeTool === SketchTool.Constraint && sketch.constraintSubMode === 'Midpoint',
    );
    toggleActive(
      refs.toolEqualBtn,
      sketch.activeTool === SketchTool.Constraint && sketch.constraintSubMode === 'Equal',
    );
    toggleActive(
      refs.toolCoincidentBtn,
      sketch.activeTool === SketchTool.Constraint && sketch.constraintSubMode === 'Coincident',
    );

    if (refs.sketchObjectList) {
      refs.sketchObjectList.innerHTML = sketch.objects.map((o) =>
        `<li class="${o.isSelected ? 'selected' : ''} ${o.refType ? 'is-selectable' : 'is-readonly'}"
             data-ref-type="${o.refType ?? ''}"
             data-ref-id="${o.refId ?? ''}">
          <span>${OBJECT_ICONS[o.kind] ?? '&#9679;'}</span> ${o.label}
        </li>`,
      ).join('');
    }

    if (refs.sketchConstraintStatus) {
      const analysis = sketchService._slvsAdapter?.ready
        ? sketchService._slvsAdapter.analyze(store.state.sketch)
        : { dof: 0, status: 'under', issues: [] };
      const parts = [];

      // DOF status
      if (analysis.status === 'over') {
        parts.push('Over-constrained');
      } else if (analysis.status === 'well') {
        parts.push('Fully constrained');
      } else if (analysis.dof > 0) {
        parts.push(`${analysis.dof} degree${analysis.dof === 1 ? '' : 's'} of freedom remaining`);
      }

      // Overconstraint messages from the solver's failed-constraint list
      if (analysis.issues.length) {
        parts.push(`${analysis.issues.length} overconstraint${analysis.issues.length === 1 ? '' : 's'}: ${analysis.issues.map((i) => i.message).join('; ')}`);
      }

      refs.sketchConstraintStatus.textContent = parts.join(' — ');
    }
  }

  // --- Event bindings ---

  bindIfPresent(refs.sketchColorSelect, 'change', () => {
    sketchService.strokeColor = refs.sketchColorSelect.value;
  });

  bindIfPresent(refs.sketchThicknessSlider, 'input', () => {
    sketchService.strokeThickness = Number(refs.sketchThicknessSlider.value);
  });

  bindIfPresent(refs.sketchUndoBtn, 'click', () => sketchService.undo());
  bindIfPresent(refs.sketchClearBtn, 'click', () => sketchService.clear());
  bindIfPresent(refs.sketchDeleteBtn, 'click', () => sketchService.deleteSelected());

  bindIfPresent(refs.sketchObjectList, 'click', (event) => {
    const row = event.target.closest('li[data-ref-type]');
    if (!row) return;
    const refType = row.dataset.refType;
    const rawRefId = row.dataset.refId;
    if (!refType || rawRefId === '') return;
    sketchService.selectObjectByRef(refType, Number(rawRefId), event.ctrlKey);
  });

  bindIfPresent(refs.sketchCopyObjectsBtn, 'click', async () => {
    const sketch = store.state.sketch;
    const data = {
      points: sketch.points.map((p) => ({ id: p.id, x: p.x, y: p.y, isAnchor: p.isAnchor, isSelected: p.isSelected })),
      lines: sketch.lines.map((l) => ({ id: l.id, startId: l.start?.id, endId: l.end?.id, isSelected: l.isSelected })),
      dimensions: sketch.dimensions.map((d) => ({ id: d.id, aId: d.a?.id, bId: d.b?.id, value: d.value, drivenValue: d.drivenValue, kind: d.kind })),
      constraints: sketch.constraints.map((c) => ({ id: c.id, type: c.type, pointAId: c.pointA?.id, pointBId: c.pointB?.id, lineAId: c.lineA?.id, lineBId: c.lineB?.id })),
      objects: sketch.objects.map((o) => ({ kind: o.kind, refType: o.refType, refId: o.refId, label: o.label, isSelected: o.isSelected })),
    };
    const text = JSON.stringify(data, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      if (refs.sketchCopyObjectsBtn) refs.sketchCopyObjectsBtn.textContent = 'Copied!';
      setTimeout(() => {
        if (refs.sketchCopyObjectsBtn) refs.sketchCopyObjectsBtn.textContent = 'Copy objects';
      }, 1500);
    } catch (err) {
      console.error('Failed to copy sketch objects:', err);
      if (refs.sketchCopyObjectsBtn) refs.sketchCopyObjectsBtn.textContent = 'Copy failed';
      setTimeout(() => {
        if (refs.sketchCopyObjectsBtn) refs.sketchCopyObjectsBtn.textContent = 'Copy objects';
      }, 1500);
    }
  });

  bindIfPresent(refs.toolLineBtn, 'click', () => {
    sketchService.activeTool = SketchTool.Line;
  });
  bindIfPresent(refs.toolConstructionLineBtn, 'click', () => {
    sketchService.activeTool = SketchTool.ConstructionLine;
  });
  bindIfPresent(refs.toolCircleBtn, 'click', () => {
    sketchService.activeTool = SketchTool.Circle;
  });
  bindIfPresent(refs.toolRectangleBtn, 'click', () => {
    sketchService.activeTool = SketchTool.Rectangle;
  });
  bindIfPresent(refs.toolSelectBtn, 'click', () => {
    sketchService.activeTool = SketchTool.Select;
  });
  bindIfPresent(refs.toolAnchorBtn, 'click', () => {
    sketchService.activeTool = SketchTool.Anchor;
  });
  bindIfPresent(refs.toolFillBtn, 'click', () => {
    sketchService.activeTool = SketchTool.Fill;
  });
  bindIfPresent(refs.toolDimensionBtn, 'click', () => {
    sketchService.activeTool = SketchTool.Dimension;
  });
  bindIfPresent(refs.toolPerpendicularBtn, 'click', () => {
    sketchService.activeTool = SketchTool.Constraint;
    sketchService.constraintSubMode = 'Perpendicular';
  });
  bindIfPresent(refs.toolParallelBtn, 'click', () => {
    sketchService.activeTool = SketchTool.Constraint;
    sketchService.constraintSubMode = 'Parallel';
  });
  bindIfPresent(refs.toolHvBtn, 'click', () => {
    sketchService.activeTool = SketchTool.Constraint;
    sketchService.constraintSubMode = 'HorizontalVertical';
  });
  bindIfPresent(refs.toolMidpointBtn, 'click', () => {
    sketchService.activeTool = SketchTool.Constraint;
    sketchService.constraintSubMode = 'Midpoint';
  });
  bindIfPresent(refs.toolEqualBtn, 'click', () => {
    sketchService.activeTool = SketchTool.Constraint;
    sketchService.constraintSubMode = 'Equal';
  });
  bindIfPresent(refs.toolCoincidentBtn, 'click', () => {
    sketchService.activeTool = SketchTool.Constraint;
    sketchService.constraintSubMode = 'Coincident';
  });

  function updateRowCountsSidebar() {
    const filledCells = store.state.filledCells || new Set();
    const sketch = store.state.sketch;
    const sketchFilled = computeFilledCellsFromSketch(
      sketch.lines,
      store.state.cellWidthPx,
      store.state.cellHeightPx,
      store.state.fillThreshold,
    );
    const allFilled = new Set(filledCells);
    for (const key of sketchFilled) allFilled.add(key);

    const list = documentObj.getElementById('row-counts-list');
    const empty = documentObj.getElementById('row-counts-empty');
    if (!list) return;
    if (allFilled.size === 0) {
      list.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }

    if (empty) empty.style.display = 'none';
    const rows = buildRowInstructions(allFilled);
    list.innerHTML = rows.map(({ row, stitches, instruction }) =>
      `<li><span class="row-label">Row ${row}</span>`
      + `<span class="row-instruction">${instruction}</span>`
      + `<span class="row-count">${stitches} stitch${stitches === 1 ? '' : 'es'}</span></li>`
    ).join('');
  }

  // Store subscription
  store.subscribe((path) => {
    if (path.startsWith('sketch.')) {
      updateSketchSidebar();
    }
    if (path === 'filledCells' || path === 'sketch.lines' || path === 'cellWidthPx' || path === 'cellHeightPx' || path === 'fillThreshold') {
      updateRowCountsSidebar();
    }
  });

  // Initial population
  updateSketchSidebar();
  updateRowCountsSidebar();

  return { updateSketchSidebar };
}
