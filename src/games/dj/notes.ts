// DJ game — note model + rendering constants (vendored; not shared with other games).
//
// Two note types:
//   "hit"     — tap A or B as the note reaches the hit line
//   "scratch" — produce spinner motion in the indicated direction (CW/CCW)
//               when the note reaches the hit line. If no spinner is connected,
//               a LEFT flick = CCW and a RIGHT flick = CW.

export type ScratchDir = "CW" | "CCW";

export interface NoteEvent {
    beat: number;
    type: "hit" | "scratch";
    /** For hit notes: which button to press. */
    button?: "A" | "B";
    /** For scratch notes: which direction. */
    scratch?: ScratchDir;
}

export interface ActiveNote {
    event: NoteEvent;
    hit: boolean;
    missed: boolean;
}

// Layout — single horizontal lane scrolling right-to-left
export const LANE_Y   = 160;    // y-center of the lane (in 336×262 canvas)
export const HIT_X    = 80;     // x position of the hit line (left side, near turntable)
export const NOTE_W   = 20;     // width of note heads / scratch indicators
export const NOTE_H   = 14;     // height of note heads

// Timing
export const LOOKAHEAD_BEATS = 4;     // how many beats ahead notes appear at the right edge
export const HIT_WINDOW_BEATS = 0.45; // ± beats for a valid hit

// Pixel width per beat
export const LANE_RIGHT = 334;   // right edge where notes spawn
export const PX_PER_BEAT = (LANE_RIGHT - HIT_X) / LOOKAHEAD_BEATS;

// Colors
export const COLOR_HIT_A:      [number, number, number] = [80,  180, 255];  // blue
export const COLOR_HIT_B:      [number, number, number] = [255, 110,  80];  // orange
export const COLOR_SCRATCH_CW: [number, number, number] = [80,  255, 160];  // green
export const COLOR_SCRATCH_CCW:[number, number, number] = [255, 220,  60];  // yellow

/** x position of the note head at the given beat, given the current beat. */
export function noteX(noteBeat: number, currentBeat: number): number {
    const beatsUntil = noteBeat - currentBeat;          // >0 = in the future
    return HIT_X + beatsUntil * PX_PER_BEAT;
}
