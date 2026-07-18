export function deleteSketchSelection({ sketch, selectedPoints, selectedLines }) {
  const removedPoints = new Set(selectedPoints);
  const linesToRemove = new Set(selectedLines);

  // Collect circles to remove (selected or whose center is a removed point)
  const circlesToRemove = new Set();
  for (const circle of sketch.circles || []) {
    if (circle.isSelected || removedPoints.has(circle.center)) {
      circlesToRemove.add(circle);
      removedPoints.add(circle.center);
    }
  }

  // Collect Béziers to remove (selected, or any control point removed)
  const beziersToRemove = new Set();
  for (const bezier of sketch.beziers || []) {
    if (bezier.isSelected ||
        removedPoints.has(bezier.start) ||
        removedPoints.has(bezier.control1) ||
        removedPoints.has(bezier.control2) ||
        removedPoints.has(bezier.end)) {
      beziersToRemove.add(bezier);
      removedPoints.add(bezier.start);
      removedPoints.add(bezier.control1);
      removedPoints.add(bezier.control2);
      removedPoints.add(bezier.end);
    }
  }

  for (const point of removedPoints) {
    for (const line of sketch.lines) {
      if (line.start === point || line.end === point) {
        linesToRemove.add(line);
      }
    }
  }

  for (const line of linesToRemove) {
    removedPoints.add(line.start);
    removedPoints.add(line.end);
  }

  const dimsToRemove = new Set();
  for (const dim of sketch.dimensions) {
    if (dim.isSelected || removedPoints.has(dim.a) || removedPoints.has(dim.b)) {
      dimsToRemove.add(dim);
      removedPoints.add(dim.a);
      removedPoints.add(dim.b);
    }
  }
  sketch.dimensions = sketch.dimensions.filter((dim) => !dimsToRemove.has(dim));

  if (sketch.constraints.length > 0) {
    sketch.constraints = sketch.constraints.filter((constraint) => {
      if (constraint?.isSelected) return false;
      const usesRemovedPoint =
        (constraint?.pointA && removedPoints.has(constraint.pointA))
        || (constraint?.pointB && removedPoints.has(constraint.pointB));
      const usesRemovedLine =
        (constraint?.lineA && linesToRemove.has(constraint.lineA))
        || (constraint?.lineB && linesToRemove.has(constraint.lineB));
      return !usesRemovedLine && !usesRemovedPoint;
    });
  }

  sketch.lines = sketch.lines.filter((line) => !linesToRemove.has(line));
  sketch.circles = (sketch.circles || []).filter((c) => !circlesToRemove.has(c));
  sketch.beziers = (sketch.beziers || []).filter((b) => !beziersToRemove.has(b));

  return {
    dimsToRemove,
    linesToRemove,
    removedPoints,
    circlesToRemove,
    beziersToRemove,
  };
}
