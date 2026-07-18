export function nextId(items) {
  let maxId = -1;
  for (const item of items || []) {
    if (Number.isFinite(item?.id) && item.id > maxId) {
      maxId = item.id;
    }
  }
  return maxId + 1;
}
export function seedIdCountersFromSketch(service) {
  const sketch = service.store.get('sketch');
  service._nextPointId = nextId(sketch.points);
  service._nextLineId = nextId(sketch.lines);
  service._nextDimId = nextId(sketch.dimensions);
  service._nextConstraintId = nextId(sketch.constraints);
  service._nextCircleId = nextId(sketch.circles);
  service._nextRectangleId = nextId(sketch.rectangles);
}
export function assignConstraintIds(service) {
  for (const constraint of service.store.state.sketch.constraints || []) {
    if (!Number.isFinite(constraint?.id)) {
      constraint.id = service._nextConstraintId++;
    }
  }
}