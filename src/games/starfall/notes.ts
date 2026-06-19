// Starfall — vendored note model and rendering constants (not shared with other games).

// ── Object types ──────────────────────────────────────────────────────────────

/** Three discrete object types that scroll down toward the player. */
export type ObjectType = "enemy" | "bullet" | "asteroid";

/** A single entry in the chart timeline. */
export interface StarNote {
    beat: number;
    col: number;          // 0–4 (5 columns), irrelevant for "bullet"
    type: ObjectType;
}

/** A live object in the field. */
export interface ActiveObject {
    note: StarNote;
    hit: boolean;
    missed: boolean;
}

// ── Layout constants ──────────────────────────────────────────────────────────

export const NUM_COLS = 5;
export const CANVAS_W = 336;
export const CANVAS_H = 262;

// Column x-centres
export const COL_X: readonly number[] = [34, 101, 168, 235, 302];

// Ship sits in this Y band
export const SHIP_Y = 230;

// The "firing line" — where notes must be met
export const FIRE_Y = 200;

// Stars begin scrolling in from this Y
export const SPAWN_Y = -20;

// How many beats ahead to spawn notes
export const LOOKAHEAD_BEATS = 6;

// Hit window (beats) — symmetric around FIRE_Y arrival
export const HIT_WINDOW_BEATS = 0.45;

// ── Colors ────────────────────────────────────────────────────────────────────

export const COLOR_ENEMY:    [number, number, number] = [80,  200, 255];  // cyan
export const COLOR_BULLET:   [number, number, number] = [255, 110,  80];  // orange
export const COLOR_ASTEROID: [number, number, number] = [160, 120,  60];  // brown-gold

// ── Y position for a note at `currentBeat` ───────────────────────────────────

/**
 * Returns the Y pixel of an object that arrives at FIRE_Y on `noteBeat`.
 * Objects travel from SPAWN_Y to FIRE_Y over LOOKAHEAD_BEATS.
 */
export function noteY(noteBeat: number, currentBeat: number): number {
    const progress = (currentBeat - noteBeat + LOOKAHEAD_BEATS) / LOOKAHEAD_BEATS;
    return SPAWN_Y + progress * (FIRE_Y - SPAWN_Y);
}
