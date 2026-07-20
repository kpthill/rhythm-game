// DJ game — spinner gesture detection (vendored), shared by both lanes.
//
// v3: scratches require **acceleration**, not just motion. On the cabinet the
// spinner has real momentum: after one flick it keeps turning for a while, so
// judging "is it moving?" made consecutive same-direction scratch notes free —
// one physical input could clear several notes. Here a scratch is a *pulse
// event* that fires only when the player actively adds energy:
//
//   - starting from rest,
//   - reversing direction, or
//   - speeding up while already gliding in the same direction.
//
// Mechanically: signed step deltas are accumulated into two adjacent
// real-time windows — `recent` (last WINDOW_MS) and `prior` (the WINDOW_MS
// before that). A pulse in direction d fires on the frame where
//     recent·d >= SCRATCH_THRESHOLD  and
//     recent·d - max(0, prior·d) >= ACCEL_THRESHOLD
// first becomes true (edge-triggered; the condition must lapse before the
// same direction can fire again). A steady glide has recent ≈ prior, so no
// acceleration and no pulse; a fresh flick puts a surge into `recent` that
// `prior` doesn't have yet.
//
// Spin notes use two different signals:
//   - onset: `spinPulse` (a pulse in either direction) — starting a spin is a
//     *timed input*, judged like a scratch, not "was already spinning".
//   - sustain: `spinning` — the low-bar activity detector (`lastActivityBeat`)
//     that tolerates cabinet momentum: as long as the accumulated window
//     magnitude stays above ACTIVITY_THRESHOLD the spin is alive, and once
//     beats since the last activity exceed the sustain grace it has stalled.
//
// The joystick fallback (always active — the emulator's virtual spinner
// reports connected, and the cabinet's always is) feeds the same accumulator
// with a constant synthetic magnitude while LEFT/RIGHT is held. The
// acceleration rule then gives exactly the intended fallback semantics for
// free: pressing a direction is a surge from rest (scratch pulse), holding it
// is steady activity (sustains a spin, no new pulses), and hitting another
// scratch note requires releasing and pressing again. The emulator's spinner
// keys arrive as ordinary step deltas and get the same treatment.

import type { LaneInput } from "./input2p";

const WINDOW_MS          = 100;  // recent/prior accumulation window size (real time, tempo-independent)
const SCRATCH_THRESHOLD  = 6;    // recent-window |steps| floor for a scratch pulse
const ACCEL_THRESHOLD    = 5;    // recent must exceed same-direction prior by this many steps
const ACTIVITY_THRESHOLD = 2;    // recent-window |steps| to count as "still spinning"
const FALLBACK_MAGNITUDE = 4;    // synthetic per-frame step magnitude while a joystick direction is held

interface Sample { t: number; d: number; }

export interface GestureState {
    samples: Sample[];
    lastActivityBeat: number;
    /** Edge-detection: whether each direction's pulse condition held last frame. */
    prevCondCW: boolean;
    prevCondCCW: boolean;
}

export function newGestureState(): GestureState {
    return { samples: [], lastActivityBeat: -Infinity, prevCondCW: false, prevCondCCW: false };
}

export function resetGestureState(g: GestureState): void {
    g.samples.length = 0;
    g.lastActivityBeat = -Infinity;
    g.prevCondCW = false;
    g.prevCondCCW = false;
}

export interface GestureResult {
    /** Pulse events — fire on exactly one frame per physical acceleration. */
    scratchCW: boolean;
    scratchCCW: boolean;
    /** Direction-agnostic pulse (either scratch direction) — a spin note's onset input. */
    spinPulse: boolean;
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
    let visualDelta = input.spinnerDelta;
    if (input.spinnerDelta !== 0) g.samples.push({ t: nowMs, d: input.spinnerDelta });

    // Joystick fallback: holding a direction feeds a constant synthetic rate.
    if (input.direction === "LEFT")  { g.samples.push({ t: nowMs, d: -FALLBACK_MAGNITUDE }); visualDelta -= FALLBACK_MAGNITUDE; }
    if (input.direction === "RIGHT") { g.samples.push({ t: nowMs, d:  FALLBACK_MAGNITUDE }); visualDelta += FALLBACK_MAGNITUDE; }

    // Keep two windows' worth of samples: recent (now-W, now] and prior (now-2W, now-W].
    const cutoff = nowMs - WINDOW_MS * 2;
    while (g.samples.length && g.samples[0].t <= cutoff) g.samples.shift();

    let recent = 0;
    let prior  = 0;
    const windowEdge = nowMs - WINDOW_MS;
    for (const s of g.samples) {
        if (s.t > windowEdge) recent += s.d;
        else prior += s.d;
    }

    if (Math.abs(recent) >= ACTIVITY_THRESHOLD) g.lastActivityBeat = currentBeat;

    // Acceleration test per direction: the recent rate must clear the scratch
    // floor AND meaningfully exceed what was already flowing in that direction.
    const condCW  =  recent >= SCRATCH_THRESHOLD &&  recent - Math.max(0,  prior) >= ACCEL_THRESHOLD;
    const condCCW = -recent >= SCRATCH_THRESHOLD && -recent - Math.max(0, -prior) >= ACCEL_THRESHOLD;

    const scratchCW  = condCW  && !g.prevCondCW;
    const scratchCCW = condCCW && !g.prevCondCCW;
    g.prevCondCW  = condCW;
    g.prevCondCCW = condCCW;

    const beatsSinceActivity = currentBeat - g.lastActivityBeat;
    const spinHealth = Math.max(0, 1 - beatsSinceActivity / stallGraceBeats);
    const spinning = beatsSinceActivity <= stallGraceBeats;

    return {
        scratchCW,
        scratchCCW,
        spinPulse: scratchCW || scratchCCW,
        spinning,
        spinHealth,
        visualDelta,
    };
}
