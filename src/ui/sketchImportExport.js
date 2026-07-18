// sketchImportExport.js — UI orchestration for the Objects panel's
// Copy / Export / Import buttons.
//
// Extracted from sketchPanelController.js so the import flow (file reading,
// format validation, mode-chooser modal, button feedback) lives in its own
// module instead of growing the panel controller. The panel controller now
// just calls `setupSketchImportExport(...)` alongside its other bindings.
//
// The actual sketch serialization (format/version, snapshot shape, id
// remapping for merge) lives in
// `src/services/sketch/sketchSerialization.js` and is invoked via
// `sketchService.exportPattern()` / `sketchService.importPattern()`.

import { bindIfPresent } from './uiUtils.js';
import { serializePattern, EXPORT_FORMAT } from '../services/sketch/sketchSerialization.js';

const COPY_RESET_TEXT = 'Copy objects';
const EXPORT_RESET_TEXT = 'Export';
const IMPORT_RESET_TEXT = 'Import';
const FLASH_MS = 1500;
const IMPORT_FLASH_MS = 2500;

/**
 * Wires up the Copy / Export / Import buttons and the hidden import file
 * input. Call once during panel setup.
 *
 * @param {{
 *   refs: Record<string, HTMLElement|null>,
 *   store: object,
 *   sketchService: object,
 *   documentObj?: Document,
 * }} opts
 */
export function setupSketchImportExport({ refs, store, sketchService, documentObj = globalThis.document }) {
  bindCopyObjects(refs, store, sketchService);
  bindExportObjects(refs, sketchService, documentObj);
  bindImportObjects(refs, sketchService, documentObj);
}

function bindCopyObjects(refs, store, sketchService) {
  bindIfPresent(refs.sketchCopyObjectsBtn, 'click', async () => {
    // Reuse the export serializer so copy and export always agree on shape.
    // Strip the envelope (format/version/exportedAt/gauge) — copy is for the
    // sketch entities only, matching the original "Copy objects" contract.
    const data = serializePattern(store.state, sketchService);
    const text = JSON.stringify(data.sketch, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      flashButton(refs.sketchCopyObjectsBtn, 'Copied!', COPY_RESET_TEXT, FLASH_MS);
    } catch (err) {
      console.error('Failed to copy sketch objects:', err);
      flashButton(refs.sketchCopyObjectsBtn, 'Copy failed', COPY_RESET_TEXT, FLASH_MS);
    }
  });
}

function bindExportObjects(refs, sketchService, documentObj) {
  bindIfPresent(refs.sketchExportObjectsBtn, 'click', () => {
    const json = sketchService.exportPattern();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = documentObj.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `knitstitch-pattern-${stamp}.json`;
    documentObj.body.appendChild(a);
    a.click();
    documentObj.body.removeChild(a);
    URL.revokeObjectURL(url);
    flashButton(refs.sketchExportObjectsBtn, 'Exported!', EXPORT_RESET_TEXT, FLASH_MS);
  });
}

function bindImportObjects(refs, sketchService, documentObj) {
  // Clicking the Import button opens the OS file picker via the hidden input.
  bindIfPresent(refs.sketchImportObjectsBtn, 'click', () => {
    if (refs.sketchImportFileInput) refs.sketchImportFileInput.click();
  });

  bindIfPresent(refs.sketchImportFileInput, 'change', async (event) => {
    const file = event.target.files?.[0];
    // Reset so selecting the same file again re-triggers change.
    event.target.value = '';
    if (!file) return;

    let text;
    try {
      text = await file.text();
    } catch (err) {
      console.error('Failed to read import file:', err);
      flashImportError(refs, 'Could not read the selected file.');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      flashImportError(refs, 'File is not valid JSON.');
      return;
    }

    // Light shape check before showing the chooser — full validation happens
    // in sketchService.importPattern via validatePatternPayload.
    if (!payload || payload.format !== EXPORT_FORMAT) {
      flashImportError(refs, 'File is not a KnitStitch pattern.');
      return;
    }

    promptImportMode(documentObj, (mode) => {
      if (!mode) return;
      try {
        sketchService.importPattern(payload, { mode });
        flashButton(refs.sketchImportObjectsBtn, `Imported (${mode})`, IMPORT_RESET_TEXT, IMPORT_FLASH_MS);
      } catch (err) {
        console.error('Import failed:', err);
        flashImportError(refs, err.message || 'Import failed.');
      }
    });
  });
}

/**
 * Shows a centered modal asking the user how to import the pattern.
 * Calls `onChoose` with 'replace', 'merge', or null (cancelled).
 */
function promptImportMode(documentObj, onChoose) {
  // Remove any existing overlay first.
  const existing = documentObj.getElementById('sketch-import-chooser');
  if (existing) existing.remove();

  const overlay = documentObj.createElement('div');
  overlay.id = 'sketch-import-chooser';
  overlay.className = 'sketch-import-chooser';
  overlay.innerHTML = `
    <div class="sketch-import-chooser__panel">
      <div class="sketch-import-chooser__title">Import pattern</div>
      <div class="sketch-import-chooser__hint">
        Replace clears the current sketch and loads gauge, grid, and filled cells from the file.
        Merge adds the file's sketch objects to the current sketch and unions filled cells (gauge/grid unchanged).
      </div>
      <div class="sketch-import-chooser__controls">
        <button class="button button-sm sketch-import-chooser__button--replace" data-mode="replace">Replace</button>
        <button class="button button-sm sketch-import-chooser__button--merge" data-mode="merge">Merge</button>
        <button class="button button-sm" data-mode="cancel">Cancel</button>
      </div>
    </div>
  `;
  documentObj.body.appendChild(overlay);

  const close = (result) => {
    overlay.remove();
    documentObj.removeEventListener('keydown', onKey);
    onChoose(result === 'cancel' ? null : result);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close(null);
  };
  overlay.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (btn) close(btn.dataset.mode);
    else if (e.target === overlay) close(null);
  });
  documentObj.addEventListener('keydown', onKey);
}

function flashImportError(refs, message) {
  flashButton(refs.sketchImportObjectsBtn, `Import failed: ${message}`, IMPORT_RESET_TEXT, IMPORT_FLASH_MS);
}

function flashButton(button, message, resetText, durationMs) {
  if (!button) return;
  button.textContent = message;
  setTimeout(() => {
    if (button) button.textContent = resetText;
  }, durationMs);
}
