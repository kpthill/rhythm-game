// Falling piece (2×2 block) and rotation for Lumines.
//
// A piece has 4 cells arranged as:
//   [0][1]
//   [2][3]
// Each cell is color 1 (orange) or 2 (purple).
// Rotation is clockwise: the color arrangement spins, the 2×2 footprint stays.

import type { CellColor } from "./grid";
import { COLS, ROWS } from "./grid";
import type { Grid } from "./grid";

export interface Piece {
    /** 2×2 color layout, row-major: [top-left, top-right, bottom-left, bottom-right] */
    cells: [CellColor, CellColor, CellColor, CellColor];
    /** Left column of the piece (0-based). */
    col: number;
    /** Top row of the piece (0-based). May be negative while spawning. */
    row: number;
}

/** Rotate the 2×2 color layout 90° clockwise. */
export function rotateCW(cells: Piece["cells"]): Piece["cells"] {
    //  [0][1]      [2][0]
    //  [2][3]  →   [3][1]
    return [cells[2], cells[0], cells[3], cells[1]];
}

/** Rotate the 2×2 color layout 90° counter-clockwise. */
export function rotateCCW(cells: Piece["cells"]): Piece["cells"] {
    //  [0][1]      [1][3]
    //  [2][3]  →   [0][2]
    return [cells[1], cells[3], cells[0], cells[2]];
}

/**
 * Check whether the piece at (col, row) with the given cells would overlap
 * any filled grid cell or go out of bounds (left/right/bottom).
 */
export function collides(grid: Grid, _cells: Piece["cells"], col: number, row: number): boolean {
    const offsets: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
    for (let i = 0; i < 4; i++) {
        const [dc, dr] = offsets[i];
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || c >= COLS) return true;
        if (r >= ROWS) return true;
        // Cells above the visible top are fine (piece spawns partially off-screen).
        if (r < 0) continue;
        if (grid[r][c] !== 0) return true;
    }
    return false;
}

/** Lock the piece into the grid (only rows that are in-bounds are written). */
export function lockPiece(grid: Grid, piece: Piece): void {
    const offsets: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
    for (let i = 0; i < 4; i++) {
        const [dc, dr] = offsets[i];
        const c = piece.col + dc;
        const r = piece.row + dr;
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
        grid[r][c] = piece.cells[i];
    }
}

/** Spawn a new piece centered near the top of the grid. */
export function spawnPiece(cells: Piece["cells"]): Piece {
    return {
        cells,
        col: Math.floor(COLS / 2) - 1, // center horizontally
        row: -1,                         // one row above top (spawns sliding in)
    };
}

/** Generate a random 2×2 color arrangement. */
export function randomCells(rng: () => number): Piece["cells"] {
    return [
        rng() < 0.5 ? 1 : 2,
        rng() < 0.5 ? 1 : 2,
        rng() < 0.5 ? 1 : 2,
        rng() < 0.5 ? 1 : 2,
    ];
}
