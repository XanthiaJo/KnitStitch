// main.js - App bootstrap, stage setup, and top-level UI wiring

import { AppStage } from './konva/appStage.js';
import { Store } from './state/store.js';
import { StorePersistence } from './state/storePersistence.js';
import { SketchService } from './services/sketch/sketchService.js';
import { setupMainUi } from './ui/mainUi.js';
import { computeFilledCellsFromSketch } from './services/sketch/fill/closedShapeFill.js';
import { SketchPoint } from './models/sketch/sketchPoint.js';
import { SketchLine } from './models/sketch/sketchLine.js';
import { SketchConstraint } from './models/sketch/sketchConstraint.js';

const store = new Store();
const persistence = new StorePersistence(store);
persistence.hydrate();

const sketchService = new SketchService(store);
persistence.attach();

if (typeof window !== 'undefined') {
  window.__knitstitchStore = store;
  window.__knitstitchSketchService = sketchService;
  window.__knitstitchComputeFilledCellsFromSketch = computeFilledCellsFromSketch;
  window.__knitstitchModules = { SketchPoint, SketchLine, SketchConstraint };
}

const mainUi = setupMainUi({ store, sketchService });

let appStage = null;
if (document.getElementById('konva-stage')) {
  appStage = new AppStage('konva-stage', store, sketchService);
}

mainUi.recalculateSize();
mainUi.syncAll();

console.log('KnitStichGrid Web - Loaded');

// Kick off the SolveSpace WASM solver load now that the page has painted.
// Loading it still involves a long, largely unavoidable main-thread block
// (see AGENTS.md "SolveSpace WASM Solver Loading"), so the boot overlay
// (index.html/app.css) stays visible until this resolves — hidden either
// way (success or failure) so the app is still usable in a degraded mode
// (no constraints/dimensions) if the solver fails to load.
if (typeof document !== 'undefined') {
  const bootOverlay = document.getElementById('boot-loading-overlay');
  const hideBootOverlay = () => {
    if (!bootOverlay) return;
    bootOverlay.classList.add('is-hidden');
    bootOverlay.addEventListener('transitionend', () => bootOverlay.remove(), { once: true });
  };
  sketchService.ensureSolver().finally(hideBootOverlay);
}
