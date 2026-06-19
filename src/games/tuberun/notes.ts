// Tube Run — vendored types and rendering constants.
// The "tube" is drawn as concentric ellipses shrinking toward a vanishing point
// at the canvas center.  The front ring (largest) is where the runner lives.

// ── Types ──────────────────────────────────────────────────────────────────────

/** A beat-indexed event in the tube-run chart. */
export interface TubeEvent {
    /** Beat at which this event must be resolved. */
    beat: number;
    /**
     * "gap"    — the tube floor has a gap at the runner's current angle; player must ROTATE
     *            so a solid floor section is under the runner, OR jump over the gap.
     * "jump"   — an obstacle juts from the floor; player must press A to jump.
     * "tunnel" — pure rotation event (safe zone is narrow); player must rotate to it.
     */
    type: "gap" | "jump" | "tunnel";
    /**
     * The angle (in radians, 0=right clockwise) of the safe section the player must
     * rotate to.  For "jump" events this is ignored (any solid floor works).
     * 0 = right wall
     * PI/2 = bottom (default runner home)
     * PI = left wall
     * -PI/2 = top
     */
    safeAngle: number;
    /** Visual colour tint for the obstacle/gap ring.  [r,g,b] */
    color: [number, number, number];
}

/** Runtime state for an active event. */
export interface ActiveEvent {
    event: TubeEvent;
    resolved: boolean;   // player hit/landed on beat
    missed: boolean;     // window expired without action
    jumped: boolean;     // player pressed A to clear a jump obstacle
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Canvas centre (same as tunnel reference). */
export const CX = 168;
export const CY = 131;

/** Canvas dimensions. */
export const W = 336;
export const H = 262;

/** How many beats ahead we show approach rings. */
export const LOOKAHEAD_BEATS = 8;

/** Window (±beats) around the event beat that counts as a hit. */
export const HIT_WINDOW_BEATS = 0.45;

/** Radius of the outermost (front) tube ring where the runner stands. */
export const FRONT_RING_RADIUS = 108;

/** Vanishing-point radius (inner ring disappears below this). */
export const VP_RADIUS = 6;

/** Half-angle of the "safe" arc highlight on gap events (radians). */
export const SAFE_ARC_HALF = Math.PI / 4;   // 45°

/** Radius of the runner avatar dot. */
export const RUNNER_DOT_R = 6;

/** Beat-to-pixel conversion for approach rings. */
export const BEAT_PX = (FRONT_RING_RADIUS - VP_RADIUS) / LOOKAHEAD_BEATS;

/**
 * Map a note beat + current beat → radius on screen.
 * At (noteBeat - LOOKAHEAD) the note is at VP_RADIUS (far away).
 * At noteBeat the note is at FRONT_RING_RADIUS (hit zone).
 */
export function eventRadius(noteBeat: number, currentBeat: number): number {
    const beatsLeft = noteBeat - currentBeat;        // positive = in future
    // When beatsLeft === 0  → radius = FRONT_RING_RADIUS
    // When beatsLeft === LOOKAHEAD_BEATS → radius = VP_RADIUS
    return FRONT_RING_RADIUS - beatsLeft * BEAT_PX;
}

/** Convert [r, g, b] tuple to alpha-modified string (unused; kept for clarity). */
export const GAP_COLOR:    [number, number, number] = [220,  60,  60];
export const JUMP_COLOR:   [number, number, number] = [255, 180,  40];
export const TUNNEL_COLOR: [number, number, number] = [ 80, 200, 120];

/** Judgment display text → colour. */
export const JUDGMENT_COLOR: Record<string, [number, number, number]> = {
    PERFECT: [255, 240,  80],
    GOOD:    [ 80, 220, 120],
    MISS:    [255,  80,  80],
    DODGE:   [ 80, 180, 255],
};
