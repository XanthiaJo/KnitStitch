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
