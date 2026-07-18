// sketchPreviewRenderer.js — renders in-progress preview shapes and the
// snap-candidate highlight into a Konva group.
//
// Extracted from SketchLayer. Previews are non-interactive (listening:false)
// dashed shapes shown only while `sketch.isActive` is true and a preview
// entity is present in store state. The snap candidate renders as a ring
// at the snap point.
//
// Each renderer is a pure function; the layer calls `renderPreviews` once
// with the relevant slice of store state.

import Konva from 'konva';
import { PREVIEW_COLOR, SELECTION_COLOR } from '../services/sketch/render/styleOptions.js';

const SNAP_RING_INNER = 6;
const SNAP_RING_OUTER = 10;
const PREVIEW_DASH = [5, 5];

/**
 * Renders all active preview shapes + the snap-candidate ring into `group`.
 * Each shape is only added when `isActive` is true and its preview entity is
 * present.
 *
 * @param {Konva.Group} group
 * @param {{
 *   isActive: boolean,
 *   previewLine: any | null,
 *   previewCircle: any | null,
 *   previewRectangle: any | null,
 *   previewBezier: any | null,
 *   snapCandidate: any | null,
 * }} preview
 * @param {{ thickness: number }} ctx
 */
export function renderPreviews(group, preview, { thickness }) {
  const { isActive } = preview;
  if (isActive && preview.previewLine) renderPreviewLine(group, preview.previewLine, thickness);
  if (isActive && preview.previewCircle) renderPreviewCircle(group, preview.previewCircle, thickness);
  if (isActive && preview.previewRectangle) renderPreviewRectangle(group, preview.previewRectangle, thickness);
  if (isActive && preview.previewBezier) renderPreviewBezier(group, preview.previewBezier, thickness);
  if (isActive && preview.snapCandidate) renderSnapRing(group, preview.snapCandidate);
}

function renderPreviewLine(group, preview, thickness) {
  group.add(new Konva.Line({
    points: [preview.start.x, preview.start.y, preview.end.x, preview.end.y],
    stroke: PREVIEW_COLOR,
    strokeWidth: thickness,
    dash: PREVIEW_DASH,
    listening: false,
  }));
}

function renderPreviewCircle(group, preview, thickness) {
  group.add(new Konva.Circle({
    x: preview.center.x,
    y: preview.center.y,
    radius: preview.radius,
    stroke: PREVIEW_COLOR,
    strokeWidth: thickness,
    dash: PREVIEW_DASH,
    listening: false,
  }));
}

function renderPreviewRectangle(group, preview, thickness) {
  const { cx, cy, halfW, halfH } = preview;
  group.add(new Konva.Rect({
    x: cx - halfW,
    y: cy - halfH,
    width: halfW * 2,
    height: halfH * 2,
    stroke: PREVIEW_COLOR,
    strokeWidth: thickness,
    dash: PREVIEW_DASH,
    listening: false,
  }));
}

function renderPreviewBezier(group, preview, thickness) {
  group.add(new Konva.Shape({
    sceneFunc: (ctx, shape) => {
      const { start, control1, control2, end } = preview;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.bezierCurveTo(control1.x, control1.y, control2.x, control2.y, end.x, end.y);
      ctx.strokeStrokeShape(shape);
    },
    stroke: PREVIEW_COLOR,
    strokeWidth: thickness,
    dash: PREVIEW_DASH,
    listening: false,
  }));
}

function renderSnapRing(group, snap) {
  group.add(new Konva.Ring({
    x: snap.x,
    y: snap.y,
    innerRadius: SNAP_RING_INNER,
    outerRadius: SNAP_RING_OUTER,
    fill: SELECTION_COLOR,
    listening: false,
  }));
}
