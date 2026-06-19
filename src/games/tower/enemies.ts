// Tower-specific enemy/note model + rendering constants (vendored; not shared).
//
// The turret sits at canvas center. Enemies spawn at the screen edge on a radial
// path (fixed angle) and converge inward. A circular FIRING RING sits at a fixed
// radius; an enemy crossing that ring is at its hit-beat. The countdown is the
// depth from spawn edge → ring; the angle is where the enemy is.
//
// Enemy → note-type mapping:
//   GRUNT   = tap   (aim barrel at it + press A on the beat)
//   ARMORED = hold  (aim and HOLD A while it sits/advances at the ring for N beats)
//   SWARM   = roll  (a quick burst of sub-enemies sweeping an arc; sweep + tap each)
//   FLYER   = B-note (needs flak: press B on the beat while roughly aimed)

export type EnemyType = "GRUNT" | "ARMORED" | "SWARM" | "FLYER";

export interface EnemyEvent {
    beat: number;        // song beat the enemy reaches the firing ring
    angle: number;       // radians, p5 convention (0 = right, CW positive)
    type: EnemyType;
    duration?: number;   // ARMORED hold length in beats
    count?: number;      // SWARM: number of sub-hits
    arc?: number;        // SWARM: angular spread (radians) swept across the burst
    step?: number;       // SWARM: beats between sub-hits
}

export interface SwarmHit {
    beat: number;
    angle: number;
    hit: boolean;
    missed: boolean;
}

export interface ActiveEnemy {
    event: EnemyEvent;
    hit: boolean;
    missed: boolean;
    holdActive: boolean;    // ARMORED engaged
    holdComplete: boolean;
    leaked: boolean;        // reached the base (damaged life)
    swarm: SwarmHit[];      // SWARM sub-hits (empty for others)
}

// ── Layout (canvas 336 × 262) ────────────────────────────────────────────────
export const CX = 168;
export const CY = 131;
export const FIRING_RADIUS = 70;   // the ring where hits land
export const SPAWN_RADIUS = 150;   // off toward the corners; enemies start here
export const BASE_RADIUS = 16;     // turret core; enemy reaching here = leak

// ── Timing ───────────────────────────────────────────────────────────────────
export const LOOKAHEAD_BEATS = 4;            // beats from spawn → ring
export const HIT_WINDOW_BEATS = 0.5;         // beat tolerance for a hit
export const PERFECT_WINDOW_BEATS = 0.18;    // tighter = PERFECT
export const AIM_TOLERANCE = 0.42;           // radians the barrel may be off (~24°)

// ── Colors per enemy type ────────────────────────────────────────────────────
export const ENEMY_COLOR: Record<EnemyType, [number, number, number]> = {
    GRUNT:   [120, 220, 140],   // green
    ARMORED: [240, 170, 70],    // amber
    SWARM:   [90, 190, 255],    // cyan
    FLYER:   [235, 110, 200],   // magenta (B / flak)
};

// Radius of an enemy at a given beat (spawn edge → firing ring → base).
// At noteBeat it is exactly FIRING_RADIUS; before that it is further out,
// after that it keeps falling toward the base (a leak).
export function enemyRadius(noteBeat: number, currentBeat: number): number {
    const tBeat = noteBeat - currentBeat;          // >0 = still incoming
    if (tBeat >= 0) {
        // SPAWN_RADIUS at -LOOKAHEAD, FIRING_RADIUS at 0
        const f = Math.min(tBeat, LOOKAHEAD_BEATS) / LOOKAHEAD_BEATS;
        return FIRING_RADIUS + (SPAWN_RADIUS - FIRING_RADIUS) * f;
    }
    // past the ring: keep advancing toward base over ~1 beat
    const f = Math.min(-tBeat, 1);
    return FIRING_RADIUS - (FIRING_RADIUS - BASE_RADIUS) * f;
}

// Smallest signed difference between two angles, in [-PI, PI].
export function angleDelta(a: number, b: number): number {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
}
