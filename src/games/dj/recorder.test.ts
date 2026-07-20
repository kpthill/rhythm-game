import { describe, it, expect } from "vitest";
import { newRecording, recordFrame, finishRecording, type Recording, type LaneRecorder } from "./recorder";
import type { LaneInput } from "./input2p";

// ── Simulation harness ───────────────────────────────────────────────────────
// Feeds recordFrame at a fixed frame→beat rate the way the game loop does.

const BEATS_PER_FRAME = 1 / 30; // 120 BPM at 60fps

function idle(): LaneInput {
    return {
        direction: null,
        aHeld: false, bHeld: false, aPressed: false, bPressed: false,
        spinnerConnected: true,
        spinnerDelta: 0,
    };
}

class Sim {
    rec: Recording = newRecording();
    beat = 0;

    frame(over: Partial<LaneInput> = {}, lane: LaneRecorder = this.rec.left): void {
        recordFrame(this.rec, lane, { ...idle(), ...over }, this.beat);
        this.beat += BEATS_PER_FRAME;
    }

    /** Advance until `beat`, feeding idle frames. */
    idleUntil(beat: number, lane: LaneRecorder = this.rec.left): void {
        while (this.beat < beat) this.frame({}, lane);
    }

    finish() {
        return finishRecording(this.rec, this.beat);
    }
}

/** Press and release button A over [from, to) beats. */
function pressA(sim: Sim, from: number, to: number): void {
    sim.idleUntil(from);
    sim.frame({ aPressed: true, aHeld: true });
    while (sim.beat < to) sim.frame({ aHeld: true });
    sim.frame(); // release
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("recorder — button classification", () => {
    it("a quick press becomes a tap on the half-beat grid", () => {
        const sim = new Sim();
        pressA(sim, 2.1, 2.3); // short: < 0.75 beats
        const r = sim.finish();
        expect(r.source).toContain(`tap("left", 2, A),`);
        expect(r.leftCount).toBe(1);
    });

    it("a long press becomes a hold with a quantized duration", () => {
        const sim = new Sim();
        pressA(sim, 2, 3.6); // 1.6 beats: >= 0.75
        const r = sim.finish();
        expect(r.source).toContain(`hold("left", 2, A, 1.5),`);
    });

    it("simultaneous A+B taps merge into a double", () => {
        const sim = new Sim();
        sim.idleUntil(4);
        sim.frame({ aPressed: true, aHeld: true, bPressed: true, bHeld: true });
        sim.frame({ aHeld: true, bHeld: true });
        sim.frame(); // release both
        const r = sim.finish();
        expect(r.source).toContain(`dbl("left", 4),`);
        expect(r.source).not.toContain(`tap("left", 4`);
    });

    it("a button still held at the end of the song is closed out", () => {
        const sim = new Sim();
        sim.idleUntil(10);
        sim.frame({ aPressed: true, aHeld: true });
        sim.frame({ aHeld: true });
        const r = sim.finish(); // finish while still held
        expect(r.leftCount).toBe(1);
    });
});

describe("recorder — spinner classification", () => {
    it("a short burst becomes a scratch (direction from net sign)", () => {
        const sim = new Sim();
        sim.idleUntil(3);
        sim.frame({ spinnerDelta: 3 });
        sim.frame({ spinnerDelta: 2 });
        sim.idleUntil(4.5); // > SPAN_CLOSE_BEATS of inactivity closes the span
        const r = sim.finish();
        expect(r.source).toContain(`sc("left", 3, CW),`);
    });

    it("a CCW burst records CCW", () => {
        const sim = new Sim();
        sim.idleUntil(3);
        sim.frame({ spinnerDelta: -5 });
        sim.idleUntil(4.5);
        const r = sim.finish();
        expect(r.source).toContain(`sc("left", 3, CCW),`);
    });

    it("a sustained span becomes a spin", () => {
        const sim = new Sim();
        sim.idleUntil(3);
        while (sim.beat < 5.2) sim.frame({ spinnerDelta: 2 }); // 2.2 beats of activity
        sim.idleUntil(6.5);
        const r = sim.finish();
        expect(r.source).toMatch(/spin\("left", 3, 2(\.5)?\),/);
    });

    it("tiny jitter is dropped", () => {
        const sim = new Sim();
        sim.idleUntil(3);
        sim.frame({ spinnerDelta: 1 });
        sim.frame({ spinnerDelta: -1 });
        sim.frame({ spinnerDelta: 1 });
        sim.idleUntil(5);
        const r = sim.finish();
        expect(r.leftCount).toBe(0);
    });

    it("joystick LEFT/RIGHT feeds the span tracker like spinner steps", () => {
        const sim = new Sim();
        sim.idleUntil(3);
        sim.frame({ direction: "RIGHT" });
        sim.idleUntil(4.5);
        const r = sim.finish();
        expect(r.source).toContain(`sc("left", 3, CW),`);
    });
});

describe("recorder — lanes and output", () => {
    it("keeps left and right lanes separate", () => {
        const sim = new Sim();
        sim.idleUntil(2);
        sim.frame({ aPressed: true, aHeld: true }, sim.rec.right);
        sim.frame({}, sim.rec.right);
        const r = sim.finish();
        expect(r.rightCount).toBe(1);
        expect(r.leftCount).toBe(0);
        expect(r.source).toContain(`tap("right", 2, A),`);
    });

    it("emits both LEFT_REC and RIGHT_REC blocks", () => {
        const sim = new Sim();
        const r = sim.finish();
        expect(r.source).toContain("const LEFT_REC: NoteEvent[]");
        expect(r.source).toContain("const RIGHT_REC: NoteEvent[]");
    });

    it("ignores input during the count-in (negative beats)", () => {
        const rec = newRecording();
        recordFrame(rec, rec.left, { ...idle(), aPressed: true, aHeld: true }, -2);
        recordFrame(rec, rec.left, idle(), -1.9);
        const r = finishRecording(rec, 10);
        expect(r.leftCount).toBe(0);
    });
});
