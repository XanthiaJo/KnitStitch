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

  // Collect rectangles to remove (selected, or any component point/line selected)
  const rectanglesToRemove = new Set();
  for (const rect of sketch.rectangles || []) {
    if (rect.isSelected) {
      rectanglesToRemove.add(rect);
    } else {
      // Check if any component is in the removed/lines sets
      const componentSelected =
        (rect.center && removedPoints.has(rect.center)) ||
        rect.corners.some((p) => removedPoints.has(p)) ||
        rect.edges.some((l) => linesToRemove.has(l)) ||
        rect.constructionLines.some((l) => linesToRemove.has(l));
      if (componentSelected) {
        rectanglesToRemove.add(rect);
      }
    }
  }

  // Add rectangle components to the removal sets
  for (const rect of rectanglesToRemove) {
    if (rect.center) removedPoints.add(rect.center);
    for (const p of rect.corners) removedPoints.add(p);
    for (const l of rect.edges) linesToRemove.add(l);
    for (const l of rect.constructionLines) linesToRemove.add(l);
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
  sketch.rectangles = (sketch.rectangles || []).filter((r) => !rectanglesToRemove.has(r));

  return {
    dimsToRemove,
    linesToRemove,
    removedPoints,
    circlesToRemove,
    rectanglesToRemove,
  };
}
