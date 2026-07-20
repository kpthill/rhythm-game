// DJ game — sustain (hold/spin) judging as a pure state machine.
//
// All-or-nothing sustains with a recovery window: entry timing sets the grade,
// completing the sustain scores it, and an accidental drop mid-way is
// recoverable — the note enters a "lapsed" state and flashes for
// SUSTAIN_RECOVER_BEATS; a fresh input inside that window resumes the sustain
// (downgraded to GOOD — recovery keeps the note, not the PERFECT), while
// letting the window expire (or the note end while still lapsed) fails it.
//
//        entry input in window          drop (not near end)
//   idle ────────────────────▶ active ─────────────────────▶ lapsed
//     │                          │  ▲                          │
//     │ window passes            │  └───── fresh input ────────┤
//     ▼                          │        (grade → GOOD)       │ window expires
//   failed                       │ reaches end                 │ or note ends
//                                ▼ (or drop near end)          ▼
//                              done                          failed
//
// "Fresh input" differs by note kind and is the caller's business:
//   hold — the button is down again (re-press);
//   spin — a fresh acceleration pulse (spinPulse), NOT merely "spinning
//          again": a lapse is an active question and drift isn't an answer.

import type { ActiveNote } from "./notes";
import { HIT_WINDOW_BEATS, PERFECT_FRACTION, SUSTAIN_GRACE_BEATS, SUSTAIN_RECOVER_BEATS } from "./notes";

/** What happened to the sustain this frame (null = nothing changed). */
export type SustainEvent = "entered" | "completed" | "lapsed" | "recovered" | "failed" | null;

/**
 * Advance a hold/spin note's sustain state by one frame.
 * Mutates `note` (sustain, entryGrade, lapseStartBeat) and reports the transition.
 *
 * `entryEngaged`   — the timed input that starts (or, while lapsed, revives) the sustain.
 * `sustainEngaged` — the looser condition that keeps an active sustain alive.
 */
export function stepSustain(
    note: ActiveNote,
    currentBeat: number,
    beatDiff: number,
    entryEngaged: boolean,
    sustainEngaged: boolean,
): SustainEvent {
    const ev = note.event;
    const endBeat = ev.beat + (ev.durationBeats ?? 0);

    if (!note.sustain || note.sustain === "idle") {
        if (entryEngaged && Math.abs(beatDiff) <= HIT_WINDOW_BEATS) {
            const perfect = Math.abs(beatDiff) < HIT_WINDOW_BEATS * PERFECT_FRACTION;
            note.entryGrade = perfect ? "PERFECT" : "GOOD";
            note.sustain = "active";
            return "entered";
        }
        if (beatDiff > HIT_WINDOW_BEATS) {
            note.sustain = "failed";
            return "failed";
        }
        return null;
    }

    if (note.sustain === "active") {
        if (currentBeat >= endBeat) {
            note.sustain = "done";
            return "completed";
        }
        if (!sustainEngaged) {
            if (currentBeat >= endBeat - SUSTAIN_GRACE_BEATS) {
                // Dropped close enough to the end to count as finished.
                note.sustain = "done";
                return "completed";
            }
            note.sustain = "lapsed";
            note.lapseStartBeat = currentBeat;
            return "lapsed";
        }
        return null;
    }

    if (note.sustain === "lapsed") {
        if (entryEngaged) {
            note.sustain = "active";
            note.entryGrade = "GOOD"; // recovery keeps the note, not the PERFECT
            return "recovered";
        }
        const lapseStart = note.lapseStartBeat ?? currentBeat;
        if (currentBeat >= endBeat || currentBeat - lapseStart > SUSTAIN_RECOVER_BEATS) {
            note.sustain = "failed";
            return "failed";
        }
        return null;
    }

    return null; // done / failed: terminal
}
