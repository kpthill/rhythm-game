// Saber — note model and rendering constants (vendored; not shared with other games).
// Notes fly DOWN a single lane toward a hit line at the bottom of the canvas.

import type { Direction } from "../../platform/input";

export type Button = "A" | "B";

export interface NoteEvent {
    beat: number;
    direction: Direction;
    button: Button;
    /** "both" means the player must press A+B simultaneously with matching direction */
    both?: boolean;
}

export interface ActiveNote {
    event: NoteEvent;
    hit: boolean;
    missed: boolean;
}

export const BUTTON_COLOR: Record<Button, [number, number, number]> = {
    A: [80, 160, 255],   // blue
    B: [255, 100, 60],   // orange-red
};

export const BOTH_COLOR: [number, number, number] = [200, 80, 255]; // purple for A+B

// Canvas dimensions for saber
export const CX = 168;      // center x
export const HIT_LINE_Y = 220; // y-position of the hit line (near bottom)
export const LANE_TOP_Y = 10;  // where notes first appear

export const LOOKAHEAD_BEATS = 4;
export const HIT_WINDOW_BEATS = 0.5;

// Arrow directions mapped to arrow drawing offsets [dx, dy] for arrowhead tip
export const DIRECTION_ARROW: Record<Direction, [number, number]> = {
    UP:         [  0, -1],
    UP_RIGHT:   [  1, -1],
    RIGHT:      [  1,  0],
    DOWN_RIGHT: [  1,  1],
    DOWN:       [  0,  1],
    DOWN_LEFT:  [ -1,  1],
    LEFT:       [ -1,  0],
    UP_LEFT:    [ -1, -1],
};

/**
 * Y position of a note on screen.
 * At noteBeat = currentBeat + LOOKAHEAD_BEATS → LANE_TOP_Y (just spawned)
 * At noteBeat = currentBeat → HIT_LINE_Y (at the hit line)
 */
export function noteY(noteBeat: number, currentBeat: number): number {
    // fraction 0..1 where 0=just spawned (at top), 1=at hit line
    const frac = 1 - (noteBeat - currentBeat) / LOOKAHEAD_BEATS;
    return LANE_TOP_Y + frac * (HIT_LINE_Y - LANE_TOP_Y);
}
