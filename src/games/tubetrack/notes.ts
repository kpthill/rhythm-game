// TubeTrack — note model and rendering constants (vendored; not shared with other games).
//
// The tube is viewed from behind: a cylindrical tunnel with the camera looking DOWN the barrel.
// Notes ride on the tube wall at a specific angular position (tubeAngle) and beat time.
// As beatNow() approaches the note's beat, the note moves from the vanishing point (center)
// outward to the front ring (FRONT_RING_RADIUS). The player rotates the tube via the
// spinner (or joystick fallback) to align the note under a fixed runner at 6-o'clock (π/2).

export interface NoteEvent {
    beat: number;
    /** Radians, p5 convention: 0 = right, clockwise positive. Range [0, 2π). */
    tubeAngle: number;
}

export interface ActiveNote {
    event: NoteEvent;
    hit: boolean;
    missed: boolean;
}

// Canvas center
export const CX = 168;
export const CY = 131;

// The front ring — the hit plane. This is the largest (nearest) ring.
export const FRONT_RING_RADIUS = 108;

// Number of depth rings to draw (not counting the front ring itself)
export const DEPTH_RING_COUNT = 6;

// Runner is anchored at 6-o'clock = π/2
export const RUNNER_ANGLE = Math.PI / 2;

// How many beats ahead notes appear from the vanishing point
export const LOOKAHEAD_BEATS = 6;

// Hit window (±beats) for a valid tap
export const HIT_WINDOW_BEATS = 0.45;

// Angular tolerance (radians) for alignment check
export const ALIGN_TOLERANCE = Math.PI / 5;  // ±36°

// Note color
export const NOTE_COLOR: [number, number, number] = [255, 220, 60];

/**
 * Returns the screen radius of a note at the given beat offset.
 * When currentBeat === noteBeat the note is at the front ring (FRONT_RING_RADIUS).
 * When currentBeat === noteBeat - LOOKAHEAD_BEATS it is at radius 0 (vanishing point).
 */
export function noteScreenRadius(noteBeat: number, currentBeat: number): number {
    const t = (currentBeat - noteBeat + LOOKAHEAD_BEATS) / LOOKAHEAD_BEATS;
    return t * FRONT_RING_RADIUS;
}
