// sketchSerialization.js — import/export serialization for the sketch.
//
// The on-disk format is a JSON object with a `format`/`version` header, a
// `gauge`/`grid` slice (so a saved pattern round-trips with its stitch
// context), the manual `filledCells`, and a `sketch` slice that mirrors the
// shape produced by `captureSketchSnapshot` (id-referenced entities + the
// service's next-id counters). `restoreSketchSnapshot` consumes that sketch
// slice directly on replace; for merge we remap every id to a fresh one
// before appending.

import { captureSketchSnapshot } from './state/sketchSnapshot.js';

export const EXPORT_FORMAT = 'knitstitch-pattern';
export const EXPORT_VERSION = 1;

// Transient sketch fields that should never be persisted. They are captured
// by `captureSketchSnapshot` (because undo needs them) but have no place in
// an exported file.
const TRANSIENT_SNAPSHOT_KEYS = [
  'previewLine',
  'snapCandidate',
  'pendingStartId',
  'dimPendingAId',
  'constraintPendingLineId',
];

// Top-level scalar state that travels with an exported pattern. These are the
// same keys `StorePersistence` hydrates, restricted to the ones that define
// the stitch context (gauge + grid metrics + fill threshold).
const PATTERN_SCALARS = [
  'cellWidthPx',
  'cellHeightPx',
  'stitchesPer4Inches',
  'rowsPer4Inches',
  'fillThreshold',
];

/**
 * Builds the plain-object payload for an exported pattern. The returned
 * object is suitable for `JSON.stringify` and round-trips through
 * `parsePatternPayload`.
 *
 * @param {object} state - the store's `state` object
 * @param {object} service - the SketchService (used to read next-id counters)
 * @returns {object} pattern payload
 */
export function serializePattern(state, service) {
  const snapshot = captureSketchSnapshot(state.sketch, service);
  for (const key of TRANSIENT_SNAPSHOT_KEYS) {
    delete snapshot[key];
  }

  const gauge = {};
  for (const key of PATTERN_SCALARS) {
    gauge[key] = state[key];
  }

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    gauge,
    filledCells: Array.from(state.filledCells || []),
    sketch: snapshot,
  };
}

/**
 * Validates a parsed pattern payload object. Throws if the format is
 * not a KnitStitch pattern or if the version is unsupported.
 *
 * @param {object} payload
 * @returns {object} the same payload, if valid
 */
export function validatePatternPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('File is not a valid pattern object.');
  }
  if (payload.format !== EXPORT_FORMAT) {
    throw new Error(`Unrecognized pattern format "${payload.format}". Expected "${EXPORT_FORMAT}".`);
  }
  if (typeof payload.version !== 'number' || payload.version > EXPORT_VERSION) {
    throw new Error(`Unsupported pattern version ${payload.version}. This build supports up to version ${EXPORT_VERSION}.`);
  }
  if (!payload.sketch || typeof payload.sketch !== 'object') {
    throw new Error('Pattern is missing a sketch section.');
  }
  return payload;
}

/**
 * Parses and validates a pattern payload string. Throws if the format is
 * not a KnitStitch pattern or if the version is unsupported.
 *
 * @param {string} text
 * @returns {object} pattern payload
 */
export function parsePatternPayload(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    throw new Error('File is not valid JSON.');
  }
  return validatePatternPayload(payload);
}

/**
 * Remaps every id in a sketch snapshot to a fresh id allocated from the
 * service's next-id counters, and bumps those counters. Returns a new
 * snapshot; the input is not mutated.
 *
 * Used by merge import so imported entities never collide with existing ids.
 *
 * @param {object} snapshot - a sketch snapshot in `captureSketchSnapshot` shape
 * @param {object} service - the SketchService (its _nextXId counters are bumped)
 * @returns {object} a new snapshot with all ids remapped
 */
export function remapSketchSnapshotForMerge(snapshot, service) {
  const pointIdMap = new Map();
  const lineIdMap = new Map();
  const constraintIdMap = new Map();

  const remapPointId = (oldId) => {
    if (oldId == null) return null;
    if (!pointIdMap.has(oldId)) pointIdMap.set(oldId, service._nextPointId++);
    return pointIdMap.get(oldId);
  };
  const remapLineId = (oldId) => {
    if (oldId == null) return null;
    if (!lineIdMap.has(oldId)) lineIdMap.set(oldId, service._nextLineId++);
    return lineIdMap.get(oldId);
  };
  const remapConstraintId = (oldId) => {
    if (oldId == null) return null;
    if (!constraintIdMap.has(oldId)) constraintIdMap.set(oldId, service._nextConstraintId++);
    return constraintIdMap.get(oldId);
  };

  // Points first so line/dim/constraint refs can resolve.
  const points = (snapshot.points || []).map((raw) => ({
    ...raw,
    id: remapPointId(raw.id),
  }));

  const lines = (snapshot.lines || []).map((raw) => ({
    ...raw,
    id: remapLineId(raw.id),
    startId: remapPointId(raw.startId),
    endId: remapPointId(raw.endId),
  }));

  const dimensions = (snapshot.dimensions || []).map((raw) => ({
    ...raw,
    id: service._nextDimId++,
    aId: remapPointId(raw.aId),
    bId: remapPointId(raw.bId),
  }));

  const constraints = (snapshot.constraints || []).map((raw) => ({
    ...raw,
    id: remapConstraintId(raw.id),
    pointAId: raw.pointAId != null ? remapPointId(raw.pointAId) : null,
    pointBId: raw.pointBId != null ? remapPointId(raw.pointBId) : null,
    lineAId: raw.lineAId != null ? remapLineId(raw.lineAId) : null,
    lineBId: raw.lineBId != null ? remapLineId(raw.lineBId) : null,
  }));

  const circles = (snapshot.circles || []).map((raw) => ({
    ...raw,
    id: service._nextCircleId++,
    centerId: remapPointId(raw.centerId),
  }));

  const beziers = (snapshot.beziers || []).map((raw) => ({
    ...raw,
    id: service._nextBezierId++,
    startId: remapPointId(raw.startId),
    control1Id: remapPointId(raw.control1Id),
    control2Id: remapPointId(raw.control2Id),
    endId: remapPointId(raw.endId),
  }));

  return {
    ...snapshot,
    points,
    lines,
    dimensions,
    constraints,
    circles,
    beziers,
    // Transient fields are nulled out — merge never carries preview/pending state.
    previewLine: null,
    snapCandidate: null,
    pendingStartId: null,
    dimPendingAId: null,
    constraintPendingLineId: null,
    nextPointId: service._nextPointId,
    nextLineId: service._nextLineId,
    nextDimId: service._nextDimId,
    nextConstraintId: service._nextConstraintId,
    nextCircleId: service._nextCircleId,
    nextBezierId: service._nextBezierId,
  };
}
