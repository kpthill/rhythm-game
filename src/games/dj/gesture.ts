// DJ game — spinner gesture detection (vendored), shared by both lanes.
//
// Fixes the two known v1 issues called out in the spec:
//   1. Scratch detection was instantaneous (one frame >= 3 steps). Here we
//      accumulate signed step delta over a short real-time window (~100ms) so
//      a slow-but-deliberate spin still registers as a scratch.
//   2. The joystick fallback's `flickFrames` was tracked but never consulted.
//      Here the fallback's semantics are: a *press* feeds the same
//      accumulator as a real scratch pulse, and *holding* the direction keeps
//      feeding it every frame — which naturally reproduces "tap = scratch,
//      hold = spin" without a separate timer, and drives the same stall
//      detector spin notes need.
//
// The stall detector (`lastActivityBeat`) is what spin notes use for their
// all-or-nothing sustain: as long as the accumulated window magnitude stays
// above a low activity bar, the spin is "alive"; once beats since the last
// activity exceed the sustain grace, it's considered stalled.

import type { LaneInput } from "./input2p";

const WINDOW_MS          = 100;  // gesture accumulation window (real time, tempo-independent)
const SCRATCH_THRESHOLD  = 6;    // accumulated |steps| within the window to register a scratch pulse
const ACTIVITY_THRESHOLD = 2;    // accumulated |steps| within the window to count as "still spinning"
const FALLBACK_MAGNITUDE = 4;    // synthetic per-frame step magnitude while a joystick direction is held

interface Sample { t: number; d: number; }

export interface GestureState {
    samples: Sample[];
    lastActivityBeat: number;
}

export function newGestureState(): GestureState {
    return { samples: [], lastActivityBeat: -Infinity };
}

export function resetGestureState(g: GestureState): void {
    g.samples.length = 0;
    g.lastActivityBeat = -Infinity;
}

export interface GestureResult {
    scratchCW: boolean;
    scratchCCW: boolean;
    /** Continuous spinning right now — feeds spin-note sustain + stall visuals. */
    spinning: boolean;
    /** 1 = actively spinning, decays toward 0 as a stall approaches (for slow-down feedback). */
    spinHealth: number;
    /** Signed magnitude this frame, for platter/visual response. */
    visualDelta: number;
}

/** Sample this lane's gesture state for the current frame. Call at most once per lane per frame. */
export function sampleGesture(
    g: GestureState,
    input: LaneInput,
    nowMs: number,
    currentBeat: number,
    stallGraceBeats: number,
): GestureResult {
    let visualDelta = 0;

    if (input.spinnerConnected) {
        if (input.spinnerDelta !== 0) g.samples.push({ t: nowMs, d: input.spinnerDelta });
        visualDelta = input.spinnerDelta;
    } else {
        // Joystick fallback: holding a direction feeds the accumulator every frame, so a
        // quick tap crosses SCRATCH_THRESHOLD almost immediately (a "scratch") while only a
        // sustained hold keeps `lastActivityBeat` fresh long enough to satisfy a spin note.
        if (input.direction === "LEFT")  { g.samples.push({ t: nowMs, d: -FALLBACK_MAGNITUDE }); visualDelta = -FALLBACK_MAGNITUDE; }
        if (input.direction === "RIGHT") { g.samples.push({ t: nowMs, d:  FALLBACK_MAGNITUDE }); visualDelta =  FALLBACK_MAGNITUDE; }
    }

    const cutoff = nowMs - WINDOW_MS;
    while (g.samples.length && g.samples[0].t < cutoff) g.samples.shift();

    let sum = 0;
    for (const s of g.samples) sum += s.d;

    if (Math.abs(sum) >= ACTIVITY_THRESHOLD) g.lastActivityBeat = currentBeat;

    const beatsSinceActivity = currentBeat - g.lastActivityBeat;
    const spinHealth = Math.max(0, 1 - beatsSinceActivity / stallGraceBeats);
    const spinning = beatsSinceActivity <= stallGraceBeats;

    return {
        scratchCW:  sum >= SCRATCH_THRESHOLD,
        scratchCCW: sum <= -SCRATCH_THRESHOLD,
        spinning,
        spinHealth,
        visualDelta,
    };
}
