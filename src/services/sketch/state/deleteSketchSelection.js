export function deleteSketchSelection({ sketch, selectedPoints, selectedLines }) {
  const removedPoints = new Set(selectedPoints);
  const linesToRemove = new Set(selectedLines);

  for (const point of selectedPoints) {
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

  return {
    dimsToRemove,
    linesToRemove,
    removedPoints,
  };
}
