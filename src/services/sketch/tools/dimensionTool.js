import { SketchDimension } from '../../../models/sketch/sketchDimension.js';
import { wouldOverconstrain } from '../solver/dofAnalyzer.js';
import {
  rebuildSketchObjects,
  setSnapCandidate,
  showCursorMessage,
} from '../state/sketchStateHelpers.js';

/**
 * Owns the full dimension lifecycle: click-to-place, edit overlay, and
 * driven-value constraint application.
 *
 * Receives the SketchService instance so it can call shared helpers
 * (selectPoint, clearSelection, store access) without duplicating them.
 */
export class DimensionTool {
  constructor(service) {
    this.service = service;
  }

  get store() { return this.service.store; }

  onDimensionClick(position, modifiers = {}) {
    const snapped = this.service._findNearestPoint(position, modifiers.snapEnabled !== false);
    if (!snapped) return;

    if (!this.service._dimPendingA) {
      this.service._dimPendingA = snapped;
      this.service.selectPoint(snapped);
      setSnapCandidate(this.service, null);
    } else {
      if (!Object.is(this.service._dimPendingA, snapped)) {
        this._commitDimension(this.service._dimPendingA, snapped);
      }
      this.service._dimPendingA = null;
      this.service.clearSelection();
      setSnapCandidate(this.service, null);
    }
  }

  _commitDimension(a, b) {
    this.service._recordSnapshot('Add dimension');
    const dim = new SketchDimension(this.service._nextDimId++, a, b);
    this.store.state.sketch.dimensions.push(dim);
    this.store.set('sketch.dimensions', [...this.store.state.sketch.dimensions]);
    rebuildSketchObjects(this.service);
    this.openDimEdit(dim);
  }

  openDimEdit(dim) {
    const hasDisplay = dim.displayValue !== null && dim.displaySuffix !== null;
    this.store.set('sketch.pendingDimEdit', {
      dimId:       dim.id,
      initialText: hasDisplay
        ? String(dim.displayValue)
        : dim.labelText.replace(/^[^\d.]*/, ''),
      labelPos:    { ...dim.labelPos },
      unitLabel:   hasDisplay ? `Distance (${dim.displaySuffix.trim()}):` : 'Distance (px):',
      onConfirm: (value) => {
        // If the dim has a display unit (e.g. inches), convert back to pixels
        const targetPx = hasDisplay
          ? value / dim.displayValue * (dim.drivenValue ?? this._measureDimPx(dim))
          : value;

        // Check if driving this dimension would over-constrain the sketch
        const overcheck = wouldOverconstrain(this.store.state.sketch, {
          isDimension: true,
          pointA: dim.a,
          pointB: dim.b,
        });
        if (overcheck.wouldOverconstrain) {
          showCursorMessage(this.service, 'Over-constrained: this dimension would remove too many degrees of freedom', dim.labelPos);
          this.store.set('sketch.pendingDimEdit', null);
          return;
        }

        this._applyDimConstraint(dim, targetPx);
        if (hasDisplay) {
          dim.displayValue = value;
          dim.recompute();
        }
        this.store.set('sketch.pendingDimEdit', null);
      },
      onCancel: () => {
        const sketch = this.store.state.sketch;
        sketch.dimensions = sketch.dimensions.filter((candidate) => candidate !== dim);
        this.service.clearSelection();
        this.store.set('sketch.dimensions', [...sketch.dimensions]);
        this.store.set('sketch.pendingDimEdit', null);
        rebuildSketchObjects(this.service);
      },
    });
  }

  _measureDimPx(dim) {
    const dx = dim.b.x - dim.a.x;
    const dy = dim.b.y - dim.a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _applyDimConstraint(dim, targetPx) {
    this.service._recordSnapshot('Apply dimension constraint');
    const usageA = this._countLineUsage(dim.a);
    const usageB = this._countLineUsage(dim.b);
    const free  = usageA < usageB ? dim.a : dim.b;
    const fixed = usageA < usageB ? dim.b : dim.a;

    if (dim.kind === 'Horizontal') {
      const signX = Math.sign(free.x - fixed.x) || 1;
      free.x = fixed.x + signX * targetPx;
    } else if (dim.kind === 'Vertical') {
      const signY = Math.sign(free.y - fixed.y) || 1;
      free.y = fixed.y + signY * targetPx;
    } else {
      const dx = free.x - fixed.x;
      const dy = free.y - fixed.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len >= 0.001) {
        free.x = fixed.x + (dx / len) * targetPx;
        free.y = fixed.y + (dy / len) * targetPx;
      }
    }

    dim.setDrivenValue(targetPx);
    this.service._reconvergeConstraints();
    for (const d of this.store.state.sketch.dimensions) {
      if (!Object.is(d, dim) && (Object.is(d.a, free) || Object.is(d.b, free)))
        d.recompute();
    }
    this.store.set('sketch.dimensions', [...this.store.state.sketch.dimensions]);
    this.store.set('sketch.points', [...this.store.state.sketch.points]);
    rebuildSketchObjects(this.service);
  }

  _countLineUsage(pt) {
    let count = 0;
    for (const line of this.store.state.sketch.lines)
      if (Object.is(line.start, pt) || Object.is(line.end, pt)) count++;
    return count;
  }
}
