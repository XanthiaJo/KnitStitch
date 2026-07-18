import { STROKE_COLOR_OPTIONS } from './render/styleOptions.js';
import { SlvsAdapter } from './solver/slvsAdapter.js';
import { ToolRegistry } from './tools/toolRegistry.js';
import { HistoryManager } from './state/historyManager.js';
import { nearestPoint, findSharedPoint } from '../../utils/geometry.js';
import { ConstraintSubMode, SNAP_RADIUS, SketchObjectKind, SketchTool } from './constants.js';
import { removeOrphanPoint } from './state/sketchCleanup.js';
import { syncSketchStateToStore, rebuildSketchObjects, flushSketchArrays, setPreviewLine, setSnapCandidate } from './state/sketchStoreSync.js';
import { seedIdCountersFromSketch, assignConstraintIds } from './state/sketchIdManager.js';
import { startDrag, onCanvasMouseUp, onSelectMouseMove } from './interactions/dragHandler.js';
import { ensureOriginAnchor, undo, clear, cancelCurrentLine, recordSnapshot, exitToSelect } from './state/lifecycle.js';
import { clearSelection, selectPoint, selectLine, selectDimension, selectConstraint, selectCircle, selectRectangle, selectObjectByRef } from './state/sketchSelection.js';
import { deleteSelected, getHasSelection } from './state/selection.js';
import { getIsActive, setIsActive, getActiveTool, setActiveTool, getConstraintSubMode, setConstraintSubMode, getStrokeColor, setStrokeColor, getStrokeThickness, setStrokeThickness, getPendingStart, setPendingStart, getTemplates } from './state/properties.js';
import { applyTemplate, regenerateTemplate } from './templates/templateActions.js';

export { ConstraintSubMode, SketchObjectKind, SketchTool } from './constants.js';

export class SketchService {
  constructor(store) {
    this.store = store;
    this._nextPointId = 0;
    this._nextLineId = 0;
    this._nextDimId = 0;
    this._nextConstraintId = 0;
    this._nextCircleId = 0;
    this._nextRectangleId = 0;
    this._dimPendingA = null;
    this._constraintPendingLine = null;
    this._constraintPendingPoint = null;
    this._selectedPoints = new Set();
    this._selectedLines = new Set();
    this._suppressNextClick = false;
    this._slvsAdapter = null;
    this._slvsInitPromise = null;
    this._toolRegistry = new ToolRegistry(this);
    this._history = new HistoryManager(this);

    this.strokeColorOptions = STROKE_COLOR_OPTIONS;

    syncSketchStateToStore(this.store);
    seedIdCountersFromSketch(this);

    // The SolveSpace WASM bundle (~6 MB) is NOT loaded here. Loading it
    // still involves a long, largely unavoidable main-thread block (see
    // ensureSolver() for details and AGENTS.md "SolveSpace WASM Solver
    // Loading" for the full writeup of what's been tried). The caller
    // (main.js) is responsible for kicking off ensureSolver() once the
    // page has had a chance to paint, and for showing a loading
    // indicator while it resolves. It's also triggered lazily by tool
    // selection (properties.js) and by any solve attempt, as a fallback.
  }

  // Tool accessors — the registry owns the tool instances.
  get _lineTool() {
    return this._toolRegistry.getTool(SketchTool.Line);
  }

  get _dimensionTool() {
    return this._toolRegistry.getTool(SketchTool.Dimension);
  }

  get _constraintTool() {
    return this._toolRegistry.getTool(SketchTool.Constraint);
  }

  get _anchorTool() {
    return this._toolRegistry.getTool(SketchTool.Anchor);
  }

  get _circleTool() {
    return this._toolRegistry.getTool(SketchTool.Circle);
  }

  get _rectangleTool() {
    return this._toolRegistry.getTool(SketchTool.Rectangle);
  }

  get _templateTool() {
    return this._toolRegistry.templateTool;
  }

  onCanvasClick(position, modifiers = {}) {
    return this._toolRegistry.onCanvasClick(position, modifiers);
  }

  onLineClick(line, position, modifiers = {}) {
    return this._toolRegistry.onLineClick(line, position, modifiers);
  }

  onPointClick(pt, position, modifiers = {}) {
    return this._toolRegistry.onPointClick(pt, position, modifiers);
  }

  onCanvasMouseMove(position, modifiers = {}) {
    return this._toolRegistry.onCanvasMouseMove(position, modifiers);
  }

  onRightMouseDown() {
    return this._toolRegistry.onRightMouseDown();
  }

  onCanvasMouseDown(position, modifiers = {}) {
    return this._toolRegistry.onCanvasMouseDown(position, modifiers);
  }

  exitToSelect() {
    return exitToSelect(this);
  }

  startDrag(position, modifiers = {}) {
    return startDrag(this, position, modifiers);
  }

  onCanvasMouseUp() {
    return onCanvasMouseUp(this);
  }

  _onSelectMouseMove(position, modifiers = {}) {
    return onSelectMouseMove(this, position, modifiers);
  }

  ensureOriginAnchor() {
    return ensureOriginAnchor(this);
  }

  undo() {
    return undo(this);
  }

  clear() {
    return clear(this);
  }

  cancelCurrentLine() {
    return cancelCurrentLine(this);
  }

  _recordSnapshot(description) {
    return recordSnapshot(this, description);
  }

  deleteSelected() {
    return deleteSelected(this);
  }

  get hasSelection() {
    return getHasSelection(this);
  }

  clearSelection() {
    return clearSelection(this);
  }

  selectPoint(point, multiSelect = false) {
    return selectPoint(this, point, multiSelect);
  }

  selectLine(line, multiSelect = false) {
    return selectLine(this, line, multiSelect);
  }

  selectDimension(dim, multiSelect = false) {
    return selectDimension(this, dim, multiSelect);
  }

  selectConstraint(constraint, multiSelect = false) {
    return selectConstraint(this, constraint, multiSelect);
  }

  selectCircle(circle, multiSelect = false) {
    return selectCircle(this, circle, multiSelect);
  }

  selectRectangle(rect, multiSelect = false) {
    return selectRectangle(this, rect, multiSelect);
  }

  selectObjectByRef(refType, refId, multiSelect = false) {
    return selectObjectByRef(this, refType, refId, multiSelect);
  }

  get isActive() {
    return getIsActive(this);
  }

  set isActive(value) {
    setIsActive(this, value);
  }

  get activeTool() {
    return getActiveTool(this);
  }

  set activeTool(value) {
    setActiveTool(this, value);
  }

  get constraintSubMode() {
    return getConstraintSubMode(this);
  }

  set constraintSubMode(value) {
    setConstraintSubMode(this, value);
  }

  get strokeColor() {
    return getStrokeColor(this);
  }

  set strokeColor(value) {
    setStrokeColor(this, value);
  }

  get strokeThickness() {
    return getStrokeThickness(this);
  }

  set strokeThickness(value) {
    setStrokeThickness(this, value);
  }

  get _pendingStart() {
    return getPendingStart(this);
  }

  set _pendingStart(value) {
    setPendingStart(this, value);
  }

  get templates() {
    return getTemplates(this);
  }

  applyTemplate(templateId) {
    return applyTemplate(this, templateId);
  }

  regenerateTemplate(measurements) {
    return regenerateTemplate(this, measurements);
  }

  _findNearestPoint(position, allowSnap = true, excludePoint = null) {
    const snapRadius = allowSnap ? SNAP_RADIUS : 0.001;
    return nearestPoint(this.store.state.sketch.points, position, snapRadius, excludePoint);
  }

  _removeOrphanPoint(point) {
    const sketch = this.store.state.sketch;
    if (removeOrphanPoint(sketch, point)) {
      this.store.set('sketch.points', [...sketch.points]);
    }
  }

  _findSharedPoint(lineA, lineB) {
    return findSharedPoint(lineA, lineB);
  }

  _rebuildObjects() {
    rebuildSketchObjects(this);
  }

  _flushSketchArrays() {
    flushSketchArrays(this);
  }

  _assignConstraintIds() {
    assignConstraintIds(this);
  }

  /**
   * Re-converge all constraints using the global solver.
   *
   * Called after a constraint is created (or deleted) to ensure that the
   * one-shot local enforcement didn't break other constraints on shared
   * points. The global solver iterates to satisfy all constraints
   * simultaneously.
   */
  _reconvergeConstraints(preferredMovePoints = null) {
    if (!this._slvsAdapter?.ready) {
      // Solver not loaded yet — trigger the lazy load and reconverge once
      // it's ready. The constraint/dimension is already stored, so the
      // geometry will snap to satisfy it as soon as the solver finishes
      // initializing. Only flush/rebuild if the solve actually moved
      // points, so a no-op reconverge (e.g. an already-satisfied
      // dimension) doesn't trigger a disruptive re-render that could
      // race with the user's next interaction.
      this.ensureSolver().then(() => {
        if (!this._slvsAdapter?.ready) return;
        const sketch = this.store.state.sketch;
        const before = sketch.points.map((p) => `${p.id}:${p.x},${p.y}`);
        this._slvsAdapter.solveAndWriteBack(
          sketch,
          new Set(),
          preferredMovePoints,
        );
        const after = sketch.points.map((p) => `${p.id}:${p.x},${p.y}`);
        if (before.length !== after.length || before.some((b, i) => b !== after[i])) {
          this._flushSketchArrays(this);
          this._rebuildObjects(this);
        }
      });
      return;
    }
    this._slvsAdapter.solveAndWriteBack(
      this.store.state.sketch,
      new Set(),
      preferredMovePoints,
    );
    this._flushSketchArrays(this);
    this._rebuildObjects(this);
  }

  /**
   * Load and instantiate the SolveSpace WASM solver (idempotent — safe to
   * call repeatedly; later calls reuse the in-flight or completed load).
   *
   * The slvs.js bundle is ~6 MB and embeds its .wasm payload as base64
   * (Emscripten's SINGLE_FILE=1, see solver-wasm/src/slvs/CMakeLists.txt).
   * That forces a synchronous base64 decode + non-streaming
   * WebAssembly.instantiate() instead of streaming compilation, which is
   * a long, mostly-unavoidable main-thread block (can be minutes) no
   * matter when it's triggered — see AGENTS.md "SolveSpace WASM Solver
   * Loading" for what's been tried and the real fix (rebuilding
   * solver-wasm without SINGLE_FILE=1).
   *
   * Given that, this is called explicitly by main.js shortly after boot
   * (not from this constructor) so first paint isn't blocked, and a
   * loading overlay covers the app until the returned promise resolves.
   * It's also triggered as a fallback by tool selection (properties.js)
   * and any solve attempt, in case main.js's call hasn't finished yet.
   */
  ensureSolver() {
    if (this._slvsAdapter?.ready) return Promise.resolve();
    if (this._slvsInitPromise) return this._slvsInitPromise;
    this._slvsAdapter = new SlvsAdapter(this.store);
    this._slvsInitPromise = this._slvsAdapter.init()
      .then(() => { this._slvsInitPromise = null; })
      .catch((e) => {
        console.error('SlvsAdapter init failed', e);
        this._slvsAdapter = null;
        this._slvsInitPromise = null;
      });
    return this._slvsInitPromise;
  }

  /**
   * Single dispatch point for constraint solving. Delegates to the
   * SolveSpace WASM solver via the SlvsAdapter.
   *
   * @param {object} sketch - the sketch state
   * @param {Set} movedPoints - points directly manipulated by the user
   * @returns {number|null} result code or iteration count
   */
  _solve(sketch, movedPoints) {
    if (!this._slvsAdapter?.ready) {
      // Trigger the lazy load so future drags solve; this drag is unsolved.
      this.ensureSolver();
      return null;
    }
    return this._slvsAdapter.solveAndWriteBack(sketch, movedPoints);
  }

  _setPreviewLine(line) {
    setPreviewLine(this, line);
  }

  _setSnapCandidate(point) {
    setSnapCandidate(this, point);
  }

  _seedIdCountersFromSketch() {
    seedIdCountersFromSketch(this);
  }

  onConstraintLineClick(line, multiSelect = false, position = null) {
    this._constraintTool.onConstraintLineClick(line, multiSelect, position);
  }

  onConstraintPointClick(point, multiSelect = false, position = null) {
    this._constraintTool.onConstraintPointClick(point, multiSelect, position);
  }

  _openDimEdit(dim) {
    this._dimensionTool.openDimEdit(dim);
  }
}
