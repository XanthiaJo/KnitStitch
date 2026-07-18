import { rebuildSketchObjects } from './sketchStoreSync.js';

export function clearSelection(service) {
  for (const p of service._selectedPoints) p.isSelected = false;
  for (const l of service._selectedLines) l.isSelected = false;
  for (const d of service.store.state.sketch.dimensions) d.isSelected = false;
  for (const c of service.store.state.sketch.constraints) {
    if (c) c.isSelected = false;
  }
  for (const c of service.store.state.sketch.circles || []) c.isSelected = false;
  for (const r of service.store.state.sketch.rectangles || []) {
    r.isSelected = false;
    for (const p of r.corners || []) p.isSelected = false;
    if (r.center) r.center.isSelected = false;
    for (const l of r.edges || []) l.isSelected = false;
    for (const l of r.constructionLines || []) l.isSelected = false;
  }
  service._selectedPoints.clear();
  service._selectedLines.clear();
  rebuildSketchObjects(service);
  service.store.set('sketch.points', [...service.store.state.sketch.points]);
  service.store.set('sketch.lines', [...service.store.state.sketch.lines]);
  service.store.set('sketch.dimensions', [...service.store.state.sketch.dimensions]);
  service.store.set('sketch.constraints', [...service.store.state.sketch.constraints]);
  service.store.set('sketch.circles', [...service.store.state.sketch.circles || []]);
  service.store.set('sketch.rectangles', [...service.store.state.sketch.rectangles || []]);
}
export function selectPoint(service, point, multiSelect = false) {
  if (!multiSelect) clearSelection(service);
  point.isSelected = true;
  service._selectedPoints.add(point);
  rebuildSketchObjects(service);
  service.store.set('sketch.points', [...service.store.state.sketch.points]);
}
export function selectLine(service, line, multiSelect = false) {
  if (!multiSelect) clearSelection(service);
  line.isSelected = true;
  service._selectedLines.add(line);
  rebuildSketchObjects(service);
  service.store.set('sketch.lines', [...service.store.state.sketch.lines]);
}
export function selectDimension(service, dim, multiSelect = false) {
  if (!multiSelect) clearSelection(service);
  dim.isSelected = true;
  rebuildSketchObjects(service);
  service.store.set('sketch.dimensions', [...service.store.state.sketch.dimensions]);
}
export function selectConstraint(service, constraint, multiSelect = false) {
  if (!multiSelect) clearSelection(service);
  constraint.isSelected = true;
  rebuildSketchObjects(service);
  service.store.set('sketch.constraints', [...service.store.state.sketch.constraints]);
}
export function selectCircle(service, circle, multiSelect = false) {
  if (!multiSelect) clearSelection(service);
  circle.isSelected = true;
  rebuildSketchObjects(service);
  service.store.set('sketch.circles', [...service.store.state.sketch.circles]);
}
export function selectRectangle(service, rect, multiSelect = false) {
  if (!multiSelect) clearSelection(service);
  rect.isSelected = true;
  // Also select all component points and lines for visual feedback
  for (const p of rect.corners) p.isSelected = true;
  if (rect.center) rect.center.isSelected = true;
  for (const l of rect.edges) l.isSelected = true;
  for (const l of rect.constructionLines) l.isSelected = true;
  rebuildSketchObjects(service);
  service.store.set('sketch.rectangles', [...service.store.state.sketch.rectangles]);
  service.store.set('sketch.points', [...service.store.state.sketch.points]);
  service.store.set('sketch.lines', [...service.store.state.sketch.lines]);
}
export function selectObjectByRef(service, refType, refId, multiSelect = false) {
  if (refType === 'line') {
    const line = service.store.state.sketch.lines.find((candidate) => candidate.id === refId);
    if (line) selectLine(service, line, multiSelect);
    return;
  }
  if (refType === 'point') {
    const point = service.store.state.sketch.points.find((candidate) => candidate.id === refId);
    if (point) selectPoint(service, point, multiSelect);
    return;
  }
  if (refType === 'dimension') {
    const dim = service.store.state.sketch.dimensions.find((candidate) => candidate.id === refId);
    if (dim) selectDimension(service, dim, multiSelect);
    return;
  }
  if (refType === 'constraint') {
    const constraint = service.store.state.sketch.constraints.find((candidate) => candidate.id === refId);
    if (constraint) selectConstraint(service, constraint, multiSelect);
    return;
  }
  if (refType === 'circle') {
    const circle = service.store.state.sketch.circles.find((candidate) => candidate.id === refId);
    if (circle) selectCircle(service, circle, multiSelect);
    return;
  }
  if (refType === 'rectangle') {
    const rect = service.store.state.sketch.rectangles.find((candidate) => candidate.id === refId);
    if (rect) selectRectangle(service, rect, multiSelect);
    return;
  }
}