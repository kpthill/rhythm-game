import { describe, it, expect } from "vitest";
import { stepSustain, type SustainEvent } from "./sustain";
import { HIT_WINDOW_BEATS, SUSTAIN_RECOVER_BEATS, type ActiveNote, type NoteEvent } from "./notes";

const STEP = 1 / 30; // beats per frame at 120 BPM / 60fps

function holdNote(beat = 10, durationBeats = 4): ActiveNote {
    const event: NoteEvent = { lane: "left", beat, kind: "hold", button: "A", durationBeats };
    return { event, result: "pending" };
}

/**
 * Drive stepSustain from `fromBeat` to `toBeat`, with `engaged(beat)` deciding
 * the input each frame. Returns all non-null events in order.
 */
function run(
    note: ActiveNote,
    fromBeat: number,
    toBeat: number,
    engaged: (beat: number) => boolean,
    entry?: (beat: number) => boolean,
): SustainEvent[] {
    const events: SustainEvent[] = [];
    for (let b = fromBeat; b <= toBeat + 1e-9; b += STEP) {
        const e = entry ? entry(b) : engaged(b);
        const s = engaged(b);
        const ev = stepSustain(note, b, b - note.event.beat, e, s);
        if (ev) events.push(ev);
    }
    return events;
}

describe("stepSustain — entry", () => {
    it("enters with PERFECT on a well-timed input", () => {
        const note = holdNote(10);
        const events = run(note, 9.99, 10.01, () => true);
        expect(events[0]).toBe("entered");
        expect(note.entryGrade).toBe("PERFECT");
    });

    it("enters with GOOD near the window edge", () => {
        const note = holdNote(10);
        // Engage only once past beat 10.3 (outside the PERFECT fraction of ±0.45)
        const events = run(note, 10.3, 10.4, () => true);
        expect(events[0]).toBe("entered");
        expect(note.entryGrade).toBe("GOOD");
    });

    it("fails when the window passes with no input", () => {
        const note = holdNote(10);
        const events = run(note, 9, 11, () => false);
        expect(events).toEqual(["failed"]);
        expect(note.sustain).toBe("failed");
    });

    it("ignores input outside the window", () => {
        const note = holdNote(10);
        const early = stepSustain(note, 9, 9 - 10, true, true);
        expect(early).toBeNull();
        expect(note.sustain).toBeUndefined();
    });
});

describe("stepSustain — hold to completion", () => {
    it("completes at the end and keeps the PERFECT entry grade", () => {
        const note = holdNote(10, 4);
        const events = run(note, 10, 14.1, () => true);
        expect(events).toEqual(["entered", "completed"]);
        expect(note.entryGrade).toBe("PERFECT");
        expect(note.sustain).toBe("done");
    });

    it("release just before the end still completes (end grace)", () => {
        const note = holdNote(10, 4);
        // Hold from 10 to 13.9, release inside SUSTAIN_GRACE_BEATS of beat 14
        const events = run(note, 10, 14, (b) => b < 13.9);
        expect(events).toEqual(["entered", "completed"]);
    });
});

describe("stepSustain — lapse and recovery", () => {
    it("a mid-hold release lapses, and re-pressing in time recovers at GOOD", () => {
        const note = holdNote(10, 4);
        // Hold 10 → 11.5, drop until 12, re-press through the end
        const events = run(note, 10, 14.1, (b) => b < 11.5 || b >= 12);
        expect(events).toEqual(["entered", "lapsed", "recovered", "completed"]);
        expect(note.entryGrade).toBe("GOOD"); // recovery costs the PERFECT
    });

    it("fails when the recovery window expires", () => {
        const note = holdNote(10, 8);
        // Drop at 11.5 and never re-press: window is SUSTAIN_RECOVER_BEATS
        const events = run(note, 10, 14, (b) => b < 11.5);
        expect(events).toEqual(["entered", "lapsed", "failed"]);
        expect(note.sustain).toBe("failed");
        expect(note.lapseStartBeat).toBeCloseTo(1.5 + 10, 1);
    });

    it("recovery window is SUSTAIN_RECOVER_BEATS long", () => {
        const note = holdNote(10, 8);
        // Re-press just inside the window
        const rePressAt = 11.5 + SUSTAIN_RECOVER_BEATS - 0.1;
        const events = run(note, 10, 18.1, (b) => b < 11.5 || b >= rePressAt);
        expect(events).toEqual(["entered", "lapsed", "recovered", "completed"]);
    });

    it("fails if the note ends while still lapsed", () => {
        const note = holdNote(10, 2);
        // Drop at 11 (more than grace from end 12), never re-press;
        // end arrives before the recovery window expires.
        const events = run(note, 10, 12.5, (b) => b < 11);
        expect(events).toEqual(["entered", "lapsed", "failed"]);
    });

    it("a lapsed spin needs a fresh pulse, not just renewed motion", () => {
        const note = holdNote(10, 6);
        // sustainEngaged becomes true again after the lapse, but entryEngaged
        // (the fresh pulse) never fires → still fails.
        const events = run(
            note, 10, 14,
            (b) => b < 11.5 || b >= 12,   // sustain: motion resumes at 12
            (b) => b >= 10 && b < 11.5,   // entry: pulse only at the start
        );
        expect(events).toEqual(["entered", "lapsed", "failed"]);
    });

    it("a lapsed spin recovers on a fresh pulse", () => {
        const note = holdNote(10, 6);
        let pulsed = false;
        const events = run(
            note, 10, 16.1,
            (b) => b < 11.5 || b >= 12,
            (b) => {
                if (b >= 10 && b < 11.5) return true;
                if (b >= 12.2 && !pulsed) { pulsed = true; return true; } // single-frame pulse
                return false;
            },
        );
        expect(events).toEqual(["entered", "lapsed", "recovered", "completed"]);
    });
});

describe("stepSustain — terminal states stay terminal", () => {
    it("done notes ignore further input", () => {
        const note = holdNote(10, 2);
        run(note, 10, 12.1, () => true);
        expect(note.sustain).toBe("done");
        expect(stepSustain(note, 13, 3, true, true)).toBeNull();
    });

    it("failed notes ignore further input", () => {
        const note = holdNote(10, 2);
        run(note, 9, 11, () => false);
        expect(note.sustain).toBe("failed");
        expect(stepSustain(note, 11.5, 1.5, true, true)).toBeNull();
    });
});

describe("stepSustain — window edge", () => {
    it("entry works right at the hit-window edge", () => {
        const note = holdNote(10, 2);
        const edge = 10 + HIT_WINDOW_BEATS - 0.01;
        const ev = stepSustain(note, edge, edge - 10, true, true);
        expect(ev).toBe("entered");
        expect(note.entryGrade).toBe("GOOD");
    });
});
