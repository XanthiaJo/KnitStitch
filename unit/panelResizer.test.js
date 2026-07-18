import { describe, expect, it } from 'vitest';
import {
  calculatePanelHeights,
  clampPanelDragDelta,
} from '../src/ui/panelResizer.js';

describe('panel resizer sizing', () => {
  it('allocates every available pixel between cards and handles', () => {
    const heights = calculatePanelHeights(700, [1, 1, 1, 1]);

    expect(heights).toHaveLength(4);
    expect(heights.reduce((sum, height) => sum + height, 0) + 3 * 14).toBeCloseTo(700);
    expect(heights.every((height) => height >= 80)).toBe(true);
  });

  it('clamps a drag at the flexible space available to either neighbour', () => {
    expect(clampPanelDragDelta(200, 100, 40)).toBe(40);
    expect(clampPanelDragDelta(-200, 100, 40)).toBe(-100);
    expect(clampPanelDragDelta(25, 100, 40)).toBe(25);
  });

  it('keeps the layout full and stable after the lower card reaches minimum size', () => {
    const availableHeight = 700;
    const initialFlexible = [100, 120, 80, 38];
    const movedDelta = clampPanelDragDelta(60, initialFlexible[2], initialFlexible[3]);
    const movedFlexible = initialFlexible.slice();
    movedFlexible[2] += movedDelta;
    movedFlexible[3] -= movedDelta;

    const movedHeights = calculatePanelHeights(availableHeight, movedFlexible);
    expect(movedHeights.reduce((sum, height) => sum + height, 0) + 3 * 14).toBeCloseTo(availableHeight);

    const pastBoundaryDelta = clampPanelDragDelta(200, movedFlexible[2], movedFlexible[3]);
    const boundaryFlexible = movedFlexible.slice();
    boundaryFlexible[2] += pastBoundaryDelta;
    boundaryFlexible[3] -= pastBoundaryDelta;
    const boundaryHeights = calculatePanelHeights(availableHeight, boundaryFlexible);

    expect(pastBoundaryDelta).toBe(movedFlexible[3]);
    expect(boundaryHeights[3]).toBe(80);
    expect(boundaryHeights.reduce((sum, height) => sum + height, 0) + 3 * 14).toBeCloseTo(availableHeight);

    // Moving farther past the boundary must produce the same layout rather
    // than causing the grid to reclaim space or snap between two states.
    expect(clampPanelDragDelta(500, boundaryFlexible[2], boundaryFlexible[3])).toBe(0);
  });
});
