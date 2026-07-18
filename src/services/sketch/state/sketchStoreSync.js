import { assignConstraintIds } from './sketchIdManager.js';
import { buildSketchObjects } from '../render/buildSketchObjects.js';
import { findSharedPoint } from '../../../utils/geometry.js';

export function syncSketchStateToStore(store) {
  const sketch = store.get('sketch');
  store.set('sketch.lines', sketch.lines);
  store.set('sketch.points', sketch.points);
  store.set('sketch.circles', sketch.circles);
  store.set('sketch.beziers', sketch.beziers);
  store.set('sketch.objects', sketch.objects);
  store.set('sketch.previewLine', sketch.previewLine);
  store.set('sketch.snapCandidate', sketch.snapCandidate);
}

export function flushSketchArrays(service) {
  const sketch = service.store.state.sketch;
  service.store.set('sketch.points', [...sketch.points]);
  service.store.set('sketch.lines', [...sketch.lines]);
  service.store.set('sketch.dimensions', [...sketch.dimensions]);
  service.store.set('sketch.constraints', [...sketch.constraints]);
  service.store.set('sketch.circles', [...sketch.circles]);
  service.store.set('sketch.beziers', [...sketch.beziers]);
}

export function rebuildSketchObjects(service) {
  const sketch = service.store.state.sketch;
  assignConstraintIds(service);
  service.store.set('sketch.objects', buildSketchObjects(sketch, {
    findSharedPoint,
  }));
}

export function setPreviewLine(service, line) {
  service.store.set('sketch.previewLine', line);
}

export function setSnapCandidate(service, point) {
  service.store.set('sketch.snapCandidate', point);
}
