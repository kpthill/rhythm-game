// DJ game — note model, layout constants, and geometry helpers (v2, vendored).
//
// v2 is a vertical two-lane redesign: notes fall top-to-bottom toward a hit
// line near the bottom. Left lane = player-1 controls (spinner + A/B), right
// lane = player-2 controls (spinner + A/B). One player straddles both lanes —
// this is the normal way the game plays, not an expert mode.
//
// Five note kinds:
//   "tap"     — press A or B as the note crosses the hit line.
//   "hold"    — hold A or B for the note's duration (rendered with a tail).
//   "double"  — press A + B together; spans both button columns.
//   "scratch" — produce spinner motion in the indicated direction (CW/CCW) as
//               the note crosses the line. Direction matters.
//   "spin"    — keep the spinner turning continuously for the note's duration
//               (the sustained counterpart of scratch; direction-agnostic).
//
// Hold/spin use all-or-nothing sustain judging: entry timing (within the hit
// window) sets the grade, and dropping the hold / stalling the spinner past a
// short grace downgrades the whole note to MISS.

export type Lane = "left" | "right";
export type ScratchDir = "CW" | "CCW";
export type Button = "A" | "B";
export type NoteKind = "tap" | "hold" | "double" | "scratch" | "spin";

export interface NoteEvent {
    lane: Lane;
    beat: number;
    kind: NoteKind;
    /** tap/hold only — which button. */
    button?: Button;
    /** scratch only — which direction (spin is direction-agnostic). */
    scratch?: ScratchDir;
    /** hold/spin only — sustain length in beats. */
    durationBeats?: number;
}

export type NoteResult = "pending" | "hit" | "missed";
/** Sustain bookkeeping for hold/spin notes only. */
export type SustainState = "idle" | "active" | "done" | "failed";
export type Grade = "PERFECT" | "GOOD";

export interface ActiveNote {
    event: NoteEvent;
    result: NoteResult;
    sustain?: SustainState;
    /** Grade locked in at sustain entry; applied to score when the sustain completes. */
    entryGrade?: Grade;
}

// ── Canvas ───────────────────────────────────────────────────────────────────

export const W = 336;
export const H = 262;

// ── Timing ───────────────────────────────────────────────────────────────────

export const LOOKAHEAD_BEATS  = 4;
export const HIT_WINDOW_BEATS = 0.45;  // ± beats for a valid hit (carried over from v1)
export const PERFECT_FRACTION = 0.55;  // PERFECT under 55% of the window
/** All-or-nothing sustain grace: dropping a hold/spin within this many beats
 *  of its natural end still counts as a completed sustain. */
export const SUSTAIN_GRACE_BEATS = 0.25;

// ── Vertical fall geometry ───────────────────────────────────────────────────

export const NOTE_TOP = 16;   // y where notes spawn (top of the fall area)
export const HIT_Y     = 196;  // y of the hit line (shared by both lanes)
export const PX_PER_BEAT_Y = (HIT_Y - NOTE_TOP) / LOOKAHEAD_BEATS;

/** y position of a note's leading edge at `noteBeat`, given the current beat. */
export function noteY(noteBeat: number, currentBeat: number): number {
    const beatsUntil = noteBeat - currentBeat;
    return HIT_Y - beatsUntil * PX_PER_BEAT_Y;
}

/** y position clamped so a note never visually overshoots the hit line. */
export function clampedNoteY(noteBeat: number, currentBeat: number): number {
    return Math.min(noteY(noteBeat, currentBeat), HIT_Y);
}

// ── Lane geometry ────────────────────────────────────────────────────────────

export const LANE_W = 158;
export const LANE_LEFT_X  = 4;                    // left edge of the left lane
export const LANE_RIGHT_X = W - 4 - LANE_W;        // left edge of the right lane

export function laneOriginX(lane: Lane): number {
    return lane === "left" ? LANE_LEFT_X : LANE_RIGHT_X;
}
export function laneCenterX(lane: Lane): number {
    return laneOriginX(lane) + LANE_W / 2;
}
export function colAX(lane: Lane): number {
    return laneOriginX(lane) + LANE_W * 0.26;
}
export function colBX(lane: Lane): number {
    return laneOriginX(lane) + LANE_W * 0.74;
}

export const NOTE_W = 42;
export const NOTE_H = 12;
export const SCRATCH_R = 16;     // radius of scratch/spin note circles
export const HOLD_TAIL_W = 26;   // width of a hold note's tail

// ── Colors ───────────────────────────────────────────────────────────────────

export type RGB = [number, number, number];

export const COLOR_A:           RGB = [80,  180, 255];  // blue
export const COLOR_B:           RGB = [255, 110,  80];  // orange
export const COLOR_SCRATCH_CW:  RGB = [80,  255, 160];  // green
export const COLOR_SCRATCH_CCW: RGB = [255, 220,  60];  // yellow
export const COLOR_SPIN:        RGB = [210, 120, 255];  // violet — sustained spin + lane tint

/** Lerp an RGB color toward another by t in [0,1]. */
export function lerpColor(a: RGB, b: RGB, t: number): RGB {
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ];
}
