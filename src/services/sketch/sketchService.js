import { STROKE_COLOR_OPTIONS } from './render/styleOptions.js';
import { ConstraintSolver } from './solver/constraintSolver.js';
import { GlobalConstraintSolver } from './solver/globalConstraintSolver.js';
import { SlvsAdapter } from './solver/slvsAdapter.js';
import { ToolRegistry } from './tools/toolRegistry.js';
import { HistoryManager } from './state/historyManager.js';
import { checkOverconstraints } from './solver/overconstraintChecker.js';
import { nearestPoint, findSharedPoint } from '../../utils/geometry.js';
import { ConstraintSubMode, SNAP_RADIUS, SketchObjectKind, SketchTool } from './constants.js';
import { removeOrphanPoint } from './state/sketchCleanup.js';
import { syncSketchStateToStore, rebuildSketchObjects, flushSketchArrays, setPreviewLine, setSnapCandidate } from './state/sketchStoreSync.js';
import { seedIdCountersFromSketch, assignConstraintIds } from './state/sketchIdManager.js';
import { startDrag, onCanvasMouseUp, onSelectMouseMove } from './interactions/dragHandler.js';
import { ensureOriginAnchor, undo, clear, cancelCurrentLine, recordSnapshot, exitToSelect } from './state/lifecycle.js';
import { clearSelection, selectPoint, selectLine, selectDimension, selectConstraint, selectObjectByRef } from './state/sketchSelection.js';
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
    this._dimPendingA = null;
    this._constraintPendingLine = null;
    this._constraintPendingPoint = null;
    this._selectedPoints = new Set();
    this._selectedLines = new Set();
    this._suppressNextClick = false;
    this._constraintSolver = new ConstraintSolver();
    this._globalConstraintSolver = new GlobalConstraintSolver();
    this._useGlobalSolver = true; // Set to true to use global solver
    this._slvsAdapter = null;
    if (store.state.sketch.solverBackend === 'slvs') this._initSlvsAdapter();
    this._toolRegistry = new ToolRegistry(this);
    this._history = new HistoryManager(this);

    this.strokeColorOptions = STROKE_COLOR_OPTIONS;

    syncSketchStateToStore(this.store);
    seedIdCountersFromSketch(this);
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
  _reconvergeConstraints() {
    if (this._slvsAdapter?.ready) {
      this._slvsAdapter.solveAndWriteBack(this.store.state.sketch, new Set());
      this._flushSketchArrays(this);
      this._rebuildObjects(this);
      return;
    }
    if (!this._globalConstraintSolver) return;
    this._globalConstraintSolver.solve(this.store.state.sketch, new Set());
  }

  _initSlvsAdapter() {
    this._slvsAdapter = new SlvsAdapter(this.store);
    this._slvsAdapter.init().catch((e) => console.error('SlvsAdapter init failed', e));
  }

  /**
   * Single dispatch point for constraint solving. Routes to the SolveSpace
   * WASM backend when solverBackend === 'slvs' and the adapter is ready,
   * otherwise falls through to the existing native solver path.
   *
   * @param {object} sketch - the sketch state
   * @param {Set} movedPoints - points directly manipulated by the user
   * @returns {number|null} result code or iteration count
   */
  _solve(sketch, movedPoints) {
    if (this._slvsAdapter?.ready) {
      return this._slvsAdapter.solveAndWriteBack(sketch, movedPoints);
    }
    if (this._useGlobalSolver) {
      return this._globalConstraintSolver.solve(sketch, movedPoints);
    }
    for (const p of movedPoints) {
      this._constraintSolver.solveConstraintsForPoint(sketch, p, null, {});
    }
    return 0;
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

  checkOverconstraints() {
    return checkOverconstraints(this.store.state.sketch);
  }
}
