// Lumines — rhythm puzzle game for RCade (336×262 canvas).
//
// A 2×2 piece of two colors falls from the top. The player moves it LEFT/RIGHT,
// soft-drops DOWN, and rotates with A (clockwise) or B (counter-clockwise).
// When 2×2 same-color regions form on the grid, they are "marked".
// A vertical timeline sweep bar travels LEFT→RIGHT across the grid in sync with
// the beat (ctx.beatNow()), and clears marked cells as it passes over each column.
//
// Scoring: each cleared block earns points (combo multiplier for large clears).
// Game ends when the grid fills to the top (top-out) or the song ends.
// States: PLAYING → RESULT (A to restart).

import type p5 from "p5";
import type { GameModule, GameContext } from "../../platform/game";
import type { InputSnapshot } from "../../platform/input";
import { SONG_LENGTH_BEATS } from "../../platform/song";

import {
    COLS, ROWS, CELL, GRID_X, GRID_Y,
    makeGrid, findMarkedSquares, markedCells, clearCells, isTopOut,
} from "./grid";
import type { Grid, MarkedSquare } from "./grid";
import {
    rotateCW, rotateCCW, collides, lockPiece, spawnPiece, randomCells,
} from "./piece";
import type { Piece } from "./piece";

// ── Constants ─────────────────────────────────────────────────────────────────

/** How many beats for the timeline to sweep across all COLS columns once. */
const SWEEP_BEATS = 4;

/** Fall speed: one row per this many seconds at the base rate. */
const BASE_FALL_INTERVAL_MS = 700;

/** Soft-drop multiplier. */
const SOFT_DROP_MULTIPLIER = 8;

/** Delay-auto-shift and auto-repeat in ms. */
const DAS_MS = 170;
const ARR_MS = 60;

/** Points per cleared cell. */
const POINTS_PER_CELL = 50;

// Colors (p5 rgb arrays)
const COLOR_A: [number, number, number] = [255, 160, 40];   // orange
const COLOR_B: [number, number, number] = [160, 80, 220];   // purple
const COLOR_EMPTY_BG: [number, number, number] = [18, 14, 30];
const COLOR_GRID_LINE: [number, number, number] = [35, 28, 52];
const COLOR_MARKED_A: [number, number, number] = [255, 210, 100]; // bright when marked
const COLOR_MARKED_B: [number, number, number] = [200, 140, 255];
const COLOR_SWEEP: [number, number, number] = [255, 255, 255];

// ── State ─────────────────────────────────────────────────────────────────────

let ctx: GameContext;
let p: p5;

type State = "PLAYING" | "RESULT";
let state: State = "PLAYING";

let grid: Grid;
let currentPiece: Piece;
let nextCells: Piece["cells"];
let markedSquares: MarkedSquare[];

// The beat column the sweep is currently on (fractional).
let sweepCol = 0;

// Score / combo
let score = 0;
let combo = 0;
let maxCombo = 0;
let topOut = false;

// Piece fall accumulator
let fallAcc = 0;
let fallInterval = BASE_FALL_INTERVAL_MS;

// DAS/ARR for horizontal movement
let dasDir: "LEFT" | "RIGHT" | null = null;
let dasTimer = 0;
let arrTimer = 0;
let prevDirection: InputSnapshot["direction"] = null;

// Rotation latch (only fire once per press)
let prevAPressed = false;
let prevBPressed = false;

// Flash effect when cells are cleared
interface ClearFlash { col: number; row: number; timer: number; color: 1 | 2; }
let clearFlashes: ClearFlash[] = [];

// Combo pop
interface ComboPopup { text: string; timer: number; }
let comboPop: ComboPopup | null = null;

// Lock delay: small delay before locking so player can adjust
let lockDelayAcc = 0;
const LOCK_DELAY_MS = 200;

// Simple deterministic seeded RNG (xorshift32)
let rngState = 0x12345678;
function rng(): number {
    rngState ^= rngState << 13;
    rngState ^= rngState >> 17;
    rngState ^= rngState << 5;
    // Normalize to [0,1)
    return ((rngState >>> 0) / 0x100000000);
}

function seedRng(): void {
    rngState = (Date.now() & 0xffffffff) | 1;
}

// ── Initialization ────────────────────────────────────────────────────────────

function initGame(): void {
    seedRng();
    grid = makeGrid();
    nextCells = randomCells(rng);
    currentPiece = spawnPiece(randomCells(rng));
    markedSquares = [];
    sweepCol = 0;
    score = 0;
    combo = 0;
    maxCombo = 0;
    topOut = false;
    fallAcc = 0;
    fallInterval = BASE_FALL_INTERVAL_MS;
    dasDir = null;
    dasTimer = 0;
    arrTimer = 0;
    prevDirection = null;
    prevAPressed = false;
    prevBPressed = false;
    clearFlashes = [];
    comboPop = null;
    lockDelayAcc = 0;
    state = "PLAYING";
}

// ── Piece logic ───────────────────────────────────────────────────────────────

function tryMove(dc: number, dr: number): boolean {
    const nc = currentPiece.col + dc;
    const nr = currentPiece.row + dr;
    if (!collides(grid, currentPiece.cells, nc, nr)) {
        currentPiece.col = nc;
        currentPiece.row = nr;
        return true;
    }
    return false;
}

function tryRotateCW(): void {
    const newCells = rotateCW(currentPiece.cells);
    if (!collides(grid, newCells, currentPiece.col, currentPiece.row)) {
        currentPiece.cells = newCells;
    } else if (!collides(grid, newCells, currentPiece.col - 1, currentPiece.row)) {
        // Wall-kick left
        currentPiece.cells = newCells;
        currentPiece.col -= 1;
    } else if (!collides(grid, newCells, currentPiece.col + 1, currentPiece.row)) {
        // Wall-kick right
        currentPiece.cells = newCells;
        currentPiece.col += 1;
    }
}

function tryRotateCCW(): void {
    const newCells = rotateCCW(currentPiece.cells);
    if (!collides(grid, newCells, currentPiece.col, currentPiece.row)) {
        currentPiece.cells = newCells;
    } else if (!collides(grid, newCells, currentPiece.col - 1, currentPiece.row)) {
        currentPiece.cells = newCells;
        currentPiece.col -= 1;
    } else if (!collides(grid, newCells, currentPiece.col + 1, currentPiece.row)) {
        currentPiece.cells = newCells;
        currentPiece.col += 1;
    }
}

function lockAndSpawn(): void {
    lockPiece(grid, currentPiece);
    markedSquares = findMarkedSquares(grid);

    // Speed up slightly as score grows
    fallInterval = Math.max(250, BASE_FALL_INTERVAL_MS - Math.floor(score / 2000) * 30);
    fallAcc = 0;
    lockDelayAcc = 0;

    // Check top-out AFTER locking
    if (isTopOut(grid)) {
        topOut = true;
        state = "RESULT";
        ctx.audio.stop();
        return;
    }

    currentPiece = spawnPiece(nextCells);
    nextCells = randomCells(rng);
}

// ── Timeline sweep ────────────────────────────────────────────────────────────

/**
 * The sweep column is derived from the song beat, cycling every SWEEP_BEATS.
 * sweepCol ∈ [0, COLS) — fractional so the sweep line moves smoothly.
 */
function updateSweep(beat: number): void {
    const prevSweepCol = sweepCol;
    // One full sweep per SWEEP_BEATS beats.
    const beatInCycle = beat % SWEEP_BEATS;
    sweepCol = (beatInCycle / SWEEP_BEATS) * COLS;

    // Determine which integer columns the sweep passed over this frame.
    // Handle wrap-around (sweepCol resets near 0 after reaching COLS).
    const passedCols: number[] = [];
    if (sweepCol >= prevSweepCol) {
        // Normal advancement
        const colStart = Math.ceil(prevSweepCol);
        const colEnd = Math.floor(sweepCol);
        for (let c = colStart; c <= colEnd && c < COLS; c++) {
            passedCols.push(c);
        }
    } else {
        // Wrapped around: swept from prevSweepCol to COLS (end of last cycle)
        // then from 0 to sweepCol in the new cycle.
        const colStart = Math.ceil(prevSweepCol);
        for (let c = colStart; c < COLS; c++) passedCols.push(c);
        const colEnd = Math.floor(sweepCol);
        for (let c = 0; c <= colEnd; c++) passedCols.push(c);
    }

    if (passedCols.length === 0) return;

    // Clear all marked cells in the passed columns.
    let totalCleared = 0;
    for (const col of passedCols) {
        totalCleared += clearColumnMarked(col);
    }

    if (totalCleared > 0) {
        combo++;
        maxCombo = Math.max(maxCombo, combo);
        const gained = totalCleared * POINTS_PER_CELL * combo;
        score += gained;
        comboPop = { text: totalCleared > 4 ? `${totalCleared} CLEAR! ×${combo}` : `×${combo}`, timer: 90 };
    } else {
        // Reset combo only if sweep passes a column with no clears
        // (small grace: don't reset mid-combo if many columns clear at once)
        if (combo > 0 && passedCols.some(c => !hasMarkedInColumn(c))) {
            combo = 0;
        }
    }

    // Re-scan marked squares after clearing
    markedSquares = findMarkedSquares(grid);
}

function hasMarkedInColumn(col: number): boolean {
    return markedSquares.some(sq => sq.col === col || sq.col + 1 === col);
}

function clearColumnMarked(col: number): number {
    // Find all marked squares that touch this column.
    const touchingSquares = markedSquares.filter(
        sq => sq.col === col || sq.col + 1 === col
    );
    if (touchingSquares.length === 0) return 0;

    // Gather all cells from those squares.
    const toClear = markedCells(touchingSquares);
    // Only clear cells that are IN this column or to the left of the sweep.
    // (The real Lumines clears the full square when sweep hits any part of it —
    //  we clear all cells of squares that the sweep has reached.)
    const filteredClear = new Set<string>();
    for (const key of toClear) {
        const [cs] = key.split(",");
        const c = parseInt(cs, 10);
        if (c <= col) {
            filteredClear.add(key);
        }
    }

    if (filteredClear.size === 0) return 0;

    // Add flash effects
    for (const key of filteredClear) {
        const [cs, rs] = key.split(",");
        const c = parseInt(cs, 10);
        const r = parseInt(rs, 10);
        if (grid[r]?.[c] !== 0) {
            clearFlashes.push({ col: c, row: r, timer: 30, color: grid[r][c] as 1 | 2 });
        }
    }

    return clearCells(grid, filteredClear);
}

// ── Update ────────────────────────────────────────────────────────────────────

function updatePlaying(input: InputSnapshot, dt: number): void {
    const beat = ctx.beatNow();
    updateSweep(beat);

    // ── Horizontal movement with DAS/ARR ────────────────────────────────────
    const dir = input.direction;
    const wantsLeft  = dir === "LEFT"  || dir === "DOWN_LEFT"  || dir === "UP_LEFT";
    const wantsRight = dir === "RIGHT" || dir === "DOWN_RIGHT" || dir === "UP_RIGHT";

    if (dir !== prevDirection) {
        // Direction changed: reset DAS
        dasDir = null;
        dasTimer = 0;
        arrTimer = 0;
        if (wantsLeft)  { tryMove(-1, 0); dasDir = "LEFT";  dasTimer = 0; }
        if (wantsRight) { tryMove( 1, 0); dasDir = "RIGHT"; dasTimer = 0; }
    } else if (dasDir !== null) {
        dasTimer += dt;
        if (dasTimer >= DAS_MS) {
            arrTimer += dt;
            while (arrTimer >= ARR_MS) {
                arrTimer -= ARR_MS;
                if (dasDir === "LEFT")  tryMove(-1, 0);
                if (dasDir === "RIGHT") tryMove( 1, 0);
            }
        }
    }
    prevDirection = dir;

    // ── Rotation ──────────────────────────────────────────────────────────────
    if (input.aPressed && !prevAPressed) tryRotateCW();
    if (input.bPressed && !prevBPressed) tryRotateCCW();
    prevAPressed = input.aPressed;
    prevBPressed = input.bPressed;

    // ── Gravity + soft-drop ───────────────────────────────────────────────────
    const wantsDown = dir === "DOWN" || dir === "DOWN_LEFT" || dir === "DOWN_RIGHT";
    const effectiveInterval = wantsDown
        ? fallInterval / SOFT_DROP_MULTIPLIER
        : fallInterval;

    fallAcc += dt;

    // Check if the piece is resting (can't fall further).
    const isResting = collides(grid, currentPiece.cells, currentPiece.col, currentPiece.row + 1);

    if (isResting) {
        lockDelayAcc += dt;
        if (lockDelayAcc >= LOCK_DELAY_MS || wantsDown) {
            lockAndSpawn();
        }
    } else {
        lockDelayAcc = 0;
        while (fallAcc >= effectiveInterval) {
            fallAcc -= effectiveInterval;
            if (!tryMove(0, 1)) {
                // Landed mid-frame
                break;
            }
        }
    }

    // Song end
    if (beat >= SONG_LENGTH_BEATS) {
        ctx.audio.stop();
        state = "RESULT";
    }

    // Update timers
    clearFlashes = clearFlashes.filter(f => {
        f.timer--;
        return f.timer > 0;
    });
    if (comboPop !== null) {
        comboPop.timer--;
        if (comboPop.timer <= 0) comboPop = null;
    }
}

// ── Drawing ───────────────────────────────────────────────────────────────────

function cellColor(v: 0 | 1 | 2): [number, number, number] {
    if (v === 1) return COLOR_A;
    if (v === 2) return COLOR_B;
    return COLOR_EMPTY_BG;
}

function markedColor(c: 1 | 2): [number, number, number] {
    return c === 1 ? COLOR_MARKED_A : COLOR_MARKED_B;
}

function drawGrid(): void {
    // Background
    p.noStroke();
    p.fill(...COLOR_EMPTY_BG);
    p.rect(GRID_X, GRID_Y, COLS * CELL, ROWS * CELL);

    // Build marked cell set for highlighting
    const marked = markedCells(markedSquares);

    // Cells
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const v = grid[r][c];
            if (v === 0) continue;
            const x = GRID_X + c * CELL;
            const y = GRID_Y + r * CELL;
            const isMarked = marked.has(`${c},${r}`);
            const [cr, cg, cb] = isMarked ? markedColor(v as 1 | 2) : cellColor(v);
            p.fill(cr, cg, cb);
            p.noStroke();
            p.rect(x + 1, y + 1, CELL - 2, CELL - 2, 2);

            // Inner highlight for depth
            p.fill(255, 255, 255, isMarked ? 60 : 30);
            p.rect(x + 3, y + 3, CELL - 10, 4, 1);
        }
    }

    // Clear flash effects
    for (const flash of clearFlashes) {
        const x = GRID_X + flash.col * CELL;
        const y = GRID_Y + flash.row * CELL;
        const [cr, cg, cb] = flash.color === 1 ? COLOR_MARKED_A : COLOR_MARKED_B;
        const alpha = (flash.timer / 30) * 200;
        p.noStroke();
        p.fill(cr, cg, cb, alpha);
        p.rect(x, y, CELL, CELL);
    }

    // Grid lines
    p.stroke(...COLOR_GRID_LINE);
    p.strokeWeight(0.5);
    for (let c = 0; c <= COLS; c++) {
        const x = GRID_X + c * CELL;
        p.line(x, GRID_Y, x, GRID_Y + ROWS * CELL);
    }
    for (let r = 0; r <= ROWS; r++) {
        const y = GRID_Y + r * CELL;
        p.line(GRID_X, y, GRID_X + COLS * CELL, y);
    }

    // Grid border
    p.stroke(70, 55, 110);
    p.strokeWeight(2);
    p.noFill();
    p.rect(GRID_X, GRID_Y, COLS * CELL, ROWS * CELL);
}

function drawSweepLine(): void {
    const x = GRID_X + sweepCol * CELL;
    const [cr, cg, cb] = COLOR_SWEEP;

    // Glow behind the line
    p.noStroke();
    for (let i = 3; i >= 1; i--) {
        p.fill(cr, cg, cb, 20 * i);
        p.rect(x - i * 2, GRID_Y, i * 4, ROWS * CELL);
    }

    // The line itself
    p.stroke(cr, cg, cb, 220);
    p.strokeWeight(2);
    p.line(x, GRID_Y, x, GRID_Y + ROWS * CELL);
}

function drawFallingPiece(): void {
    const offsets: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];

    // Ghost piece (where it will land)
    let ghostRow = currentPiece.row;
    while (!collides(grid, currentPiece.cells, currentPiece.col, ghostRow + 1)) {
        ghostRow++;
    }
    if (ghostRow !== currentPiece.row) {
        for (let i = 0; i < 4; i++) {
            const [dc, dr] = offsets[i];
            const c = currentPiece.col + dc;
            const r = ghostRow + dr;
            if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
            const v = currentPiece.cells[i];
            const [cr, cg, cb] = cellColor(v);
            p.noStroke();
            p.fill(cr, cg, cb, 50);
            p.rect(GRID_X + c * CELL + 1, GRID_Y + r * CELL + 1, CELL - 2, CELL - 2, 2);
        }
    }

    // Actual piece
    for (let i = 0; i < 4; i++) {
        const [dc, dr] = offsets[i];
        const c = currentPiece.col + dc;
        const r = currentPiece.row + dr;
        if (r < 0) continue; // off top of screen
        if (r >= ROWS || c < 0 || c >= COLS) continue;
        const v = currentPiece.cells[i];
        const [cr, cg, cb] = cellColor(v);
        p.noStroke();
        p.fill(cr, cg, cb);
        p.rect(GRID_X + c * CELL + 1, GRID_Y + r * CELL + 1, CELL - 2, CELL - 2, 2);
        // Highlight
        p.fill(255, 255, 255, 50);
        p.rect(GRID_X + c * CELL + 3, GRID_Y + r * CELL + 3, CELL - 10, 4, 1);
        // Bright border
        p.stroke(255, 255, 255, 120);
        p.strokeWeight(1);
        p.noFill();
        p.rect(GRID_X + c * CELL + 1, GRID_Y + r * CELL + 1, CELL - 2, CELL - 2, 2);
    }
}

function drawNextPiece(): void {
    // Draw the "NEXT" preview in the right margin.
    const nx = GRID_X + COLS * CELL + 6;
    const ny = GRID_Y + 4;
    const cs = 10; // small cell size for preview

    p.noStroke();
    p.fill(100, 90, 130);
    p.textSize(7);
    p.textAlign(p.LEFT, p.TOP);
    p.text("NEXT", nx, ny);

    const offsets: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
    for (let i = 0; i < 4; i++) {
        const [dc, dr] = offsets[i];
        const v = nextCells[i];
        const [cr, cg, cb] = cellColor(v);
        p.fill(cr, cg, cb);
        p.rect(nx + dc * cs, ny + 10 + dr * cs, cs - 1, cs - 1, 1);
    }
}

function drawHUD(): void {
    const rightEdge = 334;

    // Score
    p.noStroke();
    p.textAlign(p.RIGHT, p.TOP);
    p.textSize(9);
    p.fill(200, 195, 220);
    p.text(score.toString().padStart(7, "0"), rightEdge, 4);

    // Combo
    if (combo > 1) {
        p.textAlign(p.LEFT, p.TOP);
        p.textSize(9);
        p.fill(180, 160, 220);
        p.text(`${combo}×`, 4, 4);
    }

    // Beat indicator (tiny pulse dot at top-center)
    const beat = ctx.beatNow();
    const beatFrac = beat % 1;
    const pulse = beatFrac < 0.15 ? 1 : 0;
    if (pulse) {
        p.noStroke();
        p.fill(255, 240, 80, 200);
        p.ellipse(168, 8, 6, 6);
    }

    // Combo popup
    if (comboPop !== null) {
        const alpha = p.map(comboPop.timer, 0, 90, 0, 255);
        const dy = p.map(comboPop.timer, 90, 0, 0, -20);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(12);
        p.fill(255, 240, 80, alpha);
        p.noStroke();
        p.text(comboPop.text, GRID_X + (COLS * CELL) / 2, GRID_Y + ROWS * CELL / 2 + dy);
    }

    // Sweep beat marker: small tick above each column at the beat crossing
    const sweepBeat = (beat % SWEEP_BEATS) / SWEEP_BEATS;
    const tickX = GRID_X + sweepBeat * COLS * CELL;
    p.stroke(200, 190, 255, 80);
    p.strokeWeight(1);
    p.line(tickX, GRID_Y - 4, tickX, GRID_Y);
}

// ── Screens ───────────────────────────────────────────────────────────────────

function drawPlaying(input: InputSnapshot, dt: number): void {
    p.background(10, 8, 20);
    updatePlaying(input, dt);
    drawGrid();
    drawSweepLine();
    drawFallingPiece();
    drawNextPiece();
    drawHUD();
}

function drawResult(input: InputSnapshot): void {
    p.background(10, 8, 20);
    // Draw the locked grid faintly in background
    drawGrid();

    // Overlay
    p.noStroke();
    p.fill(0, 0, 0, 150);
    p.rect(0, 0, 336, 262);

    p.textAlign(p.CENTER, p.CENTER);
    p.noStroke();

    p.fill(220, 210, 255);
    p.textSize(20);
    p.text(topOut ? "GAME OVER" : "CLEAR!", 168, 90);

    p.textSize(12);
    p.fill(200, 195, 220);
    p.text(`SCORE: ${score}`, 168, 118);

    p.textSize(10);
    p.fill(160, 150, 200);
    p.text(`MAX COMBO: ${maxCombo}×`, 168, 138);

    p.textSize(8);
    p.fill(110, 100, 140);
    p.text("A to play again   ·   hold START to exit", 168, 170);

    if (input.aPressed) {
        initGame();
        void ctx.audio.play(0);
    }
}

// ── Module ────────────────────────────────────────────────────────────────────

const lumines: GameModule = {
    id: "lumines",
    title: "Lumines",
    author: "kpthill",

    init(c: GameContext) {
        ctx = c;
        p = c.p;
        initGame();
        void ctx.audio.play(0);
    },

    frame(input: InputSnapshot, dt: number) {
        switch (state) {
            case "PLAYING": drawPlaying(input, dt); break;
            case "RESULT":  drawResult(input);       break;
        }
    },

    teardown() {
        clearFlashes = [];
        comboPop = null;
        ctx.audio.stop();
    },
};

export default lumines;
