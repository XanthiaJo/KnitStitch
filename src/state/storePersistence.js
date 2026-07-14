// StorePersistence.js - localStorage persistence layer for Store

import { SketchPoint } from '../models/sketch/sketchPoint.js';
import { SketchLine } from '../models/sketch/sketchLine.js';
import { SketchDimension } from '../models/sketch/sketchDimension.js';
import { SketchConstraint } from '../models/sketch/sketchConstraint.js';

const STORAGE_KEY = 'knitstitch_state';
const DEBOUNCE_MS = 300;

// Paths saved to localStorage. Transient UI state is excluded.
const PERSISTED_PATHS = new Set([
  'cellWidthPx',
  'cellHeightPx',
  'stitchesPer4Inches',
  'rowsPer4Inches',
  'filledCells',
  'overlayImageSrc',
  'overlayOpacity',
  'overlayVisible',
  'zoomLevel',
  'activeTemplateId',
  'templateMeasurements',
  'sketch.strokeColor',
  'sketch.strokeThickness',
  'sketch.lines',
  'sketch.points',
  'sketch.dimensions',
  'sketch.constraints',
]);

// Top-level sketch keys that are saved (used during hydration)
const PERSISTED_SKETCH_KEYS = new Set([
  'strokeColor',
  'strokeThickness',
  'lines',
  'points',
  'dimensions',
  'constraints',
]);

export class StorePersistence {
  constructor(store) {
    this._store = store;
    this._debounceTimer = null;
  }

  // Call once before the app boots to restore saved state into the store.
  hydrate() {
    let saved;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      saved = JSON.parse(raw);
    } catch {
      return;
    }

    const s = this._store;

    // Scalar top-level keys
    const scalars = [
      'cellWidthPx', 'cellHeightPx',
      'stitchesPer4Inches', 'rowsPer4Inches',
      'overlayOpacity', 'overlayVisible', 'overlayImageSrc',
      'zoomLevel', 'activeTemplateId',
    ];
    for (const key of scalars) {
      if (saved[key] !== undefined) {
        s.set(key, saved[key]);
      }
    }

    // templateMeasurements — object
    if (saved.templateMeasurements && typeof saved.templateMeasurements === 'object') {
      s.set('templateMeasurements', saved.templateMeasurements);
    }

    // filledCells — array of "r,c" strings → Set
    if (Array.isArray(saved.filledCells)) {
      s.set('filledCells', new Set(saved.filledCells));
    }
    // Migrate old previewCells array if present
    if (Array.isArray(saved.previewCells) && !saved.filledCells) {
      const oldCells = saved.previewCells;
      const cols = saved.gridColumns || 30;
      const filled = new Set();
      for (let i = 0; i < oldCells.length; i++) {
        if (oldCells[i]?.isFilled) {
          const r = Math.floor(i / cols);
          const c = i % cols;
          filled.add(`${r},${c}`);
        }
      }
      if (filled.size > 0) {
        s.set('filledCells', filled);
      }
    }

    // Sketch sub-keys
    if (saved.sketch && typeof saved.sketch === 'object') {
      const normalizedSketch = this._normalizeSketch(saved.sketch);
      for (const key of PERSISTED_SKETCH_KEYS) {
        if (normalizedSketch[key] !== undefined) {
          s.set(`sketch.${key}`, normalizedSketch[key]);
        }
      }
    }
  }

  // Call after the app boots to start watching for changes.
  attach() {
    this._store.subscribe((path) => {
      if (PERSISTED_PATHS.has(path)) {
        this._scheduleSave();
      }
    });
  }

  _scheduleSave() {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      this._save();
    }, DEBOUNCE_MS);
  }

  _save() {
    const state = this._store.state;
    const sketch = state.sketch;

    const payload = {
      cellWidthPx: state.cellWidthPx,
      cellHeightPx: state.cellHeightPx,
      stitchesPer4Inches: state.stitchesPer4Inches,
      rowsPer4Inches: state.rowsPer4Inches,
      filledCells: Array.from(state.filledCells),
      overlayImageSrc: state.overlayImageSrc,
      overlayOpacity: state.overlayOpacity,
      overlayVisible: state.overlayVisible,
      zoomLevel: state.zoomLevel,
      activeTemplateId: state.activeTemplateId,
      templateMeasurements: state.templateMeasurements,
      sketch: {
        strokeColor: sketch.strokeColor,
        strokeThickness: sketch.strokeThickness,
        lines: sketch.lines,
        points: sketch.points,
        dimensions: sketch.dimensions,
        constraints: sketch.constraints,
      },
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      // QuotaExceededError — most likely caused by a large overlayImageSrc.
      // Retry without the image.
      console.warn('StorePersistence: quota exceeded, retrying without overlay image.', e);
      payload.overlayImageSrc = null;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        console.error('StorePersistence: save failed even without overlay image.');
      }
    }
  }

  // Wipe all persisted state (e.g. for a "reset" button).
  clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  _normalizeSketch(savedSketch) {
    const rawPoints = Array.isArray(savedSketch.points) ? savedSketch.points : [];
    const points = rawPoints.map((raw) => {
      const point = new SketchPoint(raw.id ?? 0, raw.x ?? 0, raw.y ?? 0);
      point.isSelected = !!raw.isSelected;
      point.isAnchor = !!raw.isAnchor;
      return point;
    });
    const pointById = new Map(points.map((point) => [point.id, point]));

    const rawLines = Array.isArray(savedSketch.lines) ? savedSketch.lines : [];
    const lines = rawLines.map((raw) => {
      const line = new SketchLine(
        raw.id ?? 0,
        pointById.get(raw.start?.id) ?? new SketchPoint(raw.start?.id ?? 0, raw.start?.x ?? 0, raw.start?.y ?? 0),
        pointById.get(raw.end?.id) ?? new SketchPoint(raw.end?.id ?? 0, raw.end?.x ?? 0, raw.end?.y ?? 0),
        !!raw.isConstruction
      );
      line.isSelected = !!raw.isSelected;
      return line;
    });
    const lineById = new Map(lines.map((line) => [line.id, line]));

    const rawDimensions = Array.isArray(savedSketch.dimensions) ? savedSketch.dimensions : [];
    const dimensions = rawDimensions.map((raw) => {
      const a = pointById.get(raw.a?.id) ?? new SketchPoint(raw.a?.id ?? 0, raw.a?.x ?? 0, raw.a?.y ?? 0);
      const b = pointById.get(raw.b?.id) ?? new SketchPoint(raw.b?.id ?? 0, raw.b?.x ?? 0, raw.b?.y ?? 0);
      const dim = new SketchDimension(raw.id ?? 0, a, b, raw.offsetSign ?? 1);
      if (raw.drivenValue !== null && raw.drivenValue !== undefined) {
        if (raw.displayValue !== null && raw.displayValue !== undefined && raw.displaySuffix) {
          dim.setDrivenDisplay(raw.drivenValue, raw.displayValue, raw.displaySuffix);
        } else {
          dim.setDrivenValue(raw.drivenValue);
        }
      }
      dim.isSelected = !!raw.isSelected;
      return dim;
    });

    const rawConstraints = Array.isArray(savedSketch.constraints) ? savedSketch.constraints : [];
    const constraints = rawConstraints.map((raw) => {
      const pointA = pointById.get(raw.pointA?.id) ?? null;
      const pointB = pointById.get(raw.pointB?.id) ?? null;
      const lineA = lineById.get(raw.lineA?.id) ?? null;
      const lineB = lineById.get(raw.lineB?.id) ?? null;
      const constraint = new SketchConstraint(raw.type ?? 'Constraint', pointA, pointB, lineA, lineB, raw.id ?? null);
      constraint.isSelected = !!raw.isSelected;
      return constraint;
    });

    return {
      ...savedSketch,
      points,
      lines,
      dimensions,
      constraints,
    };
  }
}
