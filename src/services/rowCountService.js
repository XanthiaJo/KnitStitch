/**
 * Row-count calculations and knitting instructions.
 *
 * Row numbers are presented from the top of the filled shape down. The grid
 * itself may use negative row indexes, so display numbering is deliberately
 * kept separate from the underlying cell coordinates.
 */

/**
 * Count filled cells by their grid row.
 *
 * @param {Iterable<string>} cellKeys - Cell keys in "row,column" format.
 * @returns {Map<number, number>}
 */
export function countCellsByRow(cellKeys) {
  const counts = new Map();
  for (const key of cellKeys || []) {
    const [row] = String(key).split(',').map(Number);
    if (!Number.isFinite(row)) continue;
    counts.set(row, (counts.get(row) || 0) + 1);
  }
  return counts;
}

/**
 * Build row counts and directional instructions from the preceding row.
 *
 * Rows alternate direction: odd-numbered rows work left-to-right and
 * even-numbered rows work right-to-left. Edge changes are therefore emitted
 * in the order they are encountered while knitting the row.
 *
 * @param {Iterable<string>} cellKeys
 * @returns {Array<{row: number, stitches: number, change: number, instruction: string}>}
 */
export function buildRowInstructions(cellKeys) {
  const rows = rowsWithColumns(cellKeys);
  let previous = null;

  return rows.map(({ gridRow, columns }, index) => {
    const stitches = columns.length;
    const change = previous ? stitches - previous.columns.length : 0;
    const instruction = index === 0
      ? `Cast on ${stitches} ${stitchWord(stitches)}`
      : formatRowChange(previous.columns, columns, index);
    previous = { gridRow, columns };

    return {
      row: index + 1,
      stitches,
      change,
      instruction,
    };
  });
}

function rowsWithColumns(cellKeys) {
  const rows = new Map();
  for (const key of cellKeys || []) {
    const [row, column] = String(key).split(',').map(Number);
    if (!Number.isFinite(row) || !Number.isFinite(column)) continue;
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row).push(column);
  }

  return Array.from(rows.entries())
    .sort(([a], [b]) => b - a)
    .map(([gridRow, columns]) => ({
      gridRow,
      columns: [...new Set(columns)].sort((a, b) => a - b),
    }));
}

function formatRowChange(previousColumns, currentColumns, rowIndex) {
  if (previousColumns.length === currentColumns.length
      && previousColumns.every((column, index) => column === currentColumns[index])) {
    return 'Work even';
  }

  const previousMin = Math.min(...previousColumns);
  const previousMax = Math.max(...previousColumns);
  const currentMin = Math.min(...currentColumns);
  const currentMax = Math.max(...currentColumns);
  const left = edgeChange(previousMin, currentMin, 'left');
  const right = edgeChange(previousMax, currentMax, 'right');
  const edgeStitches = left.count + right.count;
  const middle = Math.max(0, currentColumns.length - edgeStitches);
  const segments = [
    left.instruction,
    middle > 0 ? `Work ${middle} stitches` : '',
    right.instruction,
  ].filter(Boolean);

  if (rowIndex % 2 === 0) segments.reverse();
  return segments.length ? segments.join(', ') : 'Work even';
}

function stitchWord(count) {
  return count === 1 ? 'stitch' : 'stitches';
}

function edgeChange(previousEdge, currentEdge, side) {
  const delta = side === 'left'
    ? previousEdge - currentEdge
    : currentEdge - previousEdge;
  if (delta === 0) return { count: 0, instruction: '' };

  const action = delta > 0 ? 'Increase' : 'Decrease';
  const count = Math.abs(delta);
  return {
    count,
    instruction: `${action} ${count} stitch${count === 1 ? '' : 'es'}`,
  };
}
