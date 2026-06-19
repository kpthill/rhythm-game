// Vendored grid + entity types and tuning for "Crypt", a Crypt-of-the-NecroDancer
// style beat-grid crawler. Everything resolves once per beat ("step window"):
// the player commits one of the 4 cardinal directions for the current beat, and
// on the beat boundary the player + every enemy take their action together.

import type { Direction } from "../../platform/input";

// ── Grid geometry ───────────────────────────────────────────────────────────
// Canvas is 336×262. We reserve a top HUD strip and draw a 9×7 grid of tiles.

export const COLS = 9;
export const ROWS = 7;
export const TILE = 30;                       // 9*30 = 270 wide, 7*30 = 210 tall
export const GRID_W = COLS * TILE;            // 270
export const GRID_H = ROWS * TILE;            // 210
export const GRID_X = Math.floor((336 - GRID_W) / 2); // 33
export const GRID_Y = 44;                      // leave room for HUD on top

// ── Cardinal step vectors ─────────────────────────────────────────────────────

export interface Vec { x: number; y: number; }

// Only the 4 cardinals are legal moves. Diagonals from the stick collapse to a
// cardinal so the player can never "miss" by pushing slightly off-axis.
export const CARDINAL: Record<string, Vec> = {
    UP:    { x: 0,  y: -1 },
    DOWN:  { x: 0,  y: 1 },
    LEFT:  { x: -1, y: 0 },
    RIGHT: { x: 1,  y: 0 },
};

export function dirToStep(dir: Direction | null): Vec | null {
    if (!dir) return null;
    if (dir === "UP" || dir === "UP_LEFT" || dir === "UP_RIGHT") return CARDINAL.UP;
    if (dir === "DOWN" || dir === "DOWN_LEFT" || dir === "DOWN_RIGHT") return CARDINAL.DOWN;
    if (dir === "LEFT") return CARDINAL.LEFT;
    if (dir === "RIGHT") return CARDINAL.RIGHT;
    return null;
}

// ── Enemies ───────────────────────────────────────────────────────────────────

export type EnemyKind = "skeleton" | "slime" | "bat";

export interface Enemy {
    kind: EnemyKind;
    x: number;
    y: number;
    hp: number;
    // beats survived; drives the "every-other-beat" / zig-zag cadence
    beatsAlive: number;
    // bat zig-zag horizontal sign
    zig: number;
    // visual: tile the enemy moved FROM this beat, for slide tween
    fromX: number;
    fromY: number;
    // frame the enemy was struck, for a flash
    hitFrame: number;
}

export interface EnemySpec {
    hp: number;
    points: number;
}

export const ENEMY_SPEC: Record<EnemyKind, EnemySpec> = {
    skeleton: { hp: 1, points: 100 },
    slime:    { hp: 1, points: 80 },
    bat:      { hp: 1, points: 120 },
};

// ── Player ──────────────────────────────────────────────────────────────────

export interface Player {
    x: number;
    y: number;
    fromX: number;
    fromY: number;
    hitFrame: number;
    bumpFrame: number;   // frame of a wall-bump (wasted beat)
}

// ── Tuning ────────────────────────────────────────────────────────────────────

export const MAX_LIFE = 1.0;
export const HIT_COST = 0.16;          // life lost when an enemy hits you
export const MAX_GROOVE = 8;           // groove (combo) multiplier cap
export const ATTACK_POINTS_BASE = 1;   // multiplied by enemy points * groove

// A beat "counts" as on-time if the player commits a direction during it. The
// commit is detected by sampling stick input across the beat window (see index).

export function inBounds(x: number, y: number): boolean {
    return x >= 0 && x < COLS && y >= 0 && y < ROWS;
}
