// Amplitude-specific lane + gem model and layout constants (vendored; not shared).
//
// The playfield is three vertical lanes scrolling top→bottom. Each lane is an
// INSTRUMENT. The player occupies one lane at a time and taps A/B as gems reach
// the hit line near the bottom. Clearing a contiguous PHRASE of gems "captures"
// that lane (it locks in and auto-plays visually), and the song assembles.

export type Button = "A" | "B";

export interface GemEvent {
    beat: number;
    lane: number;        // 0..LANE_COUNT-1
    button: Button;
    phrase: number;      // phrase id within the lane (a run of gems to clear together)
}

export interface ActiveGem {
    event: GemEvent;
    hit: boolean;
    missed: boolean;
}

// ── Lanes (instruments) ──────────────────────────────────────────────────────
export const LANE_COUNT = 3;

export interface LaneDef {
    name: string;
    color: [number, number, number];   // captured/lit colour
}

export const LANES: LaneDef[] = [
    { name: "DRUMS", color: [255, 90, 90] },
    { name: "BASS", color: [90, 160, 255] },
    { name: "LEAD", color: [120, 230, 130] },
];

export const BUTTON_COLOR: Record<Button, [number, number, number]> = {
    A: [80, 180, 255],   // blue
    B: [255, 150, 70],   // orange
};

// ── Layout (336 × 262) ───────────────────────────────────────────────────────
export const FIELD_TOP = 18;
export const HIT_Y = 220;            // y of the hit line
export const LANE_TOP_W = 70;        // each lane's width
export const LANE_GAP = 14;
export const FIELD_W = LANE_COUNT * LANE_TOP_W + (LANE_COUNT - 1) * LANE_GAP;
export const FIELD_LEFT = (336 - FIELD_W) / 2;

export const LOOKAHEAD_BEATS = 4;    // beats visible above the hit line
export const HIT_WINDOW_BEATS = 0.55;
export const PERFECT_WINDOW_BEATS = 0.22;

// Center x of a lane.
export function laneCenterX(lane: number): number {
    return FIELD_LEFT + lane * (LANE_TOP_W + LANE_GAP) + LANE_TOP_W / 2;
}

// Screen y of a gem at a given beat (scrolls down toward HIT_Y).
export function gemY(gemBeat: number, currentBeat: number): number {
    const t = (currentBeat - gemBeat + LOOKAHEAD_BEATS) / LOOKAHEAD_BEATS; // 0..1 at hit
    return FIELD_TOP + t * (HIT_Y - FIELD_TOP);
}
