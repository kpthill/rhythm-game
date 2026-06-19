// Grid state and square-detection logic for Lumines.
//
// Grid coordinates: col 0 is left, row 0 is top.
// Cell values: 0 = empty, 1 = color A (orange), 2 = color B (purple).
//
// Square detection: any 2×2 region where all 4 cells share the same non-zero
// color is a "marked square". The timeline sweep clears marked squares as it
// passes over them (column by column).

export const COLS = 12;
export const ROWS = 10;
export const CELL = 24; // pixels per cell

// Grid origin so the field is horizontally centred on the 336-wide canvas.
// 12 * 24 = 288; (336 - 288) / 2 = 24
export const GRID_X = 24;
// Vertically: leave 16px for top HUD, and some bottom margin
export const GRID_Y = 16;

export type CellColor = 0 | 1 | 2;
export type Grid = CellColor[][];

/** Create an empty ROWS×COLS grid (row-major). */
export function makeGrid(): Grid {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(0) as CellColor[]);
}

/** Return a deep copy of the grid. */
export function cloneGrid(g: Grid): Grid {
    return g.map(row => [...row] as CellColor[]);
}

/** True if (col, row) is inside the playfield. */
export function inBounds(col: number, row: number): boolean {
    return col >= 0 && col < COLS && row >= 0 && row < ROWS;
}

/** True if the column is fully within the playfield (used for piece placement). */
export function colInBounds(col: number): boolean {
    return col >= 0 && col < COLS;
}

// ── Marked-square detection ────────────────────────────────────────────────────

/** A 2×2 marked region, anchored at its top-left cell. */
export interface MarkedSquare {
    col: number; // top-left column
    row: number; // top-left row
    color: 1 | 2;
}

/**
 * Scan the full grid and return all 2×2 same-color regions.
 * Overlapping squares are each reported — the sweep will clear any cell
 * that is covered by at least one marked square.
 */
export function findMarkedSquares(grid: Grid): MarkedSquare[] {
    const result: MarkedSquare[] = [];
    for (let r = 0; r < ROWS - 1; r++) {
        for (let c = 0; c < COLS - 1; c++) {
            const v = grid[r][c];
            if (v === 0) continue;
            if (
                grid[r][c + 1] === v &&
                grid[r + 1][c] === v &&
                grid[r + 1][c + 1] === v
            ) {
                result.push({ col: c, row: r, color: v as 1 | 2 });
            }
        }
    }
    return result;
}

/**
 * Given a set of marked squares, return a flat Set of "col,row" strings for
 * every individual cell covered by at least one marked square.
 */
export function markedCells(squares: MarkedSquare[]): Set<string> {
    const cells = new Set<string>();
    for (const sq of squares) {
        cells.add(`${sq.col},${sq.row}`);
        cells.add(`${sq.col + 1},${sq.row}`);
        cells.add(`${sq.col},${sq.row + 1}`);
        cells.add(`${sq.col + 1},${sq.row + 1}`);
    }
    return cells;
}

/**
 * Clear all cells in `toClear` from the grid, then apply gravity
 * (cells fall down to fill empty space in each column).
 *
 * Returns the number of cells cleared.
 */
export function clearCells(grid: Grid, toClear: Set<string>): number {
    let count = 0;
    for (const key of toClear) {
        const [cs, rs] = key.split(",");
        const c = parseInt(cs, 10);
        const r = parseInt(rs, 10);
        if (inBounds(c, r) && grid[r][c] !== 0) {
            grid[r][c] = 0;
            count++;
        }
    }
    // Apply gravity column by column.
    applyGravity(grid);
    return count;
}

/** Drop all floating cells down within each column. */
function applyGravity(grid: Grid): void {
    for (let c = 0; c < COLS; c++) {
        // Collect non-zero cells from top to bottom.
        const cells: CellColor[] = [];
        for (let r = 0; r < ROWS; r++) {
            if (grid[r][c] !== 0) cells.push(grid[r][c]);
        }
        // Write back: top rows empty, bottom rows filled.
        const empty = ROWS - cells.length;
        for (let r = 0; r < ROWS; r++) {
            grid[r][c] = r < empty ? 0 : cells[r - empty];
        }
    }
}

/** True if any cell in row 0 is occupied (top-out condition). */
export function isTopOut(grid: Grid): boolean {
    return grid[0].some(v => v !== 0);
}
