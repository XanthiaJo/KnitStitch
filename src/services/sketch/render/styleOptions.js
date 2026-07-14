import { SketchColorOption } from '../../../models/sketch/sketchColorOption.js';

/**
 * Default and selectable appearance options for sketch strokes.
 *
 * Keeping colour and thickness defaults in one place means the store,
 * renderer, and UI can all read the same values instead of duplicating
 * hard-coded constants.
 */

export const DEFAULT_STROKE_COLOR = '#8b5d1f';
export const DEFAULT_STROKE_THICKNESS = 2;

export const MIN_STROKE_THICKNESS = 1;
export const MAX_STROKE_THICKNESS = 10;
export const STROKE_THICKNESS_STEP = 1;

/**
 * Renderer colour constants for sketch UI elements.
 *
 * These map to the site CSS palette (see web/css/site.css) so the sketch
 * canvas stays visually consistent with the rest of the site:
 *
 *   SELECTION_COLOR    → --primary-dark   (#8b5d1f)  dark gold
 *   ACCENT_COLOR       → --primary        (#ca9b52)  gold
 *   PREVIEW_COLOR      → --body-light     (#8a8a8a)  muted grey
 *   WITNESS_COLOR      → --body-light     (#8a8a8a)  muted grey
 *   LABEL_BG_COLOR     → --body-dark      (#111111)  near-black
 *   LABEL_STROKE_COLOR → --body           (#333333)  dark grey
 *   ERROR_COLOR        → --color-pair-rust-text (#9a5a42)  muted red-brown
 */
export const SELECTION_COLOR = '#8b5d1f';
export const ACCENT_COLOR = '#ca9b52';
export const PREVIEW_COLOR = '#8a8a8a';
export const WITNESS_COLOR = '#8a8a8a';
export const LABEL_BG_COLOR = '#111111';
export const LABEL_STROKE_COLOR = '#333333';
export const ERROR_COLOR = '#9a5a42';

/**
 * Sketch colour triplets.
 *
 * Each option carries three colours:
 *   stroke  — the vivid line colour the user picks
 *   fill    — the point fill colour (same as stroke for most)
 *   select  — a darker shade used for selection highlight of lines and points
 *
 * The select shade is approximately 30% darker than the stroke, keeping
 * the selection highlight in the same colour family instead of always
 * using the site-wide gold.
 */
export const STROKE_COLOR_OPTIONS = [
  new SketchColorOption('Gold',      '#8b5d1f', '#8b5d1f', '#5c3e14'),
  new SketchColorOption('Red',       '#E63946', '#E63946', '#A82833'),
  new SketchColorOption('Orange',    '#FF6B35', '#FF6B35', '#B84A22'),
  new SketchColorOption('Yellow',    '#F4C430', '#F4C430', '#A88A1E'),
  new SketchColorOption('Green',     '#2D9E4F', '#2D9E4F', '#1E6E37'),
  new SketchColorOption('Teal',      '#0A8A8A', '#0A8A8A', '#065E5E'),
  new SketchColorOption('Blue',      '#1D70B8', '#1D70B8', '#134D80'),
  new SketchColorOption('Purple',    '#6A3D9A', '#6A3D9A', '#482A6B'),
  new SketchColorOption('Pink',      '#E75480', '#E75480', '#A33A59'),
  new SketchColorOption('Black',     '#1A1A1A', '#1A1A1A', '#000000'),
  new SketchColorOption('Dark grey', '#555555', '#555555', '#2A2A2A'),
  new SketchColorOption('Grey',      '#999999', '#999999', '#666666'),
  new SketchColorOption('White',     '#F5F5F5', '#F5F5F5', '#BBBBBB'),
];

/**
 * Look up the triplet for a given stroke hex value.
 * Falls back to the default color's triplet if not found.
 */
export function getColorTriplet(strokeHex) {
  const match = STROKE_COLOR_OPTIONS.find(o => o.stroke.toLowerCase() === (strokeHex || '').toLowerCase());
  if (match) return match;
  return STROKE_COLOR_OPTIONS[0];
}
