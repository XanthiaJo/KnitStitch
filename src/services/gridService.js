/**
 * Returns the key for a cell at (row, col).
 */
export function cellKey(row, col) {
    return `${row},${col}`;
}

/**
 * Toggle the fill state of a cell at (row, col).
 */
export function toggleCell(store, row, col) {
    const key = cellKey(row, col);
    const cells = store.get('filledCells');
    const updated = new Set(cells);
    if (updated.has(key)) {
        updated.delete(key);
    } else {
        updated.add(key);
    }
    store.set('filledCells', updated);
}

/**
 * Clear all manually filled cells.
 */
export function clearCells(store) {
    store.set('filledCells', new Set());
}

/**
 * Remove manually filled cells that are NOT inside a sketch shape.
 * Cells that overlap with sketch-derived fills are kept.
 *
 * @param {Store} store
 * @param {Set<string>} sketchFilled - cell keys derived from sketch lines
 */
export function clearManualCellsOutsideSketch(store, sketchFilled) {
    const manual = store.get('filledCells');
    if (!manual || manual.size === 0) return;
    const sketchSet = sketchFilled ?? new Set();
    const remaining = new Set();
    for (const key of manual) {
        if (sketchSet.has(key)) {
            remaining.add(key);
        }
    }
    store.set('filledCells', remaining);
}

/**
 * Returns the bounding box of all filled cells as
 * { minRow, minCol, maxRow, maxCol } or null if no cells are filled.
 */
export function getFilledBoundingBox(filledCells) {
    if (!filledCells || filledCells.size === 0) return null;
    let minRow = Infinity, minCol = Infinity, maxRow = -Infinity, maxCol = -Infinity;
    for (const key of filledCells) {
        const [r, c] = key.split(',').map(Number);
        if (r < minRow) minRow = r;
        if (c < minCol) minCol = c;
        if (r > maxRow) maxRow = r;
        if (c > maxCol) maxCol = c;
    }
    return { minRow, minCol, maxRow, maxCol };
}

/**
 * Returns the bounding box of all filled cells (manual + sketch-derived)
 * as { minRow, minCol, maxRow, maxCol } or null if no cells are filled.
 */
export function getCombinedBoundingBox(filledCells, sketchFilled) {
    const all = new Set(filledCells);
    if (sketchFilled) {
        for (const key of sketchFilled) all.add(key);
    }
    return getFilledBoundingBox(all);
}

export function updateCellSizing(store, stitchesPer4Inches, rowsPer4Inches) {
    store.set('cellWidthPx', Math.max(1, stitchesPer4Inches));
    store.set('cellHeightPx', Math.max(1, rowsPer4Inches));
}
