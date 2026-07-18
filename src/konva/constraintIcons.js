import Konva from 'konva';
import { SELECTION_COLOR, ACCENT_COLOR } from '../services/sketch/render/styleOptions.js';

/**
 * Constraint icon renderers.
 *
 * Each renderer is a pure function that builds a Konva.Group for one
 * constraint and attaches the shared click handler. Adding a new
 * constraint icon is a one-function addition plus a registry entry.
 *
 * Renderers receive the parent group, the constraint, and a service
 * reference (used for the shared-point lookup and selection call).
 */

const ICON_COLOR_SELECTED = ACCENT_COLOR;
const ICON_COLOR_DEFAULT = SELECTION_COLOR;

function iconColor(constraint) {
  return constraint.isSelected ? ICON_COLOR_SELECTED : ICON_COLOR_DEFAULT;
}

function attachConstraintClick(iconGroup, constraint, service) {
  iconGroup.on('click tap', (e) => {
    e.cancelBubble = true;
    service.selectConstraint(constraint, e.evt.ctrlKey);
  });
}

function renderPerpendicularIcon(group, constraint, service) {
  const anchor = constraint.pointA ?? service._findSharedPoint(constraint.lineA, constraint.lineB);
  if (!anchor || !constraint.lineA || !constraint.lineB) return;

  const lineAPoint = constraint.lineA.start === anchor ? constraint.lineA.end : constraint.lineA.start;
  const lineBPoint = constraint.lineB.start === anchor ? constraint.lineB.end : constraint.lineB.start;
  if (!lineAPoint || !lineBPoint) return;

  const vecA = { x: lineAPoint.x - anchor.x, y: lineAPoint.y - anchor.y };
  const vecB = { x: lineBPoint.x - anchor.x, y: lineBPoint.y - anchor.y };
  const lenA = Math.hypot(vecA.x, vecA.y);
  const lenB = Math.hypot(vecB.x, vecB.y);
  if (lenA < 0.001 || lenB < 0.001) return;

  const unitA = { x: vecA.x / lenA, y: vecA.y / lenA };
  const unitB = { x: vecB.x / lenB, y: vecB.y / lenB };
  const iconSize = 8;
  const iconOrigin = {
    x: anchor.x + (unitA.x + unitB.x) * 8,
    y: anchor.y + (unitA.y + unitB.y) * 8,
  };
  const color = iconColor(constraint);

  const iconGroup = new Konva.Group({ listening: true });
  iconGroup.add(new Konva.Line({
    points: [
      iconOrigin.x + unitA.x * iconSize, iconOrigin.y + unitA.y * iconSize,
      iconOrigin.x + unitA.x * iconSize + unitB.x * iconSize, iconOrigin.y + unitA.y * iconSize + unitB.y * iconSize,
      iconOrigin.x + unitB.x * iconSize, iconOrigin.y + unitB.y * iconSize,
    ],
    stroke: color,
    strokeWidth: 2,
    hitStrokeWidth: 18,
    lineJoin: 'round',
    listening: true,
  }));
  iconGroup.add(new Konva.Circle({
    x: iconOrigin.x + (unitA.x + unitB.x) * (iconSize * 0.5),
    y: iconOrigin.y + (unitA.y + unitB.y) * (iconSize * 0.5),
    radius: 10,
    fill: 'rgba(0,0,0,0)',
    listening: true,
  }));
  attachConstraintClick(iconGroup, constraint, service);
  group.add(iconGroup);
}

function lineMarkerPosition(line, offset = 12) {
  const midX = (line.start.x + line.end.x) / 2;
  const midY = (line.start.y + line.end.y) / 2;
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return null;
  return {
    x: midX - (dy / length) * offset,
    y: midY + (dx / length) * offset,
    ux: dx / length,
    uy: dy / length,
    nx: -dy / length,
    ny: dx / length,
  };
}

function renderMidpointIcon(group, constraint, service) {
  const line = constraint.lineA;
  const point = constraint.pointA;
  const lineB = constraint.lineB;

  let midX, midY;
  if (!point && line && lineB) {
    // Line-line midpoint: icon at the shared midpoint.
    midX = ((line.start.x + line.end.x) / 2 + (lineB.start.x + lineB.end.x) / 2) / 2;
    midY = ((line.start.y + line.end.y) / 2 + (lineB.start.y + lineB.end.y) / 2) / 2;
  } else if (line && point) {
    const marker = lineMarkerPosition(line);
    if (!marker) return;
    midX = marker.x;
    midY = marker.y;
  } else {
    return;
  }

  const color = iconColor(constraint);
  const iconSize = 6;

  const iconGroup = new Konva.Group({ listening: true });
  // Draw a small diamond at the midpoint
  iconGroup.add(new Konva.Line({
    points: [
      midX, midY - iconSize,
      midX + iconSize, midY,
      midX, midY + iconSize,
      midX - iconSize, midY,
    ],
    stroke: color,
    strokeWidth: 2,
    closed: true,
    fill: 'rgba(0,0,0,0)',
    hitStrokeWidth: 18,
    listening: true,
  }));
  attachConstraintClick(iconGroup, constraint, service);
  group.add(iconGroup);
}

function renderEqualIcon(group, constraint, service) {
  const lines = [constraint.lineA, constraint.lineB].filter(Boolean);
  const color = iconColor(constraint);
  const iconSize = 6;

  for (const line of lines) {
    const marker = lineMarkerPosition(line);
    if (!marker) continue;
    const { x: iconX, y: iconY } = marker;
    const iconGroup = new Konva.Group({ listening: true });
    iconGroup.add(new Konva.Line({
      points: [iconX - iconSize, iconY - 2, iconX + iconSize, iconY - 2],
      stroke: color,
      strokeWidth: 2,
      lineCap: 'round',
      listening: true,
    }));
    iconGroup.add(new Konva.Line({
      points: [iconX - iconSize, iconY + 2, iconX + iconSize, iconY + 2],
      stroke: color,
      strokeWidth: 2,
      lineCap: 'round',
      listening: true,
    }));
    iconGroup.add(new Konva.Circle({
      x: iconX,
      y: iconY,
      radius: 10,
      fill: 'rgba(0,0,0,0)',
      listening: true,
    }));
    attachConstraintClick(iconGroup, constraint, service);
    group.add(iconGroup);
  }
}

function renderHorizontalIcon(group, constraint, service) {
  const line = constraint.lineA;
  if (!line) return;
  const marker = lineMarkerPosition(line);
  if (!marker) return;

  const color = iconColor(constraint);
  const iconSize = 6;
  const iconGroup = new Konva.Group({ listening: true });
  iconGroup.add(new Konva.Line({
    points: [marker.x - iconSize, marker.y, marker.x + iconSize, marker.y],
    stroke: color,
    strokeWidth: 2,
    lineCap: 'round',
    listening: true,
    hitStrokeWidth: 14,
  }));
  iconGroup.add(new Konva.Circle({
    x: marker.x,
    y: marker.y,
    radius: 10,
    fill: 'rgba(0,0,0,0)',
    listening: true,
  }));
  attachConstraintClick(iconGroup, constraint, service);
  group.add(iconGroup);
}

function renderVerticalIcon(group, constraint, service) {
  const line = constraint.lineA;
  if (!line) return;
  const marker = lineMarkerPosition(line);
  if (!marker) return;

  const color = iconColor(constraint);
  const iconSize = 6;
  const iconGroup = new Konva.Group({ listening: true });
  iconGroup.add(new Konva.Line({
    points: [marker.x, marker.y - iconSize, marker.x, marker.y + iconSize],
    stroke: color,
    strokeWidth: 2,
    lineCap: 'round',
    listening: true,
    hitStrokeWidth: 14,
  }));
  iconGroup.add(new Konva.Circle({
    x: marker.x,
    y: marker.y,
    radius: 10,
    fill: 'rgba(0,0,0,0)',
    listening: true,
  }));
  attachConstraintClick(iconGroup, constraint, service);
  group.add(iconGroup);
}

function renderCoincidentIcon(group, constraint, service) {
  const point = constraint.pointA;
  if (!point) return;

  const line = constraint.lineA;
  const lineMid = line && {
    x: (line.start.x + line.end.x) / 2,
    y: (line.start.y + line.end.y) / 2,
  };
  const awayX = lineMid ? point.x - lineMid.x : 1;
  const awayY = lineMid ? point.y - lineMid.y : -1;
  const awayLength = Math.hypot(awayX, awayY) || 1;
  const iconX = point.x + (awayX / awayLength) * 12;
  const iconY = point.y + (awayY / awayLength) * 12;

  const color = iconColor(constraint);
  const iconSize = 6;

  const iconGroup = new Konva.Group({ listening: true });
  // Bullseye-style circle offset from the coincident point
  iconGroup.add(new Konva.Circle({
    x: iconX,
    y: iconY,
    radius: iconSize,
    stroke: color,
    strokeWidth: 2,
    fill: 'rgba(0,0,0,0)',
    listening: true,
  }));
  iconGroup.add(new Konva.Circle({
    x: iconX,
    y: iconY,
    radius: 10,
    fill: 'rgba(0,0,0,0)',
    listening: true,
  }));
  attachConstraintClick(iconGroup, constraint, service);
  group.add(iconGroup);
}

function renderParallelIcon(group, constraint, service) {
  const line = constraint.lineA;
  if (!line) return;

  const marker = lineMarkerPosition(line, 16);
  if (!marker) return;

  const { x: midX, y: midY, ux, uy, nx, ny } = marker;
  const color = iconColor(constraint);
  const tickHalf = 5;   // half-length of each tick along the line direction
  const gap = 3;        // perpendicular offset of each tick from the midpoint

  const iconGroup = new Konva.Group({ listening: true });
  // Two short parallel ticks, offset on either side of the midpoint
  for (const sign of [-1, 1]) {
    const cx = midX + nx * gap * sign;
    const cy = midY + ny * gap * sign;
    iconGroup.add(new Konva.Line({
      points: [
        cx - ux * tickHalf, cy - uy * tickHalf,
        cx + ux * tickHalf, cy + uy * tickHalf,
      ],
      stroke: color,
      strokeWidth: 2,
      lineCap: 'round',
      listening: true,
      hitStrokeWidth: 18,
    }));
  }
  iconGroup.add(new Konva.Circle({
    x: midX,
    y: midY,
    radius: 10,
    fill: 'rgba(0,0,0,0)',
    listening: true,
  }));
  attachConstraintClick(iconGroup, constraint, service);
  group.add(iconGroup);
}

const REGISTRY = {
  Perpendicular: renderPerpendicularIcon,
  Parallel: renderParallelIcon,
  Midpoint: renderMidpointIcon,
  Equal: renderEqualIcon,
  Horizontal: renderHorizontalIcon,
  Vertical: renderVerticalIcon,
  Coincident: renderCoincidentIcon,
};

/**
 * Renders all constraint icons for the given constraints into `group`.
 * Unknown constraint types are silently skipped.
 */
export function renderConstraintIcons(group, constraints, service) {
  for (const constraint of constraints) {
    const renderer = REGISTRY[constraint?.type];
    if (renderer) renderer(group, constraint, service);
  }
}
