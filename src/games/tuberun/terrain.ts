// Runner (tuberun v2) — ribbon terrain model + tunable constants.
//
// The world is a tube seen head-on: concentric rings recede from a large
// FRONT ring (radius FRONT_RING_RADIUS, where the runner stands) to a
// vanishing point at the centre. Future beats live at smaller radii.
//
// Terrain is a *continuous ribbon* painted on the tube wall. At any beat it
// has an angular CENTRE and a fixed angular WIDTH. Between authored keyframes
// the centre interpolates linearly, so the path curves smoothly. Gaps are
// beat-ranges where the ribbon simply isn't there (holes you must jump).
// Obstacles are objects standing on the ribbon (visual for M1; the destroy
// verb is M2).

// ── Canvas / camera geometry ────────────────────────────────────────────────

export const W = 336;
export const H = 262;
export const CX = 168;
export const CY = 121;   // nudged up from centre so the runner + HUD fit below

/** Radius of the outermost ring — the "floor" the runner stands on. */
export const FRONT_RING_RADIUS = 104;
/** Inner radius where rings vanish. */
export const VP_RADIUS = 5;
/** How many beats of terrain are visible ahead (long lookahead per v1). */
export const LOOKAHEAD_BEATS = 8;
/** Beats → pixels of radius for approach rings. */
export const BEAT_PX = (FRONT_RING_RADIUS - VP_RADIUS) / LOOKAHEAD_BEATS;

// ── Ribbon shape ─────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;

/** First-prototype ribbon width (spec: 30° wide). */
export const RIBBON_WIDTH_DEG = 30;
export const RIBBON_HALF_WIDTH = (RIBBON_WIDTH_DEG / 2) * DEG;

/**
 * Authoring guide, not enforced at runtime: the chart keeps the ribbon centre
 * from drifting faster than this so following it stays "tracking a path", not
 * "yanking". Every keyframe below respects it.
 */
export const MAX_DRIFT_DEG_PER_SEC = 30;

// ── Steering tunables ────────────────────────────────────────────────────────

/**
 * Joystick steering speed. Well below v1's disorienting 180°/s. At 108 BPM a
 * 30°/s ribbon moves ~16°/beat; 75°/s gives ~2.5× margin so the player can
 * comfortably sit on the path and correct.
 */
export const STEER_SPEED_DEG_PER_SEC = 75;
export const STEER_SPEED = STEER_SPEED_DEG_PER_SEC * DEG;

/** Spinner steering: one physical detent (step_resolution 64) = one 1/64 turn. */
export const SPINNER_RAD_PER_STEP = (2 * Math.PI) / 64;

// ── Jump tunables ────────────────────────────────────────────────────────────

/** Jump arc duration in beats (spec: ~0.8). */
export const JUMP_BEATS = 0.8;
/** How far the jump lifts the runner inward (toward vanishing point), in px. */
export const JUMP_LIFT_PX = 30;

// ── Terrain data types ───────────────────────────────────────────────────────

export interface Keyframe {
    beat: number;
    /** Ribbon centre, radians (p5 convention: 0 = right, clockwise +). */
    center: number;
}
export interface Gap {
    /** Gap spans [at - half, at + half] in beats. */
    at: number;
    half: number;
}
export interface Obstacle {
    beat: number;
    /** Angular offset from the ribbon centre (radians). */
    offset: number;
}
export interface Terrain {
    keys: Keyframe[];
    gaps: Gap[];
    obstacles: Obstacle[];
    /** Checkpoint beats (death rewinds to the last one crossed). */
    checkpoints: number[];
    /** Beat at which the run is CLEARed. */
    endBeat: number;
}

// ── Sampling helpers ─────────────────────────────────────────────────────────

/** Screen radius of a given beat, given the current beat. */
export function radiusAtBeat(beat: number, currentBeat: number): number {
    return FRONT_RING_RADIUS - (beat - currentBeat) * BEAT_PX;
}

/** Ribbon centre angle at an arbitrary beat (linear interp, clamped at ends). */
export function ribbonCenter(t: Terrain, beat: number): number {
    const keys = t.keys;
    if (beat <= keys[0].beat) return keys[0].center;
    const last = keys[keys.length - 1];
    if (beat >= last.beat) return last.center;
    for (let i = 0; i < keys.length - 1; i++) {
        const a = keys[i];
        const b = keys[i + 1];
        if (beat >= a.beat && beat <= b.beat) {
            const f = (beat - a.beat) / (b.beat - a.beat);
            return a.center + (b.center - a.center) * f;
        }
    }
    return last.center;
}

/** Is there a hole in the ribbon at this beat? */
export function inGap(t: Terrain, beat: number): boolean {
    for (const g of t.gaps) {
        if (beat >= g.at - g.half && beat <= g.at + g.half) return true;
    }
    return false;
}

/** Latest checkpoint beat at or before `beat` (never past the start). */
export function lastCheckpoint(t: Terrain, beat: number): number {
    let cp = t.checkpoints[0];
    for (const c of t.checkpoints) {
        if (c <= beat) cp = c;
        else break;
    }
    return cp;
}

// ── The hand-authored M1 terrain ─────────────────────────────────────────────
//
// One continuous section over beats 0–96 of the shared song (108-BPM opening).
// Exercises: a flat tutorial intro, gentle then wider drifting curves, five
// gaps that must be jumped, and three obstacles standing on the path. All
// centre drifts respect MAX_DRIFT_DEG_PER_SEC at 108 BPM (0.556 s/beat).
//
// Angle convention: 90° = bottom of tube (6 o'clock) = the runner's rest home.

const k = (beat: number, deg: number): Keyframe => ({ beat, center: deg * DEG });

export const TERRAIN: Terrain = {
    keys: [
        k(0, 90), k(8, 90),      // flat tutorial
        k(16, 120), k(24, 60),   // first S-curve (±30° over 8 beats ≈ 11°/s)
        k(32, 90), k(40, 45),
        k(48, 135), k(56, 90),   // wider swing (90° over 8 beats ≈ 20°/s)
        k(64, 110), k(72, 70),
        k(80, 90), k(88, 100), k(96, 90),
    ],
    // Gaps sit on the drift so you jump while steering.
    gaps: [
        { at: 12, half: 0.3 },
        { at: 28, half: 0.3 },
        { at: 44, half: 0.32 },
        { at: 60, half: 0.32 },
        { at: 76, half: 0.3 },
    ],
    // Obstacles are visual for M1 (destroy = M2); they mark where B-targets go.
    obstacles: [
        { beat: 20, offset: 0 },
        { beat: 52, offset: 0 },
        { beat: 84, offset: 0 },
    ],
    // ~every 24 beats, all on safe (non-gap, centred) ground.
    checkpoints: [0, 24, 48, 72],
    endBeat: 96,
};
