import { SketchObjectKind } from '../constants.js';

export function buildSketchObjects(sketch, { findSharedPoint }) {
  const objects = [];

  // Build a set of component IDs owned by rectangles so we can filter them
  // out of the individual line/point/constraint listings — they show as a
  // single "Rectangle N" entry instead.
  const rectOwnedPointIds = new Set();
  const rectOwnedLineIds = new Set();
  const rectOwnedConstraintIds = new Set();
  for (const rect of sketch.rectangles || []) {
    if (rect.center) rectOwnedPointIds.add(rect.center.id);
    for (const p of rect.corners) rectOwnedPointIds.add(p.id);
    for (const l of rect.edges) rectOwnedLineIds.add(l.id);
    for (const l of rect.constructionLines) rectOwnedLineIds.add(l.id);
    for (const c of rect.constraints) rectOwnedConstraintIds.add(c.id);
  }

  for (const line of sketch.lines) {
    if (rectOwnedLineIds.has(line.id)) continue;
    const prefix = line.isConstruction ? 'Construction ' : '';
    objects.push({
      kind: SketchObjectKind.Line,
      label: `${prefix}Line ${line.id + 1}  (${line.start.x.toFixed(0)},${line.start.y.toFixed(0)}) -> (${line.end.x.toFixed(0)},${line.end.y.toFixed(0)})`,
      refType: 'line',
      refId: line.id,
      isSelected: line.isSelected,
    });
  }

  // Rectangles (shown before points so they appear as grouped entities)
  for (const rect of sketch.rectangles || []) {
    const cx = rect.center?.x ?? 0;
    const cy = rect.center?.y ?? 0;
    objects.push({
      kind: SketchObjectKind.Rectangle,
      label: `Rectangle R${rect.id + 1}  @ (${cx.toFixed(0)},${cy.toFixed(0)})`,
      refType: 'rectangle',
      refId: rect.id,
      isSelected: rect.isSelected,
    });
  }

  // Circles
  for (const circle of sketch.circles || []) {
    objects.push({
      kind: SketchObjectKind.Circle,
      label: `Circle C${circle.id + 1}  @ (${circle.center.x.toFixed(0)},${circle.center.y.toFixed(0)}) r=${circle.radius.toFixed(0)}`,
      refType: 'circle',
      refId: circle.id,
      isSelected: circle.isSelected,
    });
  }

  const usage = new Map();
  for (const line of sketch.lines) {
    if (rectOwnedLineIds.has(line.id)) continue;
    if (!usage.has(line.start)) usage.set(line.start, []);
    if (!usage.has(line.end)) usage.set(line.end, []);
    usage.get(line.start).push(line.id);
    usage.get(line.end).push(line.id);
  }

  for (const [pt, ids] of usage) {
    if (ids.length < 2) continue;
    const names = ids.map((id) => `Line ${id + 1}`).join(' & ');
    objects.push({
      kind: SketchObjectKind.Coincident,
      label: `Coincident  ${names}  @ (${pt.x.toFixed(0)},${pt.y.toFixed(0)})`,
      refType: null,
      refId: null,
      isSelected: false,
    });
  }

  // Points (anchors are shown first)
  for (const pt of sketch.points) {
    if (!pt.isAnchor) continue;
    objects.push({
      kind: SketchObjectKind.Anchor,
      label: `Anchor A${pt.id + 1}  (${pt.x.toFixed(0)},${pt.y.toFixed(0)})`,
      refType: 'point',
      refId: pt.id,
      isSelected: pt.isSelected,
    });
  }
  for (const pt of sketch.points) {
    if (pt.isAnchor) continue;
    if (rectOwnedPointIds.has(pt.id)) continue;
    objects.push({
      kind: SketchObjectKind.Point,
      label: `Point P${pt.id + 1}  (${pt.x.toFixed(0)},${pt.y.toFixed(0)})`,
      refType: 'point',
      refId: pt.id,
      isSelected: pt.isSelected,
    });
  }

  for (const constraint of sketch.constraints || []) {
    if (rectOwnedConstraintIds.has(constraint?.id)) continue;
    let label = constraint?.description ?? 'Constraint';
    let kind = SketchObjectKind.Constraint;

    if (constraint?.type === 'Coincident') {
      const a = constraint.pointA;
      const b = constraint.pointB;
      label = a && b
        ? `Coincident P${a.id + 1} & P${b.id + 1}  @ (${a.x.toFixed(0)},${a.y.toFixed(0)})`
        : 'Coincident';
      kind = SketchObjectKind.Coincident;
    } else if (constraint?.type === 'Perpendicular') {
      const pivot = constraint.pointA ?? findSharedPoint(constraint.lineA, constraint.lineB);
      label = pivot
        ? `Perpendicular L${constraint.lineA.id + 1} & L${constraint.lineB.id + 1}  @ (${pivot.x.toFixed(0)},${pivot.y.toFixed(0)})`
        : `Perpendicular L${constraint.lineA.id + 1} & L${constraint.lineB.id + 1}`;
      kind = SketchObjectKind.Perpendicular;
    } else if (constraint?.type === 'Parallel') {
      const a = constraint.lineA;
      const b = constraint.lineB;
      label = a && b
        ? `Parallel L${a.id + 1} & L${b.id + 1}`
        : `Parallel ${constraint.description}`;
      kind = SketchObjectKind.Parallel;
    } else if (constraint?.type === 'Midpoint') {
      if (constraint.lineA && constraint.lineB && !constraint.pointA) {
        const a = constraint.lineA;
        const b = constraint.lineB;
        const mx = ((a.start.x + a.end.x) / 2 + (b.start.x + b.end.x) / 2) / 2;
        const my = ((a.start.y + a.end.y) / 2 + (b.start.y + b.end.y) / 2) / 2;
        label = `Midpoint L${a.id + 1} & L${b.id + 1}  @ (${mx.toFixed(0)},${my.toFixed(0)})`;
      } else {
        const pt = constraint.pointA;
        const line = constraint.lineA;
        label = pt && line
          ? `Midpoint P${pt.id + 1} on L${line.id + 1}  @ (${pt.x.toFixed(0)},${pt.y.toFixed(0)})`
          : `Midpoint ${constraint.description}`;
      }
      kind = SketchObjectKind.Midpoint;
    } else if (constraint?.type === 'Equal') {
      const a = constraint.lineA;
      const b = constraint.lineB;
      label = a && b
        ? `Equal L${a.id + 1} & L${b.id + 1}`
        : `Equal ${constraint.description}`;
      kind = SketchObjectKind.Equal;
    } else if (constraint?.type === 'Horizontal') {
      const line = constraint.lineA;
      label = line
        ? `Horizontal L${line.id + 1}`
        : `Horizontal ${constraint.description}`;
      kind = SketchObjectKind.Horizontal;
    } else if (constraint?.type === 'Vertical') {
      const line = constraint.lineA;
      label = line
        ? `Vertical L${line.id + 1}`
        : `Vertical ${constraint.description}`;
      kind = SketchObjectKind.Vertical;
    }

    objects.push({
      kind,
      label,
      refType: 'constraint',
      refId: constraint.id,
      isSelected: !!constraint.isSelected,
    });
  }

  for (const dim of sketch.dimensions) {
    const kindLabel = dim.kind === 'Horizontal' ? 'H' : dim.kind === 'Vertical' ? 'V' : 'Aligned';
    objects.push({
      kind: SketchObjectKind.Dimension,
      label: `Dim ${dim.id + 1}  [${kindLabel}]  ${dim.labelText}`,
      refType: 'dimension',
      refId: dim.id,
      isSelected: dim.isSelected,
    });
  }

  return objects;
}
