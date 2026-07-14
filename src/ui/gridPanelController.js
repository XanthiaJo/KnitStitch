import { GaugeSettings } from '../models/gaugeSettings.js';
import { PatternDimensions } from '../models/patternDimensions.js';
import { FinishedSizeCalculator } from '../services/finishedSizeCalculator.js';
import { updateCellSizing, getCombinedBoundingBox } from '../services/gridService.js';
import { computeFilledCellsFromSketch } from '../services/sketch/fill/closedShapeFill.js';
import { collectRefs, bindIfPresent } from './uiUtils.js';

const REF_IDS = {
  gaugeStitchesInput: 'gauge-stitches',
  gaugeRowsInput: 'gauge-rows',
  finishedWidth: 'finished-width',
  finishedHeight: 'finished-height',
  recalcBtn: 'btn-recalculate',
};

/**
 * Owns the options sidebar: gauge inputs and finished size calculation.
 */
export function setupGridPanel({ store, documentObj = globalThis.document }) {
  const refs = collectRefs(documentObj, REF_IDS);
  const calc = new FinishedSizeCalculator();

  function updateGridSidebar() {
    const gs = store.get('stitchesPer4Inches');
    const gr = store.get('rowsPer4Inches');
    const fw = store.get('finishedWidth');
    const fh = store.get('finishedHeight');

    if (refs.gaugeStitchesInput) refs.gaugeStitchesInput.value = gs;
    if (refs.gaugeRowsInput) refs.gaugeRowsInput.value = gr;
    if (refs.finishedWidth) refs.finishedWidth.textContent = `Width: ${fw > 0 ? fw.toFixed(2) : '--'} in`;
    if (refs.finishedHeight) refs.finishedHeight.textContent = `Height: ${fh > 0 ? fh.toFixed(2) : '--'} in`;
  }

  function recalculateSize() {
    const gauge = new GaugeSettings(
      store.get('stitchesPer4Inches'),
      store.get('rowsPer4Inches'),
    );
    const cw = store.get('cellWidthPx');
    const ch = store.get('cellHeightPx');
    const filledCells = store.get('filledCells');
    const sketchFilled = computeFilledCellsFromSketch(
      store.get('sketch.lines'),
      cw,
      ch,
      0.3,
    );
    const bbox = getCombinedBoundingBox(filledCells, sketchFilled);
    const stitchCount = bbox ? (bbox.maxCol - bbox.minCol + 1) : 0;
    const rowCount = bbox ? (bbox.maxRow - bbox.minRow + 1) : 0;
    const dims = new PatternDimensions(stitchCount, rowCount);
    const result = calc.calculate(gauge, dims);
    store.set('finishedWidth', Math.round(result.widthInches * 100) / 100);
    store.set('finishedHeight', Math.round(result.heightInches * 100) / 100);
    updateCellSizing(store, gauge.stitchesPer4Inches, gauge.rowsPer4Inches);
  }

  // Event bindings
  bindIfPresent(refs.gaugeStitchesInput, 'change', () => {
    store.set('stitchesPer4Inches', Number(refs.gaugeStitchesInput.value) || 20);
    recalculateSize();
  });

  bindIfPresent(refs.gaugeRowsInput, 'change', () => {
    store.set('rowsPer4Inches', Number(refs.gaugeRowsInput.value) || 28);
    recalculateSize();
  });

  bindIfPresent(refs.recalcBtn, 'click', recalculateSize);

  // Store subscription
  store.subscribe((path) => {
    if (
      path === 'filledCells' ||
      path === 'cellWidthPx' ||
      path === 'cellHeightPx' ||
      path === 'stitchesPer4Inches' ||
      path === 'rowsPer4Inches' ||
      path === 'finishedWidth' ||
      path === 'finishedHeight'
    ) {
      if (path === 'filledCells' || path === 'cellWidthPx' || path === 'cellHeightPx') {
        recalculateSize();
      }
      updateGridSidebar();
    }
  });

  return { updateGridSidebar, recalculateSize };
}
