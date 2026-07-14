import { computeSockCounts, buildSockOutlineInInches } from '../services/sketch/templates/sockMeasurements.js';
import { collectRefs, bindIfPresent } from './uiUtils.js';

const REF_IDS = {
  templateList: 'template-list',
  measurementsPanel: 'template-measurements-panel',
  measFootCirc: 'measurement-foot-circ',
  measFootLen: 'measurement-foot-len',
  measLegHeight: 'measurement-leg-height',
  measEase: 'measurement-ease',
  measRib: 'measurement-rib',
  derivedWidth: 'derived-width',
  derivedRib: 'derived-rib',
  derivedSectionA: 'derived-section-a',
  derivedNotch: 'derived-notch',
  derivedNotch2: 'derived-notch-2',
  derivedSectionB: 'derived-section-b',
  derivedSectionC: 'derived-section-c',
  derivedRib2: 'derived-rib-2',
  derivedGauge: 'derived-gauge',
  derivedGaugeRows: 'derived-gauge-rows',
};

/**
 * Owns the templates sidebar: template button list, measurement inputs,
 * derived value display, and measurements panel visibility.
 */
export function setupTemplatePanel({ store, sketchService, documentObj = globalThis.document }) {
  const refs = collectRefs(documentObj, REF_IDS);

  function updateTemplatesSidebar() {
    if (!refs.templateList) return;
    const templates = sketchService.templates;
    refs.templateList.innerHTML = templates.map((t) =>
      `<button class="button button-sm" data-template-id="${t.id}">${t.label}</button>`,
    ).join('');
  }

  function readMeasurementsFromInputs() {
    return {
      footCircumference: Number(refs.measFootCirc?.value) || 0,
      footLength: Number(refs.measFootLen?.value) || 0,
      legHeight: Number(refs.measLegHeight?.value) || 0,
      negativeEasePct: Number(refs.measEase?.value) || 0,
      ribbingLength: Number(refs.measRib?.value) || 0,
    };
  }

  function writeMeasurementsToInputs(m) {
    if (!m) return;
    if (refs.measFootCirc) refs.measFootCirc.value = m.footCircumference;
    if (refs.measFootLen) refs.measFootLen.value = m.footLength;
    if (refs.measLegHeight) refs.measLegHeight.value = m.legHeight;
    if (refs.measEase) refs.measEase.value = m.negativeEasePct;
    if (refs.measRib) refs.measRib.value = m.ribbingLength;
  }

  function updateMeasurementDerived() {
    const templateId = store.get('activeTemplateId');
    if (!templateId) return;

    const gauge = {
      stitchesPer4Inches: store.get('stitchesPer4Inches'),
      rowsPer4Inches: store.get('rowsPer4Inches'),
    };
    const m = store.get('templateMeasurements');
    if (!m) return;

    const counts = computeSockCounts(gauge, m);
    const { sections } = buildSockOutlineInInches(gauge, m);

    const fmt = (inches) => `${inches.toFixed(2)} in`;

    if (refs.derivedWidth) refs.derivedWidth.textContent = `${counts.widthSts} sts / ${fmt(sections.width)}`;
    if (refs.derivedRib) refs.derivedRib.textContent = `${counts.ribRows} rows / ${fmt(sections.topRib)}`;
    if (refs.derivedSectionA) refs.derivedSectionA.textContent = `${counts.legRows} rows / ${fmt(sections.backLeg)}`;
    if (refs.derivedNotch) refs.derivedNotch.textContent = `${counts.notchRowsTotal} rows / ${fmt(sections.heel)}`;
    if (refs.derivedNotch2) refs.derivedNotch2.textContent = `${counts.notchRowsTotal} rows / ${fmt(sections.toe)}`;
    if (refs.derivedSectionB) refs.derivedSectionB.textContent = `${counts.soleRows} rows / ${fmt(sections.sole)}`;
    if (refs.derivedSectionC) refs.derivedSectionC.textContent = `${counts.instepRows} rows / ${fmt(sections.instep)}`;
    if (refs.derivedRib2) refs.derivedRib2.textContent = `${counts.ribRows} rows / ${fmt(sections.bottomRib)}`;
    if (refs.derivedGauge) refs.derivedGauge.textContent = gauge.stitchesPer4Inches;
    if (refs.derivedGaugeRows) refs.derivedGaugeRows.textContent = gauge.rowsPer4Inches;
  }

  function updateMeasurementsPanelVisibility() {
    const templateId = store.get('activeTemplateId');
    if (refs.measurementsPanel) {
      refs.measurementsPanel.style.display = templateId ? '' : 'none';
    }
    if (templateId) {
      const m = store.get('templateMeasurements');
      writeMeasurementsToInputs(m);
      updateMeasurementDerived();
    }
  }

  // --- Event bindings ---

  bindIfPresent(refs.templateList, 'click', (event) => {
    const btn = event.target.closest('button[data-template-id]');
    if (!btn) return;
    sketchService.applyTemplate(btn.dataset.templateId);
    updateMeasurementsPanelVisibility();
  });

  function onMeasurementInput() {
    const m = readMeasurementsFromInputs();
    store.set('templateMeasurements', m);
    sketchService.regenerateTemplate(m);
    updateMeasurementDerived();
  }

  for (const ref of [refs.measFootCirc, refs.measFootLen, refs.measLegHeight, refs.measEase, refs.measRib]) {
    bindIfPresent(ref, 'input', onMeasurementInput);
  }

  // Store subscription
  store.subscribe((path) => {
    if (
      path === 'activeTemplateId' ||
      path === 'templateMeasurements' ||
      path === 'stitchesPer4Inches' ||
      path === 'rowsPer4Inches'
    ) {
      updateMeasurementsPanelVisibility();
    }
  });

  return { updateTemplatesSidebar, updateMeasurementsPanelVisibility };
}
