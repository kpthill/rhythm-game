import { describe, it, expect } from "vitest";
import { newGestureState, sampleGesture, type GestureState, type GestureResult } from "./gesture";
import type { LaneInput } from "./input2p";

// ── Simulation harness ───────────────────────────────────────────────────────
// Drives sampleGesture frame by frame at 60fps / 120 BPM (2 beats per second),
// mirroring how the game loop calls it.

const FRAME_MS = 1000 / 60;
const BEATS_PER_MS = 2 / 1000; // 120 BPM
const GRACE = 0.5;             // stall grace used by the tests, in beats

function idle(): LaneInput {
    return {
        direction: null,
        aHeld: false, bHeld: false, aPressed: false, bPressed: false,
        spinnerConnected: true,
        spinnerDelta: 0,
    };
}

class Sim {
    g: GestureState = newGestureState();
    t = 1000; // arbitrary start time
    last!: GestureResult;
    pulsesCW = 0;
    pulsesCCW = 0;

    /** Advance one frame with the given input overrides. */
    frame(over: Partial<LaneInput> = {}): GestureResult {
        this.t += FRAME_MS;
        const input: LaneInput = { ...idle(), ...over };
        this.last = sampleGesture(this.g, input, this.t, this.t * BEATS_PER_MS, GRACE);
        if (this.last.scratchCW) this.pulsesCW++;
        if (this.last.scratchCCW) this.pulsesCCW++;
        return this.last;
    }

    /** Advance n frames with the same input. */
    frames(n: number, over: Partial<LaneInput> = {}): GestureResult {
        for (let i = 0; i < n; i++) this.frame(over);
        return this.last;
    }
}

// ── Scratch pulses: acceleration required ────────────────────────────────────

describe("scratch pulses — from rest", () => {
    it("a quick CW burst fires a CW pulse", () => {
        const sim = new Sim();
        sim.frames(2, { spinnerDelta: 3 });
        expect(sim.pulsesCW).toBe(1);
        expect(sim.pulsesCCW).toBe(0);
    });

    it("a quick CCW burst fires a CCW pulse", () => {
        const sim = new Sim();
        sim.frames(2, { spinnerDelta: -4 });
        expect(sim.pulsesCCW).toBe(1);
        expect(sim.pulsesCW).toBe(0);
    });

    it("small alternating jitter fires nothing", () => {
        const sim = new Sim();
        for (let i = 0; i < 20; i++) sim.frame({ spinnerDelta: i % 2 === 0 ? 1 : -1 });
        expect(sim.pulsesCW).toBe(0);
        expect(sim.pulsesCCW).toBe(0);
    });

    it("motion outside the accumulation window is forgotten", () => {
        const sim = new Sim();
        sim.frame({ spinnerDelta: 5 });
        sim.frames(15); // > 200ms idle: both windows clear
        sim.frame({ spinnerDelta: 1 });
        expect(sim.pulsesCW).toBe(0);
    });
});

describe("scratch pulses — momentum does not re-trigger", () => {
    it("one burst fires exactly one pulse even while the surge persists", () => {
        const sim = new Sim();
        sim.frames(5, { spinnerDelta: 4 });
        expect(sim.pulsesCW).toBe(1);
    });

    it("a steady glide never re-fires (cabinet momentum)", () => {
        const sim = new Sim();
        // Flick, then constant-speed coasting for a long time
        sim.frames(3, { spinnerDelta: 4 });
        sim.frames(60, { spinnerDelta: 2 });
        expect(sim.pulsesCW).toBe(1);
    });

    it("speeding up while already gliding in the same direction fires again", () => {
        const sim = new Sim();
        sim.frames(3, { spinnerDelta: 4 });   // initial flick → pulse 1
        sim.frames(30, { spinnerDelta: 2 });  // settle into a steady glide
        expect(sim.pulsesCW).toBe(1);
        sim.frames(3, { spinnerDelta: 7 });   // fresh push on top of the glide
        expect(sim.pulsesCW).toBe(2);
    });

    it("reversing direction while gliding fires the opposite pulse", () => {
        const sim = new Sim();
        sim.frames(3, { spinnerDelta: 4 });
        sim.frames(10, { spinnerDelta: 2 });
        expect(sim.pulsesCW).toBe(1);
        sim.frames(4, { spinnerDelta: -6 });
        expect(sim.pulsesCCW).toBe(1);
    });

    it("two same-direction scratches need two real accelerations", () => {
        const sim = new Sim();
        sim.frames(3, { spinnerDelta: 5 });  // scratch 1
        sim.frames(20);                      // let it die down (~330ms)
        sim.frames(3, { spinnerDelta: 5 });  // scratch 2
        expect(sim.pulsesCW).toBe(2);
    });
});

// ── Spin onset + sustain ─────────────────────────────────────────────────────

describe("spinPulse — spin onset is a timed input", () => {
    it("mirrors a pulse in either direction", () => {
        const sim = new Sim();
        sim.frames(2, { spinnerDelta: 4 });
        expect(sim.last.spinPulse || sim.pulsesCW === 1).toBe(true);

        const sim2 = new Sim();
        let sawPulse = false;
        for (let i = 0; i < 3; i++) if (sim2.frame({ spinnerDelta: -4 }).spinPulse) sawPulse = true;
        expect(sawPulse).toBe(true);
    });

    it("already-spinning motion with no fresh acceleration produces no spinPulse", () => {
        const sim = new Sim();
        sim.frames(3, { spinnerDelta: 4 });
        sim.frames(10, { spinnerDelta: 2 });
        let pulses = 0;
        for (let i = 0; i < 30; i++) if (sim.frame({ spinnerDelta: 2 }).spinPulse) pulses++;
        expect(pulses).toBe(0);
    });
});

describe("spinning / stall detection", () => {
    it("continuous motion keeps `spinning` true with full health", () => {
        const sim = new Sim();
        sim.frames(30, { spinnerDelta: 2 });
        expect(sim.last.spinning).toBe(true);
        expect(sim.last.spinHealth).toBeCloseTo(1, 1);
    });

    it("health decays after motion stops, then spinning goes false past the grace", () => {
        const sim = new Sim();
        sim.frames(10, { spinnerDelta: 2 });

        // Idle within the grace window: still spinning, but decaying
        sim.frames(10); // ~167ms ≈ 0.33 beats < GRACE
        expect(sim.last.spinning).toBe(true);
        expect(sim.last.spinHealth).toBeLessThan(1);
        expect(sim.last.spinHealth).toBeGreaterThan(0);

        // Idle past the grace: stalled
        sim.frames(10); // total ~0.67 beats > GRACE
        expect(sim.last.spinning).toBe(false);
        expect(sim.last.spinHealth).toBe(0);
    });

    it("is not spinning before any input ever arrives", () => {
        const sim = new Sim();
        sim.frames(5);
        expect(sim.last.spinning).toBe(false);
    });
});

// ── Joystick fallback ────────────────────────────────────────────────────────

describe("joystick fallback", () => {
    it("tapping RIGHT fires a CW pulse", () => {
        const sim = new Sim();
        sim.frames(2, { direction: "RIGHT" });
        expect(sim.pulsesCW).toBe(1);
    });

    it("tapping LEFT fires a CCW pulse", () => {
        const sim = new Sim();
        sim.frames(2, { direction: "LEFT" });
        expect(sim.pulsesCCW).toBe(1);
    });

    it("holding a direction sustains `spinning` without new pulses", () => {
        const sim = new Sim();
        sim.frames(60, { direction: "RIGHT" });
        expect(sim.last.spinning).toBe(true);
        expect(sim.pulsesCW).toBe(1); // only the initial press
        // ... and it stalls once released past the grace
        sim.frames(25);
        expect(sim.last.spinning).toBe(false);
    });

    it("holding through a second note ≠ hit: release + re-press fires again", () => {
        const sim = new Sim();
        sim.frames(20, { direction: "RIGHT" });
        expect(sim.pulsesCW).toBe(1);
        sim.frames(20);                        // release, let both windows drain
        sim.frames(20, { direction: "RIGHT" }); // press again
        expect(sim.pulsesCW).toBe(2);
    });

    it("works even when the spinner reports connected", () => {
        const sim = new Sim();
        sim.frames(2, { direction: "RIGHT", spinnerConnected: true });
        expect(sim.pulsesCW).toBe(1);
    });

    it("contributes to visualDelta", () => {
        const sim = new Sim();
        const r = sim.frame({ direction: "LEFT" });
        expect(r.visualDelta).toBeLessThan(0);
    });
});
